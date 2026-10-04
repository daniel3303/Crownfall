using Crownfall.Sim.Commands;
using Crownfall.Sim.Content;
using Crownfall.Sim.Core;
using Crownfall.Sim.Entities;

namespace Crownfall.Sim.Bots;

/// <summary>
/// Spends the bot hero's level-up points and pays to revive it. Points follow fixed weights so a build stays rounded:
/// damage and health first, then life steal and attack speed, a little movement speed. A revive is paid as soon as its
/// cooldown ends and the stockpile covers it; the economy holds that much back from the moment the hero falls.
/// </summary>
public sealed class BotHeroUpgrades
{
    private static readonly Dictionary<HeroStatEffect, float> Weights = new()
    {
        [HeroStatEffect.AttackDamage] = 3f,
        [HeroStatEffect.MaxHealth] = 3f,
        [HeroStatEffect.LifeSteal] = 2f,
        [HeroStatEffect.AttackSpeed] = 2f,
        [HeroStatEffect.MoveSpeed] = 1f,
    };

    private readonly Game _game;
    private readonly Player _player;

    public BotHeroUpgrades(Game game, Player player)
    {
        _game = game;
        _player = player;
    }

    public void Run(BotView view)
    {
        if (_player.HeroState.UnspentPoints > 0)
        {
            _game.Commands.Apply(_player, new HeroStatCommand { Stat = NextStat() });
        }
        if (view.TownCenter != null && _game.Heroes.CanRevive(_player) && _player.Stock.CanAfford(_game.Heroes.ReviveCost(_player)))
        {
            _game.Commands.Apply(_player, new ReviveHeroCommand { Building = view.TownCenter.Id });
        }
    }

    /// <summary>The stat furthest below its weighted share of the ranks; ties go to content order.</summary>
    public string NextStat()
    {
        var stats = _game.Content.HeroStats;
        var ranks = _player.HeroState.Ranks;
        var best = 0;
        var bestScore = float.MaxValue;
        for (var i = 0; i < stats.Count; i++)
        {
            var score = (ranks[i] + 1) / Weights.GetValueOrDefault(stats[i].Effect, 1f);
            if (score < bestScore)
            {
                bestScore = score;
                best = i;
            }
        }
        return stats[best].Id;
    }
}
