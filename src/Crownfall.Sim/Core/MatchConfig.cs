namespace Crownfall.Sim.Core;

/// <summary>Lobby settings for one match.</summary>
public sealed class MatchConfig
{
    public const int MinTeams = 2;
    public const int MaxTeams = 4;
    public const int MinPlayersPerTeam = 1;
    public const int MaxPlayersPerTeam = 4;

    public int Teams { get; set; } = 2;
    public int PlayersPerTeam { get; set; } = 2;
    public ResourceSharing Sharing { get; set; } = ResourceSharing.SeparateWithTribute;
    public BotDifficulty Difficulty { get; set; } = BotDifficulty.Normal;
    public MapSize MapSize { get; set; } = MapSize.Medium;
    public int Seed { get; set; }

    public int PlayerCount => Teams * PlayersPerTeam;

    public int MapTiles => MapSize switch
    {
        MapSize.Small => 96,
        MapSize.Large => 144,
        _ => 120,
    };

    /// <summary>Clamps every field into its supported range so untrusted lobby input is always playable.</summary>
    public MatchConfig Normalized()
    {
        return new MatchConfig
        {
            Teams = Math.Clamp(Teams, MinTeams, MaxTeams),
            PlayersPerTeam = Math.Clamp(PlayersPerTeam, MinPlayersPerTeam, MaxPlayersPerTeam),
            Sharing = Enum.IsDefined(Sharing) ? Sharing : ResourceSharing.SeparateWithTribute,
            Difficulty = Enum.IsDefined(Difficulty) ? Difficulty : BotDifficulty.Normal,
            MapSize = Enum.IsDefined(MapSize) ? MapSize : MapSize.Medium,
            Seed = Seed,
        };
    }
}
