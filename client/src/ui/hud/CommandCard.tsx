import type { ReactNode } from "react";
import { buildingDef, buildingStats, canAfford, content, maxLevel, RESOURCE_NAMES, unitDef, type Cost } from "../../content/content";
import { session } from "../../session";
import { Icon, Portrait } from "../icons";
import { useHud, type SelectionView } from "../store";
import { BuildingTip, ReviveTip, TextTip, TradeTip, UnitTip, UpgradeTip } from "../tooltip/Tips";
import { tradableResources, upgradeRequirement } from "./building-upgrades";
import { tipProps } from "../tooltip/use-tip";

const TRAIN_KEYS = ["Z", "X", "C", "V"];

export function CommandCard() {
  const selection = useHud((s) => s.selection);
  const stats = useHud((s) => s.stats);
  const mode = useHud((s) => s.mode);
  const stock = stats?.resources ?? [];
  const view = session.game;
  if (selection.kind === "units" && selection.villagers) {
    return (
      <div className="commands panel">
        {content.buildings.map((building) => (
          <CommandButton
            key={building.id}
            id={building.id}
            hotkey={building.hotkey}
            cost={building.cost}
            stock={stock}
            tip={<BuildingTip def={building} />}
            active={mode.kind === "place" && mode.building === building.id}
            onClick={() => view?.beginPlacement(building.id)}
          />
        ))}
        <CommandButton id="stop" hotkey="X" tip={STOP_TIP} onClick={() => view?.stop()} />
      </div>
    );
  }
  if (selection.kind === "units") {
    return (
      <div className="commands panel">
        <CommandButton id="attackMove" hotkey="A" tip={ATTACK_MOVE_TIP} active={mode.kind === "attackMove"} onClick={() => view?.setMode({ kind: "attackMove" })} />
        <CommandButton id="stop" hotkey="X" tip={STOP_TIP} onClick={() => view?.stop()} />
      </div>
    );
  }
  if (selection.kind === "building" && !selection.constructing) {
    return <BuildingCommands selection={selection} stock={stock} />;
  }
  return <div className="commands panel" />;
}

type BuildingSelection = Extract<SelectionView, { kind: "building" }>;

