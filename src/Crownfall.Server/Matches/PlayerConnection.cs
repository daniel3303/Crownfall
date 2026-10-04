using System.Net.WebSockets;
using System.Text;
using System.Threading.Channels;
using Crownfall.Server.Protocol;
using Crownfall.Server.Protocol.Messages;

namespace Crownfall.Server.Matches;

/// <summary>
/// One player's WebSocket. A single send loop drains an outbox so frames never interleave; at most two
/// snapshots wait at once, so a slow client skips stale snapshots instead of building lag.
/// </summary>
public sealed class PlayerConnection : IMatchClient
{
    public const int MaxMessageBytes = 16 * 1024;
    private const int MaxMessagesPerSecond = 40;
    private const int MaxPendingSnapshots = 2;

    private readonly WebSocket _socket;
    private readonly ILogger _logger;
    private readonly Channel<Outgoing> _outbox = Channel.CreateUnbounded<Outgoing>(new UnboundedChannelOptions { SingleReader = true });
    private int _pendingSnapshots;
    private string _closeReason;

    public PlayerConnection(WebSocket socket, ILogger logger)
    {
        _socket = socket;
        _logger = logger;
    }

    public void Send(ServerMessage message)
    {
        _outbox.Writer.TryWrite(new Outgoing(Encoding.UTF8.GetBytes(WireJson.Serialize(message)), WebSocketMessageType.Text));
    }

    public void SendSnapshot(byte[] snapshot)
    {
        if (Interlocked.Increment(ref _pendingSnapshots) > MaxPendingSnapshots)
        {
            Interlocked.Decrement(ref _pendingSnapshots);
            return;
        }
        if (!_outbox.Writer.TryWrite(new Outgoing(snapshot, WebSocketMessageType.Binary)))
        {
            Interlocked.Decrement(ref _pendingSnapshots);
        }
    }

    public void Close(string reason)
    {
        _closeReason ??= reason;
        _outbox.Writer.TryComplete();
    }

    public async Task RunSendLoop(CancellationToken token)
    {
        await foreach (var message in _outbox.Reader.ReadAllAsync(token))
        {
            if (_socket.State != WebSocketState.Open)
            {
                break;
            }
            await _socket.SendAsync(message.Bytes, message.Type, endOfMessage: true, token);
            if (message.Type == WebSocketMessageType.Binary)
            {
                Interlocked.Decrement(ref _pendingSnapshots);
            }
        }
        if (_closeReason != null && _socket.State is WebSocketState.Open or WebSocketState.CloseReceived)
        {
            await _socket.CloseOutputAsync(WebSocketCloseStatus.NormalClosure, _closeReason, token);
        }
    }

    public async Task RunReceiveLoop(MatchHost match, CancellationToken token)
    {
        var buffer = new byte[MaxMessageBytes];
        var windowStart = DateTime.UtcNow;
        var messagesInWindow = 0;
        while (_socket.State == WebSocketState.Open)
        {
            var (length, type) = await ReadMessage(buffer, token);
            if (type == WebSocketMessageType.Close)
            {
                Close("Goodbye.");
                return;
            }
            if (length < 0)
            {
                await _socket.CloseAsync(WebSocketCloseStatus.MessageTooBig, "Message too large.", token);
                return;
            }
            if (DateTime.UtcNow - windowStart >= TimeSpan.FromSeconds(1))
            {
                windowStart = DateTime.UtcNow;
                messagesInWindow = 0;
            }
            if (++messagesInWindow > MaxMessagesPerSecond || type != WebSocketMessageType.Text)
            {
                continue;
            }
            Dispatch(match, Encoding.UTF8.GetString(buffer, 0, length));
        }
    }

    private void Dispatch(MatchHost match, string text)
    {
        var message = ClientMessageParser.Parse(text);
        if (message is PingRequest ping)
        {
            Send(new PongMessage { C = ping.ClientTime });
            return;
        }
        if (message != null)
        {
            match.Enqueue(new MessageInbound(this, message));
        }
        else
        {
            _logger.LogDebug("Dropped malformed client message");
        }
    }

    /// <summary>Reads one whole message; returns length -1 when it exceeds the buffer.</summary>
    private async Task<(int Length, WebSocketMessageType Type)> ReadMessage(byte[] buffer, CancellationToken token)
    {
        var total = 0;
        while (true)
        {
            if (total >= buffer.Length)
            {
                return (-1, WebSocketMessageType.Text);
            }
            var result = await _socket.ReceiveAsync(new ArraySegment<byte>(buffer, total, buffer.Length - total), token);
            if (result.MessageType == WebSocketMessageType.Close)
            {
                return (0, WebSocketMessageType.Close);
            }
            total += result.Count;
            if (result.EndOfMessage)
            {
                return (total, result.MessageType);
            }
        }
    }

    private readonly record struct Outgoing(byte[] Bytes, WebSocketMessageType Type);
}
