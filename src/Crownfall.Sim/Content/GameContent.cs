namespace Crownfall.Sim.Content;

/// <summary>Root of content/game.json, the stats file shared by server and client.</summary>
public sealed class GameContent
{
    public int Version { get; set; }
    public RulesDef Rules { get; set; } = new();
    public List<UnitDef> Units { get; set; } = [];
    public List<BuildingDef> Buildings { get; set; } = [];
    public List<NodeDef> Nodes { get; set; } = [];
    public List<RaceDef> Races { get; set; } = [];
    public List<AbilityDef> Abilities { get; set; } = [];
    public List<HeroStatDef> HeroStats { get; set; } = [];
}
