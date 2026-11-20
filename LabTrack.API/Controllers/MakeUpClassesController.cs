using System.Globalization;
using System.Security.Claims;
using LabTrack.Api.Data;
using LabTrack.Api.Models;
using LabTrack.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace LabTrack.Api.Controllers;

public class CreateMakeUpClassForm
{
    public int SectionId { get; set; }
    public int LabId { get; set; }
    public DateOnly Date { get; set; }
    public TimeOnly StartTime { get; set; }
    public TimeOnly EndTime { get; set; }
    public string? Reason { get; set; }
    /// <summary>The approved request: a PDF or a photo (JPG or PNG), at most 5 MB.</summary>
    public IFormFile? Attachment { get; set; }
}

/// <summary>
/// Approved make-up classes. The Custodian or a Lab Assistant records the date, time, class and
/// laboratory from the approved request, and attaches the request itself as proof. From then on
/// the make-up behaves like a lab meeting on that date: the PC Agent offers the class, the
/// faculty confirms it, and its hours count once finally confirmed.
/// </summary>
[ApiController]
[Route("api/[controller]")]
[Authorize(Roles = "LabAssistant,Custodian,Administrator")]
public class MakeUpClassesController : ControllerBase
{
    private const long MaxBytes = 5 * 1024 * 1024;

