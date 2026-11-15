using LabTrack.Api.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Text.RegularExpressions;
using System.Text.RegularExpressions;
namespace LabTrack.Api.Controllers;

/// <summary>
/// Read-only. RemedialRecommendation rows are generated automatically by
/// SessionConfirmationsController.Confirm whenever a section remains AtRisk/NonCompliant
/// after a confirmation — never created manually.
/// </summary>
[ApiController]
[Route("api/[controller]")]
[Authorize(Roles = "LabAssistant,Custodian,Administrator")]
public class RemedialRecommendationsController : ControllerBase
{
    private readonly ApplicationDbContext _db;
    public RemedialRecommendationsController(ApplicationDbContext db) => _db = db;

    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var recs = await _db.RemedialRecommendations
            .Include(r => r.CourseSection).ThenInclude(c => c.Subject)
            .OrderByDescending(r => r.GeneratedAt)
            .Select(r => new
            {
                r.RecommendationId,
                Section = r.CourseSection.SectionCode,
                Subject = r.CourseSection.Subject.Title,
                r.HourDeficit,
                r.AdditionalSessionsNeeded,
                r.GeneratedAt
            })
            .ToListAsync();

        return Ok(recs);
    }

    [HttpGet("by-section/{sectionId:int}")]
    public async Task<IActionResult> GetBySection(int sectionId)
    {
        var recs = await _db.RemedialRecommendations
            .Where(r => r.SectionId == sectionId)
            .OrderByDescending(r => r.GeneratedAt)
            .ToListAsync();

        return Ok(recs);
    }
}

/// <summary>
/// Read-only. AuditLog rows are written by the controllers whenever a compliance-relevant
/// action occurs; they are never created or edited through a REST endpoint.
/// Open to the Administrator and the Custodian, who are accountable for the confirmations.
/// </summary>
/// <summary>
/// Read-only. AuditLog rows are written by the controllers whenever a compliance-relevant
/// action occurs; they are never created or edited through a REST endpoint.
/// Open to the Administrator and the Custodian, who are accountable for the confirmations.
/// </summary>
[ApiController]
[Route("api/[controller]")]
[Authorize(Roles = "Custodian,Administrator")]
public class AuditLogController : ControllerBase
{
    // Philippine time is UTC+8; timestamps are stored in UTC.
    private const int UtcOffsetHours = 8;

    private readonly ApplicationDbContext _db;
    public AuditLogController(ApplicationDbContext db) => _db = db;

    /// <summary>One person as an audit entry identifies them: name, role and school ID.</summary>
    private record Actor(string Name, string Role, string SchoolId)
    {
        public string WithRole => Role.Length > 0 ? $"{Name} ({Role})" : Name;
    }

    /// <summary>The role names as they are written in the paper and shown to staff.</summary>
    private static string RoleLabel(string role) => role switch
    {
        "LabAssistant" => "Laboratory Assistant",
        "Custodian" => "Laboratory Custodian",
        _ => role
    };

