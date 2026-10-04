namespace Crownfall.Server.Matches;

/// <summary>Periodically disposes matches nobody is playing any more.</summary>
public sealed class MatchCleanupService : BackgroundService
{
    private static readonly TimeSpan Interval = TimeSpan.FromSeconds(10);
    private readonly MatchRegistry _registry;
    private readonly TimeProvider _time;

    public MatchCleanupService(MatchRegistry registry, TimeProvider time)
    {
        _registry = registry;
        _time = time;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(Interval, _time);
        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            _registry.Sweep();
        }
    }
}
