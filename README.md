# LabTrack 2026

LabTrack manages university computer laboratory usage, attendance, schedules, and compliance reporting. This workspace contains a staff web application, its API, and a Windows workstation agent.

This README records the source baseline reviewed on November 20, 2026, before local setup and UI/UX changes. Setup commands below are instructions; the application has not yet been installed or run as part of this review.

## Workspace layout

```text
D:/LabTrack/
|-- README.md
|-- LabTrack/                    # Web/API Git repository
|   |-- LabTrack.API.slnx
|   |-- LabTrack.API/            # ASP.NET Core API, models, migrations, seed data
|   `-- labtrack_frontend/       # React staff dashboard
`-- LabTrackPCAgent/             # Separate Windows agent Git repository
    |-- LabTrackAgent.slnx
    |-- AgentConfig.cs
    |-- MainWindow.xaml
    `-- Services/ApiClient.cs
```

The workspace root is outside the two nested Git repositories. This README is a workspace guide; it will not be included in commits made inside either repository unless deliberately copied or moved there.

## Architecture and stack

| Component         | Stack                                                        | Responsibility                                                   |
| ----------------- | ------------------------------------------------------------ | ---------------------------------------------------------------- |
| Staff dashboard   | React 19, TypeScript, Vite 6, React Router 7                 | Staff navigation and laboratory management screens               |
| UI library        | Tailwind CSS 4, Radix UI, Lucide, Recharts, Sonner           | Styling, controls, icons, charts, notifications                  |
| Web data layer    | TanStack React Query and a shared fetch client               | API requests, caching, authentication headers                    |
| API               | ASP.NET Core / .NET 10, Entity Framework Core 10, SQL Server | Identity, authorization, attendance, schedules, reports, imports |
| Workstation agent | .NET 10 Windows WPF, self-contained win-x64 publishing       | Workstation login/session interface and API communication        |

The browser calls the API through `src/api/client.ts`. JWTs are stored under `labtrack_token` in local storage. The API uses ASP.NET Core Identity and JWT bearer authentication. The agent has a separate API client and per-machine configuration.

## Local setup

### Prerequisites

- Node.js and npm compatible with Vite 6; the frontend includes `package-lock.json` for `npm ci`.
- .NET 10 SDK for the API and agent.
- SQL Server; the checked-in configuration targets a local SQL Server Express instance using Windows authentication.
- Windows for building and running the WPF agent.

### 1. Configure and run the API

From the workspace root:

```powershell
cd D:\LabTrack\LabTrack\LabTrack.API
dotnet restore
dotnet user-secrets set "ConnectionStrings:DefaultConnection" 'Server=.\SQLEXPRESS;Database=LabTrackDb;Trusted_Connection=True;TrustServerCertificate=True;'
dotnet user-secrets set "Jwt:Key" '<replace-with-a-random-secret-at-least-32-characters-long>'
dotnet dev-certs https --trust
dotnet run --launch-profile https
```

Replace the SQL Server connection string if your instance differs. The project already declares `UserSecretsId`, so `dotnet user-secrets init` is unnecessary. Enter an actual JWT secret in place of the placeholder.

Debug builds use `UseAppHost=false`, so `dotnet run` launches the API DLL through the installed .NET host. Release builds retain the default executable behavior. Windows Application Control can block the unsigned DLL as well as the executable; this setting does not resolve a DLL signing-policy block. If that occurs, check Windows Security > App & browser control > Smart App Control settings. On a personal development PC, turning Smart App Control off removes that protection system-wide; on a managed PC, ask the administrator for an approved development policy or signing setup.

- HTTPS API: `https://localhost:7173`
- HTTP endpoint: `http://localhost:5262`
- Development Swagger UI: `https://localhost:7173/swagger`
- Default allowed browser origins: `http://localhost:3000` and `http://localhost:5173`

Startup automatically applies EF migrations and seeds roles and the administrator. Development mode additionally seeds demo accounts, laboratories, workstations, subjects, and schedules. Use a dedicated development database: launching the API performs database writes.

Configuration lives in `appsettings.json` and `appsettings.Development.json`; use user secrets for local overrides. `Sync:ApiKey` also exists, and the development settings contain a fixed value. Replace it for any shared deployment and keep real secrets outside source control.

### 2. Configure and run the dashboard

Open a second terminal:

```powershell
cd D:\LabTrack\LabTrack\labtrack_frontend
npm ci
Set-Content -Path .env.local -Value 'VITE_API_URL=https://localhost:7173'
npm run dev
```

