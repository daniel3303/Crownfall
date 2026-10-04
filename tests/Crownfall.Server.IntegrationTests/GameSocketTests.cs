using System.Net;
using System.Net.WebSockets;
using System.Text;
using Microsoft.AspNetCore.Mvc.Testing;
using Newtonsoft.Json.Linq;

namespace Crownfall.Server.IntegrationTests;

public class GameSocketTests : IClassFixture<WebApplicationFactory<Crownfall.Server.Program>>
{
    private readonly WebApplicationFactory<Crownfall.Server.Program> _factory;

    public GameSocketTests(WebApplicationFactory<Crownfall.Server.Program> factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task QuickPlay_JoinOverWebSocket_ReceivesWelcomeSnapshotsAndCommandResults()
    {
        var token = TestContext.Current.CancellationToken;
        var http = _factory.CreateClient();
        var created = await http.PostAsync("/api/matches/quickplay", null, token);
        created.StatusCode.Should().Be(HttpStatusCode.OK);
        var matchId = JObject.Parse(await created.Content.ReadAsStringAsync(token)).Value<string>("id");

        var socket = await _factory.Server.CreateWebSocketClient()
            .ConnectAsync(new Uri($"ws://localhost/ws?match={matchId}&name=Tester&race=orcs"), token);

        var welcome = await ReceiveJson(socket, "welcome", token);
        welcome.Value<string>("matchId").Should().Be(matchId);
        welcome["map"]!.Value<string>("tiles").Should().NotBeNullOrEmpty();
        var snapshot = await ReceiveBinary(socket, token);
        snapshot[0].Should().Be(1);

        await SendJson(socket, """{"t":"ping","c":42}""", token);
        var pong = await ReceiveJson(socket, "pong", token);
        pong.Value<double>("c").Should().Be(42);

        await socket.CloseAsync(WebSocketCloseStatus.NormalClosure, "done", token);
    }

    [Fact]
    public async Task Socket_ForUnknownMatch_IsRejected()
    {
        var token = TestContext.Current.CancellationToken;

        var connect = () => _factory.Server.CreateWebSocketClient().ConnectAsync(new Uri("ws://localhost/ws?match=missing&name=x"), token);

        await connect.Should().ThrowAsync<InvalidOperationException>();
    }

    [Fact]
    public async Task Socket_FromForeignOrigin_IsRejected()
    {
        var token = TestContext.Current.CancellationToken;
        var created = await _factory.CreateClient().PostAsync("/api/matches/quickplay", null, token);
        var matchId = JObject.Parse(await created.Content.ReadAsStringAsync(token)).Value<string>("id");
        var client = _factory.Server.CreateWebSocketClient();
        client.ConfigureRequest = request => request.Headers.Origin = "https://evil.example";

        var connect = () => client.ConnectAsync(new Uri($"ws://localhost/ws?match={matchId}&name=x"), token);

        await connect.Should().ThrowAsync<InvalidOperationException>().WithMessage("*403*");
    }

    [Fact]
    public async Task CreateMatch_WithOutOfRangeConfig_IsClamped()
    {
        var token = TestContext.Current.CancellationToken;
        var http = _factory.CreateClient();

        var response = await http.PostAsync("/api/matches", new StringContent("""{"teams":9,"playersPerTeam":0,"sharing":"shared"}""", Encoding.UTF8, "application/json"), token);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var summary = JObject.Parse(await response.Content.ReadAsStringAsync(token));
        summary["config"]!.Value<int>("teams").Should().Be(4);
        summary["config"]!.Value<int>("playersPerTeam").Should().Be(1);
        summary["config"]!.Value<string>("sharing").Should().Be("shared");
    }

    [Fact]
    public async Task Health_ReturnsOk()
    {
        var response = await _factory.CreateClient().GetAsync("/healthz", TestContext.Current.CancellationToken);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        response.Headers.GetValues("Content-Security-Policy").Single().Should().Contain("default-src 'self'");
    }

    private static async Task SendJson(WebSocket socket, string json, CancellationToken token)
    {
        await socket.SendAsync(Encoding.UTF8.GetBytes(json), WebSocketMessageType.Text, true, token);
    }

    private static async Task<JObject> ReceiveJson(WebSocket socket, string type, CancellationToken token)
    {
        for (var i = 0; i < 400; i++)
        {
            var (bytes, messageType) = await Receive(socket, token);
            if (messageType != WebSocketMessageType.Text)
            {
                continue;
            }
            var message = JObject.Parse(Encoding.UTF8.GetString(bytes));
            if (message.Value<string>("t") == type)
            {
                return message;
            }
        }
        throw new TimeoutException($"No '{type}' message arrived.");
    }

    private static async Task<byte[]> ReceiveBinary(WebSocket socket, CancellationToken token)
    {
        for (var i = 0; i < 400; i++)
        {
            var (bytes, messageType) = await Receive(socket, token);
            if (messageType == WebSocketMessageType.Binary)
            {
                return bytes;
            }
        }
        throw new TimeoutException("No snapshot arrived.");
    }

    private static async Task<(byte[] Bytes, WebSocketMessageType Type)> Receive(WebSocket socket, CancellationToken token)
    {
        var buffer = new byte[1 << 20];
        var total = 0;
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(token);
        timeout.CancelAfter(TimeSpan.FromSeconds(10));
        while (true)
        {
            var result = await socket.ReceiveAsync(new ArraySegment<byte>(buffer, total, buffer.Length - total), timeout.Token);
            total += result.Count;
            if (result.EndOfMessage)
            {
                return (buffer[..total], result.MessageType);
            }
        }
    }
}
