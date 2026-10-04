namespace Crownfall.Server.Protocol.Messages;

/// <summary>The viewer's market prices in gold per lot, by resource; 0 where the market does not trade.</summary>
public sealed class MarketView
{
    public int Lot { get; init; }
    public int[] Buy { get; init; } = [];
    public int[] Sell { get; init; } = [];
}
