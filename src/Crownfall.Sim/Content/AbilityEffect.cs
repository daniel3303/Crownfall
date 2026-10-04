using Newtonsoft.Json;
using Newtonsoft.Json.Converters;
using Newtonsoft.Json.Serialization;

namespace Crownfall.Sim.Content;

[JsonConverter(typeof(StringEnumConverter), typeof(CamelCaseNamingStrategy))]
public enum AbilityEffect
{
    /// <summary>Instant damage around the hero.</summary>
    Nova,

    /// <summary>Temporary buff on nearby allies.</summary>
    Buff,

    /// <summary>Delayed area damage at a target point.</summary>
    Strike,

    /// <summary>The hero rushes to a target point, hitting and stunning enemies on the way; one without damage or stun only moves.</summary>
    Dash,

    /// <summary>Instant healing for the hero and every allied unit around it.</summary>
    Heal,
}
