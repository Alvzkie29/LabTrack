using LabTrack.Api.Data;
using LabTrack.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Text;
using LabTrack.Api.Services;
using System.Globalization;

namespace LabTrack.Api.Controllers;

public class MeetingDto
{
    public int LabId { get; set; }
    public string DayOfWeek { get; set; } = string.Empty; // Monday to Friday
    public TimeOnly StartTime { get; set; }
    public TimeOnly EndTime { get; set; }
}

public class CreateCourseSectionDto
{
    public int SubjectId { get; set; }
    public string SectionCode { get; set; } = string.Empty; // the class code, e.g. "3494"
    public string? FacultyId { get; set; }
    public int AyId { get; set; }
    public List<MeetingDto> Meetings { get; set; } = new();
}

public class UpdateFacultyDto
{
    public string? FacultyId { get; set; }
}

public class RosterImportResult
{
    public int Enrolled { get; set; }
    public int AccountsCreated { get; set; }
    public int AlreadyOnRoster { get; set; }
    public List<string> Errors { get; set; } = new();
}

public class ScheduleImportResult
{
    public int SectionsCreated { get; set; }
    public int SubjectsCreated { get; set; }
    public int MeetingsAdded { get; set; }
    public int MeetingsAlreadyThere { get; set; }
    public List<string> Errors { get; set; } = new();
}

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class CourseSectionsController : ControllerBase
{
    private readonly ApplicationDbContext _db;
    private readonly UserManager<ApplicationUser> _userManager;

    public CourseSectionsController(ApplicationDbContext db, UserManager<ApplicationUser> userManager)
    {
        _db = db;
        _userManager = userManager;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll(
        [FromQuery] int? ayId, [FromQuery] int? labId, [FromQuery] bool? pendingFacultyOnly)
    {
        var query = _db.CourseSections
            .Include(c => c.Subject)
            .Include(c => c.AcademicYear)
            .Include(c => c.Faculty)
            .Include(c => c.Schedules).ThenInclude(m => m.Laboratory)
            .AsQueryable();

        if (ayId.HasValue) query = query.Where(c => c.AyId == ayId.Value);
        if (labId.HasValue) query = query.Where(c => c.Schedules.Any(m => m.LabId == labId.Value));
        if (pendingFacultyOnly == true) query = query.Where(c => c.FacultyId == null);

        var sections = await query.ToListAsync();

        var progressBySection = await _db.ChedComplianceProgresses
            .Where(p => sections.Select(s => s.SectionId).Contains(p.SectionId))
            .ToDictionaryAsync(p => p.SectionId);

        return Ok(sections.Select(c => new
        {
            c.SectionId,
            c.SectionCode,
            Subject = new { c.Subject.SubjectId, c.Subject.Code, c.Subject.Title },
            AcademicYear = c.AcademicYear.Label,
            c.FacultyId,
            Faculty = c.Faculty?.FullName,
            c.HasInstructorAssigned,
            Meetings = MeetingsOf(c),
            Compliance = progressBySection.TryGetValue(c.SectionId, out var p)
                ? new { p.ConfirmedHoursTotal, p.RequiredHours, Status = p.Status.ToString() }
                : null
        }));
    }

    [HttpGet("{id:int}")]
    public async Task<IActionResult> Get(int id)
    {
        var section = await _db.CourseSections
            .Include(c => c.Subject)
            .Include(c => c.AcademicYear)
            .Include(c => c.Faculty)
            .Include(c => c.Schedules).ThenInclude(m => m.Laboratory)
            .Include(c => c.SessionConfirmations).ThenInclude(sc => sc.FacultyConfirmedByUser)
            .Include(c => c.SessionConfirmations).ThenInclude(sc => sc.FinalConfirmedByUser)
            .FirstOrDefaultAsync(c => c.SectionId == id);

        if (section is null) return NotFound();

        var progress = await _db.ChedComplianceProgresses.FirstOrDefaultAsync(p => p.SectionId == id);

        return Ok(new
        {
            section.SectionId,
            section.SectionCode,
            Subject = new { section.Subject.SubjectId, section.Subject.Code, section.Subject.Title, section.Subject.RequiredHours, section.Subject.TermWeeks },
            AcademicYear = new { section.AcademicYear.Label, section.AcademicYear.StartDate, section.AcademicYear.EndDate },
            section.FacultyId,
            Faculty = section.Faculty?.FullName,
            section.HasInstructorAssigned,
            Meetings = MeetingsOf(section),
            Compliance = progress is null ? null : new
            {
                progress.ConfirmedHoursTotal,
                progress.RequiredHours,
                Status = progress.Status.ToString(),
                progress.UpdatedAt
            },
            SessionConfirmations = section.SessionConfirmations
                .OrderByDescending(sc => sc.SessionDate)
                .Select(sc => new
                {
                    sc.ConfirmationId,
                    SessionType = sc.SessionType.ToString(),
                    sc.SessionDate,
                    FacultyConfirmedBy = sc.FacultyConfirmedByUser?.FullName,
                    sc.FacultyConfirmedAt,
                    FinalConfirmedBy = sc.FinalConfirmedByUser?.FullName,
                    sc.FinalConfirmedAt,
                    sc.HoursCredited,
                    sc.Notes
                })
        });
    }

    /// <summary>
    /// Creates a class (the university's class code) with its lab meetings, and its CHED
    /// Compliance Progress row. FacultyId may be left null.
    /// </summary>
    [HttpPost]
    [Authorize(Roles = "Custodian,Administrator")]
    public async Task<IActionResult> Create(CreateCourseSectionDto dto)
    {
        var subject = await _db.Subjects.FindAsync(dto.SubjectId);
        if (subject is null) return BadRequest("SubjectId does not exist.");

        if (!await _db.AcademicYears.AnyAsync(a => a.AyId == dto.AyId))
            return BadRequest("AyId does not exist.");

        if (dto.Meetings.Count == 0)
            return BadRequest("A class needs at least one lab meeting.");

        var labIds = dto.Meetings.Select(m => m.LabId).Distinct().ToList();
        if (await _db.Laboratories.CountAsync(l => labIds.Contains(l.LabId)) != labIds.Count)
            return BadRequest("One of the LabIds does not exist.");

        var schedules = new List<SectionSchedule>();
        foreach (var m in dto.Meetings)
        {
            if (!LabDays.TryParse(m.DayOfWeek, out var day))
                return BadRequest($"'{m.DayOfWeek}' is not a lab day. Use Monday to Friday.");
            if (m.EndTime <= m.StartTime)
                return BadRequest("Each meeting's EndTime must be later than its StartTime.");

            schedules.Add(new SectionSchedule
            {
                LabId = m.LabId,
                DayOfWeek = day.ToString(),
                StartTime = m.StartTime,
                EndTime = m.EndTime
            });
        }

        if (await _db.CourseSections.AnyAsync(c => c.AyId == dto.AyId && c.SectionCode == dto.SectionCode))
            return BadRequest("A class with this code already exists in this academic year.");

        if (dto.FacultyId is not null)
        {
            var error = await ValidateFacultyAsync(dto.FacultyId);
            if (error is not null) return BadRequest(error);
        }

        var section = new CourseSection
        {
            SubjectId = dto.SubjectId,
            SectionCode = dto.SectionCode,
            FacultyId = dto.FacultyId,
            AyId = dto.AyId,
            Schedules = schedules
        };
        _db.CourseSections.Add(section);
        await _db.SaveChangesAsync(); // saves the class and its meetings, and generates SectionId

        var progress = new ChedComplianceProgress
        {
            SectionId = section.SectionId,
            ConfirmedHoursTotal = 0m,
            RequiredHours = subject.RequiredHours,
            Status = ComplianceStatus.NonCompliant
        };
        progress.RecomputeStatus();
        _db.ChedComplianceProgresses.Add(progress);
        await _db.SaveChangesAsync();

        return CreatedAtAction(nameof(Get), new { id = section.SectionId }, new
        {
            section.SectionId,
            section.SectionCode,
            section.SubjectId,
            section.FacultyId,
            section.AyId,
            Meetings = schedules.Select(s => new { s.LabId, s.DayOfWeek, s.StartTime, s.EndTime })
        });
    }

    /// <summary>Assigns, changes, or clears (null) the faculty member for a section.</summary>
    [HttpPatch("{id:int}/faculty")]
    [Authorize(Roles = "Custodian,Administrator")]
    public async Task<IActionResult> UpdateFaculty(int id, UpdateFacultyDto dto)
    {
        var section = await _db.CourseSections.FindAsync(id);
        if (section is null) return NotFound();

        if (dto.FacultyId is not null)
        {
            var error = await ValidateFacultyAsync(dto.FacultyId);
            if (error is not null) return BadRequest(error);
        }

        section.FacultyId = dto.FacultyId;
        await _db.SaveChangesAsync();

        return Ok(new { section.SectionId, section.FacultyId, section.HasInstructorAssigned });
    }

    /// <summary>
    /// Imports the Custodian's lab schedule from a CSV file, one row per lab meeting. Rows with the
    /// same ClassCode become one class with several meetings. Missing subjects are created.
    /// Importing the same file again adds nothing twice.
    /// </summary>
    [HttpPost("schedule/import")]
    [Authorize(Roles = "Custodian,Administrator")]
    public async Task<IActionResult> ImportSchedule([FromQuery] int ayId, IFormFile file)
    {
        if (!await _db.AcademicYears.AnyAsync(a => a.AyId == ayId)) return BadRequest("AyId does not exist.");
        if (file is null || file.Length == 0) return BadRequest("Please upload a CSV file.");

        using var reader = new StreamReader(file.OpenReadStream());
        var headerLine = await reader.ReadLineAsync();
        if (headerLine is null) return BadRequest("The file is empty.");

        var headers = ParseCsvLine(headerLine).Select(NormalizeHeader).ToList();
        int Col(params string[] names) => headers.FindIndex(h => names.Contains(h));

        var classCol = Col("classcode", "sectioncode", "class");
        var subjectCol = Col("subjectcode", "subject", "title");
        var descCol = Col("description", "subjectname");
        var unitsCol = Col("units");
        var termCol = Col("term", "termtype");
        var dayCol = Col("day", "dayofweek");
        var startCol = Col("starttime", "start");
        var endCol = Col("endtime", "end");
        var labCol = Col("lab", "laboratory", "room", "roomcode");

        if (new[] { classCol, subjectCol, dayCol, startCol, endCol, labCol }.Any(c => c < 0))
            return BadRequest("The CSV needs a header row with: ClassCode, SubjectCode, Day, StartTime, EndTime, Lab. " +
                              "Description, Units and Term are used when a subject has to be created.");

        var labByKey = (await _db.Laboratories.ToListAsync())
            .GroupBy(l => NormalizeKey(l.RoomCode)).ToDictionary(g => g.Key, g => g.First());
        var subjects = (await _db.Subjects.ToListAsync())
            .GroupBy(s => NormalizeKey(s.Code)).ToDictionary(g => g.Key, g => g.First());
        var sections = (await _db.CourseSections.Include(c => c.Schedules)
            .Where(c => c.AyId == ayId).ToListAsync()).ToDictionary(c => c.SectionCode);
        var newSections = new List<CourseSection>();

        var result = new ScheduleImportResult();
        var lineNo = 1;
        string? line;
        while ((line = await reader.ReadLineAsync()) is not null)
        {
            lineNo++;
            if (string.IsNullOrWhiteSpace(line)) continue;

            var cells = ParseCsvLine(line);
            string Cell(int col) => col >= 0 && col < cells.Count ? cells[col].Trim() : string.Empty;

            var classCode = Cell(classCol);
            var subjectCode = CleanSubjectCode(Cell(subjectCol));
            if (classCode.Length == 0 || subjectCode.Length == 0)
            {
                result.Errors.Add($"Line {lineNo}: missing class code or subject code.");
                continue;
            }

            if (!LabDays.TryParse(Cell(dayCol), out var day))
            {
                result.Errors.Add($"Line {lineNo}: '{Cell(dayCol)}' is not a lab day (Monday to Friday only).");
                continue;
            }

            if (!TryParseTime(Cell(startCol), out var start) || !TryParseTime(Cell(endCol), out var end))
            {
                result.Errors.Add($"Line {lineNo}: could not read the times (use a format like 7:30 PM).");
                continue;
            }
            if (end <= start)
            {
                result.Errors.Add($"Line {lineNo}: the end time must be later than the start time.");
                continue;
            }

            if (!labByKey.TryGetValue(NormalizeKey(Cell(labCol)), out var lab))
            {
                result.Errors.Add($"Line {lineNo}: laboratory '{Cell(labCol)}' was not found.");
                continue;
            }

            // Find the subject, or create it from this row.
            var subjectKey = NormalizeKey(subjectCode);
            if (!subjects.TryGetValue(subjectKey, out var subject))
            {
                // "1st Term" or "2nd Term" is a 9-week term (27 hours); "Sem" is a semester (54 hours).
                var term = Cell(termCol).ToLowerInvariant();
                var weeks = term.Contains("term") ? 9 : term.Contains("sem") ? 18 : 0;
                if (weeks == 0)
                {
                    result.Errors.Add($"Line {lineNo}: subject '{subjectCode}' is new, so the Term column (1st Term, 2nd Term or Sem) is needed.");
                    continue;
                }

                var title = Cell(descCol);
                if (title.Length == 0) title = subjectCode;

                subject = new Subject
                {
                    Code = subjectCode.Length > 20 ? subjectCode[..20] : subjectCode,
                    Title = title.Length > 150 ? title[..150] : title,
                    Units = decimal.TryParse(Cell(unitsCol), NumberStyles.Number, CultureInfo.InvariantCulture, out var units)
                        ? (int)units : 3,
                    TermWeeks = weeks,
                    RequiredHours = weeks == 9 ? 27m : 54m
                };
                _db.Subjects.Add(subject);
                subjects[subjectKey] = subject;
                result.SubjectsCreated++;
            }

            // Find the class (by its code, in this academic year), or create it.
            if (!sections.TryGetValue(classCode, out var section))
            {
                section = new CourseSection { SectionCode = classCode, Subject = subject, AyId = ayId };
                sections[classCode] = section;
                newSections.Add(section);
                _db.CourseSections.Add(section);
                result.SectionsCreated++;
            }
            else
            {
                var sameSubject = section.SubjectId != 0
                    ? subject.SubjectId == section.SubjectId
                    : ReferenceEquals(section.Subject, subject);
                if (!sameSubject)
                {
                    result.Errors.Add($"Line {lineNo}: class {classCode} already exists with a different subject.");
                    continue;
                }
            }

            // Add the lab meeting unless the class already has it.
            var dayName = day.ToString();
            var alreadyThere = section.Schedules.Any(m =>
                m.LabId == lab.LabId && m.DayOfWeek == dayName && m.StartTime == start && m.EndTime == end);
            if (alreadyThere)
            {
                result.MeetingsAlreadyThere++;
                continue;
            }

            section.Schedules.Add(new SectionSchedule
            {
                LabId = lab.LabId,
                DayOfWeek = dayName,
                StartTime = start,
                EndTime = end
            });
            result.MeetingsAdded++;
        }

        await _db.SaveChangesAsync();

        // Every new class needs its CHED compliance row, like Create makes.
        foreach (var s in newSections)
        {
            var progress = new ChedComplianceProgress
            {
                SectionId = s.SectionId,
                ConfirmedHoursTotal = 0m,
                RequiredHours = s.Subject.RequiredHours,
                Status = ComplianceStatus.NonCompliant
            };
            progress.RecomputeStatus();
            _db.ChedComplianceProgresses.Add(progress);
        }
        await _db.SaveChangesAsync();

        return Ok(result);
    }

    private async Task<string?> ValidateFacultyAsync(string facultyId)
    {
        var user = await _userManager.FindByIdAsync(facultyId);
        if (user is null || !user.IsActive || !await _userManager.IsInRoleAsync(user, "Faculty"))
            return "FacultyId must belong to an active user with the Faculty role.";
        return null;
    }

    /// <summary>The lab meetings of a class, in week order, for the JSON responses.</summary>
    private static IEnumerable<object> MeetingsOf(CourseSection c) =>
        c.Schedules
            .OrderBy(m => LabDays.Order(m.DayOfWeek)).ThenBy(m => m.StartTime)
            .Select(m => (object)new
            {
                m.ScheduleId,
                m.DayOfWeek,
                m.StartTime,
                m.EndTime,
                Laboratory = new { m.Laboratory.LabId, m.Laboratory.Name, m.Laboratory.RoomCode }
            });

    /// <summary>The class list of one section.</summary>
    [HttpGet("{id:int}/roster")]
    [Authorize(Roles = "Custodian,LabAssistant,Administrator")]
    public async Task<IActionResult> GetRoster(int id)
    {
        if (!await _db.CourseSections.AnyAsync(c => c.SectionId == id)) return NotFound();

        var roster = await _db.SectionEnrollments
            .Where(e => e.SectionId == id)
            .OrderBy(e => e.Student.LastName).ThenBy(e => e.Student.FirstName)
            .Select(e => new { e.StudentId, e.Student.SchoolId, Name = e.Student.FullName })
            .ToListAsync();

        return Ok(roster);
    }

    /// <summary>
    /// Imports a class list from a CSV file. Header row needed, with a StudentId column and, for
    /// students who have no account yet, LastName and FirstName (MiddleName and Email are optional).
    /// Missing student accounts are created with a temporary password.
    /// </summary>
    [HttpPost("{id:int}/roster/import")]
    [Authorize(Roles = "Custodian,LabAssistant,Administrator")]
    public async Task<IActionResult> ImportRoster(int id, IFormFile file)
    {
        if (!await _db.CourseSections.AnyAsync(c => c.SectionId == id)) return NotFound();
        if (file is null || file.Length == 0) return BadRequest("Please upload a CSV file.");

        using var reader = new StreamReader(file.OpenReadStream());
        var headerLine = await reader.ReadLineAsync();
        if (headerLine is null) return BadRequest("The file is empty.");

        var headers = ParseCsvLine(headerLine).Select(NormalizeHeader).ToList();
        int Col(params string[] names) => headers.FindIndex(h => names.Contains(h));

        var idCol = Col("studentid", "schoolid", "idnumber", "id", "stdidno");
        var nameCol = Col("stdname", "fullname", "name");
        var firstCol = Col("firstname", "first");
        var lastCol = Col("lastname", "last", "surname");
        var middleCol = Col("middlename", "middle");
        var emailCol = Col("email", "emailaddress");

        if (idCol < 0) return BadRequest("The CSV needs a header row with a StudentId column.");

        var result = new RosterImportResult();
        var onRoster = (await _db.SectionEnrollments
            .Where(e => e.SectionId == id).Select(e => e.StudentId).ToListAsync()).ToHashSet();

        var lineNo = 1;
        string? line;
        while ((line = await reader.ReadLineAsync()) is not null)
        {
            lineNo++;
            if (string.IsNullOrWhiteSpace(line)) continue;

            var cells = ParseCsvLine(line);
            string Cell(int col) => col >= 0 && col < cells.Count ? cells[col].Trim() : string.Empty;

            var schoolId = Cell(idCol);
            if (schoolId.Length == 0)
            {
                result.Errors.Add($"Line {lineNo}: missing student ID.");
                continue;
            }

            var student = await _db.Users.FirstOrDefaultAsync(u => u.SchoolId == schoolId);
            if (student is null)
            {
                var first = Cell(firstCol);
                var last = Cell(lastCol);

                // The university's class list has one name column, last name first, in capitals
                // (for example "SANTOS MARIA CLARA"). Split at the first space and tidy the capitals.
                var fullName = Cell(nameCol);
                if ((first.Length == 0 || last.Length == 0) && fullName.Length > 0)
                {
                    var parts = fullName.Split(' ', 2, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
                    last = TidyName(parts[0]);
                    first = TidyName(parts.Length > 1 ? parts[1] : parts[0]);
                }
                if (first.Length == 0 || last.Length == 0)
                {
                    result.Errors.Add($"Line {lineNo}: {schoolId} has no account and no name to create one.");
                    continue;
                }

                var email = Cell(emailCol);
                if (email.Length == 0) email = $"{schoolId.ToLowerInvariant()}@student.labtrack.local";
                var middle = Cell(middleCol);

                student = new ApplicationUser
                {
                    UserName = email,
                    Email = email,
                    FirstName = first,
                    MiddleName = middle.Length > 0 ? middle : null,
                    LastName = last,
                    SchoolId = schoolId,
                    EmailConfirmed = true,
                    MustChangePassword = true
                };

                var created = await _userManager.CreateAsync(student, DefaultPassword.ForStudent(schoolId));
                if (!created.Succeeded)
                {
                    result.Errors.Add($"Line {lineNo}: could not create {schoolId} ({string.Join("; ", created.Errors.Select(e => e.Description))}).");
                    continue;
                }

                await _userManager.AddToRoleAsync(student, "Student");
                result.AccountsCreated++;
            }
            else if (!await _userManager.IsInRoleAsync(student, "Student"))
            {
                result.Errors.Add($"Line {lineNo}: {schoolId} belongs to a non-student account.");
                continue;
            }

            if (!onRoster.Add(student.Id))
            {
                result.AlreadyOnRoster++;
                continue;
            }

            _db.SectionEnrollments.Add(new SectionEnrollment { SectionId = id, StudentId = student.Id });
            result.Enrolled++;
        }

        await _db.SaveChangesAsync();
        return Ok(result);
    }

    private static string NormalizeHeader(string header) =>
        new string(header.Where(char.IsLetterOrDigit).ToArray()).ToLowerInvariant();
    /// <summary>Letters and digits only, upper case, so "CL 1" and "CL1" (or "IT 6" and "IT6") match.</summary>
    private static string NormalizeKey(string text) =>
        new string(text.Where(char.IsLetterOrDigit).ToArray()).ToUpperInvariant();

    /// <summary>The lab schedule writes subject codes like "IT 6/L" (the lab part); the subject is "IT 6".</summary>
    private static string CleanSubjectCode(string code)
    {
        var value = code.Trim();
        if (value.EndsWith("/L", StringComparison.OrdinalIgnoreCase))
            value = value[..^2].Trim();
        return value;
    }

    /// <summary>Reads times like "7:30 PM", "07:30 pm" or "19:30".</summary>
    private static bool TryParseTime(string text, out TimeOnly time) =>
        TimeOnly.TryParse(text.Trim(), CultureInfo.InvariantCulture, DateTimeStyles.None, out time);
    private static string TidyName(string name) =>
    CultureInfo.InvariantCulture.TextInfo.ToTitleCase(name.ToLowerInvariant());

    /// <summary>Splits one CSV line, handling quoted cells such as "Dela Cruz, Juan".</summary>
    private static List<string> ParseCsvLine(string line)
    {
        var cells = new List<string>();
        var current = new StringBuilder();
        var inQuotes = false;

        for (var i = 0; i < line.Length; i++)
        {
            var c = line[i];
            if (inQuotes)
            {
                if (c == '"' && i + 1 < line.Length && line[i + 1] == '"') { current.Append('"'); i++; }
                else if (c == '"') inQuotes = false;
                else current.Append(c);
            }
            else if (c == '"') inQuotes = true;
            else if (c == ',') { cells.Add(current.ToString()); current.Clear(); }
            else current.Append(c);
        }

        cells.Add(current.ToString());
        return cells;
    }
}