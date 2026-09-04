using System.ComponentModel.DataAnnotations;

namespace LabTrack.Api.Models;

/// <summary>
/// Tamper-evident trail of who did what, when — important for a CHED compliance system where
/// Session Confirmations and compliance status need to be defensible/auditable. Rows are
/// append-only: written by the service layer whenever a compliance-relevant action occurs
/// (session confirmation, user creation/role change, compliance status change, etc.) and never
/// updated or deleted afterward.
/// </summary>
public class AuditLog
{
    public int AuditId { get; set; }

    /// <summary>The user who performed the action. Nullable to allow system-generated entries (e.g. automated recompute jobs).</summary>
    public string? UserId { get; set; }
    public ApplicationUser? User { get; set; }

    /// <summary>Short machine-readable action name, e.g. "SessionConfirmed", "UserCreated", "RoleAssigned", "ComplianceStatusChanged".</summary>
    [MaxLength(100)]
    public string Action { get; set; } = string.Empty;

    /// <summary>The entity type affected, e.g. "SessionConfirmation", "CourseSection", "ApplicationUser".</summary>
    [MaxLength(100)]
    public string EntityType { get; set; } = string.Empty;

    /// <summary>Primary key of the affected entity, stored as string since entity PK types vary (int vs Identity's string id).</summary>
    [MaxLength(50)]
    public string EntityId { get; set; } = string.Empty;

    /// <summary>Free-form snapshot/details, typically a small JSON blob of the relevant before/after values.</summary>
    public string? Details { get; set; }

    /// <summary>IP address the action originated from, when available (e.g. which lab workstation triggered it).</summary>
    [MaxLength(45)]
    public string? IpAddress { get; set; }

    public DateTime Timestamp { get; set; } = DateTime.UtcNow;
}