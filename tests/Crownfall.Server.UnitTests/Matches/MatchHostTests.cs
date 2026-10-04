using Crownfall.Server.Matches;
using Crownfall.Server.Protocol;
using Crownfall.Server.Protocol.Messages;
using Crownfall.Server.UnitTests.Support;
using Crownfall.Sim.Commands;
using Crownfall.Sim.Content;
using Crownfall.Sim.Core;
using Crownfall.Sim.Events;
using Microsoft.Extensions.Logging.Abstractions;

namespace Crownfall.Server.UnitTests.Matches;

public class MatchHostTests
{
    private static readonly ContentDb Content = ContentDb.Load(RepoFiles.Path("content", "game.json"));

    [Fact]
    public void Join_TwoPlayers_LandOnDifferentTeamsAndFirstIsHost()
    {
        using var match = CustomMatch();
        var (first, second) = (new FakeClient(), new FakeClient());

        Join(match, first, "Ana");
        Join(match, second, "Bo");

        var lobby = second.Last<LobbyMessage>();
        var ana = lobby.Seats.Single(s => s.Name == "Ana");
        var bo = lobby.Seats.Single(s => s.Name == "Bo");
        ana.Team.Should().NotBe(bo.Team);
        ana.IsHost.Should().BeTrue();
        lobby.Seats.Count(s => s.IsBot).Should().Be(2);
    }

    [Fact]
    public void Rename_InLobby_IsSanitizedAndShownToEveryone()
    {
        using var match = CustomMatch();
        var (host, guest) = (new FakeClient(), new FakeClient());
        Join(match, host, "Ana");
        Join(match, guest, "Bo");

        match.Enqueue(new MessageInbound(guest, new LobbyRequest(LobbyAction.SetName, 0, null, "  Sir (Bot) Bartholomew the Bold ")));
        match.Tick();

        var seats = host.Last<LobbyMessage>().Seats;
        seats.Should().Contain(s => s.Name == "Sir Bot Bartholo");
        seats.Should().NotContain(s => s.Name == "Bo");
    }

    [Fact]
    public void Rename_ToBlank_FallsBackToTheDefaultName()
    {
        using var match = CustomMatch();
        var host = new FakeClient();
        Join(match, host, "Ana");

        match.Enqueue(new MessageInbound(host, new LobbyRequest(LobbyAction.SetName, 0, null, "   ")));
        match.Tick();

        host.Last<LobbyMessage>().Seats.Should().Contain(s => s.Name == PlayerNames.Fallback);
    }

    [Fact]
    public void Start_ByHost_SendsWelcomeWithMapToEveryHuman()
    {
        using var match = CustomMatch();
        var (host, guest) = (new FakeClient(), new FakeClient());
        Join(match, host, "Ana");
        Join(match, guest, "Bo");

        Lobby(match, guest, LobbyAction.Start);
        match.Phase.Should().Be(MatchPhase.Lobby);
        Lobby(match, host, LobbyAction.Start);

        match.Phase.Should().Be(MatchPhase.Playing);
        host.Last<WelcomeMessage>().Map.Tiles.Should().NotBeNullOrEmpty();
        guest.Last<WelcomeMessage>().You.Should().NotBe(host.Last<WelcomeMessage>().You);
    }

    [Fact]
    public void Playing_StreamsSnapshotsAndPeriodicState()
    {
        using var match = QuickMatch();
        var client = new FakeClient();
        Join(match, client, "Ana");

        for (var i = 0; i < 6; i++)
        {
            match.Tick();
        }

        client.Snapshots.Should().BeGreaterThanOrEqualTo(6);
        client.Messages.OfType<StateMessage>().Should().HaveCountGreaterThanOrEqualTo(2);
    }

    [Fact]
    public void Playing_StateCarriesTheHeroStatsAndElapsedTime()
    {
        using var match = QuickMatch();
        var client = new FakeClient();
        Join(match, client, "Ana");

        for (var i = 0; i < 30; i++)
        {
            match.Tick();
        }

        var state = client.Last<StateMessage>();
        state.ElapsedSeconds.Should().BeGreaterThan(0);
        state.Hero.Stats.MaxHp.Should().BeGreaterThan(0);
        state.Hero.Stats.Attack.Should().BeGreaterThan(0);
        state.Hero.Ranks.Should().HaveCount(Content.HeroStats.Count);
        state.Hero.ReviveCost.Should().Equal(Content.HeroReviveCost(state.Hero.Level));
    }

