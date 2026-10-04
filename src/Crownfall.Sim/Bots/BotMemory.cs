using System.Numerics;
using Crownfall.Sim.Content;
using Crownfall.Sim.Entities;
using Crownfall.Sim.Events;

namespace Crownfall.Sim.Bots;

/// <summary>
/// What a bot's team has seen: enemy buildings and soldiers remembered through fog, a decaying tally of the enemy
/// army mix, neutral camps, and where enemy bases probably are. Everything here comes from vision or public map rules.
/// </summary>
public sealed class BotMemory
{
    // Unseen production starts this many seconds in, roughly when a first barracks finishes its first soldier.
    private const int FirstSoldierSeconds = 120;

    // Opponents rarely train nonstop, so unseen production counts at this share of a barracks' capacity.
    private const float UnseenProductionShare = 0.8f;

    private readonly Game _game;
    private readonly Player _player;
    private readonly BotCombatModel _model;
    private readonly int _forgetTicks;
    private readonly float _mixDecay;
    private readonly SortedDictionary<int, KnownBuilding> _buildings = [];
    private readonly SortedDictionary<int, KnownUnit> _units = [];
    private readonly SortedDictionary<int, KnownCamp> _camps = [];
    private readonly HashSet<int> _tallied = [];
    private readonly float[] _mix;
    private readonly List<int> _stale = [];
    private readonly List<KnownStrike> _strikes = [];
    private readonly float _averagePower;
    private readonly float _averageTrainSeconds;

    public BotMemory(Game game, Player player, BotProfile profile, BotCombatModel model)
    {
        _game = game;
        _player = player;
        _model = model;
        _forgetTicks = profile.MemorySeconds * game.Content.Rules.TickRate;
        _mixDecay = MathF.Pow(0.5f, profile.ThinkTicks / (float)Math.Max(1, _forgetTicks));
        _mix = new float[game.Content.Units.Count];
        _averagePower = model.Military.Count == 0 ? 0 : model.Military.Average(model.Power);
        _averageTrainSeconds = model.Military.Count == 0 ? 1 : MathF.Max(1, model.Military.Average(u => u.TrainTime));
        CandidateStarts = InferEnemyStarts(game, player);
    }

    public IEnumerable<KnownBuilding> Buildings => _buildings.Values;
    public IEnumerable<KnownUnit> Fighters => _units.Values;
    public IEnumerable<KnownCamp> Camps => _camps.Values;

    /// <summary>Enemy strikes seen being cast that have not landed yet, in cast order.</summary>
    public IReadOnlyList<KnownStrike> Strikes => _strikes;

    /// <summary>Likely enemy start spots, nearest first, from the map's rotational symmetry around its center.</summary>
    public IReadOnlyList<Vector2> CandidateStarts { get; }

    public float EnemyArmyPower { get; private set; }
    public int LastArmySightingTick { get; private set; } = -100000;
    public int LastVillagerSightingTick { get; private set; } = -100000;
    public Vector2 LastVillagerSighting { get; private set; }

    public void Observe(BotView view)
    {
        foreach (var building in view.EnemyBuildings)
        {
            if (!_buildings.ContainsKey(building.Id))
            {
                _buildings[building.Id] = new KnownBuilding { Id = building.Id, Def = building.Def, Owner = building.Owner.Index, Rect = building.Rect };
            }
        }
        ForgetDestroyedBuildings();
        foreach (var unit in view.EnemyUnits)
        {
            ObserveUnit(unit, view.Tick);
        }
        ForgetLostUnits(view.Tick);
        for (var i = 0; i < _mix.Length; i++)
        {
            _mix[i] *= _mixDecay;
        }
        ObserveCamps(view);
        _strikes.RemoveAll(s => s.ImpactTick < view.Tick);
        EnemyArmyPower = _units.Values.Sum(u => u.Power);
    }

    /// <summary>
    /// Known enemy power plus what their barracks (at least one per living enemy) could have trained since the bot last saw
    /// their soldiers, so stale intel reads as a bigger enemy rather than an empty one.
    /// </summary>
    public float EnemyEstimate(int tick)
    {
        var rate = _game.Content.Rules.TickRate;
        var since = Math.Max(LastArmySightingTick, FirstSoldierSeconds * rate);
        var unseenSeconds = Math.Clamp(tick - since, 0, _forgetTicks) / (float)rate;
        var enemies = _game.Players.Count(p => p.Team != _player.Team && !p.IsDefeated);
        var barracks = Math.Max(enemies, _buildings.Values.Count(b => b.Def.TrainableUnits.Any(u => u.IsMilitary)));
        return EnemyArmyPower + barracks * unseenSeconds / _averageTrainSeconds * _averagePower * UnseenProductionShare;
    }

    /// <summary>Share of recently scouted enemy fighters of this type, heroes weighted by power; zero when nothing has been seen.</summary>
    public float MixShare(UnitDef def)
    {
        var total = MixTotal;
        return total <= 0 ? 0 : _mix[def.Kind] / total;
    }

    /// <summary>Decayed count of distinct enemy fighters seen recently, heroes weighted by power.</summary>
    public float MixTotal => _model.Fighters.Sum(def => _mix[def.Kind]);

    /// <summary>Known tower and town center fire covering a point.</summary>
    public float DefensePowerNear(Vector2 point, float radius)
    {
        var total = 0f;
        foreach (var building in _buildings.Values)
        {
            if (building.Def.Attack != null && building.Rect.DistanceTo(point) <= radius + building.Def.Attack.Range)
            {
                total += _model.DefensePower(building.Def);
            }
        }
        return total;
    }

