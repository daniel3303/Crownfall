using Crownfall.Sim.Commands;
using Crownfall.Sim.Content;
using Crownfall.Sim.Core;
using Crownfall.Sim.Entities;

namespace Crownfall.Sim.Bots;

/// <summary>
/// Plans the army mix from content-derived trade values: a balanced base mix, shifted toward the units that beat what the
/// bot has scouted, and fills barracks queues with whichever planned unit is furthest below its share.
/// </summary>
public sealed class BotArmyComposer
{
    // No unit type falls below this share, so the army keeps a mix even against a one-type enemy.
    private const float MinShare = 0.1f;

    // Scouted soldiers needed before counters replace the base mix entirely.
    private const float FullIntel = 4f;

    private readonly Game _game;
    private readonly Player _player;
    private readonly BotProfile _profile;
    private readonly BotCombatModel _model;
    private readonly BotMemory _memory;
    private readonly float[] _base;
    private readonly float[] _mix;
    private readonly int[] _owned;

    public BotArmyComposer(Game game, Player player, BotProfile profile, BotCombatModel model, BotMemory memory)
    {
        _game = game;
        _player = player;
        _profile = profile;
        _model = model;
        _memory = memory;
        _base = Normalize(model.Military.Select(unit => Preference(unit, enemy => enemy.IsHero ? 0 : 1f / model.Military.Count)).ToArray());
        _mix = (float[])_base.Clone();
        _owned = new int[model.Military.Count];
    }

    /// <summary>Planned share of each unit type, aligned with <see cref="BotCombatModel.Military"/>.</summary>
    public IReadOnlyList<float> Mix => _mix;

    public void Plan(bool[] available)
    {
        var intel = MathF.Min(1, _memory.MixTotal / FullIntel);
        var weight = _profile.CounterWeight * intel;
        var counter = intel > 0 ? Normalize(_model.Military.Select(unit => Preference(unit, _memory.MixShare)).ToArray()) : _base;
        for (var i = 0; i < _mix.Length; i++)
        {
            var affordable = IsSustainable(_model.Military[i], available);
            _mix[i] = affordable ? MathF.Max(MinShare, _base[i] * (1 - weight) + counter[i] * weight) : 0;
        }
        var total = _mix.Sum();
        for (var i = 0; i < _mix.Length; i++)
        {
            _mix[i] = total > 0 ? _mix[i] / total : _base[i];
        }
    }

    /// <summary>Queues one unit in each barracks with room, leaving <paramref name="reserve"/> unspent.</summary>
    public void Train(BotView view, int[] reserve)
    {
        CountOwned(view);
        foreach (var barracks in view.Buildings)
        {
            if (!barracks.IsComplete || barracks.Def.TrainableUnits.Count == 0 || barracks.Def.IsTownCenter || barracks.Queue.Count >= _profile.BarracksQueue)
            {
                continue;
            }
            var choice = Choose(barracks, reserve);
            if (choice == null)
            {
                continue;
            }
            _game.Commands.Apply(_player, new TrainCommand { Building = barracks.Id, Unit = choice.Id });
            _owned[IndexOf(choice)]++;
        }
    }

    /// <summary>
    /// The trainable unit furthest below its planned share, saving for it when the stock is short; another unit is bought
    /// instead only when it is itself a whole unit behind its share.
    /// </summary>
    private UnitDef Choose(Building barracks, int[] reserve)
    {
        var total = _owned.Sum() + 1;
        var ranked = barracks.Def.TrainableUnits
            .Select(unit => (Unit: unit, Index: IndexOf(unit)))
            .Where(c => c.Index >= 0 && _mix[c.Index] > 0)
            .Select(c => (c.Unit, Gap: _mix[c.Index] * total - _owned[c.Index]))
            .OrderByDescending(c => c.Gap)
            .ToList();
        for (var i = 0; i < ranked.Count; i++)
        {
            if ((i == 0 || ranked[i].Gap >= 1) && CanAfford(ranked[i].Unit, reserve))
            {
                return ranked[i].Unit;
            }
        }
        return null;
    }

    /// <summary>exp of the share-weighted log trade value against an enemy mix: how well the unit fares on average.</summary>
    private float Preference(UnitDef unit, Func<UnitDef, float> share)
    {
        var score = 0f;
        foreach (var enemy in _model.Fighters)
        {
            score += share(enemy) * MathF.Log(_model.Exchange(unit, enemy));
        }
        return MathF.Exp(score);
    }

    /// <summary>A unit is sustainable when every resource it costs can be gathered or is already banked.</summary>
    private bool IsSustainable(UnitDef unit, bool[] available)
    {
        for (var i = 0; i < Resources.Count; i++)
        {
            if (unit.CostAmounts[i] > 0 && !available[i] && _player.Stock[(ResourceType)i] < unit.CostAmounts[i])
            {
                return false;
            }
        }
        return true;
    }

    /// <summary>Affordable while leaving the reserve untouched in every resource the unit spends.</summary>
    private bool CanAfford(UnitDef unit, int[] reserve)
    {
        return BotBuilder.CanAffordAbove(_player, unit.CostAmounts, reserve);
    }

    private void CountOwned(BotView view)
    {
        Array.Clear(_owned);
        foreach (var unit in view.Army)
        {
            var index = IndexOf(unit.Def);
            if (index >= 0)
            {
                _owned[index]++;
            }
        }
        foreach (var building in view.Buildings)
        {
            foreach (var item in building.Queue)
            {
                var index = IndexOf(item.Unit);
                if (index >= 0)
                {
                    _owned[index]++;
                }
            }
        }
    }

    private int IndexOf(UnitDef unit)
    {
        for (var i = 0; i < _model.Military.Count; i++)
        {
            if (_model.Military[i] == unit)
            {
                return i;
            }
        }
        return -1;
    }

    private static float[] Normalize(float[] values)
    {
        var total = values.Sum();
        return total <= 0 ? values : values.Select(v => v / total).ToArray();
    }
}