    [Fact]
    public void Playing_StateCarriesTheDragonsLandingTimer()
    {
        using var match = QuickMatch();
        var client = new FakeClient();
        Join(match, client, "Ana");

        for (var i = 0; i < 10; i++)
        {
            match.Tick();
        }

        var state = client.Last<StateMessage>();
        state.Dragon.IsUp.Should().BeFalse();
        state.Dragon.LandsInSeconds.Should().BeLessThan(Content.Rules.Dragon.SpawnSeconds).And.BeGreaterThan(Content.Rules.Dragon.SpawnSeconds - 2);
        state.Dragon.BuffSeconds.Should().Be(0);
    }

    [Fact]
    public void Playing_StateCarriesStorageCapsAndMarketPrices()
    {
        using var match = QuickMatch();
        var client = new FakeClient();
        Join(match, client, "Ana");

        for (var i = 0; i < 10; i++)
        {
            match.Tick();
        }

        var state = client.Last<StateMessage>();
        var townCenter = Content.Building("townCenter").Storage;
        state.Storage.Should().Equal(townCenter, townCenter, townCenter, townCenter);
        state.TownCenterLevel.Should().Be(1);
        state.Market.Lot.Should().Be(Content.Rules.Market.Lot);
        state.Market.Buy[(int)Crownfall.Sim.Core.ResourceType.Gold].Should().Be(0);
        state.Market.Buy[(int)Crownfall.Sim.Core.ResourceType.Food].Should().BeGreaterThan(state.Market.Sell[(int)Crownfall.Sim.Core.ResourceType.Food]);
    }

    [Fact]
    public void Join_RunningQuickPlay_TakesOverABotSeat()
    {
        using var match = QuickMatch();
        var client = new FakeClient();

        Join(match, client, "Ana");

        var you = client.Last<WelcomeMessage>().You;
        var player = match.Game.Players[you];
        player.IsBot.Should().BeFalse();
        player.Name.Should().Be("Ana");
    }

    [Fact]
    public void Leave_MidGame_HandsTheSeatBackToABot()
    {
        using var match = QuickMatch();
        var client = new FakeClient();
        Join(match, client, "Ana");
        var you = client.Last<WelcomeMessage>().You;

        match.Enqueue(new LeaveInbound(client));
        match.Tick();

        match.Game.Players[you].IsBot.Should().BeTrue();
        match.Status.HumanCount.Should().Be(0);
    }

    [Fact]
    public void Join_FullMatch_IsRefused()
    {
        using var match = CustomMatch(perTeam: 1);
        Join(match, new FakeClient(), "Ana");
        Join(match, new FakeClient(), "Bo");
        var late = new FakeClient();

        Join(match, late, "Cy");

        late.Last<ErrorMessage>().Message.Should().Contain("full");
        late.ClosedWith.Should().NotBeNull();
    }

    [Fact]
    public void Command_FromSeatedPlayer_ReachesTheSimulation()
    {
        using var match = QuickMatch();
        var client = new FakeClient();
        Join(match, client, "Ana");
        var player = match.Game.Players[client.Last<WelcomeMessage>().You];
        var townCenter = match.Game.Entities.Buildings.First(b => b.Owner == player && b.Def.IsTownCenter);

        match.Enqueue(new MessageInbound(client, new CommandRequest(new TrainCommand { Building = townCenter.Id, Unit = "villager" })));
        match.Tick();

        townCenter.Queue.Should().ContainSingle();
    }

    [Fact]
    public void GameOver_SendsEndWithDurationAndTimeline()
    {
        using var match = QuickMatch();
        var client = new FakeClient();
        Join(match, client, "Ana");
        for (var i = 0; i < 250; i++)
        {
            match.Tick();
        }

        match.Game.End(match.Game.Players[client.Last<WelcomeMessage>().You].Team);
        match.Tick();

        var end = client.Last<EndMessage>();
        end.DurationSeconds.Should().Be(match.Game.Tick / Content.Rules.TickRate);
        end.Timeline.Seconds.Should().StartWith([0, 10, 20]);
        end.Timeline.Seconds[^1].Should().Be(end.DurationSeconds);
        end.Timeline.Players.Should().HaveCount(2).And.OnlyContain(p => p.Score.Count == end.Timeline.Seconds.Count);
        end.Players.Should().OnlyContain(p => p.HeroDeaths == 0 && p.HeroKills == 0);
    }

