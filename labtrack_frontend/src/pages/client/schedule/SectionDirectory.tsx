import { useRef, type KeyboardEvent } from "react";
import { ChevronRight, CircleDot, UserRoundX } from "lucide-react";
import type { CourseSectionSummary } from "@/api/courseSections";

export function SectionDirectory({
  sections,
  selectedId,
  labFilter,
  unsavedIds,
  onSelect,
}: {
  sections: CourseSectionSummary[];
  selectedId: number | null;
  labFilter: number | "all";
  unsavedIds: Set<number>;
  onSelect: (sectionId: number) => void;
}) {
  const list = useRef<HTMLDivElement>(null);

  // Up/Down moves through the list, like a native listbox.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const i = sections.findIndex((s) => s.sectionId === selectedId);
    const next = e.key === "ArrowDown" ? Math.min(sections.length - 1, i + 1) : Math.max(0, i - 1);
    const target = sections[next < 0 ? 0 : next];
    if (!target) return;
    onSelect(target.sectionId);
    list.current?.querySelector<HTMLButtonElement>(`[data-id="${target.sectionId}"]`)?.focus();
  };

  return (
    <div ref={list} className="sch-dir-list" role="listbox" aria-label="Course sections" onKeyDown={onKeyDown}>
      {sections.map((s) => {
        const selected = s.sectionId === selectedId;
        // Unique labs in the order the meetings were imported.
        const labs = [...new Map(s.meetings.filter((m) => m.laboratory).map((m) => [m.laboratory.labId, m.laboratory.roomCode])).entries()];
        return (
          <button
            key={s.sectionId}
            data-id={s.sectionId}
            type="button"
            role="option"
            aria-selected={selected}
            tabIndex={selected || (selectedId === null && s === sections[0]) ? 0 : -1}
            className={`sch-dir-item ${selected ? "is-selected" : ""}`}
            onClick={() => onSelect(s.sectionId)}
          >
            <span className="sch-dir-top">
              <span className="sch-dir-code">Section {s.sectionCode}</span>
              {unsavedIds.has(s.sectionId) && <span className="sch-dir-unsaved" title="Faculty change not saved yet"><CircleDot size={10} /> Unsaved</span>}
            </span>
            <span className="sch-dir-subject">
              <b>{s.subject.code}</b> — {s.subject.title}
            </span>
            <span className={`sch-dir-fac ${s.facultyId ? "" : "is-missing"}`}>
              {s.faculty ?? <><UserRoundX size={12} /> Unassigned</>}
            </span>
            <span className="sch-dir-meta">
              {labs.map(([id, code]) => (
                <span key={id} className={`sch-lab-tag ${labFilter === id ? "is-match" : ""}`}>{code}</span>
              ))}
              <span className="sch-dir-count">{s.meetings.length} {s.meetings.length === 1 ? "meeting" : "meetings"}</span>
            </span>
            <ChevronRight size={16} className="sch-dir-chevron" aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}
