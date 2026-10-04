using Crownfall.Server.Matches;

namespace Crownfall.Server.UnitTests.Matches;

public class PlayerNamesTests
{
    [Theory]
    [InlineData("\u200B\u200B")]
    [InlineData("\u3164")]
    [InlineData("\u2800 \u2800")]
    [InlineData("\u202E\u2066")]
    [InlineData("  \t ")]
    public void Sanitize_NameThatDrawsNothing_FallsBackToTheDefault(string raw)
    {
        PlayerNames.Sanitize(raw).Should().Be(PlayerNames.Fallback);
    }

    [Fact]
    public void Sanitize_DirectionAndZeroWidthMarks_AreDropped()
    {
        PlayerNames.Sanitize("\u202Eevil\u200Bname").Should().Be("evilname");
    }

    [Fact]
    public void Sanitize_SpacesOfAnyKind_CollapseToOne()
    {
        PlayerNames.Sanitize("\u3000 Sir\u00A0\u00A0 Bot  ").Should().Be("Sir Bot");
    }

    [Fact]
    public void Sanitize_LongName_IsCutWithoutSplittingACharacter()
    {
        var name = PlayerNames.Sanitize(new string('a', 15) + "\U0001F600");

        name.Should().Be(new string('a', 15));
        PlayerNames.Sanitize(new string('b', 40)).Should().HaveLength(PlayerNames.MaxLength);
    }
}
