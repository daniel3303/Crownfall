using System.Numerics;
using Crownfall.Sim.Core;
using Crownfall.Sim.Entities;

namespace Crownfall.Sim.Systems;

/// <summary>Neutral camps, the dragon's lair among them: guard their spot, chase intruders up to a leash, reset, and respawn.</summary>
public sealed class CreepSystem
{
    private const float SpawnRingRadius = 1.2f;
    private const float RespawnBlockRadius = 6f;
    private const float LeashArriveDistance = 0.6f;

    private readonly Game _game;
    private readonly List<Unit> _nearby = [];

    public CreepSystem(Game game)
    {
        _game = game;
    }

    public List<CreepCamp> Camps { get; } = [];

    public void Spawn(CreepCamp camp)
    {
        camp.RespawnTick = -1;
        for (var i = 0; i < camp.Members.Count; i++)
        {
            var angle = i * MathF.Tau / camp.Members.Count;
            var position = camp.Center + new Vector2(MathF.Cos(angle), MathF.Sin(angle)) * (i == 0 ? 0 : SpawnRingRadius);
            var creep = _game.SpawnUnit(camp.Members[i], null, position);
            creep.Camp = camp;
            camp.Alive.Add(creep);
        }
    }

    public void UpdateIdle(Unit creep)
    {
        if (creep.IsLeashing)
        {
            creep.IsLeashing = false;
            creep.Hp = creep.MaxHp;
        }
        if (creep.Def.IsPassive)
        {
            return;
        }
        _nearby.Clear();
        _game.Spatial.Query(creep.Position, _game.Content.Rules.CreepAggroRange, _nearby.Add);
        var intruder = _nearby.Where(u => u.IsAlive && u.Owner != null).OrderBy(u => Vector2.DistanceSquared(u.Position, creep.Position)).FirstOrDefault();
        if (intruder != null)
        {
            creep.Order = UnitOrder.Attack(intruder, isAuto: true, resume: UnitOrder.Idle);
        }
    }

    public void Leash(Unit creep)
    {
        creep.IsLeashing = true;
        creep.ClearPath();
        creep.Order = UnitOrder.Move(creep.Camp.Center);
    }

    public void OnAttacked(Unit creep, Entity source)
    {
        if (source is not Unit attacker || !attacker.IsAlive || attacker.Owner == null)
        {
            return;
        }
        foreach (var member in creep.Camp.Alive)
        {
            if (member.IsAlive && !member.IsLeashing && member.Order.Type == OrderType.Idle)
            {
                member.Order = UnitOrder.Attack(attacker, isAuto: true, resume: UnitOrder.Idle);
            }
        }
    }

    public void OnCreepDied(Unit creep, Player killer)
    {
        var camp = creep.Camp;
        camp.Alive.Remove(creep);
        if (killer != null && Resources.Total(creep.Def.BountyAmounts) > 0)
        {
            _game.Storage.Store(killer, creep.Def.BountyAmounts);
            var gold = creep.Def.BountyAmounts[(int)ResourceType.Gold];
            _game.Events.Add(new Events.DepositEvent
            {
                Player = killer.Index,
                X = creep.Position.X,
                Y = creep.Position.Y,
                Resource = ResourceType.Gold,
                Amount = gold,
            });
        }
        if (camp.Alive.Count == 0)
        {
            camp.RespawnTick = _game.Tick + (int)(camp.RespawnSeconds * _game.Content.Rules.TickRate);
        }
        if (camp.IsLair)
        {
            _game.Dragon.OnSlain(creep, killer);
        }
    }

    public void Update()
    {
        foreach (var camp in Camps)
        {
            if (camp.RespawnTick < 0 || _game.Tick < camp.RespawnTick)
            {
                continue;
            }
            _nearby.Clear();
            _game.Spatial.Query(camp.Center, RespawnBlockRadius, _nearby.Add);
            if (!camp.IsLair && _nearby.Any(u => u.IsAlive && u.Owner != null))
            {
                continue;
            }
            Spawn(camp);
            if (camp.IsLair)
            {
                _game.Dragon.OnLanded(camp);
            }
        }
        foreach (var camp in Camps)
        {
            foreach (var creep in camp.Alive)
            {
                if (creep.IsLeashing && Vector2.Distance(creep.Position, camp.Center) <= LeashArriveDistance)
                {
                    creep.Hp = creep.MaxHp;
                }
            }
        }
    }
}
