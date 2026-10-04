using Crownfall.Sim.Core;
using Newtonsoft.Json;

namespace Crownfall.Sim.Content;

/// <summary>A gatherable resource deposit such as a gold mine. Trees are map tiles, not nodes.</summary>
public sealed class NodeDef
{
    public string Id { get; set; }
    public string Name { get; set; }
    public int Size { get; set; }
    public int Amount { get; set; }
    public string Resource { get; set; }

    [JsonIgnore]
    public int Kind { get; internal set; }

    [JsonIgnore]
    public ResourceType ResourceType { get; internal set; }
}