    /// <summary>
    /// Newest first, one page at a time. "role" is a stored role name such as "LabAssistant".
    /// Student logins are left out unless includeStudentLogins is true.
    /// "from" and "to" are local (Philippine) dates, both inclusive.
    /// Timestamps are returned in Philippine time. User ids and section ids inside Details are
    /// replaced with the person's name, role and the class code so the entry can be read as is.
    /// </summary>
    [HttpGet]
    public async Task<IActionResult> GetAll(
        [FromQuery] string? entityType,
        [FromQuery] string? action,
        [FromQuery] string? role,
        [FromQuery] bool includeStudentLogins = false,
        [FromQuery] DateOnly? from = null,
        [FromQuery] DateOnly? to = null,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 50)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 200);

        var query = _db.AuditLogs.AsQueryable();

        if (!string.IsNullOrWhiteSpace(entityType)) query = query.Where(a => a.EntityType == entityType);
        if (!string.IsNullOrWhiteSpace(action)) query = query.Where(a => a.Action == action);
        if (!string.IsNullOrWhiteSpace(role))
        {
            // Everything done by the people who hold this role, e.g. every Laboratory Assistant.
            var idsInRole =
                from userRole in _db.UserRoles
                join identityRole in _db.Roles on userRole.RoleId equals identityRole.Id
                where identityRole.Name == role
                select userRole.UserId;

            query = query.Where(a => a.UserId != null && idsInRole.Contains(a.UserId));
        }
        // Every student login writes an entry, which in a full laboratory outnumbers everything
        // else. They are left out unless they are asked for, or unless the Student role is the
        // filter, where hiding them would make no sense.
        if (!includeStudentLogins && role != "Student")
        {
            var studentIds =
                from userRole in _db.UserRoles
                join identityRole in _db.Roles on userRole.RoleId equals identityRole.Id
                where identityRole.Name == "Student"
                select userRole.UserId;

            query = query.Where(a => !(a.Action == "UserLoggedIn"
                                       && a.UserId != null
                                       && studentIds.Contains(a.UserId)));
        }
        if (from.HasValue)
        {
            var fromUtc = from.Value.ToDateTime(TimeOnly.MinValue).AddHours(-UtcOffsetHours);
            query = query.Where(a => a.Timestamp >= fromUtc);
        }
        if (to.HasValue)
        {
            var toUtc = to.Value.AddDays(1).ToDateTime(TimeOnly.MinValue).AddHours(-UtcOffsetHours);
            query = query.Where(a => a.Timestamp < toUtc);
        }

        var total = await query.CountAsync();

        var rows = await query
            .OrderByDescending(a => a.Timestamp)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(a => new
            {
                a.AuditId,
                a.UserId,
                a.Action,
                a.EntityType,
                a.EntityId,
                a.Details,
                a.IpAddress,
                a.Timestamp
            })
            .ToListAsync();

        // Details hold raw ids such as "RecordedBy=<user id>" and "SectionId=3". Look up every
        // person this page mentions, whether as the actor or inside the details, in one go.
        var allDetails = string.Join(" ", rows.Select(r => r.Details ?? string.Empty));

        var userIds = rows.Select(r => r.UserId)
            .Concat(Regex.Matches(allDetails, @"RecordedBy=([^,\s]+)").Select(m => m.Groups[1].Value))
            .Where(id => !string.IsNullOrEmpty(id))
            .Select(id => id!)
            .Distinct()
            .ToList();

        var people = await _db.Users
            .Where(u => userIds.Contains(u.Id))
            .Select(u => new { u.Id, Name = u.FirstName + " " + u.LastName, u.SchoolId })
            .ToListAsync();

        var roleRows = await (
            from userRole in _db.UserRoles
            join identityRole in _db.Roles on userRole.RoleId equals identityRole.Id
            where userIds.Contains(userRole.UserId)
            select new { userRole.UserId, RoleName = identityRole.Name })
            .ToListAsync();

        // A user normally has one role; join them if there is ever more than one.
        var rolesByUserId = roleRows
            .GroupBy(r => r.UserId)
            .ToDictionary(g => g.Key, g => string.Join(", ", g.Select(r => RoleLabel(r.RoleName ?? string.Empty))));

        var actors = people.ToDictionary(
            p => p.Id,
            p => new Actor(p.Name, rolesByUserId.GetValueOrDefault(p.Id, string.Empty), p.SchoolId));

        var classCodes = await _db.CourseSections
            .Where(s => Regex.Matches(allDetails, @"SectionId=(\d+)")
                .Select(m => int.Parse(m.Groups[1].Value)).Distinct().Contains(s.SectionId))
            .Select(s => new { s.SectionId, s.SectionCode })
            .ToDictionaryAsync(s => s.SectionId, s => s.SectionCode);

        string? Readable(string? details)
        {
            if (string.IsNullOrEmpty(details)) return details;

            details = Regex.Replace(details, @"RecordedBy=([^,\s]+)", m =>
                actors.TryGetValue(m.Groups[1].Value, out var actor) ? $"RecordedBy={actor.WithRole}" : m.Value);

            details = Regex.Replace(details, @"SectionId=(\d+)", m =>
                classCodes.TryGetValue(int.Parse(m.Groups[1].Value), out var code) ? $"Class={code}" : m.Value);

            return details;
        }

        return Ok(new
        {
            Total = total,
            Page = page,
            PageSize = pageSize,
            Items = rows.Select(r =>
            {
                var actor = r.UserId is null ? null : actors.GetValueOrDefault(r.UserId);
                return new
                {
                    r.AuditId,
                    User = actor?.Name ?? "System",
                    UserRole = actor?.Role,
                    UserSchoolId = actor?.SchoolId,
                    r.Action,
                    r.EntityType,
                    r.EntityId,
                    Details = Readable(r.Details),
                    r.IpAddress,
                    Timestamp = r.Timestamp.AddHours(UtcOffsetHours)
                };
            })
        });
    }

    /// <summary>The trail of one entity, e.g. everything that happened to one session confirmation.</summary>
    [HttpGet("by-entity/{entityType}/{entityId}")]
    public async Task<IActionResult> GetByEntity(string entityType, string entityId)
    {
        var rows = await _db.AuditLogs
            .Where(a => a.EntityType == entityType && a.EntityId == entityId)
            .OrderByDescending(a => a.Timestamp)
            .Select(a => new
            {
                a.AuditId,
                a.UserId,
                Name = a.User != null ? a.User.FirstName + " " + a.User.LastName : null,
                SchoolId = a.User != null ? a.User.SchoolId : null,
                a.Action,
                a.Details,
                a.Timestamp
            })
            .ToListAsync();

        var userIds = rows.Select(r => r.UserId).Where(id => !string.IsNullOrEmpty(id)).Select(id => id!).Distinct().ToList();

        var roleRows = await (
            from userRole in _db.UserRoles
            join role in _db.Roles on userRole.RoleId equals role.Id
            where userIds.Contains(userRole.UserId)
            select new { userRole.UserId, RoleName = role.Name })
            .ToListAsync();

        var rolesByUserId = roleRows
            .GroupBy(r => r.UserId)
            .ToDictionary(g => g.Key, g => string.Join(", ", g.Select(r => RoleLabel(r.RoleName ?? string.Empty))));

        return Ok(rows.Select(r => new
        {
            r.AuditId,
            User = r.Name ?? "System",
            UserRole = r.UserId is null ? null : rolesByUserId.GetValueOrDefault(r.UserId, string.Empty),
            UserSchoolId = r.SchoolId,
            r.Action,
            r.Details,
            Timestamp = r.Timestamp.AddHours(UtcOffsetHours)
        }));
    }
}