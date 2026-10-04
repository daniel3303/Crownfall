using System.Numerics;
using Crownfall.Sim.Content;
using Crownfall.Sim.Core;

namespace Crownfall.Sim.Entities;

public sealed class Unit : Entity
{
    public Unit(UnitDef def)
    {
        Def = def;
    }

    public UnitDef Def { get; }
    public UnitOrder Order { get; set; } = UnitOrder.Idle;
    public UnitActivity Activity { get; set; }
    public float Facing { get; set; }
    public float AttackCooldown { get; set; }

    public List<Vector2> Path { get; } = [];
    public int PathIndex { get; set; }
    public Vector2 PathGoal { get; set; }
    public int PathTick { get; set; } = -1000;
    public Vector2 StuckCheckPosition { get; set; }
    public int StuckCheckTick { get; set; }

    public ResourceType CarryType { get; set; }
    public float CarryAmount { get; set; }

    /// <summary>Fractional loot built up while stealing; only whole units leave the victim's stockpile.</summary>
    public float StealProgress { get; set; }

    public HeroState Hero { get; set; }
    public CreepCamp Camp { get; set; }
    public bool IsLeashing { get; set; }

    public int BuffUntilTick { get; set; } = -1;

    /// <summary>The ability buffing the unit; the ability system clears it once <see cref="BuffUntilTick"/> passes.</summary>
    public AbilityDef Buff { get; set; }

    /// <summary>Tick of the last hit taken; a hero regenerates once it has gone unhurt long enough.</summary>
    public int LastDamagedTick { get; set; } = int.MinValue / 2;

    /// <summary>A stunned unit neither moves nor attacks until this tick.</summary>
    public int StunUntilTick { get; set; } = -1;

    /// <summary>Set while a hero charges; orders wait until it lands.</summary>
    public DashState Dash { get; set; }

    public override EntityCategory Category => EntityCategory.Unit;
    public override int Kind => Def.Kind;
    public override float Radius => Def.Radius;
    public override int Sight => Def.Sight;
    public override ArmorDef Armor => Def.Armor;

    public bool IsHero => Hero != null;

    /// <summary>Armor against a damage type: the unit type's, plus what a hero's items and talents and a warding buff add.</summary>
    public float ArmorAgainst(DamageType type)
    {
        return Def.Armor.Against(type) + (Hero?.ArmorBonus(type) ?? 0) + (Buff?.ArmorBonus ?? 0);
    }
    public bool IsCarrying => CarryAmount > 0;

    /// <summary>The level of the building that trained the unit when that level drills stronger troops, else 1.</summary>
    public int Rank { get; set; } = 1;

    /// <summary>Attack multiplier the unit's rank grants.</summary>
    public float RankAttack { get; set; } = 1;

    /// <summary>Attack with rank and hero bonuses, multiplied by the owner's dragon buff and any attack buff from an ability.</summary>
    public float AttackDamage => (Def.Attack * RankAttack + (Hero?.BonusAttack ?? 0)) * (1 + (Owner?.AttackBuff ?? 0) + (Buff?.AttackBonus ?? 0));

    /// <summary>True while the owner's team holds the dragon's attack buff.</summary>
    public bool HasTeamBuff => Owner is { AttackBuff: > 0 };

    /// <summary>Radius in which the unit picks its own fights; kept apart from the wider sight.</summary>
    public float AcquireRange => Def.Acquire;

    public bool IsStunned(int tick)
    {
        return tick < StunUntilTick;
    }

    public bool IsBuffed(int tick)
    {
        return Buff != null && tick < BuffUntilTick;
    }

    /// <summary>Rally and hero speed ranks add up rather than multiply.</summary>
    public float SpeedAt(int tick)
    {
        var bonus = (IsBuffed(tick) ? Buff.SpeedBonus : 0) + (Hero?.MoveSpeedBonus ?? 0);
        return Def.Speed * (1 + bonus);
    }

    /// <summary>Rally and attack-speed ranks add up the same way and divide the base cooldown.</summary>
    public float CooldownAt(int tick)
    {
        var bonus = (IsBuffed(tick) ? Buff.AttackSpeedBonus : 0) + (Hero?.AttackSpeedBonus ?? 0);
        return Def.Cooldown / (1 + bonus);
    }

    /// <summary>The enemy wall the current path stops at, which the unit must break to go on; 0 for none.</summary>
    public int BreachWall { get; set; }

    public void ClearPath()
    {
        Path.Clear();
        PathIndex = 0;
        BreachWall = 0;
    }
}
