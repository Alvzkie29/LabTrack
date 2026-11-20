using System.Globalization;
using System.Security.Claims;
using LabTrack.Api.Data;
using LabTrack.Api.Models;
using LabTrack.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace LabTrack.Api.Controllers;

public class AutoSendDto
{
    public bool On { get; set; }
}

/// <summary>The weekly missed-meetings email reminders to faculty: preview, send now, test, history.</summary>
[ApiController]
[Route("api/[controller]")]
[Authorize(Roles = "Custodian,Administrator")]
public class RemindersController : ControllerBase
{
    private readonly ApplicationDbContext _db;
    private readonly ReminderService _reminders;

    public RemindersController(ApplicationDbContext db, ReminderService reminders)
    {
        _db = db;
        _reminders = reminders;
    }

    /// <summary>The setup, and the classes that would get a reminder this week.</summary>
    [HttpGet]
    public async Task<IActionResult> Preview()
    {
        var o = _reminders.Options;
        var week = ReminderService.MondayOf(DateOnly.FromDateTime(ReminderService.LocalNow));
        var logs = await _db.ReminderLogs.Where(l => l.WeekStart == week).ToListAsync();
        var classes = await _reminders.FindAsync();

        return Ok(new
        {
            Setup = new
            {
                AutoSend = await _reminders.AutoSendAsync(),
                o.Configured,
                From = o.UserName,
                o.SendDay,
                o.SendHour,
                o.CountMissedFrom,
            },
            WeekStart = week,
            Classes = classes.Select(c =>
            {
                var log = logs.FirstOrDefault(l => l.SectionId == c.SectionId);
                return new
                {
                    c.SectionId, c.SectionCode, c.SubjectCode, c.SubjectTitle, c.Faculty, c.Email,
                    c.ConfirmedHours, c.RequiredHours, c.Missed, c.MissedHours, c.MadeUpHours,
                    c.OutstandingHours, c.SessionHours, c.SuggestedMakeUps,
                    SentAt = log?.Error == null ? log?.SentAt : null,
                    Error = log?.Error,
                };
            }),
        });
    }

    /// <summary>Turns the automatic weekly emails on or off. Send now and the test still work when off.</summary>
    [HttpPut("auto-send")]
    public async Task<IActionResult> SetAutoSend([FromBody] AutoSendDto dto)
    {
        var userId = User.FindFirst("sub")?.Value ?? User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        await _reminders.SetAutoSendAsync(dto.On, userId);
        await AuditAsync(dto.On ? "RemindersAutoSendOn" : "RemindersAutoSendOff",
            dto.On ? "Automatic weekly reminder emails turned on" : "Automatic weekly reminder emails turned off");
        return NoContent();
    }

    /// <summary>Sends this week's reminders now, to the classes that have not had one yet.</summary>
    [HttpPost("send")]
    public async Task<IActionResult> Send()
    {
        try
        {
            var r = await _reminders.SendWeeklyAsync();
            await AuditAsync("RemindersSent", $"Sent={r.Sent}, Failed={r.Failed}, NoEmail={r.NoEmail}, AlreadySent={r.AlreadySent}");
            return Ok(new { r.Sent, r.Failed, r.NoEmail, r.AlreadySent });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    /// <summary>Sends a sample reminder to the signed-in user's own email, to check the Gmail account.</summary>
    [HttpPost("test")]
    public async Task<IActionResult> Test()
    {
        if (!_reminders.Options.Configured)
            return BadRequest(new { message = "The sending Gmail account is not set up in appsettings.json." });
        var userId = User.FindFirst("sub")?.Value ?? User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        var email = await _db.Users.Where(u => u.Id == userId).Select(u => u.Email).FirstOrDefaultAsync();
        if (string.IsNullOrWhiteSpace(email)) return BadRequest(new { message = "Your account has no email address." });
        try
        {
            await _reminders.SendTestAsync(email);
            return Ok(new { message = $"A sample reminder was sent to {email}." });
        }
        catch (Exception ex)
        {
            // The real reason is usually in the inner exception (e.g. "connection was closed", "5.7.0 Authentication Required").
            var reason = ex.InnerException?.Message ?? ex.Message;
            return BadRequest(new { message = $"Sending failed: {ex.Message} {reason}" });
        }
    }

    private async Task AuditAsync(string action, string details)
    {
        _db.AuditLogs.Add(new AuditLog
        {
            UserId = User.FindFirst("sub")?.Value ?? User.FindFirst(ClaimTypes.NameIdentifier)?.Value,
            Action = action,
            EntityType = nameof(ReminderLog),
            EntityId = ReminderService.MondayOf(DateOnly.FromDateTime(ReminderService.LocalNow)).ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            Details = details,
            IpAddress = this.CallerIp(),
        });
        await _db.SaveChangesAsync();
    }
}
