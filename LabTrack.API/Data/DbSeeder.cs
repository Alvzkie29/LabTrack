using LabTrack.Api.Models;
using Microsoft.AspNetCore.Identity;

namespace LabTrack.Api.Data;

public static class DbSeeder
{
    public static readonly string[] Roles = { "Administrator", "Custodian", "LabAssistant", "Student" };

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
}