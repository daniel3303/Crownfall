namespace Crownfall.Sim.Content;

/// <summary>Which hero a seat leads when nobody picks for it.</summary>
public static class HeroRoster
{
    /// <summary>
    /// A bot seat's hero, the same for the same seed, race and seat on every run; a fixed integer mix, since string
    /// hashes and shared randomness differ between processes.
    /// </summary>
    public static UnitDef BotPick(RaceDef race, int seed, int seat)
    {
        var mix = unchecked((uint)seed * 2654435761u ^ (uint)(seat + 1) * 40503u);
        mix ^= mix >> 15;
        mix = unchecked(mix * 0x2c1b3c6du);
        mix ^= mix >> 12;
        return race.HeroUnits[(int)(mix % (uint)race.HeroUnits.Count)];
    }
}
