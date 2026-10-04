# Wire protocol fixtures

`snapshot-v2.bin` is the binary encoding of `snapshot-v2.json`. The C# encoder test and the TypeScript decoder test both read these files, so either side drifting breaks a test.

`vision-v2.json` is a seeded bot match's snapshot plus the map tiles and the server's visible tiles for one team; trees block line of sight, so the client fog code needs the tiles to reproduce the visible set exactly. The same seed regenerating a different file means the simulation lost determinism.

A building record's `state` byte is its upgrade level (from 1). While flag 128 (`Upgrading`) is set, its `extra` byte is the upgrade's percent done; otherwise it is construction progress. A hero's `extra` byte is its level. Any other unit's `extra` byte is the load it carries while flag 2 (`Carrying`) is set, else its rank: the level of the building that trained it, 1 for an ordinary unit.

Map tiles, in the start message and in tile events, are bytes: 0 grass, 1 sand, 2 water, 3 tree, 4 shallows. Shallows are a lake's walkable rim: units wade through them slowly, and only walls, gates and wall towers can be built on them.

Version 2 added a 19th record byte, `attackSpeed`: how much faster than its base cooldown a unit attacks right now (attack-speed ranks plus Rally), as the multiplier × 64. 64 is the base rate, and buildings and nodes always send 64. The client times attack animations and swing sounds by it.

Regenerate after an intentional format change:

```bash
CROWNFALL_UPDATE_FIXTURES=1 dotnet test --project tests/Crownfall.Server.UnitTests
```
