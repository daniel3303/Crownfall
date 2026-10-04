using Crownfall.Server;
using Crownfall.Server.Matches;
using Crownfall.Sim.Content;
using Newtonsoft.Json.Converters;
using Newtonsoft.Json.Serialization;

var builder = WebApplication.CreateBuilder(args);
var contentPath = builder.Configuration["Content:Path"] ?? ContentDb.FindDefaultPath();
builder.Services.AddSingleton(ContentDb.Load(contentPath));
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddSingleton<MatchRegistry>();
builder.Services.AddHostedService<MatchCleanupService>();
builder.Services.AddClientCompression();
builder.Services.AddControllers().AddNewtonsoftJson(options =>
{
    options.SerializerSettings.ContractResolver = new DefaultContractResolver { NamingStrategy = new CamelCaseNamingStrategy() };
    options.SerializerSettings.Converters.Add(new StringEnumConverter(new CamelCaseNamingStrategy()));
});

var app = builder.Build();
app.UseSecurityHeaders();
app.UseWebSockets(new WebSocketOptions { KeepAliveInterval = TimeSpan.FromSeconds(15) });
app.UseClientFiles();
app.MapControllers();
app.Map("/ws", GameSocketEndpoint.Handle);
app.MapGet("/healthz", () => Results.Text("ok"));
app.MapClientFallback();
app.Run();

namespace Crownfall.Server
{
    public partial class Program
    {
    }
}
