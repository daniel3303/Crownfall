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
    public HeroState HeroState { get; init; }

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

    /// <summary>This player's market mid prices in gold per lot, by resource; gold's slot is unused.</summary>
    public float[] MarketPrices { get; init; } = new float[Core.Resources.Count];
}
