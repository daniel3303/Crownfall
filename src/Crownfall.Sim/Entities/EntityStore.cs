namespace Crownfall.Sim.Entities;

/// <summary>All live entities. Removal is deferred to <see cref="Sweep"/> so systems can iterate safely.</summary>
public sealed class EntityStore
{
    private readonly Dictionary<int, Entity> _byId = [];
    private readonly List<Entity> _removed = [];
    private int _nextId = 1;

    public List<Unit> Units { get; } = [];
    public List<Building> Buildings { get; } = [];
    public List<ResourceNode> Nodes { get; } = [];

    public T Add<T>(T entity) where T : Entity
    {
        entity.Id = _nextId++;
        _byId[entity.Id] = entity;
        switch (entity)
        {
            case Unit unit:
                Units.Add(unit);
                break;
            case Building building:
                Buildings.Add(building);
                break;
            case ResourceNode node:
                Nodes.Add(node);
                break;
        }
        return entity;
    }

    /// <summary>Returns the live entity with this id, or null.</summary>
    public Entity Get(int id)
    {
        return _byId.TryGetValue(id, out var entity) && !entity.IsRemoved ? entity : null;
    }

    public void MarkRemoved(Entity entity)
    {
        if (entity.IsRemoved)
        {
            return;
        }
        entity.IsRemoved = true;
        _removed.Add(entity);
    }

    public void Sweep()
    {
        if (_removed.Count == 0)
        {
            return;
        }
        foreach (var entity in _removed)
        {
            _byId.Remove(entity.Id);
        }
        _removed.Clear();
        Units.RemoveAll(u => u.IsRemoved);
        Buildings.RemoveAll(b => b.IsRemoved);
        Nodes.RemoveAll(n => n.IsRemoved);
    }

    public IEnumerable<Entity> All()
    {
        foreach (var unit in Units)
        {
            yield return unit;
        }
        foreach (var building in Buildings)
        {
            yield return building;
        }
        foreach (var node in Nodes)
        {
            yield return node;
        }
    }
}
