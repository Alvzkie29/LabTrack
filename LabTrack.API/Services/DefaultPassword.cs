namespace LabTrack.Api.Services;

public static class DefaultPassword
{
    /// <summary>Starting password for student accounts: "Lab@" followed by the student ID, e.g. Lab@123456.</summary>
    public static string ForStudent(string schoolId) => $"Lab@{schoolId}";
}