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
    /// classes with twice-weekly lab meetings, Monday to Friday, and one account for each role. Safe to run repeatedly.
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

        // ---- Labs, subjects, academic year, classes (created once) ----
        if (await db.Laboratories.AnyAsync(l => l.RoomCode == "CL1")) return;

        var ay = new AcademicYear
        {
            Label = "2026-2027",
            TermType = TermType.FirstSemester,
            StartDate = DateTime.Today.AddMonths(-3),
            EndDate = DateTime.Today.AddMonths(3),
            IsActive = true
        };

        var subjects = new[]
        {
        new Subject { Code = "IT211", Title = "Data Structures and Algorithms", Units = 3, RequiredHours = 54m, TermWeeks = 18 },
        new Subject { Code = "IT212", Title = "Networking Fundamentals",        Units = 3, RequiredHours = 54m, TermWeeks = 18 },
        new Subject { Code = "IT213", Title = "Web Development",                Units = 3, RequiredHours = 54m, TermWeeks = 18 },
        new Subject { Code = "IT214", Title = "Database Management Systems",    Units = 3, RequiredHours = 54m, TermWeeks = 18 },
    };

        Laboratory NewLab(string code, string name) => new()
        {
            Name = name,
            RoomCode = code,
            Capacity = 40,
            IsActive = true,
            Workstations = Enumerable.Range(1, 5)
                .Select(i => new Workstation { PcIdentifier = $"{code}-PC{i:00}", SeatLabel = $"PC-{i:00}", IsActive = true })
                .ToList()
        };

        var cl1 = NewLab("CL1", "Computer Laboratory 1");
        var cl2 = NewLab("CL2", "Computer Laboratory 2");

        db.AcademicYears.Add(ay);
        db.Subjects.AddRange(subjects);
        db.Laboratories.AddRange(cl1, cl2);
        await db.SaveChangesAsync();

        // Class time blocks. Edit this list to match the real timetable.
        var blocks = new[]
        {
        (Start: new TimeOnly(8, 0),   End: new TimeOnly(10, 0)),
        (Start: new TimeOnly(10, 0),  End: new TimeOnly(12, 0)),
        (Start: new TimeOnly(13, 30), End: new TimeOnly(15, 30)),
        (Start: new TimeOnly(15, 30), End: new TimeOnly(17, 30)),
    };

        SectionSchedule Meeting(DayOfWeek day, int block, Laboratory room) => new()
        {
            LabId = room.LabId,
            DayOfWeek = day.ToString(),
            StartTime = blocks[block].Start,
            EndTime = blocks[block].End
        };

        // Each class has its university class code and meets twice a week in the lab, Monday to Friday only.
        // Class 3496 has its second meeting in a different laboratory.
        var classes = new (string Code, Subject Subject, SectionSchedule[] Meetings)[]
        {
        ("3494", subjects[0], new[] { Meeting(DayOfWeek.Monday,    0, cl1), Meeting(DayOfWeek.Thursday, 0, cl1) }),
        ("3495", subjects[1], new[] { Meeting(DayOfWeek.Monday,    1, cl1), Meeting(DayOfWeek.Thursday, 1, cl1) }),
        ("3496", subjects[2], new[] { Meeting(DayOfWeek.Tuesday,   0, cl1), Meeting(DayOfWeek.Friday,   0, cl2) }),
        ("3497", subjects[3], new[] { Meeting(DayOfWeek.Tuesday,   1, cl1), Meeting(DayOfWeek.Friday,   1, cl1) }),
        ("3498", subjects[0], new[] { Meeting(DayOfWeek.Wednesday, 0, cl1), Meeting(DayOfWeek.Friday,   2, cl1) }),
        ("3499", subjects[1], new[] { Meeting(DayOfWeek.Monday,    2, cl2), Meeting(DayOfWeek.Wednesday, 3, cl2) }),
        ("3500", subjects[2], new[] { Meeting(DayOfWeek.Tuesday,   3, cl2), Meeting(DayOfWeek.Thursday,  2, cl2) }),
        ("3502", subjects[3], new[] { Meeting(DayOfWeek.Wednesday, 2, cl1), Meeting(DayOfWeek.Monday,    3, cl1) }),
        };

        foreach (var c in classes)
        {
            db.CourseSections.Add(new CourseSection
            {
                SectionCode = c.Code,
                SubjectId = c.Subject.SubjectId,
                FacultyId = faculty.Id,
                AyId = ay.AyId,
                Schedules = c.Meetings.ToList()
            });
        }
        await db.SaveChangesAsync();

        // Each class needs its CHED compliance row, like CourseSectionsController.Create makes.
        var sections = await db.CourseSections.Include(s => s.Subject).ToListAsync();
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