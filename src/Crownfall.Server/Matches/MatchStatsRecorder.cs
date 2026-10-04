using Crownfall.Server.Protocol.Messages;
using Crownfall.Sim;
using Crownfall.Sim.Core;
using Crownfall.Sim.Events;

namespace Crownfall.Server.Matches;

/// <summary>
/// Watches a running game from the host, read-only: samples each player's army, gathering and score every
/// <see cref="SampleSeconds"/> and counts from the tick's events what <c>PlayerStats</c> does not track.
/// </summary>
public sealed class MatchStatsRecorder
{
    public const int SampleSeconds = 10;

    private readonly int _sampleTicks;
    private readonly int _tickRate;
    private readonly HashSet<int> _heroKinds;
    private readonly HashSet<string> _soldiers;
    private readonly List<int> _seconds = [];
    private readonly PlayerTally[] _tallies;
    private int _lastObservedTick = -1;
    private int _lastSampledTick = -1;

    public MatchStatsRecorder(Game game)
    {
        _tickRate = game.Content.Rules.TickRate;
        _sampleTicks = SampleSeconds * _tickRate;
        _heroKinds = game.Content.Units.Where(u => u.IsHero).Select(u => u.Kind).ToHashSet();
        _soldiers = game.Content.Units.Where(u => u.IsMilitary).Select(u => u.Id).ToHashSet();
        _tallies = game.Players.Select(_ => new PlayerTally()).ToArray();
        Sample(game);
        _lastObservedTick = game.Tick;
    }

    public PlayerTally Tally(int player)
    {
        return _tallies[player];
    }

    /// <summary>Call once after every step: counts the step's events, then samples on the interval and at the final tick.</summary>
    public void Observe(Game game)
    {
        if (game.Tick != _lastObservedTick)
        {
            _lastObservedTick = game.Tick;
            Count(game);
        }
        if (game.Tick != _lastSampledTick && (game.Tick % _sampleTicks == 0 || game.IsOver))
        {
            Sample(game);
        }
    }

    public TimelineView Timeline()
    {
        return new TimelineView
        {
            IntervalSeconds = SampleSeconds,
            Seconds = [.. _seconds],
            Players = _tallies.Select((tally, index) => new PlayerTimelineView
            {
                Index = index,
                Army = [.. tally.Army],
                Gathered = [.. tally.Gathered],
                Score = [.. tally.Score],
            }).ToList(),
        };
    }

    private void Sample(Game game)
    {
        _lastSampledTick = game.Tick;
        var second = game.Tick / _tickRate;
        // A game ending a few ticks past an interval would repeat that second, so the final state replaces that sample.
        if (_seconds.Count > 0 && _seconds[^1] == second)
        {
            DropLastSample();
        }
        _seconds.Add(second);
        var army = new int[_tallies.Length];
        foreach (var unit in game.Entities.Units)
        {
            if (unit.Owner != null && unit.IsAlive && unit.Def.IsMilitary)
            {
                army[unit.Owner.Index]++;
            }
        }
        foreach (var player in game.Players)
        {
            var tally = _tallies[player.Index];
            tally.Army.Add(army[player.Index]);
            tally.Gathered.Add(player.Stats.Gathered);
            tally.Score.Add(player.Stats.Score);
        }
    }

    private void DropLastSample()
    {
        _seconds.RemoveAt(_seconds.Count - 1);
        foreach (var tally in _tallies)
        {
            tally.Army.RemoveAt(tally.Army.Count - 1);
            tally.Gathered.RemoveAt(tally.Gathered.Count - 1);
            tally.Score.RemoveAt(tally.Score.Count - 1);
        }
    }

    private void Count(Game game)
    {
        var events = game.Events;
        for (var i = 0; i < events.Count; i++)
        {
            switch (events[i])
            {
                case CompletedEvent completed when _soldiers.Contains(completed.What):
                    _tallies[completed.Player].SoldiersTrained++;
                    break;
                case DeathEvent { Category: "unit", Owner: >= 0 } death when _heroKinds.Contains(death.EntityKind):
                    _tallies[death.Owner].HeroDeaths++;
                    CreditHeroKill(game, events, i, death);
                    break;
            }
        }
    }

    /// <summary>
    /// The sim pays a hero's slayer its bounty right after the death, as a gold deposit where the hero fell; that deposit
    /// is the only trace of who struck the blow. A hero felled by creeps leaves none and credits nobody.
    /// </summary>
    private void CreditHeroKill(Game game, List<GameEvent> events, int deathIndex, DeathEvent death)
    {
        var victimTeam = game.Players[death.Owner].Team;
        for (var i = deathIndex + 1; i < events.Count; i++)
        {
            if (events[i] is DepositEvent { Resource: ResourceType.Gold } bounty
                && bounty.X == death.X && bounty.Y == death.Y
                && game.PlayerAt(bounty.Player) is { } killer && killer.Team != victimTeam)
            {
                _tallies[killer.Index].HeroKills++;
                return;
            }
        }
    }
}