    public bool IsCampLikelyAlive(KnownCamp camp, int tick)
    {
        var respawnTicks = (int)(_game.Content.Rules.CampRespawnSeconds * _game.Content.Rules.TickRate);
        return camp.LastAliveTick >= camp.LastEmptyTick || tick - camp.LastEmptyTick >= respawnTicks;
    }

    /// <summary>The nearest likely enemy start this team has not explored yet.</summary>
    public bool TryUnexploredStart(out Vector2 point)
    {
        foreach (var candidate in CandidateStarts)
        {
            if (!_game.Vision.IsTileExplored(_player.Team, (int)candidate.X, (int)candidate.Y))
            {
                point = candidate;
                return true;
            }
        }
        point = default;
        return false;
    }

    private void ObserveUnit(Unit unit, int tick)
    {
        if (unit.Def.IsVillager)
        {
            LastVillagerSighting = unit.Position;
            LastVillagerSightingTick = tick;
            return;
        }
        if (!unit.Def.IsMilitary && !unit.IsHero)
        {
            return;
        }
        if (unit.IsHero)
        {
            ForgetOtherHeroes(unit);
        }
        else
        {
            LastArmySightingTick = tick;
        }
        if (_tallied.Add(unit.Id))
        {
            _mix[unit.Def.Kind] += _model.Weight(unit.Def);
        }
        if (!_units.TryGetValue(unit.Id, out var known))
        {
            known = new KnownUnit { Id = unit.Id, Def = unit.Def, Owner = unit.Owner.Index };
            _units[unit.Id] = known;
        }
        known.Position = unit.Position;
        known.Power = _model.Power(unit);
        known.FullPower = _model.FullPower(unit);
        known.LastSeenTick = tick;
    }

    /// <summary>An enemy cast the team saw; delayed strikes are kept so soldiers can step out before they land.</summary>
    public void Witness(AbilityEvent ability, int tick)
    {
        if (ability.Team != _player.Team && ability.DelayTicks > 0)
        {
            _strikes.Add(new KnownStrike { Point = new Vector2(ability.X, ability.Y), Radius = ability.Radius, ImpactTick = tick + ability.DelayTicks });
        }
    }

    /// <summary>
    /// A soldier seen dying is forgotten; a hero seen dying is remembered at full health, since it is revived whole and
    /// counting it out for its revive delay only invites an attack that meets it at home.
    /// </summary>
    public void Witness(DeathEvent death, int tick)
    {
        if (!_units.TryGetValue(death.Id, out var known))
        {
            return;
        }
        if (known.Def.IsHero)
        {
            known.Power = known.FullPower;
            known.LastSeenTick = tick;
            return;
        }
        _units.Remove(death.Id);
    }

    private void ForgetOtherHeroes(Unit hero)
    {
        _stale.Clear();
        _stale.AddRange(_units.Values.Where(u => u.Def.IsHero && u.Owner == hero.Owner.Index && u.Id != hero.Id).Select(u => u.Id));
        RemoveStale(_units);
    }

    /// <summary>
    /// Soldiers not seen dying are forgotten after the memory horizon; heroes only with their defeated owner, because a
    /// fallen hero can always be revived.
    /// </summary>
    private void ForgetLostUnits(int tick)
    {
        _stale.Clear();
        foreach (var known in _units.Values)
        {
            if (!known.Def.IsHero && tick - known.LastSeenTick > _forgetTicks || _game.PlayerAt(known.Owner).IsDefeated)
            {
                _stale.Add(known.Id);
            }
        }
        RemoveStale(_units);
    }

    private void ForgetDestroyedBuildings()
    {
        _stale.Clear();
        foreach (var known in _buildings.Values)
        {
            var spotVisible = _game.Vision.IsPointVisible(_player.Team, known.Position);
            var gone = spotVisible && _game.Entities.Get(known.Id) is not { IsAlive: true };
            if (gone || _game.PlayerAt(known.Owner).IsDefeated)
            {
                _stale.Add(known.Id);
            }
        }
        RemoveStale(_buildings);
    }

    private void ObserveCamps(BotView view)
    {
        foreach (var creep in view.Creeps)
        {
            if (creep.Camp == null)
            {
                continue;
            }
            if (!_camps.TryGetValue(creep.Camp.Id, out var camp))
            {
                camp = new KnownCamp { Id = creep.Camp.Id, Center = creep.Camp.Center };
                _camps[camp.Id] = camp;
            }
            camp.LastAliveTick = view.Tick;
            camp.HasBoss |= creep.Def.HasTag("boss");
        }
        foreach (var camp in _camps.Values)
        {
            if (camp.LastAliveTick != view.Tick && _game.Vision.IsPointVisible(_player.Team, camp.Center))
            {
                camp.LastEmptyTick = view.Tick;
            }
        }
    }

    private void RemoveStale<T>(SortedDictionary<int, T> known)
    {
        foreach (var id in _stale)
        {
            known.Remove(id);
        }
    }

    private static List<Vector2> InferEnemyStarts(Game game, Player player)
    {
        var center = game.MapCenter;
        var offset = player.Start.Center - center;
        var teams = game.Config.Teams;
        var candidates = new List<Vector2>();
        for (var k = 1; k < teams; k++)
        {
            var angle = k * MathF.Tau / teams;
            var (sin, cos) = MathF.SinCos(angle);
            candidates.Add(center + new Vector2(offset.X * cos - offset.Y * sin, offset.X * sin + offset.Y * cos));
        }
        return candidates.OrderBy(c => Vector2.DistanceSquared(c, player.Start.Center)).ToList();
    }
}
