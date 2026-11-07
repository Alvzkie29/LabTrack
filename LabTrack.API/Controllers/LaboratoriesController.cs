using LabTrack.Api.Data;
using LabTrack.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace LabTrack.Api.Controllers;

public class CreateLaboratoryDto
{
    public string Name { get; set; } = string.Empty;
    public string RoomCode { get; set; } = string.Empty;
    public int Capacity { get; set; }
}

public class CreateWorkstationDto
{
    public int LabId { get; set; }
    public string PcIdentifier { get; set; } = string.Empty;
    public string SeatLabel { get; set; } = string.Empty;
}

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class LaboratoriesController : ControllerBase
{
    private readonly ApplicationDbContext _db;
    public LaboratoriesController(ApplicationDbContext db) => _db = db;

    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var labs = await _db.Laboratories
            .Select(l => new
            {
                l.LabId,
                l.Name,
                l.RoomCode,
                l.Capacity,
                l.IsActive,
                WorkstationCount = l.Workstations.Count
            })
            .ToListAsync();

        return Ok(labs);
    }

    /// <summary>Lists the workstations registered in one lab (static data, no live status).</summary>
    [HttpGet("{id:int}/workstations")]
    public async Task<IActionResult> GetWorkstations(int id)
    {
        var labExists = await _db.Laboratories.AnyAsync(l => l.LabId == id);
        if (!labExists) return NotFound();

        var workstations = await _db.Workstations
            .Where(w => w.LabId == id)
            .OrderBy(w => w.SeatLabel)
            .Select(w => new { w.WorkstationId, w.SeatLabel, w.PcIdentifier, w.IsActive })
            .ToListAsync();

        return Ok(workstations);
    }

    [HttpPost]
    [Authorize(Roles = "Administrator")]
    public async Task<IActionResult> Create(CreateLaboratoryDto dto)
    {
        var lab = new Laboratory
        {
            Name = dto.Name,
            RoomCode = dto.RoomCode,
            Capacity = dto.Capacity
        };

        _db.Laboratories.Add(lab);
        await _db.SaveChangesAsync();

        return CreatedAtAction(nameof(GetAll), new { },
            new { lab.LabId, lab.Name, lab.RoomCode, lab.Capacity, lab.IsActive });
    }

    [HttpPut("{id:int}")]
    [Authorize(Roles = "Administrator")]
    public async Task<IActionResult> Update(int id, CreateLaboratoryDto dto)
    {
        var lab = await _db.Laboratories.FindAsync(id);
        if (lab is null) return NotFound();

        lab.Name = dto.Name;
        lab.RoomCode = dto.RoomCode;
        lab.Capacity = dto.Capacity;

        await _db.SaveChangesAsync();
        return Ok(new { lab.LabId, lab.Name, lab.RoomCode, lab.Capacity, lab.IsActive });
    }

    [HttpDelete("{id:int}")]
    [Authorize(Roles = "Administrator")]
    public async Task<IActionResult> Deactivate(int id)
    {
        var lab = await _db.Laboratories.FindAsync(id);
        if (lab is null) return NotFound();

        lab.IsActive = false;
        await _db.SaveChangesAsync();
        return NoContent();
    }
}

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class WorkstationsController : ControllerBase
{
    private readonly ApplicationDbContext _db;
    public WorkstationsController(ApplicationDbContext db) => _db = db;

    [HttpGet("{id:int}")]
    public async Task<IActionResult> Get(int id)
    {
        var ws = await _db.Workstations.FindAsync(id);
        return ws is null ? NotFound() : Ok(ws);
    }

    [HttpPost]
    [Authorize(Roles = "Administrator")]
    public async Task<IActionResult> Create(CreateWorkstationDto dto)
    {
        var labExists = await _db.Laboratories.AnyAsync(l => l.LabId == dto.LabId);
        if (!labExists) return BadRequest("LabId does not exist.");

        var seatTaken = await _db.Workstations
            .AnyAsync(w => w.LabId == dto.LabId && w.SeatLabel == dto.SeatLabel);
        if (seatTaken)
            return BadRequest($"Seat '{dto.SeatLabel}' is already assigned to another workstation in this lab.");

        var pcIdTaken = await _db.Workstations.AnyAsync(w => w.PcIdentifier == dto.PcIdentifier);
        if (pcIdTaken)
            return BadRequest($"PC identifier '{dto.PcIdentifier}' is already in use.");

        var ws = new Workstation
        {
            LabId = dto.LabId,
            PcIdentifier = dto.PcIdentifier,
            SeatLabel = dto.SeatLabel
        };

        _db.Workstations.Add(ws);
        await _db.SaveChangesAsync();

        return CreatedAtAction(nameof(Get), new { id = ws.WorkstationId },
            new { ws.WorkstationId, ws.LabId, ws.PcIdentifier, ws.SeatLabel, ws.IsActive });
    }
}