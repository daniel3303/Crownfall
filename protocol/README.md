# Wire protocol

## Fixtures

`snapshot-v2.bin` is the binary encoding of `snapshot-v2.json`. The C# encoder test and the TypeScript decoder test both read these files, so either side drifting breaks a test.

`vision-v2.json` is a seeded bot match's snapshot plus the map tiles and the server's visible tiles for one team; trees block line of sight, so the client fog code needs the tiles to reproduce the visible set exactly. The same seed regenerating a different file means the simulation lost determinism.

## Snapshot records and map tiles

A building record's `state` byte is its upgrade level (from 1). While flag 128 (`Upgrading`) is set, its `extra` byte is the upgrade's percent done; otherwise it is construction progress. A hero's `extra` byte is its level. Any other unit's `extra` byte is the load it carries while flag 2 (`Carrying`) is set, else its rank: the level of the building that trained it, 1 for an ordinary unit.

Map tiles, in the start message and in tile events, are bytes: 0 grass, 1 sand, 2 water, 3 tree, 4 shallows. Shallows are a lake's walkable rim: units wade through them slowly, and only walls, gates and wall towers can be built on them.

Version 2 added a 19th record byte, `attackSpeed`: how much faster than its base cooldown a unit attacks right now (attack-speed ranks plus Rally), as the multiplier × 64. 64 is the base rate, and buildings and nodes always send 64. The client times attack animations and swing sounds by it.

Flag 16 (`Buffed`) marks a unit under Rally or a unit whose owner holds the dragon's attack buff; the record format is unchanged.

## Shop, streaks and the dragon

The gold loop added only JSON, never record bytes:

- Commands `{ "type": "buyItem", "item": "<item id>" }` and `{ "type": "sellItem", "slot": <0-based slot> }`. Both need the living hero within `rules.itemShopRange` tiles of an own completed town center; a refusal comes back as a warning notice.
- The state message's `hero` adds `items` (an item id per inventory slot, `null` where empty), `canShop`, `streak` (enemy heroes slain since its last death) and `cooldownFactor` (what ability cooldowns are multiplied by, from level and items under `rules.heroCooldownReductionCap`).
- The state message adds `dragon: { isUp, landsInSeconds, buffSeconds }` when the rules have a dragon; `buffSeconds` is the viewer's own buff.
- Event `{ "k": "announce", "type", "title", "text", "player", "team", "x", "y" }` reaches every player. `type` is `firstBlood`, `killStreak`, `shutdown`, `dragonSpawned` or `dragonSlain`; `player` and `team` are -1 when no one owns it.

## Hero picks, kits and talents

Picking a hero and its talents added only JSON; snapshot records keep version 2. Content numbers units, then buildings, then nodes, so the four heroes and two unique units appended to `units` shifted every building and node kind id; client and server read the same `game.json`, which is why `vision-v2.json` was regenerated.

- The socket URL takes `&hero=<unit id>` beside `race`. In a lobby it sets the seat's hero when the seat's race lists it in `races[].heroes`; any other value is ignored and the seat leads the race's classic `races[].hero`.
- Joining a running match prefers a bot seat of the requested race on the team with the fewest humans, and the pick replaces the bot's hero only while that hero has earned nothing yet. Otherwise the bot's hero stays, and a warning `notice` event a second later tells the newcomer why.
- Lobby request `{ "t": "lobby", "action": "hero", "hero": "<unit id>" }` picks the seat's hero; a hero outside the seat's race is ignored, and a race change drops a pick the new race cannot field.
- Lobby `seats[]`, the welcome and state `players[]`, and the end message's `players[]` carry `hero`, the unit id each seat leads. A bot seat's hero is drawn from the match seed, the same on every run.
- Each hero's `abilities` list its kit; `cooldowns` in the state message's `hero`, the `slot` of an `ability` command and the `slot` of an `ability` event index that kit, not the global `abilities` list.
- Ability effect `heal` restores health to the caster and every allied unit within `radius`; its `ability` event has `delayTicks` 0. Buffs may also carry `armorBonus` and `attackBonus`, and a strike may carry `stun`.
- Command `{ "type": "pickTalent", "tier": <0-based tier>, "talent": "<talent id>" }` fills a tier once the hero's level reaches `rules.heroTalentLevels[tier]`; a filled tier or an option of another tier or hero is ignored, and a tier not yet open comes back as a warning notice. The state message's `hero` adds `talents`, a talent id per tier, `null` where unpicked; its `stats` already include what talents add. Talents last through death.
- A unit whose `races` lists races trains only for those races, and one with `requiresTrainerLevel` only at a training building of that level; the second refusal comes back as a warning notice.

## The `end` message

The server sends one `end` text frame when the match is decided. Besides each player's totals, it carries what the host recorded while the match ran (`MatchStatsRecorder`, outside the simulation):

```json
{
  "t": "end",
  "winningTeam": 0,
  "durationSeconds": 734,
  "players": [
    { "index": 0, "name": "Ana", "team": 0, "hero": "archmage", "isBot": false, "score": 4210, "gathered": 3600, "kills": 41, "losses": 12,
      "unitsTrained": 38, "heroLevel": 6, "soldiersTrained": 24, "buildingsBuilt": 11, "heroKills": 2, "heroDeaths": 0 }
  ],
  "timeline": {
    "intervalSeconds": 10,
    "seconds": [0, 10, 20, 734],
    "players": [{ "index": 0, "army": [0, 0, 2, 9], "gathered": [0, 40, 95, 3600], "score": [0, 40, 95, 4210] }]
  }
}
```

- `winningTeam` is -1 for a draw; `durationSeconds` is whole game seconds.
- `soldiersTrained` excludes villagers, unlike `unitsTrained`; `heroKills` counts enemy heroes the player slew, `heroDeaths` the times its own hero fell.
- `timeline` samples every `intervalSeconds` from second 0, plus one last sample at the final tick, which replaces an interval sample in the same whole second, so `seconds` strictly increases; each player's arrays line up with `seconds`. `army` counts living soldiers, heroes excluded.

## Regenerating fixtures

Regenerate after an intentional format change:

```bash
CROWNFALL_UPDATE_FIXTURES=1 dotnet test --project tests/Crownfall.Server.UnitTests
```
