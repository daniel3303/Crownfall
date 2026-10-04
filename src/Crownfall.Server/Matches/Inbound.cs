namespace Crownfall.Server.Matches;

/// <summary>Work queued for the match loop thread, which owns all match state.</summary>
public abstract record Inbound(IMatchClient Client);
