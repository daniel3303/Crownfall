namespace Crownfall.Server.Protocol.Messages;

/// <summary>The center dragon's public timer and the viewer's own dragon buff.</summary>
public sealed class DragonView
{
    /// <summary>True while the dragon is on the map.</summary>
    public bool IsUp { get; init; }

    /// <summary>Seconds until it lands; 0 while it is up.</summary>
    public float LandsInSeconds { get; init; }

    /// <summary>Seconds the viewer's attack buff from slaying it has left; 0 without one.</summary>
    public float BuffSeconds { get; init; }
}