/** An own finished building: training, the hero revive at a town center, upgrades, market trades and the queue. */
function BuildingCommands({ selection, stock }: { selection: BuildingSelection; stock: number[] }) {
  const hero = useHud((s) => s.stats?.hero);
  const view = session.game;
  const def = buildingDef(selection.entity.defId);
  const isTownCenter = def.tags?.includes("townCenter") ?? false;
  return (
    <div className="commands panel">
      {selection.trains.map((unit, i) => {
        const def = unitDef(unit);
        return <CommandButton key={unit} id={unit} hotkey={TRAIN_KEYS[i]} cost={def.cost} stock={stock} tip={<UnitTip def={def} hotkey={TRAIN_KEYS[i]} rank={selection.entity.level} />} onClick={() => view?.train(unit)} />;
      })}
      {isTownCenter && hero && hero.id === 0 && (
        <CommandButton
          id="revive"
          cost={costOf(hero.reviveCost)}
          stock={stock}
          disabled={hero.reviveSeconds > 0}
          overlay={hero.reviveSeconds > 0 ? String(Math.ceil(hero.reviveSeconds)) : undefined}
          tip={<ReviveTip hero={hero} />}
          onClick={() => view?.reviveHero(selection.entity.id)}
        />
      )}
      <UpgradeButton selection={selection} stock={stock} />
      {def.market && <MarketButtons stock={stock} />}
      {selection.queue.length > 0 && (
        <div className="queue">
          {selection.queue.map((unit, i) => (
            <button key={i} className="queue-item" onClick={() => view?.cancelTrain()} {...tipProps(() => QUEUE_TIP)}>
              <Portrait id={unit} />
              {i === 0 && <span className="queue-progress" style={{ width: `${selection.progress * 100}%` }} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Upgrade to the next level, or cancel the running upgrade for a full refund. */
function UpgradeButton({ selection, stock }: { selection: BuildingSelection; stock: number[] }) {
  const townCenterLevel = useHud((s) => s.stats?.townCenterLevel ?? 0);
  const view = session.game;
  const def = buildingDef(selection.entity.defId);
  const level = selection.entity.level;
  if (selection.entity.upgrading) {
    return <CommandButton id="cancelUpgrade" overlay={`${selection.entity.upgradeProgress}%`} tip={CANCEL_UPGRADE_TIP} onClick={() => view?.cancelUpgrade()} />;
  }
  if (level >= maxLevel(def)) return null;
  const locked = upgradeRequirement(def, level) > townCenterLevel;
  return (
    <CommandButton
      id="upgrade"
      hotkey="U"
      cost={buildingStats(def, level + 1).cost}
      stock={stock}
      disabled={locked}
      tip={<UpgradeTip def={def} level={level} townCenterLevel={townCenterLevel} />}
      onClick={() => view?.upgrade()}
    />
  );
}

/** Buy and sell buttons for each tradable resource, priced from the player's own market. */
function MarketButtons({ stock }: { stock: number[] }) {
  const market = useHud((s) => s.stats?.market);
  const view = session.game;
  if (!market) return null;
  return (
    <>
      {tradableResources(market).flatMap((resource) => {
        const i = RESOURCE_NAMES.indexOf(resource);
        return [true, false].map((buy) => {
          const price = (buy ? market.buy[i] : market.sell[i]) ?? 0;
          return (
            <CommandButton
              key={`${resource}-${buy}`}
              id={resource}
              corner={<Icon id={buy ? "buy" : "sell"} />}
              overlay={String(price)}
              cost={buy ? { gold: price } : { [resource]: market.lot }}
              stock={stock}
              tip={<TradeTip resource={resource} buy={buy} price={price} lot={market.lot} />}
              onClick={() => view?.trade(resource, buy)}
            />
          );
        });
      })}
    </>
  );
}

function costOf(amounts: readonly number[]): Cost {
  return Object.fromEntries(RESOURCE_NAMES.map((name, i) => [name, amounts[i] ?? 0])) as Cost;
}

const STOP_TIP = <TextTip title="Stop" hotkey="X" text="Cancel the selected units' orders." />;
const ATTACK_MOVE_TIP = <TextTip title="Attack-move" hotkey="A" text="Then click the ground: the units walk there and fight anything hostile on the way." />;
const QUEUE_TIP = <TextTip title="Cancel training" hotkey="Backspace" text="Removes the last unit in the queue and refunds it." />;
const CANCEL_UPGRADE_TIP = <TextTip title="Cancel upgrade" text="Stops the upgrade and refunds its full price." />;

interface CommandButtonProps {
  id: string;
  tip: ReactNode;
  hotkey?: string;
  cost?: Cost;
  stock?: number[];
  active?: boolean;
  disabled?: boolean;
  /** Text over the icon, such as a countdown. */
  overlay?: string;
  /** A small mark in the top corner, such as buy or sell. */
  corner?: ReactNode;
  onClick(): void;
}

function CommandButton({ id, hotkey, cost, stock, active, disabled, overlay, corner, tip, onClick }: CommandButtonProps) {
  const affordable = !cost || canAfford(cost, stock ?? []);
  return (
    <button
      className={`command ${active ? "active" : ""} ${affordable && !disabled ? "" : "poor"}`}
      aria-disabled={disabled}
      onClick={() => !disabled && onClick()}
      {...tipProps(() => tip)}
    >
      <span>
        <Portrait id={id} />
      </span>
      {hotkey && <kbd>{hotkey}</kbd>}
      {corner && <span className="command-corner">{corner}</span>}
      {overlay && <span className={corner ? "command-price" : "cooldown"}>{overlay}</span>}
    </button>
  );
}
