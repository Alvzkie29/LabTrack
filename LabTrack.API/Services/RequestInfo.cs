using Microsoft.AspNetCore.Mvc;

namespace LabTrack.Api.Services;

public static class RequestInfo
{
    /// <summary>
    /// The IP address the request came from, for the audit log. On the lab network this is the
    /// workstation that sent it, so an audit entry says where the action happened. IPv6-mapped
    /// IPv4 addresses are written in their plain form (127.0.0.1 rather than ::ffff:127.0.0.1).
    /// </summary>
    public static string? CallerIp(this ControllerBase controller)
    {
        var ip = controller.HttpContext.Connection.RemoteIpAddress;
        if (ip is null) return null;
        if (ip.IsIPv4MappedToIPv6) ip = ip.MapToIPv4();
        return ip.ToString();
    }
}