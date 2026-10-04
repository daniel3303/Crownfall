using Newtonsoft.Json;
using Newtonsoft.Json.Converters;
using Newtonsoft.Json.Serialization;

namespace Crownfall.Sim.Events;

[JsonConverter(typeof(StringEnumConverter), typeof(CamelCaseNamingStrategy))]
public enum NoticeTone
{
    Info,
    Warning,
    Alert,
    Success,
}
