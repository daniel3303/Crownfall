using Crownfall.Sim.Core;
using Crownfall.Sim.Entities;
using Crownfall.Sim.Events;

namespace Crownfall.Sim.Systems;

/// <summary>
/// The center boss, whose lair is a creep camp that fills on the rules' schedule and leashes like any other. Landings are
/// announced to everyone, and the slayers' team shares its gold and a timed attack buff.
/// </summary>
public sealed class DragonSystem
{
    private readonly Game _game;

    public DragonSystem(Game game)
    {
        _game = game;
    }

    /// <summary>The lair camp, or null when the rules have no dragon.</summary>
    public CreepCamp Lair { get; private set; }

    public bool IsUp => Lair is { Alive.Count: > 0 };

    /// <summary>Seconds until the dragon lands; 0 while it is up or without a lair.</summary>
    public float SecondsUntilLanding => Lair == null || IsUp ? 0 : MathF.Max(0, Lair.RespawnTick - _game.Tick) / _game.Content.Rules.TickRate;

    /// <summary>Creates the empty lair at the layout's lair point, timed to fill after the rules' first delay.</summary>
    public void OpenLair(int campId)
    {
        var rules = _game.Content.Rules;
        if (rules.Dragon == null)
        {
            return;
        }
        Lair = new CreepCamp(campId, _game.Layout.Lair, [_game.Content.DragonUnit])
        {
            RespawnSeconds = rules.Dragon.RespawnSeconds,
            LeashRange = rules.Dragon.LeashRange,
            IsLair = true,
            RespawnTick = (int)(rules.Dragon.SpawnSeconds * rules.TickRate),
        };
        _game.Creeps.Camps.Add(Lair);
    }

    /// <summary>Ends attack buffs whose time is up.</summary>
    public void Update()
    {
        foreach (var player in _game.Players)
        {
            if (player.AttackBuff > 0 && _game.Tick >= player.AttackBuffUntilTick)
            {
                player.AttackBuff = 0;
            }
        }
    }

    public void OnLanded(CreepCamp lair)
    {
        var name = _game.Content.DragonUnit.Name;
        _game.Events.Add(new AnnouncementEvent
        {
            Type = AnnouncementType.DragonSpawned,
            Title = "The Dragon Awakens",
            Text = $"The {name} has landed at the center of the map.",
            X = lair.Center.X,
            Y = lair.Center.Y,
        });
    }

    /// <summary>
    /// Pays every stockpile on the slaying team the dragon's gold once (teammates sharing a pool are paid once) and
    /// gives every player on that team the attack buff, shown where the dragon fell.
    /// </summary>
    public void OnSlain(Unit dragon, Player killer)
    {
        var def = _game.Content.Rules.Dragon;
        if (killer == null || def == null)
        {
            return;
        }
        var until = _game.Tick + (int)(def.BuffSeconds * _game.Content.Rules.TickRate);
        var paid = new List<Stockpile>();
        foreach (var player in _game.Players.Where(p => p.Team == killer.Team && !p.IsDefeated))
        {
            player.AttackBuff = def.BuffAttack;
            player.AttackBuffUntilTick = until;
            _game.Notify(player, $"Your team slew the {dragon.Def.Name}: +{def.Gold} gold and +{(int)MathF.Round(def.BuffAttack * 100)}% attack for {(int)def.BuffSeconds} s.", NoticeTone.Success, dragon.Position);
            if (paid.Any(stock => ReferenceEquals(stock, player.Stock)))
            {
                continue;
            }
            paid.Add(player.Stock);
            _game.Storage.Store(player, ResourceType.Gold, def.Gold);
            _game.Events.Add(new DepositEvent { Player = player.Index, X = dragon.Position.X, Y = dragon.Position.Y, Resource = ResourceType.Gold, Amount = def.Gold });
        }
        _game.Events.Add(new AnnouncementEvent
        {
            Type = AnnouncementType.DragonSlain,
            Title = "Dragon Slain",
            Text = $"{killer.Name}'s team slew the {dragon.Def.Name}.",
            Player = killer.Index,
            Team = killer.Team,
            X = dragon.Position.X,
            Y = dragon.Position.Y,
        });
    }

    /// <summary>Seconds the team's dragon buff has left; 0 when it has none.</summary>
    public float BuffSecondsLeft(Player player)
    {
        return player.AttackBuff > 0 ? MathF.Max(0, player.AttackBuffUntilTick - _game.Tick) / _game.Content.Rules.TickRate : 0;
    }
}
