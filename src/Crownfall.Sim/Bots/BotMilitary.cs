using System.Numerics;
using Crownfall.Sim.Commands;
using Crownfall.Sim.Entities;

namespace Crownfall.Sim.Bots;

/// <summary>
/// Bot army: trains the planned mix, defends the base and villagers, and attacks only when its power beats what it knows
/// of the enemy by the profile's margin. Attacks stage, regroup when strung out and fall back when the fight turns, and
/// between attacks a strong enough army slays the dragon.
/// </summary>
public sealed class BotMilitary
{
    private const float RallyDistance = 8f;
    private const float StagingDistance = 12f;
    private const float GatheredRadius = 7f;
    private const float GatheredFraction = 0.8f;
    private const int StagingTimeoutTicks = 250;
    private const int RetreatTimeoutTicks = 200;
    private const float LocalRadius = 11f;
    private const float WaveLossRetreat = 0.35f;
    private const float RecallShare = 0.15f;
    private const float StragglerDistance = 4f;

    // The wave advances on a point this far ahead of its centroid, so fast units wait for slow ones.
    private const float StepDistance = 7f;

    // After a retreat the army attacks again only once it is this much stronger, or after the profile's regroup time.
    private const float RegroupGrowth = 1.3f;

    // A wave with fewer than this share near its centroid gathers there before going on, until the gathered share is met.
    private const float StrungOutFraction = 0.6f;

    // Enemy fighters this far past the local radius already count as met, so the wave fights rather than regroups.
    private const float ContactMargin = 4f;

    // A regroup gives up after this long, and the next may start only after the same time again.
    private const int RegroupTimeoutTicks = 120;

    // A dragon fight gives up after this long, and the army leaves it once losses pass this multiple of what it expected.
    private const int SlayTimeoutTicks = 900;
    private const float SlayLossOverrun = 2f;

    // After a dragon fight ends, won or not, the army waits this long before trying again.
    private const int SlayCooldownTicks = 900;

    private readonly Game _game;
    private readonly Player _player;
    private readonly BotProfile _profile;
    private readonly BotCombatModel _model;
    private readonly BotMemory _memory;
    private readonly BotArmyComposer _composer;
    private readonly BotTargeting _targeting;
    private readonly BotMicro _micro;
    private readonly HashSet<int> _wave = [];
    private int _waveStartCount;
    private int _modeTick;
    private int _objectiveBuilding;
    private Vector2? _detour;
    private int _retreatTick = -100000;
    private float _retreatPower;
    private int _regroupTick = -100000;
    private bool _regrouping;
    private float _slayBudget;
    private int _slayEndTick = -100000;

    public BotMilitary(Game game, Player player, BotProfile profile, BotCombatModel model, BotMemory memory, BotArmyComposer composer)
    {
        _game = game;
        _player = player;
        _profile = profile;
        _model = model;
        _memory = memory;
        _composer = composer;
        _targeting = new BotTargeting(game, memory);
        _micro = new BotMicro(game, player, profile, model, memory);
    }

    public BotMode Mode { get; private set; } = BotMode.Building;
    public Vector2 Objective { get; private set; }

    /// <summary>True when the army is too weak for what the bot knows or estimates of the enemy, or the base is under attack.</summary>
    public bool Urgent { get; private set; }

    /// <summary>Weighs the army against the enemy estimate; when urgent, soldiers are queued before the economy spends.</summary>
    public void Assess(BotView view, BotThreat threat, int[] heroReserve)
    {
        var hasBarracks = view.Buildings.Any(b => b.IsComplete && b.Def.TrainableUnits.Any(u => u.IsMilitary));
        Urgent = hasBarracks && (threat.IsActive || OwnPower(view) < _profile.DefenseRatio * _memory.EnemyEstimate(view.Tick));
        if (Urgent)
        {
            _composer.Train(view, heroReserve);
        }
    }

