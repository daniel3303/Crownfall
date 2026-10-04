using Crownfall.Server.Protocol.Messages;
using Crownfall.Sim;
using Crownfall.Sim.Content;
using Crownfall.Sim.Core;
using Crownfall.Sim.Entities;

namespace Crownfall.Server.Matches;

/// <summary>Builds the JSON messages a match sends: lobby, welcome, HUD state and final results.</summary>
public sealed class LobbyMessageBuilder
{
    private readonly MatchHost _match;
    private readonly ContentDb _content;

    public LobbyMessageBuilder(MatchHost match, ContentDb content)
    {
        _match = match;
        _content = content;
    }

    public LobbyMessage Lobby(Seat viewer)
    {
        return new LobbyMessage
        {
            MatchId = _match.Id,
            Phase = "lobby",
            You = viewer.Index,
            Config = _match.Config,
            Seats = _match.Seats.Select(s => new SeatView
            {
                Index = s.Index,
                Team = s.Team,
                Name = s.Name,
                Race = s.Race,
                Hero = _match.HeroOf(s),
                IsBot = s.IsBot,
                IsHost = s == _match.HostSeat,
            }).ToList(),
        };
    }

    public WelcomeMessage Welcome(Seat viewer)
    {
        var game = _match.Game;
        return new WelcomeMessage
        {
            MatchId = _match.Id,
            You = viewer.Player.Index,
            Config = _match.Config,
            TickRate = _content.Rules.TickRate,
            Tick = game.Tick,
            Players = Players(),
            Map = new MapView
            {
                Width = game.Map.Width,
                Height = game.Map.Height,
                Tiles = Convert.ToBase64String(game.Map.TileBytes()),
            },
        };
    }

    public StateMessage State(Player viewer)
    {
        var game = _match.Game;
        var rate = _content.Rules.TickRate;
        return new StateMessage
        {
            Tick = game.Tick,
            ElapsedSeconds = game.Tick / rate,
            Resources = viewer.Stock.Snapshot(),
            Storage = viewer.Stock.Caps(),
            TownCenterLevel = game.Upgrades.TownCenterLevel(viewer),
            Market = Market(game, viewer),
            Population = viewer.Population,
            PopulationCap = viewer.PopulationCap,
            Hero = HeroViewFactory.Create(game, viewer),
            Dragon = game.Dragon.Lair == null ? null : new DragonView
            {
                IsUp = game.Dragon.IsUp,
                LandsInSeconds = game.Dragon.SecondsUntilLanding,
                BuffSeconds = game.Dragon.BuffSecondsLeft(viewer),
            },
            Production = game.Entities.Buildings
                .Where(b => b.Owner == viewer && b.Queue.Count > 0)
                .Select(b => new ProductionView
                {
                    Id = b.Id,
                    Queue = b.Queue.Select(q => q.Unit.Id).ToList(),
                    Progress = b.Queue[0].Progress,
                })
                .ToList(),
            Players = Players(),
        };
    }

    private MarketView Market(Game game, Player viewer)
    {
        var tradable = Resources.All.Select(game.Market.IsTradable).ToArray();
        return new MarketView
        {
            Lot = _content.Rules.Market.Lot,
            Buy = Resources.All.Select((type, i) => tradable[i] ? game.Market.BuyPrice(viewer, type) : 0).ToArray(),
            Sell = Resources.All.Select((type, i) => tradable[i] ? game.Market.SellPrice(viewer, type) : 0).ToArray(),
        };
    }

    public EndMessage End(MatchStatsRecorder stats)
    {
        var game = _match.Game;
        return new EndMessage
        {
            WinningTeam = game.WinningTeam,
            DurationSeconds = game.Tick / _content.Rules.TickRate,
            Players = game.Players.Select(p =>
            {
                var tally = stats.Tally(p.Index);
                return new EndPlayerView
                {
                    Index = p.Index,
                    Name = p.Name,
                    Team = p.Team,
                    IsBot = p.IsBot,
                    Hero = p.HeroState.Def.Id,
                    Score = p.Stats.Score,
                    Gathered = p.Stats.Gathered,
                    Kills = p.Stats.Kills,
                    Losses = p.Stats.Losses,
                    UnitsTrained = p.Stats.UnitsTrained,
                    HeroLevel = p.HeroState.Level,
                    SoldiersTrained = tally.SoldiersTrained,
                    BuildingsBuilt = p.Stats.BuildingsBuilt,
                    HeroKills = tally.HeroKills,
                    HeroDeaths = tally.HeroDeaths,
                };
            }).ToList(),
            Timeline = stats.Timeline(),
        };
    }

    private List<PlayerView> Players()
    {
        return _match.Game.Players.Select(p => new PlayerView
        {
            Index = p.Index,
            Name = p.Name,
            Team = p.Team,
            Race = p.Race.Id,
            Hero = p.HeroState.Def.Id,
            IsBot = p.IsBot,
            Defeated = p.IsDefeated,
            Score = p.Stats.Score,
        }).ToList();
    }
}
