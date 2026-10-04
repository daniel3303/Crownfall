using Crownfall.Sim.Core;

namespace Crownfall.Sim.Bots;

/// <summary>Difficulty knobs: reaction speed, economy size, attack caution and which skills a bot uses.</summary>
public sealed class BotProfile
{
    public int ThinkTicks { get; init; }

    public int TargetVillagers { get; init; }
    public int VillagerQueue { get; init; }

    /// <summary>A villager over its job target before the bot moves it to a short resource.</summary>
    public int RebalanceSurplus { get; init; }

    public int RebalancePerThink { get; init; }
    public int BarracksAtVillagers { get; init; }
    public int VillagersPerExtraBarracks { get; init; }
    public int MaxBarracks { get; init; }
    public int BarracksQueue { get; init; }
    public int Towers { get; init; }

    /// <summary>Towers the bot builds up to while its bank floats and stone allows.</summary>
    public int MaxTowers { get; init; }

    public int MaxFarms { get; init; }
    public int ConcurrentFarms { get; init; }
    public int MaxStorehouses { get; init; }
    public int ConcurrentHouses { get; init; }

    /// <summary>Own army power must exceed known enemy power by this factor before an attack.</summary>
    public float AttackMargin { get; init; }

    public int MinAttackArmy { get; init; }

    /// <summary>Army power below this share of the estimated enemy puts soldiers ahead of villagers and farms.</summary>
    public float DefenseRatio { get; init; }

    /// <summary>Retreat when nearby enemy power exceeds the army's own by this factor.</summary>
    public float RetreatRatio { get; init; }

    /// <summary>How strongly production follows scouted counters, from 0 (fixed mix) to 1.</summary>
    public float CounterWeight { get; init; }

    public bool Micro { get; init; }

    /// <summary>Archers that just fired step back behind their own melee.</summary>
    public bool Kite { get; init; }

    /// <summary>Soldiers step out from under enemy meteor strikes seen being cast.</summary>
    public bool Dodge { get; init; }

    /// <summary>Melee soldiers a ready enemy area ability would kill stay out of its reach, but for a few baits.</summary>
    public bool RespectAreaAbilities { get; init; }

    /// <summary>An attacking wave strung out on the march gathers on its centroid before it meets the enemy.</summary>
    public bool KeepWaveTogether { get; init; }

    /// <summary>Most soldiers, as a share of the group, the bot will expect to lose slaying the dragon; 0 never tries.</summary>
    public float DragonLossShare { get; init; }

    /// <summary>Dearest item, in total resources, the bot buys for its hero.</summary>
    public int ItemBudget { get; init; }

    /// <summary>Seconds after a retreat before the army may attack again without having grown.</summary>
    public int RegroupSeconds { get; init; }
    public bool ScoutEarly { get; init; }

    /// <summary>Seconds without seeing enemy soldiers before the hero scouts again; 0 never re-scouts.</summary>
    public int RescoutSeconds { get; init; }

    public bool DefendVillagers { get; init; }
    public bool VillagersFlee { get; init; }
    public int MemorySeconds { get; init; }

    /// <summary>Hero hp fraction below which it walks home; 0 never retreats.</summary>
    public float HeroRetreatHealth { get; init; }

    public int NovaTargets { get; init; }
    public int StrikeTargets { get; init; }

    /// <summary>Extra share of every deposit the bot banks, villager loads and hero bounties alike; 0 for a fair economy. The bonus never counts toward Stats.Gathered, so end-screen figures show only what was really gathered.</summary>
    public float GatherBonus { get; init; }

    /// <summary>Never leaves home: no scouting, raids, army or hero trips, so a tutorial player can learn undisturbed.</summary>
    public bool Passive { get; init; }