    public void Run(BotView view, BotThreat threat, int[] reserve)
    {
        _composer.Train(view, reserve);
        SetRallies(view);
        if (threat.IsActive && (Mode != BotMode.Attacking || threat.Power >= RecallShare * Power(view.Army)))
        {
            Defend(view, threat);
            return;
        }
        if (Mode == BotMode.Defending)
        {
            Enter(BotMode.Building, view);
        }
        switch (Mode)
        {
            case BotMode.Staging:
                Stage(view);
                break;
            case BotMode.Attacking:
                Attack(view);
                break;
            case BotMode.Retreating:
                Retreat(view);
                break;
            case BotMode.Slaying:
                Slay(view);
                break;
            default:
                Build(view);
                break;
        }
    }

    private void Build(BotView view)
    {
        var rally = Rally(view);
        if (!SettleFight(view, rally))
        {
            return;
        }
        var stragglers = view.Army.Where(u => u.Order.Type == OrderType.Idle && Vector2.Distance(u.Position, rally) > StragglerDistance).ToList();
        Order(stragglers, rally, attackMove: true);
        if (ShouldAttack(view, out var objective, out var building))
        {
            Objective = objective;
            _objectiveBuilding = building;
            Enter(BotMode.Staging, view);
            return;
        }
        if (ShouldSlay(view))
        {
            Objective = _game.Layout.Lair;
            _objectiveBuilding = 0;
            StartWave(view);
            Enter(BotMode.Slaying, view);
        }
    }

    /// <summary>
    /// Soldiers still fighting away from the rally once a defense ends keep fighting with the wave's micro while they hold
    /// and fall back together once they are losing, rather than brawling on unled. False when they fall back.
    /// </summary>
    private bool SettleFight(BotView view, Vector2 rally)
    {
        var engaged = view.Army.Where(u => u.Order is { Type: OrderType.Attack, Target.Owner: not null } && Vector2.Distance(u.Position, rally) > StragglerDistance).ToList();
        if (engaged.Count == 0)
        {
            return true;
        }
        if (IsLosingLocally(view, engaged))
        {
            BeginRetreat(view);
            return false;
        }
        _micro.Fight(view, engaged, Centroid(engaged), 0);
        return true;
    }

    /// <summary>
    /// Slay the dragon while it is up and the army, with a fit hero, is expected to lose no more than the profile's share
    /// of itself bringing it down from its last seen health. Never while regrouping or soon after the last attempt.
    /// </summary>
    private bool ShouldSlay(BotView view)
    {
        if (_profile.DragonLossShare <= 0 || !_memory.DragonUp || view.Army.Count < _profile.MinAttackArmy || _game.Content.DragonUnit == null)
        {
            return false;
        }
        if (view.Tick - _slayEndTick < SlayCooldownTicks || IsRegrouping(view, OwnPower(view)))
        {
            return false;
        }
        var group = Group(view, view.Army);
        var losses = _model.SlayLosses(group, _game.Content.DragonUnit, _memory.DragonHp, view.Tick);
        _slayBudget = _profile.DragonLossShare * group.Count;
        return losses <= _slayBudget;
    }

    /// <summary>
    /// Marches the wave on the lair and sets every soldier and a fit hero on the dragon once it is in sight. Once it falls the
    /// army goes back to building; a fight that drags on, turns against the wave or costs far more than expected is a retreat.
    /// </summary>
    private void Slay(BotView view)
    {
        var wave = view.Army.Where(u => _wave.Contains(u.Id)).ToList();
        if (!_memory.DragonUp)
        {
            Enter(BotMode.Building, view);
            return;
        }
        var dragging = view.Tick - _modeTick >= SlayTimeoutTicks;
        if (dragging || wave.Count == 0 || _waveStartCount - wave.Count > SlayLossOverrun * _slayBudget || IsLosingLocally(view, wave))
        {
            BeginRetreat(view);
            return;
        }
        var group = Group(view, wave);
        var dragon = view.Creeps.FirstOrDefault(c => c.Camp is { IsLair: true });
        if (dragon == null)
        {
            Order(group.Where(u => !IsMovingTo(u, Objective)).ToList(), Objective, attackMove: true);
            return;
        }
        var idle = group.Where(u => u.Order.Type != OrderType.Attack || u.Order.Target != dragon).Select(u => u.Id).ToList();
        if (idle.Count > 0)
        {
            _game.Commands.Apply(_player, new AttackCommand { Units = idle, Target = dragon.Id });
        }
    }

