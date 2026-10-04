using System.Collections.Concurrent;
using Crownfall.Server.Protocol;
using Crownfall.Server.Protocol.Messages;
using Crownfall.Sim;
using Crownfall.Sim.Commands;
using Crownfall.Sim.Content;
using Crownfall.Sim.Core;
using Crownfall.Sim.Events;

namespace Crownfall.Server.Matches;

/// <summary>
/// Owns one match. All seat, lobby and game state is touched only on the loop thread; sockets talk
/// to it through <see cref="Enqueue"/>. Counters read by the registry are published with Volatile.
/// </summary>
public sealed class MatchHost : IDisposable
{
    private const int MaxConsecutiveFailures = 20;
    private const int MaxCommandsPerClientPerTick = 12;

    private readonly ConcurrentQueue<Inbound> _inbox = new();
    private readonly List<CommandEnvelope> _pendingCommands = [];
    private readonly Dictionary<IMatchClient, int> _commandsThisTick = [];

    // Raised a second after the join, once the newcomer's game view is up to show them.
    private readonly List<(IMatchClient Client, string Text, int Tick)> _joinNotices = [];
    private readonly ContentDb _content;
    private readonly ILogger _logger;
    private readonly TimeProvider _time;
    private readonly LobbyMessageBuilder _messages;
    private readonly SeatTable _seats;
    private CancellationTokenSource _cancellation;
    private Task _loop;
    private Game _game;
    private MatchStatsRecorder _stats;
    private int _failures;

    public MatchHost(string id, MatchConfig config, bool isQuickPlay, ContentDb content, ILogger logger, TimeProvider time)
    {
        Id = id;
        Config = config.Normalized();
        if (Config.Seed == 0)
        {
            Config.Seed = Random.Shared.Next(1, int.MaxValue);
        }
        IsQuickPlay = isQuickPlay;
        _content = content;
        _logger = logger;
        _time = time;
        _messages = new LobbyMessageBuilder(this, content);
        CreatedAt = time.GetUtcNow();
        Status = new MatchStatus(CreatedAt);
        _seats = new SeatTable(Config, content);
        if (isQuickPlay)
        {
            StartGame();
        }
        PublishCounters();
    }

    public string Id { get; }
    public MatchConfig Config { get; }
    public bool IsQuickPlay { get; }
    public DateTimeOffset CreatedAt { get; }
    public MatchStatus Status { get; }
    public MatchPhase Phase => Status.Phase;

    internal IReadOnlyList<Seat> Seats => _seats.All;
    internal Game Game => _game;
    internal Seat HostSeat => _seats.Host;

    /// <summary>The hero a seat leads: a human's valid pick or the race's classic hero, and for a bot a draw from the seed.</summary>
    internal string HeroOf(Seat seat)
    {
        var race = _content.Race(seat.Race);
        return seat.IsBot ? HeroRoster.BotPick(race, Config.Seed, seat.Index).Id : seat.Hero ?? race.Hero;
    }

    public void Start()
    {
        _cancellation = new CancellationTokenSource();
        _loop = Task.Run(() => RunLoop(_cancellation.Token));
    }

    public void Enqueue(Inbound inbound)
    {
        _inbox.Enqueue(inbound);
    }

    public void Dispose()
    {
        _cancellation?.Cancel();
        try
        {
            _loop?.Wait(TimeSpan.FromSeconds(2));
        }
        catch (AggregateException exception) when (exception.InnerExceptions.All(e => e is OperationCanceledException))
        {
            _logger.LogDebug("Match {Id} loop cancelled", Id);
        }
        foreach (var seat in _seats.Humans)
        {
            seat.Client.Close("Match closed.");
        }
        _cancellation?.Dispose();
    }

    /// <summary>One loop iteration: apply queued joins, leaves and messages, then advance the game.</summary>
    internal void Tick()
    {
        _commandsThisTick.Clear();
        while (_inbox.TryDequeue(out var inbound))
        {
            Handle(inbound);
        }
        if (Phase == MatchPhase.Playing)
        {
            StepGame();
        }
        PublishCounters();
    }

