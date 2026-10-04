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
    public async Task TutorialLobby_AgainstAPassiveBot_StartsButIsNeverListed()
    {
        var token = TestContext.Current.CancellationToken;
        var http = _factory.CreateClient();
        var tutorial = await CreateLobby(http, """{"teams":2,"playersPerTeam":1,"difficulty":"passive","mapSize":"small"}""", token);
        var custom = await CreateLobby(http, """{"teams":2,"playersPerTeam":1,"difficulty":"brutal"}""", token);
        tutorial["config"]!.Value<string>("difficulty").Should().Be("passive");
        custom["config"]!.Value<string>("difficulty").Should().Be("brutal");
        var tutorialSocket = await Connect(tutorial.Value<string>("id"), token);
        var customSocket = await Connect(custom.Value<string>("id"), token);
        await ReceiveJson(tutorialSocket, "lobby", token);
        await ReceiveJson(customSocket, "lobby", token);

        var listed = await ListedLobbies(http, custom.Value<string>("id"), token);
        listed.Should().Contain(custom.Value<string>("id")).And.NotContain(tutorial.Value<string>("id"));

        await SendJson(tutorialSocket, """{"t":"lobby","action":"start"}""", token);
        var welcome = await ReceiveJson(tutorialSocket, "welcome", token);
        welcome["players"]!.Should().HaveCount(2);
        await tutorialSocket.CloseAsync(WebSocketCloseStatus.NormalClosure, "done", token);
        await customSocket.CloseAsync(WebSocketCloseStatus.NormalClosure, "done", token);
    }

    [Fact]
    public async Task Health_ReturnsOk()
    {
        var response = await _factory.CreateClient().GetAsync("/healthz", TestContext.Current.CancellationToken);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        response.Headers.GetValues("Content-Security-Policy").Single().Should().Contain("default-src 'self'");
    }

    private static async Task<JObject> CreateLobby(HttpClient http, string config, CancellationToken token)
    {
        var response = await http.PostAsync("/api/matches", new StringContent(config, Encoding.UTF8, "application/json"), token);
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        return JObject.Parse(await response.Content.ReadAsStringAsync(token));
    }

    private async Task<WebSocket> Connect(string matchId, CancellationToken token)
    {
        return await _factory.Server.CreateWebSocketClient().ConnectAsync(new Uri($"ws://localhost/ws?match={matchId}&name=Tester&race=humans"), token);
    }

    /// <summary>Lobby ids from the public list, polled until <paramref name="expected"/> shows, since the match loop publishes its counts a tick later.</summary>
    private static async Task<List<string>> ListedLobbies(HttpClient http, string expected, CancellationToken token)
    {
        var ids = new List<string>();
        for (var attempt = 0; attempt < 50 && !ids.Contains(expected); attempt++)
        {
            await Task.Delay(100, token);
            var list = JArray.Parse(await http.GetStringAsync("/api/matches", token));
            ids = list.Select(m => m.Value<string>("id")).ToList();
        }
        return ids;
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
