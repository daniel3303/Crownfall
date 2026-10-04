namespace Crownfall.Server.Matches;

public static class BotNames
{
    private static readonly string[] Names =
    [
        "Aldric", "Brynja", "Corwin", "Dagny", "Eirik", "Freya", "Gorm", "Hilda",
        "Ivar", "Jorunn", "Kael", "Liv", "Magnus", "Nessa", "Orrin", "Petra",
    ];

    public static string For(int seatIndex)
    {
        return $"{Names[seatIndex % Names.Length]} (bot)";
    }
}
