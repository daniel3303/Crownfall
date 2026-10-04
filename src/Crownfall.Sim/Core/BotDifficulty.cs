using System.ComponentModel.DataAnnotations;
using Newtonsoft.Json;
using Newtonsoft.Json.Converters;
using Newtonsoft.Json.Serialization;

namespace Crownfall.Sim.Core;

[JsonConverter(typeof(StringEnumConverter), typeof(CamelCaseNamingStrategy))]
public enum BotDifficulty
{
    [Display(Name = "Easy")]
    Easy,

    [Display(Name = "Normal")]
    Normal,

    [Display(Name = "Hard")]
    Hard,

    [Display(Name = "Brutal")]
    Brutal,

    /// <summary>The tutorial's sparring partner: it builds an economy and never leaves home.</summary>
    [Display(Name = "Passive")]
    Passive,
}
