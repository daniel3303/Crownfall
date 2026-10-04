namespace Crownfall.Sim.Content;

public sealed class AbilityDef
{
    public string Id { get; set; }
    public string Name { get; set; }
    public string Key { get; set; }
    public AbilityEffect Effect { get; set; }
    public int UnlockLevel { get; set; }
    public float Cooldown { get; set; }
    public float Radius { get; set; }
    public float Range { get; set; }
    public float Damage { get; set; }
    public float DamagePerLevel { get; set; }
    public float Duration { get; set; }
    public float AttackSpeedBonus { get; set; }
    public float SpeedBonus { get; set; }
    public float Delay { get; set; }
    public float BuildingMultiplier { get; set; }

    /// <summary>Tiles per second a dash travels.</summary>
    public float Speed { get; set; }

    /// <summary>Seconds a dash stuns each enemy it hits.</summary>
    public float Stun { get; set; }
    public string Description { get; set; }

    public float DamageAt(int level)
    {
        return Damage + DamagePerLevel * (level - 1);
    }
}
