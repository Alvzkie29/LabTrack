using System.Globalization;
using System.Net;
using System.Net.Mail;
using System.Text;
using LabTrack.Api.Data;
using LabTrack.Api.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace LabTrack.Api.Services;

/// <summary>The "Email" section of appsettings.json.</summary>
public class EmailOptions
{
    public string Host { get; set; } = "smtp.gmail.com";
    public int Port { get; set; } = 587;
    /// <summary>The Gmail address the reminders are sent from.</summary>
    public string UserName { get; set; } = string.Empty;
    /// <summary>A Gmail app password (16 letters), not the account's normal password.</summary>
    public string AppPassword { get; set; } = string.Empty;
    public string FromName { get; set; } = "LabTrack · Laboratory Management Office";
    /// <summary>The day and hour (Philippine time) the weekly reminders go out.</summary>
    public string SendDay { get; set; } = "Monday";
    public int SendHour { get; set; } = 7;
    /// <summary>
    /// Meetings before this date (yyyy-MM-dd) are not counted as missed: the day LabTrack started
    /// tracking the labs. Leave empty to count from the start of the semester.
    /// </summary>
    public string? CountMissedFrom { get; set; }

    public bool Configured => !string.IsNullOrWhiteSpace(UserName) && !string.IsNullOrWhiteSpace(AppPassword);
}

public record MissedMeeting(DateOnly Date, decimal Hours, string Reason);

public record ClassReminder(
    int SectionId, string SectionCode, string SubjectCode, string SubjectTitle,
    string? Faculty, string? Email,
    decimal ConfirmedHours, decimal RequiredHours,
    List<MissedMeeting> Missed, decimal MissedHours, decimal MadeUpHours,
    decimal OutstandingHours, decimal SessionHours, int SuggestedMakeUps);

/// <summary>
/// Finds the classes with missed lab meetings and emails their faculty a reminder. A meeting is
/// missed when it was scheduled (in the class's own term), has passed, and has no session
/// confirmation, physical or virtual, whatever the reason marked for it. Make-up classes that were
/// held count against the missed hours. Virtual lab hours are recorded at the end of the term, so
/// the reminder says they are not in the total yet.
/// </summary>
public class ReminderService
{
    private const int UtcOffsetHours = 8; // Philippine time

    private readonly ApplicationDbContext _db;
    private readonly EmailOptions _options;
    private readonly ILogger<ReminderService> _log;

    public ReminderService(ApplicationDbContext db, IOptions<EmailOptions> options, ILogger<ReminderService> log)
    {
        _db = db;
        _options = options.Value;
        _log = log;
    }

    public EmailOptions Options => _options;

    private const string AutoSendKey = "Reminders.AutoSend";

    /// <summary>
    /// Whether the weekly emails go out by themselves. The Custodian switches this on the Email
    /// Reminders page; it starts off, so nothing is sent until the office is ready.
    /// </summary>
    public async Task<bool> AutoSendAsync(CancellationToken ct = default) =>
        await _db.AppSettings.Where(s => s.Key == AutoSendKey).Select(s => s.Value).FirstOrDefaultAsync(ct) == "on";

