using System.ComponentModel.DataAnnotations;
using Newtonsoft.Json;
using Newtonsoft.Json.Converters;
using Newtonsoft.Json.Serialization;

namespace Crownfall.Sim.Core;

[JsonConverter(typeof(StringEnumConverter), typeof(CamelCaseNamingStrategy))]
public enum MapSize
{
    [Display(Name = "Small")]
    Small,

    [Display(Name = "Medium")]
    Medium,

    [Display(Name = "Large")]
    Large,
}
