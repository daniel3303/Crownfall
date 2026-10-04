namespace Crownfall.Server.Protocol.Messages;

public sealed class ProductionView
{
    public int Id { get; init; }
    public List<string> Queue { get; init; } = [];
    public float Progress { get; init; }
}