    public async Task SetAutoSendAsync(bool on, string? userId, CancellationToken ct = default)
    {
        var setting = await _db.AppSettings.FindAsync(new object[] { AutoSendKey }, ct);
        if (setting is null)
        {
            setting = new AppSetting { Key = AutoSendKey };
            _db.AppSettings.Add(setting);
        }
        setting.Value = on ? "on" : "off";
        setting.UpdatedBy = userId;
        setting.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);
    }

    public static DateTime LocalNow => DateTime.UtcNow.AddHours(UtcOffsetHours);

    public static DateOnly MondayOf(DateOnly d) => d.AddDays(-(((int)d.DayOfWeek + 6) % 7));

    /// <summary>The classes of the active semester that have missed meetings not yet made up.</summary>
    public async Task<List<ClassReminder>> FindAsync(CancellationToken ct = default)
    {
        var ay = await _db.AcademicYears.FirstOrDefaultAsync(a => a.IsActive, ct);
        if (ay is null) return new();

        var today = DateOnly.FromDateTime(LocalNow);
        var from = DateOnly.FromDateTime(ay.StartDate);
        if (DateOnly.TryParse(_options.CountMissedFrom, CultureInfo.InvariantCulture, out var countFrom) && countFrom > from)
            from = countFrom;
        var to = DateOnly.FromDateTime(ay.EndDate);
        if (to >= today) to = today.AddDays(-1); // today's meeting may still happen

        var sections = await _db.CourseSections
            .Include(c => c.Subject)
            .Include(c => c.Faculty)
            .Include(c => c.Schedules)
            .Include(c => c.AcademicYear)
            .Where(c => c.AyId == ay.AyId && c.Schedules.Any())
            .ToListAsync(ct);
        var ids = sections.Select(s => s.SectionId).ToList();

        var progress = await _db.ChedComplianceProgresses
            .Where(p => ids.Contains(p.SectionId))
            .ToDictionaryAsync(p => p.SectionId, ct);

        var held = (await _db.SessionConfirmations
                .Where(c => ids.Contains(c.SectionId))
                .Select(c => new { c.SectionId, c.SessionDate })
                .ToListAsync(ct))
            .Select(c => (c.SectionId, DateOnly.FromDateTime(c.SessionDate)))
            .ToHashSet();

        var marks = (await _db.SessionStatuses
                .Where(s => ids.Contains(s.SectionId))
                .ToListAsync(ct))
            .GroupBy(s => (s.SectionId, s.SessionDate))
            .ToDictionary(g => g.Key, g => g.First());

        var makeUps = await _db.MakeUpClasses.Where(m => ids.Contains(m.SectionId)).ToListAsync(ct);

        var list = new List<ClassReminder>();
        foreach (var s in sections)
        {
            var missed = new List<MissedMeeting>();
            for (var d = from; d <= to; d = d.AddDays(1))
            {
                var weekday = d.DayOfWeek.ToString();
                var meetings = s.Schedules.Where(m => m.DayOfWeek == weekday).ToList();
                if (meetings.Count == 0 || !s.RunsOn(d)) continue;
                if (held.Contains((s.SectionId, d))) continue;

                var hours = (decimal)meetings.Sum(m => (m.EndTime - m.StartTime).TotalHours);
                var reason = marks.TryGetValue((s.SectionId, d), out var mark)
                    ? (mark.Status == SessionStatuses.Others && !string.IsNullOrWhiteSpace(mark.Note) ? mark.Note! : mark.Status)
                    : "not marked";
                missed.Add(new MissedMeeting(d, hours, reason));
            }
            if (missed.Count == 0) continue;

            var madeUp = makeUps
                .Where(m => m.SectionId == s.SectionId && held.Contains((s.SectionId, m.Date)))
                .Sum(m => m.Hours);
            var missedHours = missed.Sum(m => m.Hours);
            var outstanding = missedHours - madeUp;
            if (outstanding <= 0) continue;

            var first = s.Schedules.OrderBy(m => m.StartTime).First(); // the class's usual session length
            var sessionHours = (decimal)(first.EndTime - first.StartTime).TotalHours;
            var suggested = sessionHours > 0 ? (int)Math.Ceiling(outstanding / sessionHours) : 1;

            list.Add(new ClassReminder(
                s.SectionId, s.SectionCode, s.Subject.Code, s.Subject.Title,
                s.Faculty?.FullName, string.IsNullOrWhiteSpace(s.Faculty?.Email) ? null : s.Faculty!.Email,
                progress.TryGetValue(s.SectionId, out var prog) ? prog.ConfirmedHoursTotal : 0,
                prog?.RequiredHours ?? s.Subject.RequiredHours,
                missed, missedHours, madeUp, outstanding, sessionHours, suggested));
        }
        return list.OrderBy(r => r.SectionCode).ToList();
    }

    /// <summary>
    /// Emails every class's faculty that has not had this week's reminder yet. Classes without a
    /// faculty email are skipped. A failed send is logged and tried again on the next run.
    /// </summary>
    public async Task<(int Sent, int Failed, int NoEmail, int AlreadySent)> SendWeeklyAsync(CancellationToken ct = default)
    {
        if (!_options.Configured) throw new InvalidOperationException("The sending Gmail account is not set up in appsettings.json.");

        var week = MondayOf(DateOnly.FromDateTime(LocalNow));
        var reminders = await FindAsync(ct);
        var done = (await _db.ReminderLogs.Where(l => l.WeekStart == week && l.Error == null).Select(l => l.SectionId).ToListAsync(ct)).ToHashSet();

        int sent = 0, failed = 0, noEmail = 0, already = 0;
        foreach (var r in reminders)
        {
            if (done.Contains(r.SectionId)) { already++; continue; }
            if (r.Email is null) { noEmail++; continue; }

            string? error = null;
            try
            {
                await SendAsync(r.Email, Subject(r), Html(r), Text(r), ct);
                sent++;
            }
            catch (Exception ex)
            {
                error = ex.Message.Length > 500 ? ex.Message[..500] : ex.Message;
                failed++;
                _log.LogWarning(ex, "Reminder for class {Section} to {Email} failed", r.SectionCode, r.Email);
            }

            var entry = await _db.ReminderLogs.FirstOrDefaultAsync(l => l.WeekStart == week && l.SectionId == r.SectionId, ct);
            if (entry is null)
            {
                entry = new ReminderLog { WeekStart = week, SectionId = r.SectionId };
                _db.ReminderLogs.Add(entry);
            }
            entry.ToEmail = r.Email;
            entry.OutstandingHours = r.OutstandingHours;
            entry.SentAt = DateTime.UtcNow;
            entry.Error = error;
            await _db.SaveChangesAsync(ct);
        }
        return (sent, failed, noEmail, already);
    }

    /// <summary>A sample reminder sent to one address, to check the Gmail account works.</summary>
    public Task SendTestAsync(string to, CancellationToken ct = default)
    {
        var sample = new ClassReminder(0, "0000", "IT 000/L", "Sample Subject", "Sample Faculty", to, 12, 27,
            new List<MissedMeeting>
            {
                new(DateOnly.FromDateTime(LocalNow).AddDays(-8), 2, SessionStatuses.NoTeacher),
                new(DateOnly.FromDateTime(LocalNow).AddDays(-6), 2, "not marked"),
            }, 4, 0, 4, 2, 2);
        return SendAsync(to, "[Test] " + Subject(sample), Html(sample), Text(sample), ct);
    }

    private async Task SendAsync(string to, string subject, string html, string text, CancellationToken ct)
    {
        using var message = new MailMessage
        {
            From = new MailAddress(_options.UserName, _options.FromName),
            Subject = subject,
            Body = text,
            BodyEncoding = Encoding.UTF8,
            SubjectEncoding = Encoding.UTF8,
        };
        message.To.Add(new MailAddress(to));
        message.AlternateViews.Add(AlternateView.CreateAlternateViewFromString(html, Encoding.UTF8, "text/html"));

        using var client = new SmtpClient(_options.Host, _options.Port)
        {
            EnableSsl = true, // Gmail: STARTTLS on port 587
            Credentials = new NetworkCredential(_options.UserName, _options.AppPassword),
        };
        await client.SendMailAsync(message, ct);
    }

    // ------------------------------------------------------------------ the email

    private static string H(decimal hours) => hours.ToString("0.##", CultureInfo.InvariantCulture);
    private static string Day(DateOnly d) => d.ToString("MMM d", CultureInfo.InvariantCulture);
    private static string Plural(int n, string word) => n == 1 ? $"{n} {word}" : $"{n} {word}es";

    private static string Subject(ClassReminder r) =>
        $"LabTrack reminder: missed lab meetings for {r.SectionCode} {r.SubjectCode}";

    private static string Text(ClassReminder r)
    {
        var b = new StringBuilder();
        b.AppendLine($"Good day{(r.Faculty is null ? "" : $", {r.Faculty}")}.");
        b.AppendLine();
        b.AppendLine($"Class {r.SectionCode} · {r.SubjectCode} {r.SubjectTitle}");
        b.AppendLine($"Confirmed lab hours so far: {H(r.ConfirmedHours)} of {H(r.RequiredHours)}.");
        b.AppendLine($"Missed lab meetings: {string.Join(", ", r.Missed.Select(m => $"{Day(m.Date)} ({m.Reason})"))}, {H(r.MissedHours)} hours.");
        if (r.MadeUpHours > 0) b.AppendLine($"Make-up classes held: {H(r.MadeUpHours)} hours. Still to make up: {H(r.OutstandingHours)} hours.");
        b.AppendLine($"Suggested: {Plural(r.SuggestedMakeUps, "make-up class")} of {H(r.SessionHours)} hours each. Please ask the Laboratory Custodian to schedule them.");
        b.AppendLine();
        b.AppendLine("Your virtual lab hours will be added when they are recorded at the end of the term, so the total above does not include them yet.");
        b.AppendLine();
        b.AppendLine("This is an automated reminder from LabTrack, Laboratory Management Office.");
        return b.ToString();
    }

    private static string Html(ClassReminder r)
    {
        static string E(string s) => WebUtility.HtmlEncode(s);
        var rows = string.Join("", r.Missed.Select(m =>
            $"<tr><td style=\"padding:4px 12px 4px 0\">{E(m.Date.ToString("ddd, MMM d", CultureInfo.InvariantCulture))}</td>" +
            $"<td style=\"padding:4px 12px 4px 0\">{E(m.Reason)}</td><td style=\"padding:4px 0\">{H(m.Hours)} h</td></tr>"));
        return $"""
            <div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;color:#1f2328;max-width:560px">
              <div style="border-top:4px solid #800000;padding-top:12px">
                <p>Good day{(r.Faculty is null ? "" : $", {E(r.Faculty)}")}.</p>
                <p style="margin:0 0 4px"><b style="color:#800000">Class {E(r.SectionCode)}</b> · {E(r.SubjectCode)} {E(r.SubjectTitle)}</p>
                <p style="margin:0 0 12px">Confirmed lab hours so far: <b>{H(r.ConfirmedHours)} of {H(r.RequiredHours)}</b>.</p>
                <p style="margin:0 0 4px">Missed lab meetings ({H(r.MissedHours)} hours):</p>
                <table style="border-collapse:collapse;font-size:13px;margin-bottom:12px">{rows}</table>
                {(r.MadeUpHours > 0 ? $"<p style=\"margin:0 0 12px\">Make-up classes held: {H(r.MadeUpHours)} hours. Still to make up: <b>{H(r.OutstandingHours)} hours</b>.</p>" : "")}
                <p style="margin:0 0 12px;padding:10px 12px;background:#fff4f4;border-left:3px solid #800000">
                  <b>Suggested:</b> {Plural(r.SuggestedMakeUps, "make-up class")} of {H(r.SessionHours)} hours each.
                  Please ask the Laboratory Custodian to schedule them.
                </p>
                <p style="margin:0 0 12px;color:#57606a">Your virtual lab hours will be added when they are recorded at the end of the term,
                  so the total above does not include them yet.</p>
                <p style="margin:0;font-size:12px;color:#57606a">This is an automated reminder from LabTrack, Laboratory Management Office.</p>
              </div>
            </div>
            """;
    }
}
