using Newtonsoft.Json;

namespace Crownfall.Sim.Content;

/// <summary>A hero item sold at a town center; every stat it lists adds to the hero's while it sits in a slot.</summary>
public sealed class ItemDef
{
    public string Id { get; set; }
    public string Name { get; set; }
    public Dictionary<string, int> Cost { get; set; } = [];
    public float Attack { get; set; }
    public float Hp { get; set; }
    public ArmorDef Armor { get; set; } = new();

    /// <summary>Fraction added to attack speed, alongside attack-speed ranks and Rally.</summary>
    public float AttackSpeed { get; set; }

    public float MoveSpeed { get; set; }
    public float LifeSteal { get; set; }

    /// <summary>Hp per second healed at all times, in combat too, on top of resting regeneration.</summary>
    public float Regen { get; set; }

    /// <summary>Share taken off ability cooldowns; it adds to the level reduction under one cap.</summary>
    public float CooldownReduction { get; set; }

    public string Description { get; set; }

    [JsonIgnore]
    public int[] CostAmounts { get; internal set; }
}