Open `http://localhost:3000`. The API URL is an origin **without `/api`**; API modules supply their own request paths. The same HTTPS origin is the fallback when `VITE_API_URL` is unset. The checked-in `.env.example` is currently empty.

If Vite selects another port because 3000 is occupied, free port 3000 or configure the API's `Cors:AllowedOrigins` for the actual browser origin. Restart Vite after changing environment values. If browser requests fail, first check that the API is running and its development certificate is trusted.

### 3. Use seeded development accounts

The following credentials come from `LabTrack.API/Data/DbSeeder.cs` and apply when the accounts are first created. Existing account passwords are not reset by seeding.

| Role                 | Email                      | Initial password |
| -------------------- | -------------------------- | ---------------- |
| Administrator        | `admin@labtrack.local`     | `Admin@12345`    |
| Custodian            | `custodian@labtrack.local` | `Custodian@123`  |
| Laboratory assistant | `assistant@labtrack.local` | `Assistant@123`  |
| Faculty              | `faculty@labtrack.local`   | `Faculty@123`    |
| Student              | `student@labtrack.local`   | `Student@123`    |

Only the administrator is seeded outside Development. Change initial passwords before shared use. The web interface is for Administrator, Custodian, and LabAssistant roles; Faculty and Student have no allowed staff-page paths in the frontend permission map.

### 4. Configure the workstation agent when needed

#### PC agent login credentials

Enter a School ID below in the agent's **Student ID** field, followed by its password. You can also use the email address as the login identifier.

| Purpose            | Role                 | School ID    | Email                      | Initial password |
| ------------------ | -------------------- | ------------ | -------------------------- | ---------------- |
| Student attendance | Student              | `2026-0001`  | `student@labtrack.local`   | `Student@123`    |
| Maintenance unlock | Administrator        | `ADMIN-0001` | `admin@labtrack.local`     | `Admin@12345`    |
| Maintenance unlock | Custodian            | `CUST-0001`  | `custodian@labtrack.local` | `Custodian@123`  |
| Maintenance unlock | Laboratory assistant | `ASST-0001`  | `assistant@labtrack.local` | `Assistant@123`  |

These initial credentials are defined in `LabTrack/LabTrack.API/Data/DbSeeder.cs`. The student, custodian, and assistant accounts are created when the API runs in **Development**; only the administrator is seeded outside Development. Seeding does not reset existing passwords.

Student login lets you select and confirm a class scheduled in the workstation's laboratory today to record attendance. Staff login unlocks the PC for maintenance and records an audit entry without recording attendance. Faculty accounts cannot log in through the PC agent.

Keep the API running and configure a workstation that exists in the database. Change these development passwords before shared use.

#### Run and configure the agent

The web UI can be reviewed without launching the agent. When testing workstation flows:

```powershell
cd D:\LabTrack\LabTrackPCAgent
dotnet restore
dotnet build
dotnet run
```

`AgentConfig.Load()` reads `agent.config.json` beside the executable and creates defaults when the file is missing. Configure that file for the target workstation:

```json
{
  "ApiBaseUrl": "https://localhost:7173/api",
  "PcIdentifier": "CL1-PC01",
  "LabId": 1,
  "LockEnabled": false
}
```

Unlike the browser setting, the agent base URL **includes `/api`**. Match the workstation identifier and laboratory ID to database records. Keep locking disabled while reviewing the agent UI on a development machine.

#### Lab lock-screen demo

For a lab demo, set `"LockEnabled": true` in `LabTrackPCAgent/bin/Debug/net10.0-windows/win-x64/agent.config.json`, then run the agent. Start the API first and verify the workstation is registered. This setting applies to the executable in that output folder.

Lock mode opens a borderless, full-screen login window with no close button and blocks common exit shortcuts. Sign in as student `2026-0001` with `Student@123`, select a class available today, and confirm attendance to access the desktop. Accounts marked as requiring a new password must change it first. Staff can sign in as `ADMIN-0001` with `Admin@12345` to unlock for maintenance without attendance. Use current passwords if these accounts have been changed.

The session bar's up-arrow hides the details in a compact **Show session** tab; click that tab to expand it again. Hiding the details keeps the session active. **End Session** still asks for confirmation before returning the PC to the login lock screen. For recovery if login is unavailable, use **Ctrl+Alt+Delete > Sign out**; this ends the Windows session and closes unsaved applications. To return to normal development mode, set `"LockEnabled": false` before the next agent launch. This setting does not install automatic startup at Windows sign-in.

Publish using `dotnet publish -c Release -r win-x64`. The project already enables self-contained, single-file deployment. Configure `agent.config.json` beside the published executable for each machine.

## Current web screens

