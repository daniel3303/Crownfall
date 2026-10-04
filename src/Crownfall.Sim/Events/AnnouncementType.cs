using Newtonsoft.Json;
using Newtonsoft.Json.Converters;
using Newtonsoft.Json.Serialization;

namespace Crownfall.Sim.Events;

[JsonConverter(typeof(StringEnumConverter), typeof(CamelCaseNamingStrategy))]
public enum AnnouncementType
{
    FirstBlood,
    KillStreak,
    Shutdown,
    DragonSpawned,
    DragonSlain,
}