    [Fact]
    public void End_SerializesTheTimelineInCamelCase()
    {
        using var match = QuickMatch();
        var client = new FakeClient();
        Join(match, client, "Ana");
        match.Game.End(0);
        match.Tick();

        var json = WireJson.Serialize(client.Last<EndMessage>());

        json.Should().Contain("\"durationSeconds\":").And.Contain("\"timeline\":{\"intervalSeconds\":10,\"seconds\":[");
        json.Should().Contain("\"heroKills\":").And.Contain("\"soldiersTrained\":").And.Contain("\"army\":[");
    }

    [Fact]
    public void SetHero_InLobby_ShowsThePickOnTheSeatAndLeadsItInTheMatch()
    {
        using var match = CustomMatch(perTeam: 1);
        var host = new FakeClient();
        Join(match, host, "Ana");
        var pick = Content.Race(SeatOf(host, "Ana").Race).HeroUnits[1].Id;

        PickHero(match, host, pick);
        var seat = SeatOf(host, "Ana");
        Lobby(match, host, LobbyAction.Start);

        seat.Hero.Should().Be(pick);
        match.Game.Players[host.Last<WelcomeMessage>().You].HeroState.Def.Id.Should().Be(pick);
        host.Last<WelcomeMessage>().Players.Single(p => p.Name == "Ana").Hero.Should().Be(pick);
    }

    [Fact]
    public void SetHero_OfAnotherRace_KeepsTheSeatsHero()
    {
        using var match = CustomMatch(perTeam: 1);
        var host = new FakeClient();
        Join(match, host, "Ana");
        var race = SeatOf(host, "Ana").Race;
        var foreign = Content.Races.First(r => r.Id != race).HeroUnits[1].Id;

        PickHero(match, host, foreign);

        SeatOf(host, "Ana").Hero.Should().Be(Content.Race(race).Hero);
    }

    [Fact]
    public void SetRace_DropsAPickTheNewRaceCannotField()
    {
        using var match = CustomMatch(perTeam: 1);
        var host = new FakeClient();
        Join(match, host, "Ana");
        var race = SeatOf(host, "Ana").Race;
        var other = Content.Races.First(r => r.Id != race);
        PickHero(match, host, Content.Race(race).HeroUnits[2].Id);

        match.Enqueue(new MessageInbound(host, new LobbyRequest(LobbyAction.SetRace, 0, other.Id)));
        match.Tick();

        SeatOf(host, "Ana").Race.Should().Be(other.Id);
        SeatOf(host, "Ana").Hero.Should().Be(other.Hero);
    }

    [Fact]
    public void Join_LobbyWithAHeroPick_TakesTheRaceAndTheHero()
    {
        using var match = CustomMatch(perTeam: 1);
        var host = new FakeClient();

        match.Enqueue(new JoinInbound(host, "Ana", "orcs", "shaman"));
        match.Tick();

        SeatOf(host, "Ana").Race.Should().Be("orcs");
        SeatOf(host, "Ana").Hero.Should().Be("shaman");
    }

    [Fact]
    public void Lobby_BotSeats_ShowTheHeroTheSeedPicksForThem()
    {
        using var match = CustomMatch();
        var host = new FakeClient();
        Join(match, host, "Ana");

        var bots = host.Last<LobbyMessage>().Seats.Where(s => s.IsBot).ToList();

        bots.Should().NotBeEmpty();
        bots.Should().OnlyContain(s => s.Hero == HeroRoster.BotPick(Content.Race(s.Race), match.Config.Seed, s.Index).Id);
    }

    [Fact]
    public void Start_BotSeats_LeadTheHeroTheLobbyShowedThem()
    {
        using var match = CustomMatch();
        var host = new FakeClient();
        Join(match, host, "Ana");
        var bots = host.Last<LobbyMessage>().Seats.Where(s => s.IsBot).ToList();

        Lobby(match, host, LobbyAction.Start);

        bots.Should().NotBeEmpty();
        bots.Select(s => match.Game.Players[s.Index].HeroState.Def.Id).Should().Equal(bots.Select(s => s.Hero));
    }

    [Fact]
    public void SetHero_AfterTheMatchStarted_IsIgnored()
    {
        using var match = CustomMatch(perTeam: 1);
        var host = new FakeClient();
        Join(match, host, "Ana");
        Lobby(match, host, LobbyAction.Start);
        var player = match.Game.Players[host.Last<WelcomeMessage>().You];
        var hero = player.HeroState.Def;

        PickHero(match, host, player.Race.HeroUnits.First(h => h != hero).Id);

        player.HeroState.Def.Should().BeSameAs(hero);
        player.Hero.Def.Should().BeSameAs(hero);
    }

