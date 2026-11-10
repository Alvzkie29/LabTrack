namespace LabTrack.Api.Services;

/// <summary>Lab meetings happen Monday to Friday only; the university holds no Saturday classes.</summary>
public static class LabDays
{
    public static readonly DayOfWeek[] Allowed =
    {
        DayOfWeek.Monday, DayOfWeek.Tuesday, DayOfWeek.Wednesday, DayOfWeek.Thursday, DayOfWeek.Friday
    };

    /// <summary>Accepts "Monday" or "Mon" (any case). Returns false for Saturday, Sunday or anything else.</summary>
    public static bool TryParse(string? text, out DayOfWeek day)
    {
        day = default;
        var value = text?.Trim();
        if (string.IsNullOrEmpty(value)) return false;

        foreach (var allowed in Allowed)
        {
            var name = allowed.ToString();
            if (value.Equals(name, StringComparison.OrdinalIgnoreCase)
                || (value.Length == 3 && name.StartsWith(value, StringComparison.OrdinalIgnoreCase)))
            {
                day = allowed;
                return true;
            }
        }
        return false;
    }

    /// <summary>Position in the week (Monday = 0), for sorting.</summary>
    public static int Order(string dayName) => Array.FindIndex(Allowed, d => d.ToString() == dayName);
}