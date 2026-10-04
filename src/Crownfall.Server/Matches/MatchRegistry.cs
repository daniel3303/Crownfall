using System.Collections.Concurrent;
using System.Security.Cryptography;
using Crownfall.Sim.Content;
using Crownfall.Sim.Core;

namespace Crownfall.Server.Matches;

/// <summary>Live matches: creation, quick-play matchmaking, lobby listing and cleanup of abandoned matches.</summary>
public sealed class MatchRegistry : IDisposable
{
    public const int MaxMatches = 60;
    private const int QuickPlayJoinWindowSeconds = 180;
    private const string IdAlphabet = "abcdefghjkmnpqrstuvwxyz23456789";
    private static readonly TimeSpan EndedLifetime = TimeSpan.FromSeconds(60);
    private static readonly TimeSpan AbandonedLobbyLifetime = TimeSpan.FromMinutes(2);
    private static readonly TimeSpan AbandonedGameLifetime = TimeSpan.FromSeconds(30);

    private readonly ConcurrentDictionary<string, MatchHost> _matches = new();
    private readonly object _createLock = new();
    private readonly ContentDb _content;
    private readonly ILoggerFactory _loggers;
    private readonly TimeProvider _time;

    public MatchRegistry(ContentDb content, ILoggerFactory loggers, TimeProvider time)
    {
        _content = content;
        _loggers = loggers;
        _time = time;
    }

    public int Count => _matches.Count;

    /// <summary>Creates and starts a match, or returns null when the server is at capacity.</summary>
    public MatchHost Create(MatchConfig config, bool isQuickPlay)
    {
        lock (_createLock)
        {
            if (_matches.Count >= MaxMatches)
            {
                return null;
            }
            var id = NewId();
            var match = new MatchHost(id, config, isQuickPlay, _content, _loggers.CreateLogger<MatchHost>(), _time);
            _matches[id] = match;
            match.Start();
            return match;
        }
    }

    public MatchHost Get(string id)
    {
        return id != null && _matches.TryGetValue(id, out var match) ? match : null;
    }

    public MatchHost FindOrCreateQuickPlay()
    {
        lock (_createLock)
        {
            var open = _matches.Values
                .Where(m => m.IsQuickPlay && m.Phase == MatchPhase.Playing && m.Status.OpenSeats > 0 && m.Status.GameSeconds < QuickPlayJoinWindowSeconds)
                .OrderByDescending(m => m.Status.HumanCount)
                .FirstOrDefault();
            if (open != null)
            {
                return open;
            }
        }
        return Create(new MatchConfig(), isQuickPlay: true);
    }

    public IReadOnlyList<MatchHost> OpenLobbies()
    {
        return _matches.Values
            .Where(m => !m.IsQuickPlay && m.Phase == MatchPhase.Lobby && m.Status.OpenSeats > 0 && m.Status.HumanCount > 0)
            .OrderByDescending(m => m.CreatedAt)
            .ToList();
    }

    public void Sweep()
    {
        var now = _time.GetUtcNow();
        foreach (var match in _matches.Values)
        {
            if (!IsAbandoned(match, now) || !_matches.TryRemove(match.Id, out _))
            {
                continue;
            }
            match.Dispose();
        }
    }

    public void Dispose()
    {
        foreach (var match in _matches.Values)
        {
            match.Dispose();
        }
        _matches.Clear();
    }

    private static bool IsAbandoned(MatchHost match, DateTimeOffset now)
    {
        var idleFor = now - match.Status.LastHumanSeenAt;
        return match.Phase switch
        {
            MatchPhase.Ended => now - match.Status.EndedAt > EndedLifetime,
            MatchPhase.Lobby => match.Status.HumanCount == 0 && idleFor > AbandonedLobbyLifetime,
            _ => match.Status.HumanCount == 0 && idleFor > AbandonedGameLifetime,
        };
    }

    private string NewId()
    {
        while (true)
        {
            var id = RandomNumberGenerator.GetString(IdAlphabet, 8);
            if (!_matches.ContainsKey(id))
            {
                return id;
            }
        }
    }
}
