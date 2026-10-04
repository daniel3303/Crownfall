using System.Globalization;
using System.Text;

namespace Crownfall.Server.Matches;

/// <summary>Cleans a display name from the query string or the lobby.</summary>
public static class PlayerNames
{
    public const int MaxLength = 16;
    public const string Fallback = "Wanderer";

    // Letters that render as blank space, so a name made of them would read as nameless.
    private static readonly HashSet<int> BlankLetters = [0x115F, 0x1160, 0x2800, 0x3164, 0xFFA0];

    public static string Sanitize(string raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
        {
            return Fallback;
        }
        var builder = new StringBuilder();
        foreach (var rune in raw.EnumerateRunes())
        {
            if (IsHidden(rune) || rune.Value == '(' || rune.Value == ')')
            {
                continue;
            }
            var text = Rune.IsWhiteSpace(rune) || BlankLetters.Contains(rune.Value) ? " " : rune.ToString();
            if (text == " " && (builder.Length == 0 || builder[^1] == ' '))
            {
                continue;
            }
            if (builder.Length + text.Length > MaxLength)
            {
                break;
            }
            builder.Append(text);
        }
        var name = builder.ToString().Trim();
        return name.Length == 0 ? Fallback : name;
    }

    /// <summary>Control, formatting (zero-width, text direction) and unassigned or private characters, which draw nothing or mislead.</summary>
    private static bool IsHidden(Rune rune)
    {
        return Rune.GetUnicodeCategory(rune) is UnicodeCategory.Control or UnicodeCategory.Format or UnicodeCategory.PrivateUse
            or UnicodeCategory.OtherNotAssigned or UnicodeCategory.Surrogate or UnicodeCategory.LineSeparator or UnicodeCategory.ParagraphSeparator;
    }
}
