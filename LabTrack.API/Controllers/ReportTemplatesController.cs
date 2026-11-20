using System.Security.Claims;
using LabTrack.Api.Data;
using LabTrack.Api.Models;
using LabTrack.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace LabTrack.Api.Controllers;

/// <summary>
/// The Excel template the weekly report is filled from. The Custodian uploads the office's own
/// workbook; the dashboard fills it in the browser. Until one is uploaded, the dashboard uses the
/// default template it ships with. The file is kept in App_Data, outside wwwroot, so only signed-in
/// staff can download it.
/// </summary>
[ApiController]
[Route("api/reporttemplates")]
[Authorize(Roles = "LabAssistant,Custodian,Administrator")]
public class ReportTemplatesController : ControllerBase
{
    private const long MaxBytes = 5 * 1024 * 1024;
    private const string XlsxType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

    private readonly ApplicationDbContext _db;
    private readonly string _path;

    public ReportTemplatesController(ApplicationDbContext db, IWebHostEnvironment env)
    {
        _db = db;
        _path = Path.Combine(env.ContentRootPath, "App_Data", "templates", "weekly-report.xlsx");
    }

    /// <summary>The uploaded template, or 404 when none has been uploaded (the dashboard then uses its default).</summary>
    [HttpGet("weekly")]
    public IActionResult Get()
    {
        if (!System.IO.File.Exists(_path)) return NotFound(new { message = "No template uploaded; the default is used." });
        var info = new FileInfo(_path);
        Response.Headers["X-Template-Updated"] = info.LastWriteTimeUtc.ToString("o");
        return PhysicalFile(_path, XlsxType, "weekly-report-template.xlsx");
    }

    /// <summary>Replace the template. The dashboard checks the sheets and placeholders before sending it.</summary>
    [HttpPut("weekly")]
    [Authorize(Roles = "Custodian,Administrator")]
    [RequestSizeLimit(MaxBytes + 64 * 1024)]
    public async Task<IActionResult> Upload(IFormFile? file)
    {
        if (file is null || file.Length == 0) return BadRequest(new { message = "Choose an .xlsx file." });
        if (file.Length > MaxBytes) return BadRequest(new { message = "The file is larger than 5 MB." });
        if (!file.FileName.EndsWith(".xlsx", StringComparison.OrdinalIgnoreCase))
            return BadRequest(new { message = "Only .xlsx files are accepted. In Excel, use Save As > Excel Workbook." });

        // An .xlsx is a zip file, which starts with "PK".
        await using (var check = file.OpenReadStream())
        {
            var head = new byte[2];
            if (await check.ReadAsync(head) < 2 || head[0] != (byte)'P' || head[1] != (byte)'K')
                return BadRequest(new { message = "The file is not a valid .xlsx workbook." });
        }

        Directory.CreateDirectory(Path.GetDirectoryName(_path)!);
        var temp = _path + ".uploading";
        await using (var output = System.IO.File.Create(temp))
        await using (var input = file.OpenReadStream())
            await input.CopyToAsync(output);
        System.IO.File.Move(temp, _path, overwrite: true);

        await Audit("ReportTemplateUploaded", $"File={file.FileName}, Bytes={file.Length}");
        return Ok(new { message = "Template saved." });
    }

    /// <summary>Go back to the default template.</summary>
    [HttpDelete("weekly")]
    [Authorize(Roles = "Custodian,Administrator")]
    public async Task<IActionResult> Reset()
    {
        if (System.IO.File.Exists(_path)) System.IO.File.Delete(_path);
        await Audit("ReportTemplateReset", "Back to the default template");
        return NoContent();
    }

    private async Task Audit(string action, string details)
    {
        _db.AuditLogs.Add(new AuditLog
        {
            UserId = User.FindFirst("sub")?.Value ?? User.FindFirst(ClaimTypes.NameIdentifier)?.Value,
            Action = action,
            EntityType = "ReportTemplate",
            EntityId = "weekly",
            Details = details,
            IpAddress = this.CallerIp(),
        });
        await _db.SaveChangesAsync();
    }
}