| Route                 | Purpose                               |
| --------------------- | ------------------------------------- |
| `/`                   | Staff login                           |
| `/dashboard`          | Laboratory overview                   |
| `/workstation`        | Workstation monitoring and management |
| `/courses`            | Course sections                       |
| `/courses/:sectionId` | Section details                       |
| `/confirm-session`    | Session review and confirmation       |
| `/imports`            | Data imports                          |
| `/at-risk`            | At-risk monitoring                    |
| `/attendance-report`  | Attendance reports                    |
| `/compliance-report`  | Compliance reports                    |
| `/audit-log`          | Audit history                         |
| `/schedule`           | Schedules                             |
| `/users`              | User administration                   |
| `/settings`           | Account details and password changes  |

Navigation and page access vary by role. Review `src/contexts/RoleContext.tsx`, page restrictions, and API authorization together when changing access behavior. `RequireAuth` checks the session; it does not itself implement per-route role permissions.

## Starting points for UI/UX work

Paths below are relative to `LabTrack/labtrack_frontend/`.

| File or directory                 | What to change or inspect                             |
| --------------------------------- | ----------------------------------------------------- |
| `src/App.tsx`                     | Routes and provider composition                       |
| `src/components/AppShell.tsx`     | Shared sidebar, top bar, navigation, responsive shell |
| `src/pages/client/AppLayout.tsx`  | Shell and toast composition                           |
| `src/pages/auth/StaffLogin.tsx`   | Login experience                                      |
| `src/pages/client/`               | Individual staff screens                              |
| `src/components/ui/`              | Shared UI primitives                                  |
| `src/index.css` and `src/App.css` | Theme tokens, global styling, print behavior          |
| `src/contexts/AuthContext.tsx`    | Authenticated user/session state                      |
| `src/contexts/RoleContext.tsx`    | Role permissions and compatibility state              |
| `src/api/`                        | API contracts and request helpers                     |

The current shell uses maroon (`#800000`) and gold (`#F4C430`) branding with neutral surfaces, compact controls, and a collapsible sidebar. Global font stacks name Inter and JetBrains Mono. Styling combines shared CSS variables, Tailwind utilities, and inline values in components, so a theme change will need review beyond the global stylesheet.

Before editing, capture desktop and narrow-screen baselines for the three staff roles. Review navigation, table density, filters, forms, loading/empty/error states, keyboard focus, and report printing. Preserve request payloads and role behavior while changing presentation, then verify the relevant workflows against the running API.

## Validation and known baseline limits

Run frontend checks from `LabTrack/labtrack_frontend/`:

```powershell
npm run build
npx tsc -b --noEmit
npm run preview
```

`npm run build` explicitly uses `tsc -b --noCheck`, so a successful production bundle does not establish TypeScript correctness. Run the separate type check to identify baseline issues before UI changes. The package currently defines no `test` or `lint` scripts, although an ESLint configuration is present.

Build the API with `dotnet build` from `LabTrack/LabTrack.API/`, and build the agent separately from `LabTrackPCAgent/`. No automated test projects were found in this scan.

Other observations to keep in mind:

- Mock-data utility files remain, but current client pages use API modules. An old comment in `src/api/queryClient.ts` still describes pages as mock-backed; do not treat that comment as the current architecture.
- `RoleContext` retains a no-op `setRole` compatibility method and local assigned-lab state initialized to `CL2`; confirm real assignment requirements before using it for new UI behavior.
- The API registers SignalR services and JWT handling for `/hubs`, but `Program.cs` currently maps no hub endpoint. Do not assume live updates are connected because the dependency exists.
- The agent references SQLite, but offline persistence and synchronization should be verified in implementation before being described as working features.
- `nginx.conf` is currently empty; deployment configuration and browser-route fallback still need to be established for hosting.

This review changed documentation only. Runtime behavior, database connectivity, builds, and browser flows remain to be verified during setup.

# In PowerShell as Administrator, run

Restart-Service -Name 'MSSQL$SQLEXPRESS'

then;

dotnet run --launch-profile https

sc.exe query 'MSSQL$SQLEXPRESS'
Start-Service -Name 'MSSQL$SQLEXPRESS'

STOP_PENDING
Get-Service -Name 'MSSQL$SQLEXPRESS'

## TO STOP THE PC AGENT PASTE ON POWERSHELL

Stop-Process -Name LabTrackAgent -Force -ErrorAction SilentlyContinue

$policyPath = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Policies\System'
Remove-ItemProperty -Path $policyPath `    -Name DisableTaskMgr,DisableLockWorkstation,DisableChangePassword`
-ErrorAction SilentlyContinue