    [Fact]
    public void Join_RunningQuickPlayWithAHeroPick_LeadsThatHeroOnASeatOfItsRace()
    {
        using var match = QuickMatch();
        var client = new FakeClient();

        match.Enqueue(new JoinInbound(client, "Ana", "orcs", "blademaster"));
        match.Tick();

        var player = match.Game.Players[client.Last<WelcomeMessage>().You];
        player.Race.Id.Should().Be("orcs");
        player.HeroState.Def.Id.Should().Be("blademaster");
        player.Hero.Def.Id.Should().Be("blademaster");
        match.Game.Entities.Units.Count(u => u.Owner == player && u.IsHero && u.IsAlive).Should().Be(1);
    }

    [Fact]
    public void Join_RunningQuickPlayAfterTheBotsHeroEarnedXp_KeepsThatHero()
    {
        using var match = QuickMatch();
        var bot = match.Game.Players.Single(p => p.Race.Id == "orcs");
        match.Game.Heroes.AddXp(bot, 10);
        var hero = bot.HeroState.Def;
        var pick = bot.Race.HeroUnits.First(h => h != hero).Id;
        var client = new FakeClient();

        match.Enqueue(new JoinInbound(client, "Ana", "orcs", pick));
        match.Tick();

        match.Game.Players[client.Last<WelcomeMessage>().You].HeroState.Def.Should().BeSameAs(hero);
    }

    [Fact]
    public void Join_RunningQuickPlayAfterTheBotsHeroEarnedXp_ANoticeTellsTheNewcomerWhy()
    {
        using var match = QuickMatch();
        var bot = match.Game.Players.Single(p => p.Race.Id == "orcs");
        match.Game.Heroes.AddXp(bot, 10);
        var pick = bot.Race.HeroUnits.First(h => h != bot.HeroState.Def);
        var client = new FakeClient();

        match.Enqueue(new JoinInbound(client, "Ana", "orcs", pick.Id));
        for (var tick = 0; tick <= Content.Rules.TickRate; tick++)
        {
            match.Tick();
        }

        var notices = client.Messages.OfType<EventsMessage>().SelectMany(m => m.Events).OfType<NoticeEvent>().ToList();
        notices.Should().ContainSingle(n => n.Tone == NoticeTone.Warning && n.Text.Contains(bot.HeroState.Def.Name) && n.Text.Contains(pick.Name));
    }

    [Fact]
    public void Join_RunningQuickPlayWithAHeroPick_RaisesNoNoticeWhenThePickLeads()
    {
        using var match = QuickMatch();
        var client = new FakeClient();

        match.Enqueue(new JoinInbound(client, "Ana", "orcs", "blademaster"));
        for (var tick = 0; tick <= Content.Rules.TickRate; tick++)
        {
            match.Tick();
        }

        client.Messages.OfType<EventsMessage>().SelectMany(m => m.Events).OfType<NoticeEvent>().Should().NotContain(n => n.Text.Contains("this seat", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public void GameOver_EndListsEachPlayersHero()
    {
        using var match = QuickMatch();
        var client = new FakeClient();
        Join(match, client, "Ana");

        match.Game.End(0);
        match.Tick();

        client.Last<EndMessage>().Players.Select(p => p.Hero).Should().Equal(match.Game.Players.Select(p => p.HeroState.Def.Id));
    }

    private static SeatView SeatOf(FakeClient client, string name)
    {
        return client.Last<LobbyMessage>().Seats.Single(s => s.Name == name);
    }

    private static void PickHero(MatchHost match, FakeClient client, string hero)
    {
        match.Enqueue(new MessageInbound(client, new LobbyRequest(LobbyAction.SetHero, 0, null, null, hero)));
        match.Tick();
    }

    private static MatchHost CustomMatch(int perTeam = 2)
    {
        var config = new MatchConfig { Teams = 2, PlayersPerTeam = perTeam, MapSize = MapSize.Small, Seed = 5 };
        return new MatchHost("custom", config, isQuickPlay: false, Content, NullLogger.Instance, TimeProvider.System);
    }

    private static MatchHost QuickMatch()
    {
        var config = new MatchConfig { Teams = 2, PlayersPerTeam = 1, MapSize = MapSize.Small, Seed = 5 };
        return new MatchHost("quick", config, isQuickPlay: true, Content, NullLogger.Instance, TimeProvider.System);
    }

    private static void Join(MatchHost match, FakeClient client, string name)
    {
        match.Enqueue(new JoinInbound(client, name, null));
        match.Tick();
    }

    private static void Lobby(MatchHost match, FakeClient client, LobbyAction action)
    {
        match.Enqueue(new MessageInbound(client, new LobbyRequest(action, 0, null)));
        match.Tick();
    }
}
