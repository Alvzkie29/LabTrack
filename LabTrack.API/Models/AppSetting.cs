using System.ComponentModel.DataAnnotations;

namespace LabTrack.Api.Models;

/// <summary>
/// A setting staff can change from the dashboard without restarting the API, stored by key.
/// "Reminders.AutoSend" = "on" or "off": whether the weekly reminder emails go out by themselves.
/// </summary>
public class AppSetting
{
    [Key]
    [MaxLength(100)]
    public string Key { get; set; } = string.Empty;

    [MaxLength(500)]
    public string Value { get; set; } = string.Empty;

    public string? UpdatedBy { get; set; }
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
