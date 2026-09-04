using LabTrack.Api.Data;
using LabTrack.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace LabTrack.Api.Controllers;

public class CreateSubjectDto
{
    public string Code { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public int Units { get; set; }
    public decimal RequiredHours { get; set; }
    public int TermWeeks { get; set; }
}

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class SubjectsController : ControllerBase
{
    private readonly ApplicationDbContext _db;
    public SubjectsController(ApplicationDbContext db) => _db = db;

    [HttpGet]
    public async Task<IActionResult> GetAll() => Ok(await _db.Subjects.ToListAsync());

    [HttpGet("{id:int}")]
    public async Task<IActionResult> Get(int id)
    {
        var subject = await _db.Subjects.FindAsync(id);
        return subject is null ? NotFound() : Ok(subject);
    }

    [HttpPost]
    [Authorize(Roles = "Administrator")]
    public async Task<IActionResult> Create(CreateSubjectDto dto)
    {
        if (await _db.Subjects.AnyAsync(s => s.Code == dto.Code))
            return BadRequest("A subject with this code already exists.");

        var subject = new Subject
        {
            Code = dto.Code,
            Title = dto.Title,
            Description = dto.Description,
            Units = dto.Units,
            RequiredHours = dto.RequiredHours,
            TermWeeks = dto.TermWeeks
        };

        _db.Subjects.Add(subject);
        await _db.SaveChangesAsync();
        return CreatedAtAction(nameof(Get), new { id = subject.SubjectId }, new
        {
            subject.SubjectId,
            subject.Code,
            subject.Title,
            subject.Description,
            subject.Units,
            subject.RequiredHours,
            subject.TermWeeks
        });
    }

    [HttpPut("{id:int}")]
    [Authorize(Roles = "Administrator")]
    public async Task<IActionResult> Update(int id, CreateSubjectDto dto)
    {
        var subject = await _db.Subjects.FindAsync(id);
        if (subject is null) return NotFound();

        subject.Title = dto.Title;
        subject.Description = dto.Description;
        subject.Units = dto.Units;
        subject.RequiredHours = dto.RequiredHours;
        subject.TermWeeks = dto.TermWeeks;

        await _db.SaveChangesAsync();
        return Ok(new
        {
            subject.SubjectId,
            subject.Code,
            subject.Title,
            subject.Description,
            subject.Units,
            subject.RequiredHours,
            subject.TermWeeks
        });
    }
}