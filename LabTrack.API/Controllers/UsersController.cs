using LabTrack.Api.Data;
using LabTrack.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace LabTrack.Api.Controllers;

public class UpdateUserStatusDto
{
    public bool IsActive { get; set; }
}

[ApiController]
[Route("api/[controller]")]
[Authorize(Roles = "Administrator")]
public class UsersController : ControllerBase
{
    private readonly ApplicationDbContext _db;
    private readonly UserManager<ApplicationUser> _userManager;

    public UsersController(ApplicationDbContext db, UserManager<ApplicationUser> userManager)
    {
        _db = db;
        _userManager = userManager;
    }

    /// <summary>
    /// Lists every account with its role and a "last active" timestamp derived from the most
    /// recent AuditLog entry attributed to that user (login, session confirmation, etc.) — there
    /// is no separate dedicated last-login column on ApplicationUser itself.
    /// </summary>
    public class UserListItem
    {
        public string Id { get; set; } = string.Empty;
        public string FullName { get; set; } = string.Empty;
        public string SchoolId { get; set; } = string.Empty;
        public string? Email { get; set; }
        public string Role { get; set; } = string.Empty;
        public bool IsActive { get; set; }
        public DateTime? LastActive { get; set; }
    }

    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] string? role)
    {
        var users = await _db.Users.ToListAsync();

        // Most recent audit timestamp per user, in one query rather than N+1.
        var lastActiveByUser = await _db.AuditLogs
            .Where(a => a.UserId != null)
            .GroupBy(a => a.UserId)
            .Select(g => new { UserId = g.Key, LastActive = g.Max(a => a.Timestamp) })
            .ToDictionaryAsync(x => x.UserId!, x => x.LastActive);

        var result = new List<UserListItem>();
        foreach (var user in users)
        {
            var roles = await _userManager.GetRolesAsync(user);
            var userRole = roles.FirstOrDefault() ?? "Student";

            if (role is not null && !string.Equals(userRole, role, StringComparison.OrdinalIgnoreCase))
                continue;

            result.Add(new UserListItem
            {
                Id = user.Id,
                FullName = user.FullName,
                SchoolId = user.SchoolId,
                Email = user.Email,
                Role = userRole,
                IsActive = user.IsActive,
                LastActive = lastActiveByUser.TryGetValue(user.Id, out var la) ? la : null,
            });
        }

        return Ok(result.OrderByDescending(u => u.LastActive ?? DateTime.MinValue));
    }

    /// <summary>Enables or disables an account. A disabled account is rejected at login (AuthController already checks IsActive).</summary>
    [HttpPatch("{id}/status")]
    public async Task<IActionResult> UpdateStatus(string id, UpdateUserStatusDto dto)
    {
        var user = await _db.Users.FindAsync(id);
        if (user is null) return NotFound();

        var actingUserId = User.FindFirst("sub")?.Value ?? User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
        if (user.Id == actingUserId && !dto.IsActive)
            return BadRequest("You cannot disable your own account.");

        user.IsActive = dto.IsActive;

        _db.AuditLogs.Add(new AuditLog
        {
            UserId = actingUserId,
            Action = dto.IsActive ? "UserReEnabled" : "UserDisabled",
            EntityType = nameof(ApplicationUser),
            EntityId = user.Id,
            Details = $"Target={user.SchoolId}",
        });

        await _db.SaveChangesAsync();

        return Ok(new { user.Id, user.IsActive });
    }
}