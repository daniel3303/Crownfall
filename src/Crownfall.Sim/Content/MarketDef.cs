namespace Crownfall.Sim.Content;

/// <summary>
/// Storehouse trading of food, wood and stone for gold. Each player has their own prices: a purchase raises the
/// price of that resource, a sale lowers it, and every price drifts back toward its base over time.
/// </summary>
public sealed class MarketDef
{
    /// <summary>Resources moved by one trade.</summary>
    public int Lot { get; set; }

    /// <summary>Starting mid price in gold for one lot, by resource; gold itself is not traded.</summary>
    public Dictionary<string, int> Prices { get; set; } = [];

    /// <summary>Total gap between buying and selling, as a share of the mid price; buying then selling loses it.</summary>
    public float Spread { get; set; }

    /// <summary>Gold the mid price moves per lot bought or sold.</summary>
    public float Step { get; set; }

    public float MinPrice { get; set; }
    public float MaxPrice { get; set; }

    /// <summary>Gold per second each price moves back toward its base.</summary>
    public float DriftPerSecond { get; set; }
}
