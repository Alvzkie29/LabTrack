using System.Security.Cryptography;
using System.Text;
using LabTrack.Api.Data;
using LabTrack.Api.Models;
using LabTrack.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace LabTrack.Api.Controllers;

public class OfflineAttendanceDto
{
    public Guid OfflineId { get; set; }
    public string StudentId { get; set; } = string.Empty;
    public string PcIdentifier { get; set; } = string.Empty;
    public int SectionId { get; set; }
    public DateTime LoginTimeUtc { get; set; }
}

/// <summary>
/// Used only by the Lab Sync Service on each laboratory's Master PC. It is not a user, so it
/// authenticates with a shared key (the X-Sync-Key header) instead of a login.
/// </summary>
[ApiController]
[Route("api/[controller]")]
[AllowAnonymous]
public class SyncController : ControllerBase
{
    private const int UtcOffsetHours = 8; // Philippine time
    private readonly ApplicationDbContext _db;
    private readonly IConfiguration _config;

    public SyncController(ApplicationDbContext db, IConfiguration config)
    {
        _db = db;
        _config = config;
    }

    private bool KeyIsValid()
    {
        var expected = _config["Sync:ApiKey"];
        var given = Request.Headers["X-Sync-Key"].ToString();
        if (string.IsNullOrEmpty(expected) || string.IsNullOrEmpty(given)) return false;

        return CryptographicOperations.FixedTimeEquals(
            Encoding.UTF8.GetBytes(expected), Encoding.UTF8.GetBytes(given));
    }

    /// <summary>
    /// What a Master PC needs to verify logins on its own: the active student accounts with
    /// their password hashes, and the classes that meet in this laboratory.
    /// </summary>
    [HttpGet("snapshot")]
    public async Task<IActionResult> GetSnapshot([FromQuery] int labId)
    {
        if (!KeyIsValid()) return Unauthorized();
        if (!await _db.Laboratories.AnyAsync(l => l.LabId == labId)) return NotFound("Laboratory not found.");

        var studentIds =
            from userRole in _db.UserRoles
            join identityRole in _db.Roles on userRole.RoleId equals identityRole.Id
            where identityRole.Name == "Student"
            select userRole.UserId;

        var students = await _db.Users
            .Where(u => u.IsActive && studentIds.Contains(u.Id))
            .Select(u => new
            {
                u.Id,
                u.SchoolId,
                FullName = u.FirstName + " " + u.LastName,
                u.PasswordHash
            })
            .ToListAsync();

        // The classes meeting in this lab in the current term, and today's make-up classes here
        // (added as a meeting on today's weekday; the snapshot expires within a day).
        var today = DateOnly.FromDateTime(DateTime.UtcNow.AddHours(UtcOffsetHours));
        var classes = await _db.CourseSections
            .Include(c => c.Subject)
            .Include(c => c.AcademicYear)
            .Include(c => c.Schedules)
            .Where(c => c.AcademicYear.IsActive && c.Schedules.Any(m => m.LabId == labId))
            .ToListAsync();
        var makeUps = await _db.MakeUpClasses
            .Include(m => m.CourseSection).ThenInclude(c => c.Subject)
            .Where(m => m.LabId == labId && m.Date == today && m.CourseSection.AcademicYear.IsActive)
            .ToListAsync();

        var sections = classes
            .Where(c => c.RunsOn(today))
            .Select(c => new
            {
                c.SectionId,
                c.SectionCode,
                SubjectCode = c.Subject.Code,
                SubjectTitle = c.Subject.Title,
                Meetings = c.Schedules
                    .Where(m => m.LabId == labId)
                    .Select(m => new { m.DayOfWeek, m.StartTime, m.EndTime })
                    .Concat(makeUps.Where(m => m.SectionId == c.SectionId)
                        .Select(m => new { DayOfWeek = today.DayOfWeek.ToString(), m.StartTime, m.EndTime }))
                    .ToList()
            })
            .Concat(makeUps
                .Where(m => !classes.Any(c => c.SectionId == m.SectionId && c.RunsOn(today)))
                .GroupBy(m => m.SectionId)
                .Select(g => new
                {
                    SectionId = g.Key,
                    g.First().CourseSection.SectionCode,
                    SubjectCode = g.First().CourseSection.Subject.Code,
                    SubjectTitle = g.First().CourseSection.Subject.Title,
                    Meetings = g.Select(m => new { DayOfWeek = today.DayOfWeek.ToString(), m.StartTime, m.EndTime }).ToList()
                }))
            .ToList();

        var workstations = await _db.Workstations
            .Where(w => w.LabId == labId && w.IsActive)
            .Select(w => w.PcIdentifier)
            .ToListAsync();

        return Ok(new
        {
            LabId = labId,
            GeneratedAtUtc = DateTime.UtcNow,
            Students = students,
            Sections = sections,
            Workstations = workstations
        });
    }

    /// <summary>
    /// Receives attendance captured while the server was unreachable. Safe to send twice:
    /// a record whose OfflineId was already stored is reported as a duplicate and skipped.
    /// </summary>
    [HttpPost("attendance")]
    public async Task<IActionResult> PostAttendance(List<OfflineAttendanceDto> records)
    {
        if (!KeyIsValid()) return Unauthorized();

        var results = new List<object>();

        foreach (var r in records)
        {
            if (await _db.AttendanceSessions.AnyAsync(a => a.OfflineId == r.OfflineId))
            {
                results.Add(new { r.OfflineId, Status = "duplicate" });
                continue;
            }

            var workstation = await _db.Workstations.FirstOrDefaultAsync(w => w.PcIdentifier == r.PcIdentifier);
            var studentExists = await _db.Users.AnyAsync(u => u.Id == r.StudentId);
            var sectionExists = await _db.CourseSections.AnyAsync(c => c.SectionId == r.SectionId);
            if (workstation is null || !studentExists || !sectionExists)
            {
                results.Add(new { r.OfflineId, Status = "rejected" });
                continue;
            }

            // One attendance record per student per class per day, same rule as the online flow.
            var loginUtc = DateTime.SpecifyKind(r.LoginTimeUtc, DateTimeKind.Utc);
            var dayStartUtc = loginUtc.AddHours(UtcOffsetHours).Date.AddHours(-UtcOffsetHours);
            var alreadyRecorded = await _db.AttendanceSessions.AnyAsync(a =>
                a.StudentId == r.StudentId
                && a.SectionId == r.SectionId
                && a.LoginTime >= dayStartUtc
                && a.LoginTime < dayStartUtc.AddDays(1));
            if (alreadyRecorded)
            {
                results.Add(new { r.OfflineId, Status = "alreadyRecorded" });
                continue;
            }

            _db.AttendanceSessions.Add(new AttendanceSession
            {
                StudentId = r.StudentId,
                WorkstationId = workstation.WorkstationId,
                SectionId = r.SectionId,
                LoginTime = loginUtc,
                OfflineId = r.OfflineId,
                Notes = "Recorded offline through the Master PC"
            });
            await _db.SaveChangesAsync(); // saved one by one so a later duplicate in the same batch is seen

            results.Add(new { r.OfflineId, Status = "accepted" });
        }

        return Ok(results);
    }
}