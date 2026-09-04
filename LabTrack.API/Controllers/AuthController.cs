using LabTrack.Api.Data;
using LabTrack.Api.DTOs;
using LabTrack.Api.Models;
using LabTrack.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace LabTrack.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AuthController : ControllerBase
{
    private readonly UserManager<ApplicationUser> _userManager;
    private readonly TokenService _tokenService;
    private readonly ApplicationDbContext _db;

    public AuthController(
        UserManager<ApplicationUser> userManager,
        TokenService tokenService,
        ApplicationDbContext db)
    {
        _userManager = userManager;
        _tokenService = tokenService;
        _db = db;
    }

    /// <summary>
    /// Register a new user. Recommended to restrict this to Administrators in production
    /// (see the commented [Authorize] attribute below) rather than leaving it open — left
    /// unrestricted here for initial setup/testing.
    /// </summary>
    [HttpPost("register")]
    // [Authorize(Roles = "Administrator")]
    public async Task<ActionResult<AuthResponseDto>> Register(RegisterDto dto)
    {
        if (!DbSeeder.Roles.Contains(dto.Role))
            return BadRequest($"Role must be one of: {string.Join(", ", DbSeeder.Roles)}");

        if (await _db.Users.AnyAsync(u => u.SchoolId == dto.SchoolId))
            return BadRequest("A user with this School ID already exists.");

        var user = new ApplicationUser
        {
            UserName = dto.Email,
            Email = dto.Email,
            FirstName = dto.FirstName,
            MiddleName = dto.MiddleName,
            LastName = dto.LastName,
            SchoolId = dto.SchoolId,
            SupervisingCustodianId = dto.SupervisingCustodianId
        };

        var result = await _userManager.CreateAsync(user, dto.Password);
        if (!result.Succeeded)
            return BadRequest(result.Errors.Select(e => e.Description));

        await _userManager.AddToRoleAsync(user, dto.Role);

        _db.AuditLogs.Add(new AuditLog
        {
            UserId = user.Id,
            Action = "UserCreated",
            EntityType = nameof(ApplicationUser),
            EntityId = user.Id,
            Details = $"Role={dto.Role}, SchoolId={dto.SchoolId}"
        });
        await _db.SaveChangesAsync();

        var roles = await _userManager.GetRolesAsync(user);
        var (token, expiresAt) = _tokenService.GenerateToken(user, roles);

        return Ok(new AuthResponseDto
        {
            Token = token,
            ExpiresAt = expiresAt,
            UserId = user.Id,
            FullName = user.FullName,
            Email = user.Email,
            SchoolId = user.SchoolId,
            Roles = roles
        });
    }

    /// <summary>
    /// Login with SchoolId or Email + password. Used both for staff login and the
    /// per-workstation student login (student ID + password) flow.
    /// </summary>
    [HttpPost("login")]
    public async Task<ActionResult<AuthResponseDto>> Login(LoginDto dto)
    {
        var user = await _db.Users.FirstOrDefaultAsync(u =>
            u.SchoolId == dto.Identifier || u.Email == dto.Identifier || u.UserName == dto.Identifier);

        if (user is null || !user.IsActive)
            return Unauthorized("Invalid credentials.");

        var passwordValid = await _userManager.CheckPasswordAsync(user, dto.Password);
        if (!passwordValid)
            return Unauthorized("Invalid credentials.");

        var roles = await _userManager.GetRolesAsync(user);
        var (token, expiresAt) = _tokenService.GenerateToken(user, roles);

        _db.AuditLogs.Add(new AuditLog
        {
            UserId = user.Id,
            Action = "UserLoggedIn",
            EntityType = nameof(ApplicationUser),
            EntityId = user.Id,
        });
        await _db.SaveChangesAsync();

        return Ok(new AuthResponseDto
        {
            Token = token,
            ExpiresAt = expiresAt,
            UserId = user.Id,
            FullName = user.FullName,
            Email = user.Email,
            SchoolId = user.SchoolId,
            Roles = roles
        });
    }

    /// <summary>Lets a logged-in user change their own password, given their current one.</summary>
    [HttpPost("change-password")]
    [Authorize]
    public async Task<IActionResult> ChangePassword(ChangePasswordDto dto)
    {
        var userId = User.FindFirst("sub")?.Value ?? User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
        var user = await _userManager.FindByIdAsync(userId ?? string.Empty);
        if (user is null) return Unauthorized();

        var result = await _userManager.ChangePasswordAsync(user, dto.CurrentPassword, dto.NewPassword);
        if (!result.Succeeded)
            return BadRequest(result.Errors.Select(e => e.Description));

        _db.AuditLogs.Add(new AuditLog
        {
            UserId = user.Id,
            Action = "PasswordChanged",
            EntityType = nameof(ApplicationUser),
            EntityId = user.Id,
        });
        await _db.SaveChangesAsync();

        return Ok(new { message = "Password changed successfully." });
    }

    [HttpGet("me")]
    [Authorize]
    public async Task<ActionResult<AuthResponseDto>> Me()
    {
        var userId = User.FindFirst("sub")?.Value ?? User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
        var user = await _userManager.FindByIdAsync(userId ?? string.Empty);
        if (user is null) return Unauthorized();

        var roles = await _userManager.GetRolesAsync(user);
        return Ok(new AuthResponseDto
        {
            UserId = user.Id,
            FullName = user.FullName,
            Email = user.Email,
            SchoolId = user.SchoolId,
            Roles = roles
        });
    }
}