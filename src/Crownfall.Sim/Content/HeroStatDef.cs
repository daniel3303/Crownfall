using Newtonsoft.Json;

namespace Crownfall.Sim.Content;

/// <summary>A hero stat a player can spend level-up points on; each rank adds <see cref="PerRank"/>.</summary>
public sealed class HeroStatDef
{
    public string Id { get; set; }
    public string Name { get; set; }

    /// <summary>Flat amount for damage and health, a fraction for speeds and life steal.</summary>
    public float PerRank { get; set; }

    public string Description { get; set; }

    [JsonIgnore]
    public HeroStatEffect Effect { get; internal set; }
}
