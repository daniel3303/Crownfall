namespace Crownfall.Sim.Content;

public sealed class ArmorDef
{
    public float Melee { get; set; }
    public float Pierce { get; set; }

    public float Against(DamageType type)
    {
        return type == DamageType.Melee ? Melee : Pierce;
    }
}
