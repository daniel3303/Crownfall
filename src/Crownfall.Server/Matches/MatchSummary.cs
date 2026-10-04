using Crownfall.Sim.Core;

namespace Crownfall.Server.Matches;

public sealed class MatchSummary
{
    public string Id { get; init; }
    public string Phase { get; init; }
    public bool IsQuickPlay { get; init; }
    public string HostName { get; init; }
    public int Humans { get; init; }
    public int OpenSeats { get; init; }
    public int Seats { get; init; }
    public MatchConfig Config { get; init; }

    public static MatchSummary From(MatchHost match)
    {
        return new MatchSummary
        {
            Id = match.Id,
            Phase = match.Phase.ToString().ToLowerInvariant(),
            IsQuickPlay = match.IsQuickPlay,
            HostName = match.Status.HostName,
            Humans = match.Status.HumanCount,
            OpenSeats = match.Status.OpenSeats,
            Seats = match.Config.PlayerCount,
            Config = match.Config,
        };
    }
}
