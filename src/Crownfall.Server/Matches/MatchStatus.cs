namespace Crownfall.Server.Matches;

/// <summary>Match facts written only by the match loop and read by the registry and API threads.</summary>
public sealed class MatchStatus
{
    private int _phase;
    private int _humanCount;
    private int _openSeats;
    private int _gameSeconds;
    private string _hostName;
    private long _lastHumanTicks;
    private long _endedTicks;

    public MatchStatus(DateTimeOffset createdAt)
    {
        _lastHumanTicks = createdAt.UtcTicks;
    }

    public MatchPhase Phase => (MatchPhase)Volatile.Read(ref _phase);
    public int HumanCount => Volatile.Read(ref _humanCount);
    public int OpenSeats => Volatile.Read(ref _openSeats);
    public int GameSeconds => Volatile.Read(ref _gameSeconds);
    public string HostName => Volatile.Read(ref _hostName);
    public DateTimeOffset LastHumanSeenAt => new(Volatile.Read(ref _lastHumanTicks), TimeSpan.Zero);
    public DateTimeOffset EndedAt => new(Volatile.Read(ref _endedTicks), TimeSpan.Zero);

    public void MarkPlaying()
    {
        Volatile.Write(ref _phase, (int)MatchPhase.Playing);
    }

    public void MarkEnded(DateTimeOffset now)
    {
        Volatile.Write(ref _phase, (int)MatchPhase.Ended);
        Volatile.Write(ref _endedTicks, now.UtcTicks);
    }

    public void Publish(int humans, int openSeats, int gameSeconds, string hostName, DateTimeOffset now)
    {
        Volatile.Write(ref _humanCount, humans);
        Volatile.Write(ref _openSeats, openSeats);
        Volatile.Write(ref _gameSeconds, gameSeconds);
        Volatile.Write(ref _hostName, hostName);
        if (humans > 0)
        {
            Volatile.Write(ref _lastHumanTicks, now.UtcTicks);
        }
    }
}