    /// <summary>
    /// Attack when own power beats known enemy power plus the defenses at the objective by the profile margin, once the army
    /// and the hero have grown to the profile's minimums or the hero deadline has passed; a maxed population attacks regardless.
    /// </summary>
    private bool ShouldAttack(BotView view, out Vector2 objective, out int building)
    {
        objective = default;
        building = 0;
        var maxed = _player.Population >= _game.Content.Rules.PopulationLimit - 3;
        var ready = view.Army.Count >= _profile.MinAttackArmy && HeroReady(view);
        if (!ready && !maxed)
        {
            return false;
        }
        if (!_targeting.TryPick(view.Home, out objective, out building))
        {
            return false;
        }
        var own = OwnPower(view);
        var enemy = _memory.EnemyEstimate(view.Tick) + _memory.DefensePowerNear(objective, LocalRadius);
        return maxed || !IsRegrouping(view, own) && own >= _profile.AttackMargin * enemy;
    }

    /// <summary>True for a while after a retreat, until the army has grown well past what it fell back with.</summary>
    private bool IsRegrouping(BotView view, float own)
    {
        return view.Tick - _retreatTick < _profile.RegroupSeconds * _game.Content.Rules.TickRate && own < _retreatPower * RegroupGrowth;
    }

    private void Stage(BotView view)
    {
        var staging = BotBuilder.Toward(view.Home, Objective, StagingDistance);
        var away = view.Army.Where(u => Vector2.Distance(u.Position, staging) > GatheredRadius && !IsMovingTo(u, staging)).ToList();
        if (IsFit(view.Hero) && !IsMovingTo(view.Hero, staging))
        {
            away.Add(view.Hero);
        }
        Order(away, staging, attackMove: true);
        var gathered = view.Army.Count(u => Vector2.Distance(u.Position, staging) <= GatheredRadius);
        if (gathered >= GatheredFraction * view.Army.Count || view.Tick - _modeTick >= StagingTimeoutTicks)
        {
            StartWave(view);
            _detour = _targeting.Detour(staging, Objective);
            Enter(BotMode.Attacking, view);
        }
    }

    private void StartWave(BotView view)
    {
        _wave.Clear();
        _wave.UnionWith(view.Army.Select(u => u.Id));
        _waveStartCount = _wave.Count;
        _regrouping = false;
    }

    private void Attack(BotView view)
    {
        var wave = view.Army.Where(u => _wave.Contains(u.Id)).ToList();
        if (wave.Count == 0 || wave.Count < WaveLossRetreat * _waveStartCount || IsLosingLocally(view, wave))
        {
            BeginRetreat(view);
            return;
        }
        if (!ObjectiveStands())
        {
            if (!_targeting.TryPick(Centroid(wave), out var next, out var building))
            {
                BeginRetreat(view);
                return;
            }
            Objective = next;
            _objectiveBuilding = building;
            _detour = _targeting.Detour(Centroid(wave), Objective);
        }
        var centroid = Centroid(wave);
        if (_detour.HasValue && Vector2.Distance(centroid, _detour.Value) <= GatheredRadius)
        {
            _detour = null;
        }
        if (IsFit(view.Hero) && Vector2.Distance(view.Hero.Position, centroid) < LocalRadius * 2)
        {
            wave.Add(view.Hero);
        }
        var heading = _detour ?? Objective;
        var advance = Vector2.Distance(centroid, heading) > StepDistance ? BotBuilder.Toward(centroid, heading, StepDistance) : heading;
        if (ShouldRegroup(view, wave, centroid))
        {
            advance = centroid;
        }
        _micro.Fight(view, wave, advance, _detour.HasValue ? 0 : _objectiveBuilding);
    }

