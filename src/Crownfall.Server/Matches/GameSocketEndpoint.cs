using System.Net.WebSockets;
using Crownfall.Sim.Content;

namespace Crownfall.Server.Matches;

/// <summary>GET /ws?match=ID&amp;name=NAME&amp;race=RACE upgrades to the match WebSocket.</summary>
public static class GameSocketEndpoint
{
    public static async Task Handle(HttpContext context, MatchRegistry registry, ContentDb content, ILogger<PlayerConnection> logger)
    {
        if (!context.WebSockets.IsWebSocketRequest)
        {
            context.Response.StatusCode = StatusCodes.Status400BadRequest;
            return;
        }
        if (!IsSameOrigin(context.Request))
        {
            context.Response.StatusCode = StatusCodes.Status403Forbidden;
            return;
        }
        var match = registry.Get(context.Request.Query["match"].ToString());
        if (match == null)
        {
            context.Response.StatusCode = StatusCodes.Status404NotFound;
            return;
        }
        var name = PlayerNames.Sanitize(context.Request.Query["name"].ToString());
        var race = context.Request.Query["race"].ToString();
        using var socket = await context.WebSockets.AcceptWebSocketAsync(new WebSocketAcceptContext { DangerousEnableCompression = true });
        var connection = new PlayerConnection(socket, logger);
        match.Enqueue(new JoinInbound(connection, name, content.HasRace(race) ? race : null));
        using var cancellation = CancellationTokenSource.CreateLinkedTokenSource(context.RequestAborted);
        var sending = connection.RunSendLoop(cancellation.Token);
        try
        {
            await connection.RunReceiveLoop(match, cancellation.Token);
        }
        catch (Exception exception) when (exception is WebSocketException or OperationCanceledException)
        {
            logger.LogDebug(exception, "Socket for match {Match} closed abruptly", match.Id);
        }
        finally
        {
            match.Enqueue(new LeaveInbound(connection));
            connection.Close(null);
            await DrainSender(sending, cancellation, logger);
        }
    }

    /// <summary>Browsers always send Origin on WebSocket upgrades; refuse pages from other sites driving a player's socket.</summary>
    private static bool IsSameOrigin(HttpRequest request)
    {
        var origin = request.Headers.Origin.ToString();
        if (string.IsNullOrEmpty(origin))
        {
            return true;
        }
        return Uri.TryCreate(origin, UriKind.Absolute, out var uri) && string.Equals(uri.Authority, request.Host.Value, StringComparison.OrdinalIgnoreCase);
    }

    private static async Task DrainSender(Task sending, CancellationTokenSource cancellation, ILogger logger)
    {
        try
        {
            await sending.WaitAsync(TimeSpan.FromSeconds(2));
        }
        catch (Exception exception) when (exception is WebSocketException or OperationCanceledException or TimeoutException)
        {
            logger.LogDebug(exception, "Send loop ended while closing");
        }
        finally
        {
            await cancellation.CancelAsync();
        }
    }
}
