using System.IO.Compression;
using Microsoft.AspNetCore.ResponseCompression;
using Microsoft.AspNetCore.StaticFiles;

namespace Crownfall.Server;

/// <summary>Serves the client build, including glTF models, compressed. API responses stay uncompressed.</summary>
public static class ClientFiles
{
    private const string GltfBinary = "model/gltf-binary";
    private const string RadianceHdr = "image/vnd.radiance";

    private static readonly string[] CompressedTypes =
    [
        GltfBinary,
        "text/html",
        "text/css",
        "text/javascript",
        "application/javascript",
        "image/svg+xml",
    ];

    public static IServiceCollection AddClientCompression(this IServiceCollection services)
    {
        services.AddResponseCompression(options =>
        {
            // Only static, secret-free files are compressed, so HTTPS compression carries no BREACH risk.
            options.EnableForHttps = true;
            options.MimeTypes = CompressedTypes;
            options.Providers.Add<BrotliCompressionProvider>();
            options.Providers.Add<GzipCompressionProvider>();
        });
        services.Configure<BrotliCompressionProviderOptions>(options => options.Level = CompressionLevel.Fastest);
        services.Configure<GzipCompressionProviderOptions>(options => options.Level = CompressionLevel.Optimal);
        return services;
    }

    public static IApplicationBuilder UseClientFiles(this IApplicationBuilder app)
    {
        app.UseResponseCompression();
        app.UseDefaultFiles();
        return app.UseStaticFiles(StaticOptions());
    }

    /// <summary>Serves the client's index.html for any other path, with the same caching as every client file.</summary>
    public static IEndpointConventionBuilder MapClientFallback(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapFallbackToFile("index.html", StaticOptions());
    }

    private static StaticFileOptions StaticOptions()
    {
        var types = new FileExtensionContentTypeProvider();
        types.Mappings[".glb"] = GltfBinary;
        // The sky light probe; static files refuse extensions they cannot type.
        types.Mappings[".hdr"] = RadianceHdr;
        return new StaticFileOptions
        {
            ContentTypeProvider = types,
            // Models and sounds keep their names across builds, so browsers must revalidate them or keep stale copies.
            OnPrepareResponse = context => context.Context.Response.Headers.CacheControl = "no-cache",
        };
    }
}