    /// <summary>
    /// True while a wave strung out on the march should gather on its centroid: from when too few soldiers are near it
    /// until most are, never once enemies are met, and never past the regroup timeout.
    /// </summary>
    private bool ShouldRegroup(BotView view, List<Unit> wave, Vector2 centroid)
    {
        if (!_profile.KeepWaveTogether || wave.Count == 0)
        {
            return false;
        }
        var near = wave.Count(u => Vector2.Distance(u.Position, centroid) <= GatheredRadius) / (float)wave.Count;
        var met = view.EnemyUnits.Any(u => (u.Def.IsMilitary || u.IsHero) && Vector2.Distance(u.Position, centroid) <= LocalRadius + ContactMargin)
            || view.EnemyBuildings.Any(b => b.Stats.Attack != null && b.EdgeDistance(centroid) <= b.Stats.Attack.Range + ContactMargin);
        if (met || near >= GatheredFraction || _regrouping && view.Tick - _regroupTick >= RegroupTimeoutTicks)
        {
            _regrouping = false;
            return false;
        }
        if (!_regrouping && near < StrungOutFraction && view.Tick - _regroupTick >= 2 * RegroupTimeoutTicks)
        {
            _regrouping = true;
            _regroupTick = view.Tick;
        }
        return _regrouping;
    }

    private void BeginRetreat(BotView view)
    {
        _retreatTick = view.Tick;
        _retreatPower = OwnPower(view);
        Enter(BotMode.Retreating, view);
        var retreating = new List<Unit>(view.Army);
        if (view.Hero is { IsAlive: true })
        {
            retreating.Add(view.Hero);
        }
        Order(retreating, Rally(view), attackMove: false);
    }

    /// <summary>
    /// Retreat when visible enemy soldiers and defenses near the wave outweigh it by the profile's ratio. Heroes count by
    /// <see cref="BotCombatModel.LocalPower"/>, so only area abilities that kill soldiers outright weigh in full, and a hero
    /// alone never turns a wave back: it outruns soldiers, so fleeing it only hands it free kills.
    /// </summary>
    private bool IsLosingLocally(BotView view, List<Unit> wave)
    {
        var front = Centroid(wave);
        var enemy = 0f;
        var backed = false;
        foreach (var unit in view.EnemyUnits)
        {
            if ((unit.Def.IsMilitary || unit.IsHero) && Vector2.Distance(unit.Position, front) <= LocalRadius)
            {
                enemy += _model.LocalPower(unit);
                backed |= !unit.IsHero;
            }
        }
        foreach (var building in view.EnemyBuildings)
        {
            if (building.IsComplete && building.Stats.Attack != null && building.EdgeDistance(front) <= building.Stats.Attack.Range + 2)
            {
                enemy += _model.DefensePower(building.Def);
                backed = true;
            }
        }
        var own = wave.Where(u => Vector2.Distance(u.Position, front) <= LocalRadius).Sum(_model.LocalPower);
        return backed && enemy > _profile.RetreatRatio * own;
    }

    /// <summary>An objective stands while it is a remembered building, or an unexplored point not yet reached.</summary>
    private bool ObjectiveStands()
    {
        if (_objectiveBuilding != 0)
        {
            return _memory.Buildings.Any(b => b.Id == _objectiveBuilding);
        }
        return !_game.Vision.IsTileExplored(_player.Team, (int)Objective.X, (int)Objective.Y) && !_memory.Buildings.Any();
    }

    private void Retreat(BotView view)
    {
        var rally = Rally(view);
        var home = view.Army.Count(u => Vector2.Distance(u.Position, rally) <= GatheredRadius * 1.5f);
        if (home >= GatheredFraction * view.Army.Count || view.Tick - _modeTick >= RetreatTimeoutTicks)
        {
            Enter(BotMode.Building, view);
        }
    }

