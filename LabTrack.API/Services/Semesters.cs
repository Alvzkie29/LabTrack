using LabTrack.Api.Data;
using LabTrack.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace LabTrack.Api.Services;

/// <summary>
/// The active semester, and which half of it a class runs in. A class is either a semestral
/// class (TermPart null: the whole semester) or a term class held in the 1st term (TermPart 1,
/// before the semester's 2nd-term start date) or the 2nd term (TermPart 2, from that date on).
/// </summary>
public static class Semesters
{
    /// <summary>The active semester's id, or null when none is active.</summary>
    public static Task<int?> ActiveIdAsync(ApplicationDbContext db) =>
        db.AcademicYears.Where(a => a.IsActive).Select(a => (int?)a.AyId).FirstOrDefaultAsync();

    /// <summary>The asked-for semester, or the active one when none was asked for.</summary>
    public static async Task<int?> OrActiveAsync(this int? ayId, ApplicationDbContext db) =>
        ayId ?? await ActiveIdAsync(db);

    /// <summary>
    /// Whether the class runs on that date as far as its term goes. Classes without a term part,
    /// and semesters without a 2nd-term start date, run the whole semester.
    /// </summary>
    public static bool RunsOn(int? termPart, DateTime? secondTermStart, DateOnly date)
    {
        if (termPart is null || secondTermStart is null) return true;
        var secondStarts = DateOnly.FromDateTime(secondTermStart.Value);
        return termPart == 1 ? date < secondStarts : date >= secondStarts;
    }

    public static bool RunsOn(this CourseSection section, DateOnly date) =>
        RunsOn(section.TermPart, section.AcademicYear?.SecondTermStart, date);

    /// <summary>"1st Term" / "2nd Term" → 1 / 2; "Sem" or blank → null (the whole semester).</summary>
    public static int? ParseTermPart(string? text)
    {
        var t = (text ?? string.Empty).Trim().ToLowerInvariant();
        if (!t.Contains("term")) return null;
        if (t.Contains('1') || t.Contains("first")) return 1;
        if (t.Contains('2') || t.Contains("second")) return 2;
        return null;
    }

    public static string TermPartName(int? termPart) => termPart switch
    {
        1 => "1st Term",
        2 => "2nd Term",
        _ => "Whole semester",
    };
}