    private async Task RunLoop(CancellationToken token)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(_content.TickSeconds), _time);
        try
        {
            while (await timer.WaitForNextTickAsync(token))
            {
                RunTickSafely();
            }
        }
        catch (OperationCanceledException)
        {
            _logger.LogDebug("Match {Id} stopped", Id);
        }
    }

    private void RunTickSafely()
    {
        try
        {
            Tick();
            _failures = 0;
        }
        catch (Exception exception)
        {
            _logger.LogError(exception, "Match {Id} tick failed", Id);
            if (++_failures >= MaxConsecutiveFailures)
            {
                Status.MarkEnded(_time.GetUtcNow());
                Broadcast(new ErrorMessage { Message = "The match hit an error and was closed." });
            }
        }
    }

    private void Handle(Inbound inbound)
    {
        switch (inbound)
        {
            case JoinInbound join:
                HandleJoin(join);
                break;
            case LeaveInbound leave:
                HandleLeave(leave.Client);
                break;
            case MessageInbound { Message: CommandRequest request } message:
                QueueCommand(message.Client, request.Command);
                break;
            case MessageInbound { Message: LobbyRequest request } message:
                HandleLobby(message.Client, request);
                break;
        }
    }

    private void HandleJoin(JoinInbound join)
    {
        if (_seats.Of(join.Client) != null)
        {
            return;
        }
        // A running match's seats keep their races, so a newcomer is steered toward one of the race it asked for.
        var seat = Phase == MatchPhase.Ended ? null : _seats.Take(join.Client, join.Name, Phase == MatchPhase.Playing ? join.Race : null);
        if (seat == null)
        {
            join.Client.Send(new ErrorMessage { Message = Phase == MatchPhase.Ended ? "This match has ended." : "This match is full." });
            join.Client.Close("No seat available.");
            return;
        }
        if (Phase == MatchPhase.Lobby)
        {
            seat.Race = join.Race ?? seat.Race;
            seat.Hero = ValidHero(seat.Race, join.Hero);
            BroadcastLobby();
            return;
        }
        _game.SetBotControl(seat.Player, false, seat.Name);
        var refusal = TakeOverHero(seat, join.Hero);
        seat.Client.Send(_messages.Welcome(seat));
        if (refusal != null)
        {
            _joinNotices.Add((seat.Client, refusal, _game.Tick + _content.Rules.TickRate));
        }
    }

    private void HandleLeave(IMatchClient client)
    {
        var seat = _seats.Of(client);
        if (seat == null)
        {
            return;
        }
        _seats.Vacate(seat);
        if (seat.Player != null && Phase == MatchPhase.Playing)
        {
            _game.SetBotControl(seat.Player, true, seat.BotName);
        }
        if (Phase == MatchPhase.Lobby)
        {
            BroadcastLobby();
        }
    }

    private void HandleLobby(IMatchClient client, LobbyRequest request)
    {
        var seat = _seats.Of(client);
        if (seat == null || Phase != MatchPhase.Lobby)
        {
            return;
        }
        switch (request.Action)
        {
            case LobbyAction.Start when seat == _seats.Host:
                StartGame();
                return;
            case LobbyAction.SwitchTeam:
                _seats.MoveToTeam(seat, request.Team);
                break;
            case LobbyAction.SetRace when _content.HasRace(request.Race):
                seat.Race = request.Race;
                seat.Hero = ValidHero(seat.Race, seat.Hero);
                break;
            case LobbyAction.SetHero when ValidHero(seat.Race, request.Hero) != null:
                seat.Hero = request.Hero;
                break;
            case LobbyAction.SetName:
                seat.Name = PlayerNames.Sanitize(request.Name);
                break;
        }
        BroadcastLobby();
    }

    private void QueueCommand(IMatchClient client, PlayerCommand command)
    {
        var seat = _seats.Of(client);
        if (seat?.Player == null || Phase != MatchPhase.Playing)
        {
            return;
        }
        var count = _commandsThisTick.GetValueOrDefault(client);
        if (count >= MaxCommandsPerClientPerTick)
        {
            return;
        }
        _commandsThisTick[client] = count + 1;
        _pendingCommands.Add(new CommandEnvelope(seat.Player.Index, command));
    }

    private void StartGame()
    {
        var setups = _seats.All.Select(s => new PlayerSetup { Name = s.Name, Team = s.Team, Race = s.Race, IsBot = s.IsBot, Hero = HeroOf(s) }).ToList();
        _game = new Game(_content, Config, setups);
        _stats = new MatchStatsRecorder(_game);
        foreach (var seat in _seats.All)
        {
            seat.Player = _game.Players[seat.Index];
        }
        Status.MarkPlaying();
        foreach (var seat in _seats.Humans)
        {
            seat.Client.Send(_messages.Welcome(seat));
        }
    }

    /// <summary>The pick when the race fields that hero, else null.</summary>
    private string ValidHero(string race, string hero)
    {
        return hero != null && _content.Race(race).FindHero(hero) != null ? hero : null;
    }

    /// <summary>
    /// A newcomer taking over a bot seat leads the hero it picked when the seat's race fields it and the bot's hero has
    /// earned nothing yet, as in a quick play joined at its start; otherwise the bot's hero stays and the text says why.
    /// </summary>
    private string TakeOverHero(Seat seat, string hero)
    {
        var current = seat.Player.HeroState.Def;
        if (hero == null || hero == current.Id)
        {
            return null;
        }
        var def = seat.Player.Race.FindHero(hero);
        if (def == null)
        {
            return $"Your hero is not one of this seat's race, so you lead its {current.Name}.";
        }
        return _game.Heroes.TryChangeHero(seat.Player, def) ? null : $"This seat's {current.Name} has already earned experience or items, so it leads instead of your {def.Name}.";
    }

    /// <summary>Raises each due join notice as a notice event of this tick, for a newcomer still in its seat.</summary>
    private void RaiseJoinNotices()
    {
        foreach (var notice in _joinNotices.Where(n => n.Tick <= _game.Tick))
        {
            if (_seats.Of(notice.Client)?.Player is { } player)
            {
                _game.Notify(player, notice.Text, NoticeTone.Warning, null);
            }
        }
        _joinNotices.RemoveAll(n => n.Tick <= _game.Tick);
    }

    private void StepGame()
    {
        _game.Step(_pendingCommands);
        _pendingCommands.Clear();
        RaiseJoinNotices();
        _stats.Observe(_game);
        TickFanOut.Send(_game, _seats.Humans, _messages);
        if (_game.IsOver)
        {
            Status.MarkEnded(_time.GetUtcNow());
            Broadcast(_messages.End(_stats));
        }
    }

    private void BroadcastLobby()
    {
        foreach (var seat in _seats.Humans)
        {
            seat.Client.Send(_messages.Lobby(seat));
        }
    }

    private void Broadcast(ServerMessage message)
    {
        foreach (var seat in _seats.Humans)
        {
            seat.Client.Send(message);
        }
    }

    private void PublishCounters()
    {
        var gameSeconds = _game == null ? 0 : _game.Tick / _content.Rules.TickRate;
        Status.Publish(_seats.Humans.Count(), _seats.OpenCount, gameSeconds, _seats.Host?.Name, _time.GetUtcNow());
    }
}