    /// <summary>
    /// Meets the raid with the army and hero; a raid that outweighs them away from the town center is awaited at the rally
    /// under its fire instead of chased into the open.
    /// </summary>
    private void Defend(BotView view, BotThreat threat)
    {
        if (Mode != BotMode.Defending)
        {
            Enter(BotMode.Defending, view);
        }
        Objective = threat.Center;
        var defenders = new List<Unit>(view.Army);
        if (IsFit(view.Hero))
        {
            defenders.Add(view.Hero);
        }
        var rally = Rally(view);
        var outmatched = threat.Power > _profile.RetreatRatio * Power(defenders);
        if (outmatched && Vector2.Distance(threat.Center, rally) > LocalRadius)
        {
            Order(defenders.Where(u => Vector2.Distance(u.Position, rally) > GatheredRadius && !IsMovingTo(u, rally)).ToList(), rally, attackMove: false);
            return;
        }
        _micro.Fight(view, defenders, threat.Center, 0);
    }

    /// <summary>Points every barracks' rally at the gathering spot so new soldiers assemble on their own.</summary>
    private void SetRallies(BotView view)
    {
        var rally = Rally(view);
        foreach (var building in view.Buildings)
        {
            if (building.IsComplete && building.Def.TrainableUnits.Any(u => u.IsMilitary) && (!building.HasRally || Vector2.Distance(building.Rally, rally) > 1))
            {
                _game.Commands.Apply(_player, new RallyCommand { Building = building.Id, X = rally.X, Y = rally.Y });
            }
        }
    }

    private void Enter(BotMode mode, BotView view)
    {
        if (Mode == BotMode.Slaying && mode != BotMode.Slaying)
        {
            _slayEndTick = view.Tick;
        }
        Mode = mode;
        _modeTick = view.Tick;
        if (mode is BotMode.Building or BotMode.Retreating)
        {
            _wave.Clear();
        }
    }

    /// <summary>The given soldiers plus the hero when it is fit to fight.</summary>
    private List<Unit> Group(BotView view, List<Unit> soldiers)
    {
        var group = new List<Unit>(soldiers);
        if (IsFit(view.Hero))
        {
            group.Add(view.Hero);
        }
        return group;
    }

    private float OwnPower(BotView view)
    {
        return Power(view.Army) + (IsFit(view.Hero) ? _model.Power(view.Hero) : 0);
    }

    /// <summary>A hero fights with the army above its retreat health; below it the hero pilot keeps it behind the lines.</summary>
    private bool IsFit(Unit hero)
    {
        return hero is { IsAlive: true } && hero.Hp >= hero.MaxHp * _profile.HeroRetreatHealth;
    }

    private float Power(IEnumerable<Unit> units)
    {
        return units.Sum(_model.Power);
    }

    /// <summary>
    /// The hero has reached the profile's attack level, or the profile's deadline has passed, so an enemy that denies the
    /// hero experience cannot hold the army at home forever.
    /// </summary>
    private bool HeroReady(BotView view)
    {
        var deadline = _profile.AttackHeroDeadlineSeconds * _game.Content.Rules.TickRate;
        return _player.HeroState.Level >= _profile.AttackHeroLevel || (deadline > 0 && view.Tick >= deadline);
    }

    /// <summary>Where soldiers gather between fights: a little way from home toward the map center.</summary>
    public Vector2 Rally(BotView view)
    {
        return BotBuilder.Toward(view.Home, _game.MapCenter, RallyDistance);
    }

    private static bool IsMovingTo(Unit unit, Vector2 point)
    {
        return unit.Order.Type is OrderType.Move or OrderType.AttackMove && Vector2.Distance(unit.Order.Point, point) <= GatheredRadius;
    }

    private static Vector2 Centroid(List<Unit> units)
    {
        var sum = Vector2.Zero;
        foreach (var unit in units)
        {
            sum += unit.Position;
        }
        return units.Count == 0 ? sum : sum / units.Count;
    }

    private void Order(List<Unit> units, Vector2 point, bool attackMove)
    {
        if (units.Count == 0)
        {
            return;
        }
        _game.Commands.Apply(_player, new MoveCommand { Units = units.Select(u => u.Id).ToList(), X = point.X, Y = point.Y, AttackMove = attackMove });
    }
}
