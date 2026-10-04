using Crownfall.Server.Protocol;
using Crownfall.Server.Protocol.Messages;
using Crownfall.Sim;

namespace Crownfall.Server.Matches;

/// <summary>Sends one simulated tick to every human: a snapshot encoded once per team, their visible events and periodic HUD state.</summary>
internal static class TickFanOut
{
    private const int StateEveryTicks = 3;

    public static void Send(Game game, IEnumerable<Seat> humans, LobbyMessageBuilder messages)
    {
        var snapshots = new Dictionary<int, byte[]>();
        var sendState = game.Tick % StateEveryTicks == 0;
        foreach (var seat in humans)
        {
            var viewer = seat.Player;
            if (!snapshots.TryGetValue(viewer.Team, out var snapshot))
            {
                snapshot = SnapshotEncoder.Encode(game, viewer);
                snapshots[viewer.Team] = snapshot;
            }
            seat.Client.SendSnapshot(snapshot);
            var events = game.Events.Where(e => e.IsVisibleTo(game, viewer)).ToList();
            if (events.Count > 0)
            {
                seat.Client.Send(new EventsMessage { Tick = game.Tick, Events = events });
            }
            if (sendState)
            {
                seat.Client.Send(messages.State(viewer));
            }
        }
    }
}
