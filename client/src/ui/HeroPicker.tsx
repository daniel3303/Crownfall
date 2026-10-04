import { heroKit, raceHeroes } from "../content/content";
import { heroUnlockLevel, isHeroUnlocked } from "../meta/heroes";
import { Icon, Portrait } from "./icons";
import { profileLevel } from "./profile";

/** The race's heroes with their four abilities; one above the profile's level shows the level that unlocks it. */
export function HeroPicker({ race, selected, onPick }: { race: string; selected: string; onPick(hero: string): void }) {
  const level = profileLevel();
  return (
    <div className="hero-picker">
      {raceHeroes(race).map((hero) => {
        const locked = !isHeroUnlocked(hero.id, level);
        const kit = heroKit(hero.id);
        return (
          <button
            key={hero.id}
            className={`hero-choice ${hero.id === selected ? "active" : ""} ${locked ? "locked" : ""}`}
            aria-disabled={locked}
            aria-pressed={hero.id === selected}
            title={locked ? `${hero.name} unlocks at profile level ${heroUnlockLevel(hero.id)}.` : kit.map((a) => `${a.key} ${a.name}`).join(" · ")}
            onClick={() => !locked && onPick(hero.id)}
          >
            <span className="hero-choice-icon">
              <Portrait id={hero.id} />
              {locked && (
                <span className="hero-choice-lock">
                  <Icon id="locked" />
                  {heroUnlockLevel(hero.id)}
                </span>
              )}
            </span>
            <strong>{hero.name}</strong>
            {locked ? (
              <small>Level {heroUnlockLevel(hero.id)}</small>
            ) : (
              <span className="hero-choice-kit">
                {kit.map((ability) => (
                  <Icon key={ability.id} id={ability.id} />
                ))}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
