using System.ComponentModel.DataAnnotations;

namespace LabTrack.Api.DTOs;

public class LoginDto
{
    /// <summary>Either the SchoolId or the Email may be used to log in.</summary>
    [Required]
    public string Identifier { get; set; } = string.Empty;

    [Required]
    public string Password { get; set; } = string.Empty;
}

public class RegisterDto
{
    [Required]
    public string FirstName { get; set; } = string.Empty;

    public string? MiddleName { get; set; }

    [Required]
    public string LastName { get; set; } = string.Empty;

    [Required]
    public string SchoolId { get; set; } = string.Empty;

    [Required, EmailAddress]
    public string Email { get; set; } = string.Empty;

    [Required, MinLength(6)]
    public string Password { get; set; } = string.Empty;

    /// <summary>One of: Student, LabAssistant, Custodian, Faculty, Administrator.</summary>
    [Required]
    public string Role { get; set; } = "Student";

    /// <summary>Faculty only: 4 to 6 digit PIN used to confirm sessions. Ignored for other roles.</summary>
    public string? Pin { get; set; }

    public string? SupervisingCustodianId { get; set; }
}

public class AuthResponseDto
{
    public string Token { get; set; } = string.Empty;
    public DateTime ExpiresAt { get; set; }
    public string UserId { get; set; } = string.Empty;
    public string FullName { get; set; } = string.Empty;
    public string SchoolId { get; set; } = string.Empty;
    public string? Email { get; set; }
    public IList<string> Roles { get; set; } = new List<string>();
}

public class ChangePasswordDto
{
    [Required]
    public string CurrentPassword { get; set; } = string.Empty;

    [Required, MinLength(6)]
    public string NewPassword { get; set; } = string.Empty;
}