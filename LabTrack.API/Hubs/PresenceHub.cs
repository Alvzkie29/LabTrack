using System.Collections.Concurrent;
using LabTrack.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.SignalR;

namespace LabTrack.Api.Hubs;

public record OnlineStaff(string UserId, string FullName, string Role);

// Track connections separately so closing one tab does not remove another tab.
public class StaffPresence
{
    private readonly ConcurrentDictionary<string, OnlineStaff> connections = new();
    public void Add(string connectionId, OnlineStaff user) => connections[connectionId] = user;
    public void Remove(string connectionId) => connections.TryRemove(connectionId, out _);
    public OnlineStaff[] Snapshot() => connections.Values.DistinctBy(u => u.UserId)
        .OrderBy(u => u.FullName).ToArray();
}

[Authorize(Roles = "Administrator,Custodian,LabAssistant")]
public class PresenceHub(StaffPresence presence, UserManager<ApplicationUser> users) : Hub
{
    public override async Task OnConnectedAsync()
    {
        var user = await users.GetUserAsync(Context.User!);
        if (user is null || !user.IsActive) { Context.Abort(); return; }
        var roles = await users.GetRolesAsync(user);
        var role = roles.FirstOrDefault(r => r is "Administrator" or "Custodian" or "LabAssistant");
        if (role is null) { Context.Abort(); return; }
        presence.Add(Context.ConnectionId, new OnlineStaff(user.Id, user.FullName, role));
        await Clients.All.SendAsync("PresenceChanged", presence.Snapshot());
        await base.OnConnectedAsync();
    }

    public OnlineStaff[] GetOnlineUsers() => presence.Snapshot();

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        presence.Remove(Context.ConnectionId);
        await Clients.All.SendAsync("PresenceChanged", presence.Snapshot());
        await base.OnDisconnectedAsync(exception);
    }
}
