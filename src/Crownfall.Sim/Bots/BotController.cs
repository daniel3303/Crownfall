using Crownfall.Sim.Entities;
using Crownfall.Sim.Events;

namespace Crownfall.Sim.Bots;

/// <summary>Drives one bot seat. Bots only act on what their team sees or has seen, through the normal command path.</summary>
public sealed class BotController
{
    private readonly Game _game;
    private readonly Player _player;
    private readonly BotProfile _profile;
    private readonly BotMemory _memory;
    private readonly BotArmyComposer _composer;
    private readonly BotEconomy _economy;
    private readonly BotVillagerGuard _guard;
    private readonly BotMilitary _military;
    private readonly BotHeroPilot _heroPilot;
    private readonly BotHeroUpgrades _heroUpgrades;
    private readonly BotUpgrades _upgrades;
    private readonly BotTrader _trader;
    private readonly BotRaids _raids;
    private readonly BotScout _scout;
    private readonly BotFoundationWatch _foundations;
    private int _nextThinkTick;

    public BotController(Game game, Player player)
    {
        _game = game;
        _player = player;
        _profile = BotProfile.For(player.BotDifficulty);
        var model = new BotCombatModel(game.Content);
        _memory = new BotMemory(game, player, _profile, model);
        _composer = new BotArmyComposer(game, player, _profile, model, _memory);
        _economy = new BotEconomy(game, player, _profile, _memory, model);
        _guard = new BotVillagerGuard(game, player, _profile, model);
        _military = new BotMilitary(game, player, _profile, model, _memory, _composer);
        _heroPilot = new BotHeroPilot(game, player, _profile, _memory);
        _heroUpgrades = new BotHeroUpgrades(game, player);
        _upgrades = new BotUpgrades(game, player, _profile);
        _trader = new BotTrader(game, player);
        _raids = new BotRaids(game, player, _memory);
        _scout = new BotScout(game, player, _profile, _memory);
        _foundations = new BotFoundationWatch(game);
        _nextThinkTick = game.Tick + player.Index % _profile.ThinkTicks;
    }

    /// <summary>Called after every tick: deaths and casts happen between thinks, and the team sees the ones in its vision.</summary>
    public void Witness(IReadOnlyList<GameEvent> events)
    {
        if (_player.IsDefeated)
        {
            return;
        }
        foreach (var gameEvent in events)
        {
            if (!gameEvent.IsVisibleTo(_game, _player))
            {
                continue;
            }
            if (gameEvent is DeathEvent death)
            {
                _memory.Witness(death, _game.Tick);
            }
            else if (gameEvent is AbilityEvent ability)
            {
                _memory.Witness(ability, _game.Tick);
            }
        }
    }

    public void Think()
    {
        if (_game.Tick < _nextThinkTick || _player.IsDefeated || _game.IsOver)
        {
            return;
        }
        _nextThinkTick = _game.Tick + _profile.ThinkTicks;
        var view = BotView.Capture(_game, _player, _foundations.Abandoned);
        _memory.Observe(view);
        _scout.Run(view, _military.Mode);
        _guard.Scan(view);
        _foundations.Track(view, _guard.Threat.IsActive);
        _composer.Plan(_economy.Available);
        _economy.Prepare(view);
        _military.Assess(view, _guard.Threat, _economy.HeroReserve);
        _economy.Run(view, _composer.Mix, _guard, _military.Urgent);
        _heroUpgrades.Run(view);
        _upgrades.Run(view, _economy.ArmyReserve, _military.Urgent);
        _trader.Run(view, _economy.ArmyReserve, _economy.Available);
        _raids.Run(view, _guard.Threat.IsActive);
        _military.Run(view, _guard.Threat, _economy.ArmyReserve);
        _guard.Protect(view);
        _heroPilot.Run(view, _military.Mode);
    }
}
