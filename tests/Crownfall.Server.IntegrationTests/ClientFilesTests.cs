using System.Net;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Crownfall.Server.IntegrationTests;

public sealed class ClientFilesTests : IClassFixture<WebApplicationFactory<Crownfall.Server.Program>>, IDisposable
{
    private readonly string _webRoot = Directory.CreateTempSubdirectory("crownfall-wwwroot-").FullName;
    private readonly WebApplicationFactory<Crownfall.Server.Program> _factory;

    public ClientFilesTests(WebApplicationFactory<Crownfall.Server.Program> factory)
    {
        Directory.CreateDirectory(Path.Combine(_webRoot, "assets"));
        File.WriteAllBytes(Path.Combine(_webRoot, "assets", "model.glb"), Enumerable.Repeat((byte)7, 64 * 1024).ToArray());
        File.WriteAllBytes(Path.Combine(_webRoot, "assets", "sky.hdr"), Enumerable.Repeat((byte)3, 1024).ToArray());
        File.WriteAllText(Path.Combine(_webRoot, "index.html"), "<!doctype html><title>Crownfall</title>");
        _factory = factory.WithWebHostBuilder(builder => builder.UseWebRoot(_webRoot));
    }

    [Fact]
    public async Task GlbModel_IsServedAsGltfBinary_Compressed()
    {
        var token = TestContext.Current.CancellationToken;
        var request = new HttpRequestMessage(HttpMethod.Get, "/assets/model.glb");
        request.Headers.AcceptEncoding.ParseAdd("br, gzip");

        var response = await _factory.CreateClient().SendAsync(request, token);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        response.Content.Headers.ContentType!.MediaType.Should().Be("model/gltf-binary");
        response.Content.Headers.ContentEncoding.Should().ContainSingle().Which.Should().Be("br");
    }

    [Fact]
    public async Task StaticFile_MustBeRevalidated_SoARebuildReplacesIt()
    {
        var token = TestContext.Current.CancellationToken;

        var response = await _factory.CreateClient().GetAsync("/assets/model.glb", token);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        response.Headers.CacheControl!.NoCache.Should().BeTrue();
    }

    [Fact]
    public async Task UnknownPath_ServesTheClientPage_ThatMustBeRevalidated()
    {
        var token = TestContext.Current.CancellationToken;

        var response = await _factory.CreateClient().GetAsync("/match/some-room", token);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        response.Content.Headers.ContentType!.MediaType.Should().Be("text/html");
        response.Headers.CacheControl!.NoCache.Should().BeTrue();
    }

    [Fact]
    public async Task HdrSky_IsServedAsRadianceImage()
    {
        var token = TestContext.Current.CancellationToken;

        var response = await _factory.CreateClient().GetAsync("/assets/sky.hdr", token);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        response.Content.Headers.ContentType!.MediaType.Should().Be("image/vnd.radiance");
    }

    [Fact]
    public async Task ApiJson_IsNotCompressed()
    {
        var token = TestContext.Current.CancellationToken;
        var request = new HttpRequestMessage(HttpMethod.Get, "/api/matches");
        request.Headers.AcceptEncoding.ParseAdd("br, gzip");

        var response = await _factory.CreateClient().SendAsync(request, token);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        response.Content.Headers.ContentEncoding.Should().BeEmpty();
    }

    public void Dispose()
    {
        _factory.Dispose();
        Directory.Delete(_webRoot, true);
    }
}
