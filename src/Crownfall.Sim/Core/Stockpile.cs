namespace Crownfall.Sim.Core;

/// <summary>
/// A pool of resources. Teammates share one instance when the match uses shared resources. Income goes through
/// <see cref="Store"/>, which keeps each resource under its storage cap; spending and refunds ignore the cap.
/// </summary>
public sealed class Stockpile
{
    private readonly int[] _amounts = new int[Resources.Count];
    private readonly int[] _caps = [int.MaxValue, int.MaxValue, int.MaxValue, int.MaxValue];

    public int this[ResourceType type] => _amounts[(int)type];

    public int Cap(ResourceType type)
    {
        return _caps[(int)type];
    }

    public int[] Caps()
    {
        return (int[])_caps.Clone();
    }

    public void SetCap(ResourceType type, int cap)
    {
        _caps[(int)type] = Math.Max(0, cap);
    }

    /// <summary>How much more income of a resource fits; 0 once at or over the cap.</summary>
    public int Room(ResourceType type)
    {
        return Math.Max(0, _caps[(int)type] - _amounts[(int)type]);
    }

    /// <summary>Adds income up to the cap and returns the part that did not fit, which is lost.</summary>
    public int Store(ResourceType type, int amount)
    {
        var kept = Math.Clamp(amount, 0, Room(type));
        _amounts[(int)type] += kept;
        return Math.Max(0, amount) - kept;
    }

    public int[] Snapshot()
    {
        return (int[])_amounts.Clone();
    }

    public bool CanAfford(int[] cost)
    {
        for (var i = 0; i < Resources.Count; i++)
        {
            if (_amounts[i] < cost[i])
            {
                return false;
            }
        }
        return true;
    }

    public bool TrySpend(int[] cost)
    {
        if (!CanAfford(cost))
        {
            return false;
        }
        for (var i = 0; i < Resources.Count; i++)
        {
            _amounts[i] -= cost[i];
        }
        return true;
    }

    /// <summary>Uncapped: starting resources and refunds of what was already paid.</summary>
    public void Add(int[] amounts)
    {
        for (var i = 0; i < Resources.Count; i++)
        {
            _amounts[i] += amounts[i];
        }
    }

    public void Add(ResourceType type, int amount)
    {
        _amounts[(int)type] += amount;
    }

    public bool TryTake(ResourceType type, int amount)
    {
        if (amount <= 0 || _amounts[(int)type] < amount)
        {
            return false;
        }
        _amounts[(int)type] -= amount;
        return true;
    }

    /// <summary>Names the first resource the stockpile is short of, for player notices.</summary>
    public string DescribeShortfall(int[] cost)
    {
        for (var i = 0; i < Resources.Count; i++)
        {
            if (_amounts[i] < cost[i])
            {
                return Resources.Name((ResourceType)i);
            }
        }
        return null;
    }
}
