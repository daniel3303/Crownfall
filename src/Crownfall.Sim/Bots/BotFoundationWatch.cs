namespace Crownfall.Sim.Bots;

/// <summary>
/// Gives up on foundations whose builders cannot reach them. There is no command to cancel a foundation, so an abandoned
/// one is left out of the bot's view; otherwise it would block every later house or barracks of its kind.
/// </summary>
public sealed class BotFoundationWatch
{
    // A foundation that makes no progress for this long, while the bot keeps sending builders, is treated as unreachable.
    private const int StallSeconds = 60;

    private readonly int _stallTicks;
    private Dictionary<int, (int Tick, float Progress)> _progress = [];
    private Dictionary<int, (int Tick, float Progress)> _next = [];

    public BotFoundationWatch(Game game)
    {
        _stallTicks = StallSeconds * game.Content.Rules.TickRate;
    }

    public HashSet<int> Abandoned { get; } = [];

    /// <summary>Stall time does not run while <paramref name="raided"/>, since builders are then sheltering, not stuck.</summary>
    public void Track(BotView view, bool raided)
    {
        _next.Clear();
        foreach (var building in view.Buildings)
        {
            if (building.IsComplete)
            {
                continue;
            }
            if (!_progress.TryGetValue(building.Id, out var last) || building.Progress > last.Progress || raided)
            {
                _next[building.Id] = (view.Tick, building.Progress);
            }
            else if (view.Tick - last.Tick >= _stallTicks)
            {
                Abandoned.Add(building.Id);
            }
            else
            {
                _next[building.Id] = last;
            }
        }
        (_progress, _next) = (_next, _progress);
    }
}
