namespace Crownfall.Sim.Core;

/// <summary>Helpers for resource amounts stored as arrays indexed by <see cref="ResourceType"/>.</summary>
public static class Resources
{
    public const int Count = 4;

    public static readonly ResourceType[] All = [ResourceType.Food, ResourceType.Wood, ResourceType.Stone, ResourceType.Gold];

    public static ResourceType Parse(string name)
    {
        return name switch
        {
            "food" => ResourceType.Food,
            "wood" => ResourceType.Wood,
            "stone" => ResourceType.Stone,
            "gold" => ResourceType.Gold,
            _ => throw new InvalidDataException($"Unknown resource '{name}'."),
        };
    }

    public static string Name(ResourceType type)
    {
        return type switch
        {
            ResourceType.Food => "food",
            ResourceType.Wood => "wood",
            ResourceType.Stone => "stone",
            _ => "gold",
        };
    }

    public static int[] FromDictionary(Dictionary<string, int> amounts)
    {
        var result = new int[Count];
        foreach (var pair in amounts)
        {
            result[(int)Parse(pair.Key)] = pair.Value;
        }
        return result;
    }

    public static int Total(int[] amounts)
    {
        var total = 0;
        foreach (var amount in amounts)
        {
            total += amount;
        }
        return total;
    }
}
