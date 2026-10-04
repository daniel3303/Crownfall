import { costList, RESOURCE_NAMES } from "../../content/content";
import { session } from "../../session";
import { Icon } from "../icons";
import { store, useHud } from "../store";
import { ItemTip } from "../tooltip/Tips";
import { tipProps } from "../tooltip/use-tip";
import { itemStatLines, SHOP_BLOCK_TEXT, shopBlock, shopItems } from "./items";

/** The hero item shop: every item with its price and stats, bought with a click while the hero stands at a town center. */
export function ShopPanel() {
  const hero = useHud((s) => s.stats?.hero);
  const stock = useHud((s) => s.stats?.resources ?? []);
  if (!hero?.items) return null;
  const status = hero.id === 0 ? SHOP_BLOCK_TEXT.fallen : hero.canShop ? "Your hero is at a town center: click an item to buy it." : SHOP_BLOCK_TEXT.away;
  return (
    <div className="shop panel">
      <div className="shop-head">
        <h3>
          <Icon id="shop" /> Hero Shop
        </h3>
        <button className="btn btn-small" onClick={() => store.set({ shop: false })}>
          Close <kbd>P</kbd>
        </button>
      </div>
      <p className={`shop-status ${hero.canShop ? "ok" : "away"}`}>{status}</p>
      <div className="shop-items">
        {shopItems().map((item) => {
          const block = shopBlock(item, hero, stock);
          const owned = block === "owned";
          return (
            <button
              key={item.id}
              className={`shop-item ${block ? `blocked blocked-${block}` : ""}`}
              aria-disabled={!!block}
              onClick={() => !block && session.game?.buyItem(item.id)}
              {...tipProps(() => <ItemTip item={item} block={block} />)}
            >
              <span className="shop-item-icon">
                <Icon id={item.id} />
              </span>
              <span className="shop-item-body">
                <span className="shop-item-name">{item.name}</span>
                <span className="shop-item-stats">{itemStatLines(item).map((line) => line.text).join(", ")}</span>
              </span>
              <span className="shop-item-price">
                {owned ? (
                  <em>Owned</em>
                ) : (
                  costList(item.cost).map((amount, i) =>
                    amount > 0 ? (
                      <span key={RESOURCE_NAMES[i]} className={(stock[i] ?? 0) >= amount ? "" : "short"}>
                        <Icon id={RESOURCE_NAMES[i]!} />
                        {amount}
                      </span>
                    ) : null,
                  )
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
