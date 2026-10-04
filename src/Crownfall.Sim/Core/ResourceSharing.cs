using System.ComponentModel.DataAnnotations;
using Newtonsoft.Json;
using Newtonsoft.Json.Converters;
using Newtonsoft.Json.Serialization;

namespace Crownfall.Sim.Core;

/// <summary>How teammates handle resources, chosen in the lobby.</summary>
[JsonConverter(typeof(StringEnumConverter), typeof(CamelCaseNamingStrategy))]
public enum ResourceSharing
{
    [Display(Name = "Separate")]
    Separate,

    [Display(Name = "Separate + tribute")]
    SeparateWithTribute,

    [Display(Name = "Shared team pool")]
    Shared,
}
