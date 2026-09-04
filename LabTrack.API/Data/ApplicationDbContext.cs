using LabTrack.Api.Models;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace LabTrack.Api.Data;

public class ApplicationDbContext : IdentityDbContext<ApplicationUser>
{
    public ApplicationDbContext(DbContextOptions<ApplicationDbContext> options) : base(options) { }

    public DbSet<Laboratory> Laboratories => Set<Laboratory>();
    public DbSet<Workstation> Workstations => Set<Workstation>();
    public DbSet<AcademicYear> AcademicYears => Set<AcademicYear>();
    public DbSet<Subject> Subjects => Set<Subject>();
    public DbSet<CourseSection> CourseSections => Set<CourseSection>();
    public DbSet<SessionConfirmation> SessionConfirmations => Set<SessionConfirmation>();
    public DbSet<ChedComplianceProgress> ChedComplianceProgresses => Set<ChedComplianceProgress>();
    public DbSet<RemedialRecommendation> RemedialRecommendations => Set<RemedialRecommendation>();
    public DbSet<AttendanceSession> AttendanceSessions => Set<AttendanceSession>();
    public DbSet<ActivityScore> ActivityScores => Set<ActivityScore>();
    public DbSet<AuditLog> AuditLogs => Set<AuditLog>();

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);

        // ---- Explicit primary keys ----
        // EF Core only auto-detects "Id" or "{ClassName}Id" as a PK by convention. Several
        // entities here use ERD-matching key names that don't fit that pattern, so they need
        // to be configured explicitly.
        builder.Entity<AcademicYear>().HasKey(a => a.AyId);
        builder.Entity<Laboratory>().HasKey(l => l.LabId);
        builder.Entity<CourseSection>().HasKey(c => c.SectionId);
        builder.Entity<SessionConfirmation>().HasKey(sc => sc.ConfirmationId);
        builder.Entity<ChedComplianceProgress>().HasKey(p => p.ProgressId);
        builder.Entity<RemedialRecommendation>().HasKey(r => r.RecommendationId);
        builder.Entity<AttendanceSession>().HasKey(a => a.AttendanceId);
        builder.Entity<ActivityScore>().HasKey(a => a.ActivityId);
        builder.Entity<AuditLog>().HasKey(a => a.AuditId);

        // ---- Users ----
        builder.Entity<ApplicationUser>()
            .HasIndex(u => u.SchoolId)
            .IsUnique();

        builder.Entity<ApplicationUser>()
            .HasOne(u => u.SupervisingCustodian)
            .WithMany()
            .HasForeignKey(u => u.SupervisingCustodianId)
            .OnDelete(DeleteBehavior.Restrict);

        // ---- Laboratories / Workstations ----
        builder.Entity<Workstation>()
            .HasOne(w => w.Laboratory)
            .WithMany(l => l.Workstations)
            .HasForeignKey(w => w.LabId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.Entity<Workstation>()
            .HasIndex(w => w.DeviceIdentifier)
            .IsUnique();

        // A seat label only needs to be unique within its own lab (e.g. two different labs can
        // both have a seat "A1"), not globally — hence the composite index rather than a plain
        // unique index on SeatLabel alone.
        builder.Entity<Workstation>()
            .HasIndex(w => new { w.LabId, w.SeatLabel })
            .IsUnique();

        // ---- Academic Years / Subjects ----
        builder.Entity<Subject>()
            .HasIndex(s => s.Code)
            .IsUnique();

        // ---- Course Sections ----
        builder.Entity<CourseSection>()
            .HasIndex(c => c.SectionCode)
            .IsUnique();

        builder.Entity<CourseSection>()
            .HasOne(c => c.Subject)
            .WithMany(s => s.CourseSections)
            .HasForeignKey(c => c.SubjectId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.Entity<CourseSection>()
            .HasOne(c => c.AcademicYear)
            .WithMany(a => a.CourseSections)
            .HasForeignKey(c => c.AyId)
            .OnDelete(DeleteBehavior.Restrict);

        // ---- Session Confirmations ----
        builder.Entity<SessionConfirmation>()
            .HasOne(sc => sc.CourseSection)
            .WithMany(c => c.SessionConfirmations)
            .HasForeignKey(sc => sc.SectionId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.Entity<SessionConfirmation>()
            .HasOne(sc => sc.ConfirmedByUser)
            .WithMany()
            .HasForeignKey(sc => sc.ConfirmedBy)
            .OnDelete(DeleteBehavior.Restrict);

        // ---- CHED Compliance (one-to-one with CourseSection) ----
        builder.Entity<ChedComplianceProgress>()
            .HasOne(p => p.CourseSection)
            .WithOne()
            .HasForeignKey<ChedComplianceProgress>(p => p.SectionId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.Entity<ChedComplianceProgress>()
            .HasIndex(p => p.SectionId)
            .IsUnique();

        // ---- Remedial Recommendations ----
        builder.Entity<RemedialRecommendation>()
            .HasOne(r => r.CourseSection)
            .WithMany()
            .HasForeignKey(r => r.SectionId)
            .OnDelete(DeleteBehavior.Cascade);

        // ---- Attendance Sessions ----
        builder.Entity<AttendanceSession>()
            .HasOne(a => a.Student)
            .WithMany()
            .HasForeignKey(a => a.StudentId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.Entity<AttendanceSession>()
            .HasOne(a => a.Workstation)
            .WithMany(w => w.AttendanceSessions)
            .HasForeignKey(a => a.WorkstationId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.Entity<AttendanceSession>()
            .HasOne(a => a.CourseSection)
            .WithMany(c => c.AttendanceSessions)
            .HasForeignKey(a => a.SectionId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.Entity<AttendanceSession>()
            .HasOne(a => a.ReviewedByUser)
            .WithMany()
            .HasForeignKey(a => a.ReviewedByUserId)
            .OnDelete(DeleteBehavior.Restrict);

        // ---- Activity Scores (one-to-one with AttendanceSession) ----
        builder.Entity<ActivityScore>()
            .HasOne(a => a.AttendanceSession)
            .WithOne(s => s.ActivityScore)
            .HasForeignKey<ActivityScore>(a => a.AttendanceId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.Entity<ActivityScore>()
            .HasIndex(a => a.AttendanceId)
            .IsUnique();

        // ---- Audit Log ----
        builder.Entity<AuditLog>()
            .HasOne(a => a.User)
            .WithMany()
            .HasForeignKey(a => a.UserId)
            .OnDelete(DeleteBehavior.SetNull);

        builder.Entity<AuditLog>()
            .HasIndex(a => new { a.EntityType, a.EntityId });
    }
}