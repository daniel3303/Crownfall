using Crownfall.Sim.Content;
using Crownfall.Sim.Core;

namespace Crownfall.Server.Matches;

/// <summary>The fixed seats of one match: who sits where, who hosts, and which bot seat a newcomer takes.</summary>
internal sealed class SeatTable
{
    private readonly List<Seat> _seats = [];

    public SeatTable(MatchConfig config, ContentDb content)
    {
        for (var team = 0; team < config.Teams; team++)
        {
            for (var slot = 0; slot < config.PlayersPerTeam; slot++)
            {
                var index = team * config.PlayersPerTeam + slot;
                var botName = BotNames.For(index);
                _seats.Add(new Seat
                {
                    Index = index,
                    Team = team,
                    BotName = botName,
                    Name = botName,
                    Race = content.Races[index % content.Races.Count].Id,
                });
            }
        }
    }

    public IReadOnlyList<Seat> All => _seats;
    public IEnumerable<Seat> Humans => _seats.Where(s => !s.IsBot);
    public Seat Host { get; private set; }

    /// <summary>Bot seats a human could still take: seats whose player has not been defeated.</summary>
    public int OpenCount => _seats.Count(IsOpen);

    public Seat Of(IMatchClient client)
    {
        return _seats.FirstOrDefault(s => s.Client == client);
    }

    /// <summary>Seats a client in the open bot seat on the team with the fewest humans; the first human hosts.</summary>
    public Seat Take(IMatchClient client, string name)
    {
        var seat = _seats.Where(IsOpen)
            .OrderBy(s => _seats.Count(o => o.Team == s.Team && !o.IsBot))
            .ThenBy(s => s.Index)
            .FirstOrDefault();
        if (seat == null)
        {
            return null;
        }
        seat.Client = client;
        seat.Name = name;
        Host ??= seat;
        return seat;
    }

    /// <summary>Hands a seat back to its bot and passes hosting to another human.</summary>
    public void Vacate(Seat seat)
    {
        seat.Client = null;
        seat.Name = seat.BotName;
        if (Host == seat)
        {
            Host = _seats.FirstOrDefault(s => !s.IsBot);
        }
    }

    /// <summary>Moves a human into a bot seat on another team, keeping their name, race and host role.</summary>
    public void MoveToTeam(Seat seat, int team)
    {
        var target = _seats.FirstOrDefault(s => s.Team == team && s.IsBot);
        if (target == null || team == seat.Team)
        {
            return;
        }
        target.Client = seat.Client;
        target.Name = seat.Name;
        target.Race = seat.Race;
        var wasHost = Host == seat;
        seat.Client = null;
        seat.Name = seat.BotName;
        if (wasHost)
        {
            Host = target;
        }
    }

    private static bool IsOpen(Seat seat)
    {
        return seat.IsBot && (seat.Player == null || !seat.Player.IsDefeated);
    }
}
