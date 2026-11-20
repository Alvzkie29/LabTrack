using LabTrack.Api.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace LabTrack.Api.Services;

/// <summary>
/// Sends the weekly reminders on the set day, from the set hour (Philippine time). It checks every
/// 15 minutes for the next 24 hours, so it also catches up if the server was off at that hour.
/// Classes already reminded this week are skipped, so a restart never sends twice.
/// </summary>
public class ReminderScheduler : BackgroundService
{
    private readonly IServiceScopeFactory _scopes;
    private readonly EmailOptions _options;
    private readonly ILogger<ReminderScheduler> _log;

    public ReminderScheduler(IServiceScopeFactory scopes, IOptions<EmailOptions> options, ILogger<ReminderScheduler> log)
    {
        _scopes = scopes;
        _options = options.Value;
        _log = log;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!_options.Configured)
        {
            _log.LogInformation("Weekly email reminders are off: the Gmail account is not set in appsettings.json.");
            return;
        }
        if (!Enum.TryParse<DayOfWeek>(_options.SendDay, true, out var sendDay)) sendDay = DayOfWeek.Monday;

        using var timer = new PeriodicTimer(TimeSpan.FromMinutes(15));
        do
        {
            try
            {
                var now = ReminderService.LocalNow;
                // From the send hour on the send day, for 24 hours (to catch up after downtime).
                var sendMoment = ReminderService.MondayOf(DateOnly.FromDateTime(now))
                    .AddDays(((int)sendDay + 6) % 7)
                    .ToDateTime(new TimeOnly(Math.Clamp(_options.SendHour, 0, 23), 0));
                if (now >= sendMoment && now < sendMoment.AddDays(1))
                {
                    using var scope = _scopes.CreateScope();
                    var service = scope.ServiceProvider.GetRequiredService<ReminderService>();
                    // The Custodian's switch on the Email Reminders page, checked each time.
                    if (!await service.AutoSendAsync(stoppingToken)) continue;
                    var result = await service.SendWeeklyAsync(stoppingToken);
                    if (result.Sent + result.Failed > 0)
                        _log.LogInformation("Weekly reminders: {Sent} sent, {Failed} failed, {NoEmail} without an email.",
                            result.Sent, result.Failed, result.NoEmail);
                }
            }
            catch (Exception ex) when (!stoppingToken.IsCancellationRequested)
            {
                _log.LogWarning(ex, "Weekly reminders could not run.");
            }
        } while (await timer.WaitForNextTickAsync(stoppingToken));
    }
}
