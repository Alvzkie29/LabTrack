import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

/** Right-side drawer (full width on phones). Escape and the backdrop close it unless `locked`. */
export function Drawer({
  title,
  eyebrow,
  subtitle,
  onClose,
  locked = false,
  footer,
  children,
  wide = false,
}: {
  title: string;
  eyebrow?: string;
  subtitle?: ReactNode;
  onClose: () => void;
  locked?: boolean;
  footer?: ReactNode;
  children: ReactNode;
  wide?: boolean;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(document.activeElement);

  useEffect(() => {
    const returnTo = opener.current;
    panel.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus() ?? panel.current?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
      if (returnTo instanceof HTMLElement && returnTo.isConnected) returnTo.focus();
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !locked) onClose();
      // Keep Tab inside the drawer.
      if (e.key === "Tab" && panel.current) {
        const items = panel.current.querySelectorAll<HTMLElement>("button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex='-1'])");
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [locked, onClose]);

  return (
    <div className="mk-drawer-root">
      <div className="mk-drawer-backdrop" onClick={() => !locked && onClose()} aria-hidden="true" />
      <div ref={panel} className={`mk-drawer ${wide ? "is-wide" : ""}`} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}>
        <header className="mk-drawer-head">
          <div>
            {eyebrow && <p className="mk-eyebrow">{eyebrow}</p>}
            <h2>{title}</h2>
            {subtitle && <div className="mk-drawer-sub">{subtitle}</div>}
          </div>
          <button type="button" className="mk-icon-btn" aria-label="Close" onClick={onClose} disabled={locked}>
            <X size={17} />
          </button>
        </header>
        <div className="mk-drawer-body">{children}</div>
        {footer && <footer className="mk-drawer-foot">{footer}</footer>}
      </div>
    </div>
  );
}
