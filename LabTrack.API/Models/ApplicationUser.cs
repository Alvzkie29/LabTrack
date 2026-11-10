using Microsoft.AspNetCore.Identity;

namespace LabTrack.Api.Models;

/// <summary>
/// Extends ASP.NET Core Identity's user with LabTrack-specific profile fields.
/// Roles (assigned via IdentityRole): Student, LabAssistant, Custodian, Administrator.
/// </summary>
public class ApplicationUser : IdentityUser
{
    public string FirstName { get; set; } = string.Empty;

    /// <summary>Optional — some users may not have a middle name on record.</summary>
    public string? MiddleName { get; set; }

    public string LastName { get; set; } = string.Empty;

    /// <summary>Convenience read-only property for display purposes (e.g. "Dela Cruz, Juan M.").</summary>
    public string FullName =>
        string.IsNullOrWhiteSpace(MiddleName)
            ? $"{FirstName} {LastName}"
            : $"{FirstName} {MiddleName[0]}. {LastName}";

    /// <summary>
    /// School/Student ID or Staff ID used for workstation login (student ID + password flow).
    /// Unique per user, distinct from the Identity UserName/Email.
    /// </summary>
    public string SchoolId { get; set; } = string.Empty;

    /// <summary>
    /// For Lab Assistants: the Custodian who oversees them. Null for other roles.
    /// </summary>
    public string? SupervisingCustodianId { get; set; }
    public ApplicationUser? SupervisingCustodian { get; set; }
    public string? PinHash { get; set; }

    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    /// <summary>True until the student sets their own password (new imported accounts).</summary>
    public bool MustChangePassword { get; set; } = false;
}