    public static BotProfile For(BotDifficulty difficulty)
    {
        return difficulty switch
        {
            BotDifficulty.Easy => new BotProfile
            {
                ThinkTicks = 20,
                TargetVillagers = 12,
                VillagerQueue = 1,
                RebalanceSurplus = 3,
                RebalancePerThink = 1,
                BarracksAtVillagers = 11,
                VillagersPerExtraBarracks = int.MaxValue,
                MaxBarracks = 1,
                BarracksQueue = 2,
                Towers = 0,
                MaxTowers = 0,
                MaxFarms = 12,
                ConcurrentFarms = 1,
                MaxStorehouses = 2,
                ConcurrentHouses = 1,
                AttackMargin = 1.8f,
                MinAttackArmy = 10,
                DefenseRatio = 0f,
                RetreatRatio = 2.5f,
                CounterWeight = 0.25f,
                Micro = false,
                Kite = false,
                Dodge = false,
                RespectAreaAbilities = false,
                KeepWaveTogether = false,
                DragonLossShare = 0.2f,
                ItemBudget = 150,
                RegroupSeconds = 60,
                ScoutEarly = false,
                RescoutSeconds = 0,
                DefendVillagers = false,
                VillagersFlee = false,
                MemorySeconds = 60,
                HeroRetreatHealth = 0,
                NovaTargets = 3,
                StrikeTargets = 4,
            },
            BotDifficulty.Hard => new BotProfile
            {
                ThinkTicks = 5,
                TargetVillagers = 40,
                VillagerQueue = 2,
                RebalanceSurplus = 1,
                RebalancePerThink = 2,
                BarracksAtVillagers = 9,
                VillagersPerExtraBarracks = 12,
                MaxBarracks = 4,
                BarracksQueue = 2,
                Towers = 2,
                MaxTowers = 4,
                MaxFarms = 40,
                ConcurrentFarms = 3,
                MaxStorehouses = 5,
                ConcurrentHouses = 2,
                AttackMargin = 1.2f,
                MinAttackArmy = 7,
                DefenseRatio = 0.8f,
                RetreatRatio = 1.3f,
                CounterWeight = 1f,
                Micro = true,
                Kite = true,
                Dodge = true,
                RespectAreaAbilities = true,
                KeepWaveTogether = true,
                DragonLossShare = 0.3f,
                ItemBudget = 800,
                RegroupSeconds = 30,
                ScoutEarly = true,
                RescoutSeconds = 120,
                DefendVillagers = true,
                VillagersFlee = true,
                MemorySeconds = 180,
                HeroRetreatHealth = 0.35f,
                NovaTargets = 2,
                StrikeTargets = 3,
            },
            // Hard's judgment with faster reactions, earlier attacks and a bonus-fed economy. In bot duels it does not beat
            // Hard yet (19 of 40 seeds); income, tempo and hero experience bonuses all measured as noise.
            BotDifficulty.Brutal => new BotProfile
            {
                ThinkTicks = 3,
                TargetVillagers = 48,
                VillagerQueue = 2,
                RebalanceSurplus = 1,
                RebalancePerThink = 2,
                BarracksAtVillagers = 9,
                VillagersPerExtraBarracks = 12,
                MaxBarracks = 4,
                BarracksQueue = 2,
                Towers = 2,
                MaxTowers = 4,
                MaxFarms = 40,
                ConcurrentFarms = 3,
                MaxStorehouses = 8,
                ConcurrentHouses = 2,
                AttackMargin = 1.2f,
                MinAttackArmy = 5,
                DefenseRatio = 0.8f,
                RetreatRatio = 1.3f,
                CounterWeight = 1f,
                Micro = true,
                Kite = true,
                Dodge = true,
                RegroupSeconds = 30,
                ScoutEarly = true,
                RescoutSeconds = 120,
                DefendVillagers = true,
                VillagersFlee = true,
                MemorySeconds = 180,
                HeroRetreatHealth = 0.35f,
                NovaTargets = 2,
                StrikeTargets = 3,
                RespectAreaAbilities = true,
                KeepWaveTogether = true,
                DragonLossShare = 0.3f,
                ItemBudget = 800,
                GatherBonus = 0.3f,
            },
            BotDifficulty.Passive => new BotProfile
            {
                ThinkTicks = 20,
                TargetVillagers = 12,
                VillagerQueue = 1,
                RebalanceSurplus = 3,
                RebalancePerThink = 1,
                BarracksAtVillagers = int.MaxValue,
                VillagersPerExtraBarracks = int.MaxValue,
                MaxBarracks = 0,
                BarracksQueue = 0,
                Towers = 0,
                MaxTowers = 0,
                MaxFarms = 6,
                ConcurrentFarms = 1,
                MaxStorehouses = 2,
                ConcurrentHouses = 1,
                AttackMargin = float.MaxValue,
                MinAttackArmy = int.MaxValue,
                DefenseRatio = 0f,
                RetreatRatio = 2.5f,
                CounterWeight = 0f,
                Micro = false,
                Kite = false,
                Dodge = false,
                RegroupSeconds = 60,
                ScoutEarly = false,
                RescoutSeconds = 0,
                DefendVillagers = false,
                VillagersFlee = false,
                MemorySeconds = 60,
                HeroRetreatHealth = 0,
                NovaTargets = 3,
                StrikeTargets = 4,
                Passive = true,
            },
            _ => new BotProfile
            {
                ThinkTicks = 10,
                TargetVillagers = 28,
                VillagerQueue = 1,
                RebalanceSurplus = 2,
                RebalancePerThink = 1,
                BarracksAtVillagers = 10,
                VillagersPerExtraBarracks = 14,
                MaxBarracks = 3,
                BarracksQueue = 2,
                Towers = 1,
                MaxTowers = 2,
                MaxFarms = 28,
                ConcurrentFarms = 2,
                MaxStorehouses = 4,
                ConcurrentHouses = 1,
                AttackMargin = 1.45f,
                MinAttackArmy = 8,
                DefenseRatio = 0.7f,
                RetreatRatio = 1.6f,
                CounterWeight = 0.7f,
                Micro = true,
                Kite = false,
                Dodge = true,
                RespectAreaAbilities = false,
                KeepWaveTogether = false,
                DragonLossShare = 0.25f,
                ItemBudget = 400,
                RegroupSeconds = 45,
                ScoutEarly = true,
                RescoutSeconds = 180,
                DefendVillagers = true,
                VillagersFlee = true,
                MemorySeconds = 120,
                HeroRetreatHealth = 0.3f,
                NovaTargets = 2,
                StrikeTargets = 3,
            },
        };
    }
}
