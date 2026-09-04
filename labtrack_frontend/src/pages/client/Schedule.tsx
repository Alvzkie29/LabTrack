import { SCHEDULE } from "@/utils/mock-data";

export function SchedulePage() {
  return (
    <div className="space-y-5">
      <div>
        <div className="font-mono text-[11px] uppercase tracking-wider" style={{ color: "#57606a" }}>
          Read-only · imported from department roster
        </div>
        <h1 className="mt-1" style={{ fontSize: 22, fontWeight: 600, letterSpacing: -0.4 }}>Schedule</h1>
        <p className="mt-0.5 text-[13px]" style={{ color: "#57606a" }}>
          LabTrack does not generate or edit schedules — it only displays them and verifies attendance against them.
        </p>
      </div>

      <div style={{ background: "#ffffff", border: "1px solid #d1d9e0", borderRadius: 6 }}>
        <table className="w-full text-[12.5px]">
          <thead>
            <tr style={{ background: "#f6f8fa", color: "#57606a" }}>
              <th className="py-2.5 pl-4 text-left font-mono text-[10.5px] uppercase tracking-wider">Code</th>
              <th className="py-2.5 text-left font-mono text-[10.5px] uppercase tracking-wider">Subject</th>
              <th className="py-2.5 text-left font-mono text-[10.5px] uppercase tracking-wider">Room</th>
              <th className="py-2.5 text-left font-mono text-[10.5px] uppercase tracking-wider">Day / Time</th>
              <th className="py-2.5 pr-4 text-left font-mono text-[10.5px] uppercase tracking-wider">Faculty</th>
            </tr>
          </thead>
          <tbody>
            {SCHEDULE.map((s) => (
              <tr key={s.courseSectionId} style={{ borderTop: "1px solid #e1e4e8" }}>
                <td className="py-2.5 pl-4 font-mono text-[11.5px]" style={{ color: "#0d1117", fontWeight: 600 }}>{s.code}</td>
                <td className="py-2.5 pr-3">{s.subject}</td>
                <td className="py-2.5 pr-3 font-mono text-[11.5px]">{s.room}</td>
                <td className="py-2.5 pr-3" style={{ color: "#57606a" }}>{s.dayTime}</td>
                <td className="py-2.5 pr-4" style={{ color: "#57606a" }}>{s.faculty}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
