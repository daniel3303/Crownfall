namespace Crownfall.Server.Protocol;

/// <summary>
/// Bit flags in each snapshot record. Bits 2-3 hold the carried resource type. A building's state byte is its level
/// and, while <see cref="Upgrading"/>, its extra byte is the upgrade's percent done instead of construction progress.
/// </summary>
[Flags]
public enum SnapshotFlags : byte
{
    None = 0,
    UnderConstruction = 1,
    Carrying = 2,
    Buffed = 16,
    Training = 32,
    Hero = 64,
    Upgrading = 128,
}
