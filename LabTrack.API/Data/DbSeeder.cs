using LabTrack.Api.Models;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace LabTrack.Api.Data;

public static class DbSeeder
{
    public static readonly string[] Roles = { "Administrator", "Custodian", "LabAssistant", "Faculty", "Student" } ;

    public static async Task SeedAsync(IServiceProvider services)
    {
        var roleManager = services.GetRequiredService<RoleManager<IdentityRole>>();
        var userManager = services.GetRequiredService<UserManager<ApplicationUser>>();

        foreach (var role in Roles)
        {
            if (!await roleManager.RoleExistsAsync(role))
                await roleManager.CreateAsync(new IdentityRole(role));
        }

        const string adminEmail = "admin@labtrack.local";
        if (await userManager.FindByEmailAsync(adminEmail) is null)
        {
            var admin = new ApplicationUser
            {
                UserName = adminEmail,
                Email = adminEmail,
                FirstName = "System",
                LastName = "Administrator",
                SchoolId = "ADMIN-0001",
                EmailConfirmed = true
            };

            // CHANGE THIS PASSWORD after first login.
            var result = await userManager.CreateAsync(admin, "Admin@12345");
            if (result.Succeeded)
                await userManager.AddToRoleAsync(admin, "Administrator");
        }
    }
    /// <summary>
    /// Development-only demo data: one lab with workstations, a subject, an active academic year,
    /// sections every day of the week, and one account for each role. Safe to run repeatedly.
    /// </summary>
    public static async Task SeedDemoDataAsync(IServiceProvider services)
    {
        var db = services.GetRequiredService<ApplicationDbContext>();
        var userManager = services.GetRequiredService<UserManager<ApplicationUser>>();

        // ---- Demo accounts ----
        var custodian = await EnsureUserAsync(userManager, "custodian@labtrack.local", "Carlo", "Reyes",
            "CUST-0001", "Custodian@123", "Custodian");
        await EnsureUserAsync(userManager, "assistant@labtrack.local", "Ana", "Lim",
            "ASST-0001", "Assistant@123", "LabAssistant", supervisingCustodianId: custodian.Id);
        var faculty = await EnsureUserAsync(userManager, "faculty@labtrack.local", "Maria", "Santos",
            "FAC-0001", "Faculty@123", "Faculty", pin: "1234");
        await EnsureUserAsync(userManager, "student@labtrack.local", "Juan", "Dela Cruz",
            "2026-0001", "Student@123", "Student");

        // ---- Lab, subjects, academic year, sections (created once) ----
        if (await db.Laboratories.AnyAsync(l => l.RoomCode == "CL1")) return;

        var ay = new AcademicYear
        {
            Label = "2026-2027",
            TermType = TermType.FirstSemester,
            StartDate = DateTime.Today.AddMonths(-3),
            EndDate = DateTime.Today.AddMonths(3),
            IsActive = true
        };
        var dsa = new Subject { Code = "IT211", Title = "Data Structures and Algorithms", Units = 3, RequiredHours = 54m, TermWeeks = 18 };
        var net = new Subject { Code = "IT212", Title = "Networking Fundamentals", Units = 3, RequiredHours = 54m, TermWeeks = 18 };
        var lab = new Laboratory
        {
            Name = "Computer Laboratory 1",
            RoomCode = "CL1",
            Capacity = 40,
            IsActive = true,
            Workstations = Enumerable.Range(1, 5)
                .Select(i => new Workstation { PcIdentifier = $"CL1-PC{i:00}", SeatLabel = $"PC-{i:00}", IsActive = true })
                .ToList()
        };

        db.AcademicYears.Add(ay);
        db.Subjects.AddRange(dsa, net);
        db.Laboratories.Add(lab);
        await db.SaveChangesAsync();

        // Every day: IT211 runs almost all day so a class always matches when you test, and
        // IT212 runs 6-9 PM so the dropdown always has another class to choose from.
        foreach (var day in Enum.GetValues<DayOfWeek>())
        {
            var abbr = day.ToString()[..3].ToUpper();

            db.CourseSections.Add(new CourseSection
            {
                SectionCode = $"IT211-CL1-{abbr}",
                SubjectId = dsa.SubjectId,
                LabId = lab.LabId,
                FacultyId = faculty.Id,
                DayOfWeek = day.ToString(),
                StartTime = new TimeOnly(1, 0),
                EndTime = new TimeOnly(23, 59),
                AyId = ay.AyId
            });

            db.CourseSections.Add(new CourseSection
            {
                SectionCode = $"IT212-CL1-{abbr}",
                SubjectId = net.SubjectId,
                LabId = lab.LabId,
                FacultyId = faculty.Id,
                DayOfWeek = day.ToString(),
                StartTime = new TimeOnly(18, 0),
                EndTime = new TimeOnly(21, 0),
                AyId = ay.AyId
            });
        }
        await db.SaveChangesAsync();

        // Each section needs its CHED compliance row, like CourseSectionsController.Create makes.
        var sections = await db.CourseSections.Include(s => s.Subject)
            .Where(s => s.LabId == lab.LabId).ToListAsync();
        foreach (var section in sections)
        {
            var progress = new ChedComplianceProgress
            {
                SectionId = section.SectionId,
                ConfirmedHoursTotal = 0m,
                RequiredHours = section.Subject.RequiredHours,
                Status = ComplianceStatus.NonCompliant
            };
            progress.RecomputeStatus();
            db.ChedComplianceProgresses.Add(progress);
        }
        await db.SaveChangesAsync();
    }

    private static async Task<ApplicationUser> EnsureUserAsync(
        UserManager<ApplicationUser> userManager, string email, string firstName, string lastName,
        string schoolId, string password, string role, string? pin = null, string? supervisingCustodianId = null)
    {
        var existing = await userManager.FindByEmailAsync(email);
        if (existing is not null) return existing;

        var user = new ApplicationUser
        {
            UserName = email,
            Email = email,
            FirstName = firstName,
            LastName = lastName,
            SchoolId = schoolId,
            EmailConfirmed = true,
            SupervisingCustodianId = supervisingCustodianId
        };
        if (pin is not null)
            user.PinHash = new PasswordHasher<ApplicationUser>().HashPassword(user, pin);

        var result = await userManager.CreateAsync(user, password);
        if (!result.Succeeded)
            throw new InvalidOperationException(
                $"Demo seed failed for {email}: {string.Join("; ", result.Errors.Select(e => e.Description))}");

        await userManager.AddToRoleAsync(user, role);
        return user;
    }
}