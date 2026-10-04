using Crownfall.Sim.Entities;
using Crownfall.Sim.Events;

namespace Crownfall.Sim.Systems;

/// <summary>
/// A player is defeated with no town center and no villagers left. The match has no time limit: it ends when one
/// team, allies counted together, is all that remains.
/// </summary>
public sealed class VictorySystem
{
    private readonly Game _game;

    public VictorySystem(Game game)
    {
        _game = game;
    }

    public void Update()
    {
        if (_game.IsOver || _game.Tick % _game.Content.Rules.TickRate != 0)
        {
            return;
        }
        foreach (var player in _game.Players)
        {
            if (!player.IsDefeated && !CanRecover(player))
            {
                Defeat(player);
            }
        }
        var aliveTeams = _game.Players.Where(p => !p.IsDefeated).Select(p => p.Team).Distinct().ToList();
        if (aliveTeams.Count <= 1)
        {
            _game.End(aliveTeams.Count == 1 ? aliveTeams[0] : -1);
        }
    }

    private bool CanRecover(Player player)
    {
        var hasTownCenter = _game.Entities.Buildings.Any(b => b.Owner == player && b.IsAlive && b.Def.IsTownCenter && b.IsComplete);
        return hasTownCenter || _game.Entities.Units.Any(u => u.Owner == player && u.IsAlive && u.Def.IsVillager);
    }

    private void Defeat(Player player)
    {
        player.IsDefeated = true;
        foreach (var unit in _game.Entities.Units.Where(u => u.Owner == player).ToList())
        {
            _game.Kill(unit, null);
        }
        foreach (var building in _game.Entities.Buildings.Where(b => b.Owner == player).ToList())
        {
            _game.Kill(building, null);
        }
        player.Hero = null;
        player.HeroState.ReviveTick = -1;
        _game.Events.Add(new DefeatEvent { Player = player.Index, Name = player.Name });
    }
}
