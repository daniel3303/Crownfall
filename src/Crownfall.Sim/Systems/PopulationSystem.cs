namespace Crownfall.Sim.Systems;

/// <summary>Recounts every player's population and cap each tick; heroes are free, a unit in training already counts.</summary>
public sealed class PopulationSystem
{
    private readonly Game _game;

    public PopulationSystem(Game game)
    {
        _game = game;
    }

    public void Update()
    {
        foreach (var player in _game.Players)
        {
            player.Population = 0;
            player.PopulationCap = 0;
        }
        foreach (var unit in _game.Entities.Units)
        {
            if (unit.Owner != null && !unit.IsHero)
            {
                unit.Owner.Population += unit.Def.Pop;
            }
        }
        foreach (var building in _game.Entities.Buildings)
        {
            if (building.IsComplete)
            {
                building.Owner.PopulationCap += building.Stats.Pop;
            }
            if (building.Queue.Count > 0 && building.Queue[0].Progress > 0)
            {
                building.Owner.Population += building.Queue[0].Unit.Pop;
            }
        }
        var limit = _game.Content.Rules.PopulationLimit;
        foreach (var player in _game.Players)
        {
            player.PopulationCap = Math.Min(player.PopulationCap, limit);
        }
    }
}
