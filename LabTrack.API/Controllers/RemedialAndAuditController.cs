using LabTrack.Api.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

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
/// Read-only. AuditLog rows are written by the service/controller layer whenever a
/// compliance-relevant action occurs — never created or edited through a REST endpoint.
/// Restricted to Administrator since it exposes the full system activity trail.
/// </summary>
[ApiController]
[Route("api/[controller]")]
[Authorize(Roles = "Administrator")]
public class AuditLogController : ControllerBase
{
    private readonly ApplicationDbContext _db;
    public AuditLogController(ApplicationDbContext db) => _db = db;

    [HttpGet]
    public async Task<IActionResult> GetAll(
        [FromQuery] string? entityType,
        [FromQuery] string? action,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 50)
    {
        var query = _db.AuditLogs.Include(a => a.User).AsQueryable();

        if (!string.IsNullOrWhiteSpace(entityType)) query = query.Where(a => a.EntityType == entityType);
        if (!string.IsNullOrWhiteSpace(action)) query = query.Where(a => a.Action == action);

        var logs = await query
            .OrderByDescending(a => a.Timestamp)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(a => new
            {
                a.AuditId,
                User = a.User != null ? a.User.FullName : "System",
                a.Action,
                a.EntityType,
                a.EntityId,
                a.Details,
                a.IpAddress,
                a.Timestamp
            })
            .ToListAsync();

        return Ok(logs);
    }

    [HttpGet("by-entity/{entityType}/{entityId}")]
    public async Task<IActionResult> GetByEntity(string entityType, string entityId)
    {
        var logs = await _db.AuditLogs
            .Where(a => a.EntityType == entityType && a.EntityId == entityId)
            .Include(a => a.User)
            .OrderByDescending(a => a.Timestamp)
            .Select(a => new
            {
                a.AuditId,
                User = a.User != null ? a.User.FullName : "System",
                a.Action,
                a.Details,
                a.Timestamp
            })
            .ToListAsync();

        return Ok(logs);
    }
}