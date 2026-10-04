using Newtonsoft.Json;
using Newtonsoft.Json.Serialization;

namespace Crownfall.Server.Protocol;

/// <summary>JSON settings for every text frame: camelCase keys, matching what the TypeScript client reads.</summary>
public static class WireJson
{
    public static readonly JsonSerializerSettings Settings = new()
    {
        ContractResolver = new DefaultContractResolver { NamingStrategy = new CamelCaseNamingStrategy() },
        NullValueHandling = NullValueHandling.Ignore,
        FloatFormatHandling = FloatFormatHandling.DefaultValue,
    };

    public static readonly JsonSerializer Serializer = JsonSerializer.Create(Settings);

    public static string Serialize(object value)
    {
        return JsonConvert.SerializeObject(value, Settings);
    }
}
