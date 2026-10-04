using System.Buffers.Binary;
using Crownfall.Sim;
using Crownfall.Sim.Entities;

namespace Crownfall.Server.Protocol;

/// <summary>
/// Binary snapshot, little-endian: u8 type, u8 version, u32 tick, u16 count, then 19 bytes per entity
/// (u32 id, u8 kind, u8 owner, u16 x, u16 y, u16 hp, u16 maxHp, u8 state, u8 facing, u8 extra, u8 flags, u8 attackSpeed).
/// Each viewer receives only what their team can see.
/// </summary>
public static class SnapshotEncoder
{
    public const byte MessageType = 1;
    public const byte Version = 2;
    public const byte NeutralOwner = 255;
    public const float PositionScale = 256f;
    public const int HeaderSize = 8;
    public const int RecordSize = 19;

    /// <summary>Attack speed travels as its multiplier × 64, so 64 is the unit's base rate and 255 just under 4×.</summary>
    public const float AttackSpeedScale = 64f;
    public const byte BaseAttackSpeed = 64;

    public static byte[] Encode(Game game, Player viewer)
    {
        var records = new List<EntityRecord>();
        foreach (var entity in game.Entities.All())
        {
            if (entity.IsAlive && game.Vision.IsVisible(viewer.Team, entity))
            {
                records.Add(Describe(entity, game.Tick));
            }
        }
        return Encode((uint)game.Tick, records);
    }

    public static byte[] Encode(uint tick, IReadOnlyList<EntityRecord> records)
    {
        var count = Math.Min(records.Count, ushort.MaxValue);
        var buffer = new byte[HeaderSize + count * RecordSize];
        var span = buffer.AsSpan();
        span[0] = MessageType;
        span[1] = Version;
        BinaryPrimitives.WriteUInt32LittleEndian(span[2..], tick);
        BinaryPrimitives.WriteUInt16LittleEndian(span[6..], (ushort)count);
        for (var i = 0; i < count; i++)
        {
            Write(span.Slice(HeaderSize + i * RecordSize, RecordSize), records[i]);
        }
        return buffer;
    }

    public static EntityRecord Describe(Entity entity, int tick)
    {
        var (state, extra, flags) = entity switch
        {
            Unit unit => DescribeUnit(unit, tick),
            Building building => DescribeBuilding(building),
            _ => ((byte)0, (byte)0, SnapshotFlags.None),
        };
        var facing = entity is Unit u ? u.Facing : 0f;
        return new EntityRecord(
            (uint)entity.Id,
            (byte)entity.Kind,
            entity.Owner == null ? NeutralOwner : (byte)entity.Owner.Index,
            Quantize(entity.Position.X),
            Quantize(entity.Position.Y),
            ClampHp(entity.Hp),
            ClampHp(entity.MaxHp),
            state,
            QuantizeAngle(facing),
            extra,
            (byte)flags,
            entity is Unit attacker ? QuantizeAttackSpeed(attacker, tick) : BaseAttackSpeed);
    }

    /// <summary>How much faster than its base cooldown a unit attacks now, with Rally and attack-speed ranks.</summary>
    private static byte QuantizeAttackSpeed(Unit unit, int tick)
    {
        var cooldown = unit.CooldownAt(tick);
        var multiplier = cooldown > 0 ? unit.Def.Cooldown / cooldown : 1f;
        return (byte)Math.Clamp((int)MathF.Round(multiplier * AttackSpeedScale), 1, byte.MaxValue);
    }

    private static (byte State, byte Extra, SnapshotFlags Flags) DescribeUnit(Unit unit, int tick)
    {
        var flags = SnapshotFlags.None;
        var extra = (byte)Math.Min(unit.Rank, byte.MaxValue);
        if (unit.IsCarrying)
        {
            flags |= SnapshotFlags.Carrying | (SnapshotFlags)((int)unit.CarryType << 2);
            extra = (byte)Math.Clamp((int)MathF.Round(unit.CarryAmount), 0, 255);
        }
        if (unit.IsBuffed(tick))
        {
            flags |= SnapshotFlags.Buffed;
        }
        if (unit.IsHero)
        {
            flags |= SnapshotFlags.Hero;
            extra = (byte)Math.Min(unit.Hero.Level, byte.MaxValue);
        }
        return ((byte)unit.Activity, extra, flags);
    }

    private static (byte State, byte Extra, SnapshotFlags Flags) DescribeBuilding(Building building)
    {
        var flags = building.IsComplete ? SnapshotFlags.None : SnapshotFlags.UnderConstruction;
        if (building.Queue.Count > 0)
        {
            flags |= SnapshotFlags.Training;
        }
        var progress = building.Progress;
        if (building.IsUpgrading)
        {
            flags |= SnapshotFlags.Upgrading;
            progress = building.UpgradeProgress;
        }
        var level = (byte)Math.Clamp(building.Level, 1, byte.MaxValue);
        return (level, (byte)Math.Clamp((int)(progress * 100), 0, 100), flags);
    }

    private static void Write(Span<byte> span, EntityRecord record)
    {
        BinaryPrimitives.WriteUInt32LittleEndian(span, record.Id);
        span[4] = record.Kind;
        span[5] = record.Owner;
        BinaryPrimitives.WriteUInt16LittleEndian(span[6..], record.X);
        BinaryPrimitives.WriteUInt16LittleEndian(span[8..], record.Y);
        BinaryPrimitives.WriteUInt16LittleEndian(span[10..], record.Hp);
        BinaryPrimitives.WriteUInt16LittleEndian(span[12..], record.MaxHp);
        span[14] = record.State;
        span[15] = record.Facing;
        span[16] = record.Extra;
        span[17] = record.Flags;
        span[18] = record.AttackSpeed;
    }

    private static ushort Quantize(float value)
    {
        return (ushort)Math.Clamp((int)MathF.Floor(value * PositionScale), 0, ushort.MaxValue);
    }

    private static ushort ClampHp(float value)
    {
        return (ushort)Math.Clamp((int)MathF.Ceiling(value), 0, ushort.MaxValue);
    }

    private static byte QuantizeAngle(float radians)
    {
        var turns = radians / MathF.Tau;
        turns -= MathF.Floor(turns);
        return (byte)((int)(turns * 256) & 0xFF);
    }
}
