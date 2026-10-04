namespace Crownfall.Server.UnitTests.Support;

internal static class RepoFiles
{
    public static string Path(params string[] parts)
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);
        while (directory != null && !File.Exists(System.IO.Path.Combine(directory.FullName, "Crownfall.slnx")))
        {
            directory = directory.Parent;
        }
        if (directory == null)
        {
            throw new DirectoryNotFoundException("Repository root not found.");
        }
        return System.IO.Path.Combine([directory.FullName, .. parts]);
    }
}
