import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search, UserRoundX } from "lucide-react";
import type { FacultyOption } from "@/api/sessionConfirmations";

export type OptionsState = "loading" | "ready" | "error";

/** Searchable faculty dropdown. It only picks a value; saving is a separate, explicit action. */
export function FacultyPicker({
  value,
  fallbackLabel,
  options,
  optionsState,
  disabled,
  onChange,
}: {
  value: string | null;
  fallbackLabel: string | null;
  options: FacultyOption[];
  optionsState: OptionsState;
  disabled?: boolean;
  onChange: (facultyId: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [pos, setPos] = useState<{ top: number; left: number; width: number; up: boolean } | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  // Portalled + fixed so scroll containers never clip the menu.
  useLayoutEffect(() => {
    if (!open || !button.current) return;
    const place = () => {
      const r = button.current!.getBoundingClientRect();
      const width = Math.max(r.width, 260);
      const up = window.innerHeight - r.bottom < 300 && r.top > 300;
      setPos({ top: up ? r.top - 4 : r.bottom + 4, left: Math.min(r.left, window.innerWidth - width - 8), width, up });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!menu.current?.contains(t) && !button.current?.contains(t)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    input.current?.focus();
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const q = query.trim().toLowerCase();
  const matches = options.filter((f) => !q || f.fullName.toLowerCase().includes(q) || f.schoolId.toLowerCase().includes(q));
  const current = options.find((f) => f.id === value);
  const label = value === null ? null : current?.fullName ?? fallbackLabel ?? "Unknown faculty";

  const pick = (id: string | null) => {
    setOpen(false);
    setQuery("");
    button.current?.focus();
    onChange(id);
  };

  return (
    <>
      <button
        ref={button}
        type="button"
        className={`sch-picker ${value ? "" : "is-empty"}`}
        onClick={() => setOpen((o) => !o)}
        disabled={disabled || optionsState !== "ready"}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {!value && <UserRoundX size={14} />}
        <span>{optionsState === "loading" ? "Loading faculty…" : label ?? "Unassigned"}</span>
        {current && <small>{current.schoolId}</small>}
        <ChevronDown size={14} className="sch-picker-chevron" />
      </button>

      {open && pos && createPortal(
        <div ref={menu} className="sch-picker-menu" style={{ top: pos.top, left: pos.left, width: pos.width, transform: pos.up ? "translateY(-100%)" : undefined }}>
          <label className="sch-picker-search">
            <Search size={13} />
            <input
              ref={input}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && matches.length === 1) pick(matches[0].id); }}
              placeholder="Search name or ID…"
              aria-label="Search faculty"
            />
          </label>
          <div className="sch-picker-list" role="listbox">
            <button type="button" role="option" aria-selected={value === null} className="is-none" onClick={() => pick(null)}>
              <span>Unassigned</span>
              {value === null && <Check size={13} />}
            </button>
            {matches.map((f) => (
              <button key={f.id} type="button" role="option" aria-selected={f.id === value} className={f.id === value ? "is-current" : ""} onClick={() => pick(f.id)}>
                <span>{f.fullName}</span>
                <small>{f.schoolId}</small>
                {f.id === value && <Check size={13} />}
              </button>
            ))}
            {matches.length === 0 && <p>No faculty match “{query}”.</p>}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
