using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace LabTrack.Api.Models;

public class Laboratory
{
    public int LabId { get; set; }

    [MaxLength(100)]
    public string Name { get; set; } = string.Empty;

    [MaxLength(20)]
    public string RoomCode { get; set; } = string.Empty; // e.g. "CL1"

    public int Capacity { get; set; }

    public bool IsActive { get; set; } = true;

    public ICollection<Workstation> Workstations { get; set; } = new List<Workstation>();
}

public enum WorkstationStatus
{
    Offline = 0,
    Active = 1,
    Idle = 2
}

public class Workstation
{
    public int WorkstationId { get; set; }

    public int LabId { get; set; }
    public Laboratory Laboratory { get; set; } = null!;

    /// <summary>Physical/hardware identifier for the PC (e.g. hostname or MAC-derived id).</summary>
    [MaxLength(100)]
    public string DeviceIdentifier { get; set; } = string.Empty;

    /// <summary>Human-readable seat label used for the blueprint layout (e.g. "A1", "Row2-Seat7").</summary>
    [MaxLength(20)]
    public string SeatLabel { get; set; } = string.Empty;

    public WorkstationStatus Status { get; set; } = WorkstationStatus.Offline;

    public DateTime? LastHeartbeat { get; set; }

    public ICollection<AttendanceSession> AttendanceSessions { get; set; } = new List<AttendanceSession>();
}