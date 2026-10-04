using Crownfall.Sim.Content;
using Crownfall.Sim.Core;
using Crownfall.Sim.World;

namespace Crownfall.Sim.Entities;

public sealed class Player
{
    public int Index { get; init; }
    public string Name { get; set; }
    public int Team { get; init; }
    public RaceDef Race { get; init; }
    public bool IsBot { get; set; }
    public BotDifficulty BotDifficulty { get; set; }
    public Stockpile Stock { get; init; }
    public StartLocation Start { get; init; }
    /// <summary>The hero's progress; replaced only when a newcomer swaps in another hero before this one earned anything.</summary>
    public HeroState HeroState { get; set; }

    /// <summary>The living hero unit, or null while it waits to respawn.</summary>
    public Unit Hero { get; set; }

    public int Population { get; set; }
    public int PopulationCap { get; set; }
    public bool IsDefeated { get; set; }
    public PlayerStats Stats { get; } = new();
    public int LastUnderAttackNoticeTick { get; set; } = -100000;
    public int LastHousedNoticeTick { get; set; } = -100000;
    public int LastStorageNoticeTick { get; set; } = -100000;
    public int LastRaidNoticeTick { get; set; } = -100000;

    /// <summary>Share of extra attack damage every unit of this player deals, from slaying the dragon; 0 when none.</summary>
    public float AttackBuff { get; set; }

    /// <summary>Tick at which <see cref="AttackBuff"/> wears off.</summary>
    public int AttackBuffUntilTick { get; set; } = -1;

    /// <summary>This player's market mid prices in gold per lot, by resource; gold's slot is unused.</summary>
    public float[] MarketPrices { get; init; } = new float[Core.Resources.Count];
}
