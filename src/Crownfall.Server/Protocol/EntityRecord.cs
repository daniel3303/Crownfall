namespace Crownfall.Server.Protocol;

/// <summary>One entity as it travels in a binary snapshot. Positions are tiles × 256; attack speed is a multiplier × 64.</summary>
public readonly record struct EntityRecord(
    uint Id,
    byte Kind,
    byte Owner,
    ushort X,
    ushort Y,
    ushort Hp,
    ushort MaxHp,
    byte State,
    byte Facing,
    byte Extra,
    byte Flags,
    byte AttackSpeed = SnapshotEncoder.BaseAttackSpeed);
