using System.Collections.Concurrent;
using Crownfall.Server.Protocol;
using Crownfall.Server.Protocol.Messages;
using Crownfall.Sim;
using Crownfall.Sim.Commands;
using Crownfall.Sim.Content;
using Crownfall.Sim.Core;

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
        var seat = Phase == MatchPhase.Ended ? null : _seats.Take(join.Client, join.Name);
        if (seat == null)
        {
            join.Client.Send(new ErrorMessage { Message = Phase == MatchPhase.Ended ? "This match has ended." : "This match is full." });
            join.Client.Close("No seat available.");
            return;
        }
        if (Phase == MatchPhase.Lobby)
        {
            seat.Race = join.Race ?? seat.Race;
            BroadcastLobby();
            return;
        }
        _game.SetBotControl(seat.Player, false, seat.Name);
        seat.Client.Send(_messages.Welcome(seat));
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
        var setups = _seats.All.Select(s => new PlayerSetup { Name = s.Name, Team = s.Team, Race = s.Race, IsBot = s.IsBot }).ToList();
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

    private void StepGame()
    {
        _game.Step(_pendingCommands);
        _pendingCommands.Clear();
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
