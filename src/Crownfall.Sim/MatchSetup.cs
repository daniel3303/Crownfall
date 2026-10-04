using System.Numerics;
using Crownfall.Sim.Content;
using Crownfall.Sim.Core;
using Crownfall.Sim.Entities;
using Crownfall.Sim.World;

namespace Crownfall.Sim;

/// <summary>Seats, stockpiles and the opening position of a new match.</summary>
internal static class MatchSetup
{
    private const float VillagerRingRadius = 3.2f;

    public static void Validate(ContentDb content, MatchConfig config, IReadOnlyList<PlayerSetup> setups)
    {
        if (setups.Count != config.PlayerCount)
        {
            throw new ArgumentException($"Expected {config.PlayerCount} seats, got {setups.Count}.", nameof(setups));
        }
        for (var team = 0; team < config.Teams; team++)
        {
            if (setups.Count(s => s.Team == team) != config.PlayersPerTeam)
            {
                throw new ArgumentException($"Team {team} must have {config.PlayersPerTeam} seats.", nameof(setups));
            }
        }
        if (setups.Any(s => !content.HasRace(s.Race)))
        {
            throw new ArgumentException("Every seat needs a known race.", nameof(setups));
        }
    }

    /// <summary>One player per seat; under Shared sharing every teammate holds the same Stockpile instance.</summary>
    public static List<Player> CreatePlayers(ContentDb content, MatchConfig config, MapLayout layout, IReadOnlyList<PlayerSetup> setups)
    {
        var teamStock = new Dictionary<int, Stockpile>();
        var players = new List<Player>();
        var slots = new int[config.Teams];
        for (var index = 0; index < setups.Count; index++)
        {
            var setup = setups[index];
            var stock = config.Sharing == ResourceSharing.Shared
                ? teamStock.TryGetValue(setup.Team, out var shared) ? shared : teamStock[setup.Team] = new Stockpile()
                : new Stockpile();
            stock.Add(content.StartingResources);
            var race = content.Race(setup.Race);
            var slot = slots[setup.Team]++;
            players.Add(new Player
            {
                Index = index,
                Name = setup.Name,
                Team = setup.Team,
                Race = race,
                IsBot = setup.IsBot,
                BotDifficulty = config.Difficulty,
                Stock = stock,
                Start = layout.Starts.First(s => s.Team == setup.Team && s.Slot == slot),
                HeroState = new HeroState(race.HeroUnit, content.Abilities.Count, content.HeroStats, content.Rules.HeroInventorySlots),
                MarketPrices = (float[])content.MarketBasePrices.Clone(),
            });
        }
        return players;
    }

    /// <summary>Spawns deposits, each player's town center, villagers and hero, then the creep camps and the empty dragon lair.</summary>
    public static void Populate(Game game)
    {
        var content = game.Content;
        foreach (var placement in game.Layout.Nodes)
        {
            var node = game.Entities.Add(new ResourceNode(placement.Def, placement.Footprint));
            game.Map.Occupy(placement.Footprint, node.Id, blocksMovement: true);
        }
        var townCenter = content.Buildings.First(b => b.IsTownCenter);
        var villager = content.Units.First(u => u.IsVillager);
        var villagers = content.Rules.StartingVillagers;
        foreach (var player in game.Players)
        {
            var start = player.Start;
            var building = game.PlaceBuilding(townCenter, player, start.TownCenter, complete: true);
            building.HasRally = false;
            for (var i = 0; i < villagers; i++)
            {
                var angle = start.Facing + (i - (villagers - 1) / 2f) * 0.45f;
                game.SpawnUnit(villager, player, start.Center + new Vector2(MathF.Cos(angle), MathF.Sin(angle)) * VillagerRingRadius);
            }
            var behind = start.Facing + MathF.PI;
            game.Heroes.SpawnHero(player, start.Center + new Vector2(MathF.Cos(behind), MathF.Sin(behind)) * VillagerRingRadius);
        }
        var campId = 1;
        foreach (var placement in game.Layout.Camps)
        {
            var camp = new CreepCamp(campId++, placement.Center, placement.Members.Select(content.Unit).ToList())
            {
                RespawnSeconds = content.Rules.CampRespawnSeconds,
                LeashRange = content.Rules.CreepLeashRange,
            };
            game.Creeps.Camps.Add(camp);
            game.Creeps.Spawn(camp);
        }
        game.Dragon.OpenLair(campId);
    }
}