    private static readonly Dictionary<string, string> AllowedTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        [".pdf"] = "application/pdf",
        [".jpg"] = "image/jpeg",
        [".jpeg"] = "image/jpeg",
        [".png"] = "image/png",
    };

    private readonly ApplicationDbContext _db;
    private readonly string _folder;

    public MakeUpClassesController(ApplicationDbContext db, IWebHostEnvironment env)
    {
        _db = db;
        _folder = Path.Combine(env.ContentRootPath, "App_Data", "makeup");
    }

    /// <summary>The make-up classes of a semester (the active one by default), newest first.</summary>
    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] int? ayId)
    {
        var semester = await ayId.OrActiveAsync(_db);
        var list = await _db.MakeUpClasses
            .Where(m => m.CourseSection.AyId == semester)
            .OrderByDescending(m => m.Date).ThenBy(m => m.StartTime)
            .Select(m => new
            {
                m.MakeUpId,
                m.SectionId,
                m.CourseSection.SectionCode,
                SubjectCode = m.CourseSection.Subject.Code,
                SubjectTitle = m.CourseSection.Subject.Title,
                Faculty = m.CourseSection.Faculty != null ? m.CourseSection.Faculty.FullName : null,
                m.LabId,
                Laboratory = m.Laboratory.Name,
                m.Laboratory.RoomCode,
                m.Date,
                m.StartTime,
                m.EndTime,
                m.Reason,
                m.AttachmentName,
                CreatedBy = m.CreatedByUser.FullName,
                m.CreatedAt,
            })
            .ToListAsync();

        // Whether each make-up already has a session confirmation, which locks it.
        var keys = list.Select(m => m.SectionId).Distinct().ToList();
        var confirmed = (await _db.SessionConfirmations
                .Where(c => keys.Contains(c.SectionId) && c.SessionType == SessionType.Physical)
                .Select(c => new { c.SectionId, c.SessionDate, c.FinalConfirmedAt })
                .ToListAsync())
            .GroupBy(c => (c.SectionId, DateOnly.FromDateTime(c.SessionDate)))
            .ToDictionary(g => g.Key, g => g.Any(c => c.FinalConfirmedAt != null));

        return Ok(list.Select(m => new
        {
            m.MakeUpId, m.SectionId, m.SectionCode, m.SubjectCode, m.SubjectTitle, m.Faculty,
            m.LabId, m.Laboratory, m.RoomCode, m.Date, m.StartTime, m.EndTime, m.Reason,
            m.AttachmentName, m.CreatedBy, m.CreatedAt,
            Hours = (decimal)(m.EndTime - m.StartTime).TotalHours,
            Session = confirmed.TryGetValue((m.SectionId, m.Date), out var final)
                ? (final ? "Confirmed" : "Awaiting final confirmation")
                : null,
        }));
    }

    [HttpPost]
    [RequestSizeLimit(MaxBytes + 256 * 1024)]
    public async Task<IActionResult> Create([FromForm] CreateMakeUpClassForm form)
    {
        var section = await _db.CourseSections
            .Include(c => c.AcademicYear)
            .Include(c => c.Subject)
            .FirstOrDefaultAsync(c => c.SectionId == form.SectionId);
        if (section is null) return BadRequest(new { message = "Choose a class." });

        var lab = await _db.Laboratories.FindAsync(form.LabId);
        if (lab is null) return BadRequest(new { message = "Choose a laboratory." });

        if (form.Date.DayOfWeek == DayOfWeek.Sunday)
            return BadRequest(new { message = "Make-up classes can be held Monday to Saturday." });
        var ay = section.AcademicYear;
        if (form.Date < DateOnly.FromDateTime(ay.StartDate) || form.Date > DateOnly.FromDateTime(ay.EndDate))
            return BadRequest(new { message = $"The date must be within the semester ({ay.StartDate:MMM d} to {ay.EndDate:MMM d, yyyy})." });
        if (form.EndTime <= form.StartTime)
            return BadRequest(new { message = "The end time must be later than the start time." });

        // One session per class per day: a make-up can't share a day with the class's regular meeting,
        // or one confirmation would credit both.
        var regularDay = form.Date.DayOfWeek.ToString();
        if (section.RunsOn(form.Date)
            && await _db.SectionSchedules.AnyAsync(m => m.SectionId == section.SectionId && m.DayOfWeek == regularDay))
            return Conflict(new { message = $"Class {section.SectionCode} already meets on {regularDay}s. Choose another day for the make-up class." });

        if (await _db.MakeUpClasses.AnyAsync(m => m.SectionId == form.SectionId && m.Date == form.Date))
            return Conflict(new { message = "This class already has a make-up class on that date." });

        // The laboratory must be free: no regular class running in it then, and no other make-up.
        var weekday = form.Date.DayOfWeek.ToString();
        var regular = await _db.SectionSchedules
            .Include(m => m.CourseSection).ThenInclude(c => c.AcademicYear)
            .Where(m => m.LabId == form.LabId && m.DayOfWeek == weekday && m.CourseSection.AyId == section.AyId
                        && m.StartTime < form.EndTime && form.StartTime < m.EndTime)
            .ToListAsync();
        var clash = regular.FirstOrDefault(m => m.CourseSection.RunsOn(form.Date));
        if (clash is not null)
            return Conflict(new { message = $"{lab.RoomCode} has class {clash.CourseSection.SectionCode} from {clash.StartTime:h:mm tt} to {clash.EndTime:h:mm tt} that day." });

        var other = await _db.MakeUpClasses
            .Where(m => m.LabId == form.LabId && m.Date == form.Date && m.StartTime < form.EndTime && form.StartTime < m.EndTime)
            .Select(m => new { m.CourseSection.SectionCode, m.StartTime, m.EndTime })
            .FirstOrDefaultAsync();
        if (other is not null)
            return Conflict(new { message = $"{lab.RoomCode} already has a make-up for class {other.SectionCode} from {other.StartTime:h:mm tt} to {other.EndTime:h:mm tt} that day." });

        // The approved request.
        var file = form.Attachment;
        if (file is null || file.Length == 0) return BadRequest(new { message = "Attach the approved request (PDF, JPG or PNG)." });
        if (file.Length > MaxBytes) return BadRequest(new { message = "The attachment is larger than 5 MB." });
        var ext = Path.GetExtension(file.FileName);
        if (!AllowedTypes.TryGetValue(ext, out var contentType))
            return BadRequest(new { message = "The attachment must be a PDF, JPG or PNG file." });
        if (!await LooksLikeAsync(file, ext))
            return BadRequest(new { message = "The attachment's contents don't match its file type." });

        Directory.CreateDirectory(_folder);
        var stored = $"{Guid.NewGuid():N}{ext.ToLowerInvariant()}";
        await using (var output = System.IO.File.Create(Path.Combine(_folder, stored)))
        await using (var input = file.OpenReadStream())
            await input.CopyToAsync(output);

        var userId = UserId();
        var makeUp = new MakeUpClass
        {
            SectionId = section.SectionId,
            LabId = lab.LabId,
            Date = form.Date,
            StartTime = form.StartTime,
            EndTime = form.EndTime,
            Reason = string.IsNullOrWhiteSpace(form.Reason) ? null : form.Reason.Trim()[..Math.Min(300, form.Reason.Trim().Length)],
            AttachmentName = Path.GetFileName(file.FileName)[..Math.Min(200, Path.GetFileName(file.FileName).Length)],
            AttachmentStoredName = stored,
            AttachmentContentType = contentType,
            CreatedBy = userId!,
        };
        _db.MakeUpClasses.Add(makeUp);
        try
        {
            await _db.SaveChangesAsync();
        }
        catch
        {
            System.IO.File.Delete(Path.Combine(_folder, stored));
            throw;
        }

        await AuditAsync("MakeUpClassCreated", makeUp,
            $"SectionId={section.SectionId} ({section.SectionCode}), Lab={lab.RoomCode}, Date={form.Date:yyyy-MM-dd}, {form.StartTime:HH:mm}-{form.EndTime:HH:mm}");
        return Ok(new { makeUp.MakeUpId });
    }

    /// <summary>The approved request that was attached.</summary>
    [HttpGet("{id:int}/attachment")]
    public async Task<IActionResult> Attachment(int id)
    {
        var m = await _db.MakeUpClasses.FindAsync(id);
        if (m is null) return NotFound();
        var path = Path.Combine(_folder, m.AttachmentStoredName);
        if (!System.IO.File.Exists(path)) return NotFound(new { message = "The attachment file is missing." });
        return PhysicalFile(path, m.AttachmentContentType, m.AttachmentName);
    }

    /// <summary>Removes a make-up class that was entered by mistake. Not allowed once its session was confirmed.</summary>
    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        var m = await _db.MakeUpClasses.Include(x => x.CourseSection).FirstOrDefaultAsync(x => x.MakeUpId == id);
        if (m is null) return NotFound();

        var date = m.Date.ToDateTime(TimeOnly.MinValue);
        if (await _db.SessionConfirmations.AnyAsync(c => c.SectionId == m.SectionId && c.SessionDate == date && c.SessionType == SessionType.Physical))
            return Conflict(new { message = "This make-up class already has a session confirmation, so it can't be removed." });

        _db.MakeUpClasses.Remove(m);
        await _db.SaveChangesAsync();
        var path = Path.Combine(_folder, m.AttachmentStoredName);
        if (System.IO.File.Exists(path)) System.IO.File.Delete(path);

        await AuditAsync("MakeUpClassDeleted", m,
            $"SectionId={m.SectionId} ({m.CourseSection.SectionCode}), Date={m.Date:yyyy-MM-dd}, {m.StartTime:HH:mm}-{m.EndTime:HH:mm}");
        return NoContent();
    }

    /// <summary>Checks the first bytes, so a renamed file of another kind is refused.</summary>
    private static async Task<bool> LooksLikeAsync(IFormFile file, string ext)
    {
        var head = new byte[8];
        await using var s = file.OpenReadStream();
        var n = await s.ReadAsync(head);
        if (n < 4) return false;
        return ext.ToLowerInvariant() switch
        {
            ".pdf" => head[0] == '%' && head[1] == 'P' && head[2] == 'D' && head[3] == 'F',
            ".png" => head[0] == 0x89 && head[1] == 'P' && head[2] == 'N' && head[3] == 'G',
            _ => head[0] == 0xFF && head[1] == 0xD8, // JPEG
        };
    }

    private string? UserId() => User.FindFirst("sub")?.Value ?? User.FindFirst(ClaimTypes.NameIdentifier)?.Value;

    private async Task AuditAsync(string action, MakeUpClass m, string details)
    {
        _db.AuditLogs.Add(new AuditLog
        {
            UserId = UserId(),
            Action = action,
            EntityType = nameof(MakeUpClass),
            EntityId = m.MakeUpId.ToString(CultureInfo.InvariantCulture),
            Details = details,
            IpAddress = this.CallerIp(),
        });
        await _db.SaveChangesAsync();
    }
}
