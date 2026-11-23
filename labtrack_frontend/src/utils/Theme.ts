/**
 * LabTrack theme preference.
 *
 * Saves the user's appearance choice in this browser and applies it to <html>:
 *   data-theme="light" | "dark"           (resolved mode, "system" follows the OS)
 *   data-theme-mode="light" | "dark" | "system"
 *   data-accent="maroon" | ...
 *   CSS variables: --lt-accent, --lt-accent-contrast, --lt-accent-soft, --lt-accent-ink
 *   color-scheme: light | dark            (native form controls and scrollbars follow it)
 *
 * Pages adopt the theme by using these attributes/variables, e.g.
 *   .my-button { background: var(--lt-accent, #800000); color: var(--lt-accent-contrast, #f4c430); }
 *   [data-theme="dark"] .my-card { background: #1d1a1b; }
 *
 * Call initTheme() once at startup (main.tsx) so the saved choice applies before any page renders.
 */
import { useCallback, useEffect, useRef, useState } from "react";

export type ThemeMode = "light" | "dark" | "system";
export type ThemeAccent = "maroon" | "navy" | "forest" | "plum" | "slate";
export interface ThemePreference {
  mode: ThemeMode;
  accent: ThemeAccent;
}

export const DEFAULT_THEME: ThemePreference = { mode: "light", accent: "maroon" };

/** accent: main colour · contrast: text/icons on it · soft: tinted background · ink: accent-coloured text on light surfaces */
export const ACCENTS: Record<ThemeAccent, { label: string; accent: string; contrast: string; soft: string; ink: string; darkInk: string }> = {
  maroon: { label: "LabTrack maroon", accent: "#800000", contrast: "#F4C430", soft: "#F8EDED", ink: "#800000", darkInk: "#E8A3A3" },
  navy:   { label: "Navy",            accent: "#1F3A68", contrast: "#F4C430", soft: "#ECF1F8", ink: "#1F3A68", darkInk: "#A9C1E8" },
  forest: { label: "Forest",          accent: "#2F5D46", contrast: "#F4E7B8", soft: "#EAF3EE", ink: "#2F5D46", darkInk: "#9FD0B4" },
  plum:   { label: "Plum",            accent: "#5E2B5C", contrast: "#F4C430", soft: "#F4ECF4", ink: "#5E2B5C", darkInk: "#D8AEDA" },
  slate:  { label: "Slate",           accent: "#3B4552", contrast: "#F2F2F0", soft: "#EEF0F2", ink: "#3B4552", darkInk: "#B9C3CF" },
};

const STORAGE_KEY = "labtrack.theme";
const EVENT = "labtrack:theme";
const MODES: ThemeMode[] = ["light", "dark", "system"];

function isPreference(value: unknown): value is ThemePreference {
  const v = value as ThemePreference;
  return !!v && MODES.includes(v.mode) && v.accent in ACCENTS;
}

export function loadThemePreference(): ThemePreference {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    return isPreference(parsed) ? parsed : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

/** Returns false if the browser blocks storage (the choice still applies until the page reloads). */
export function saveThemePreference(pref: ThemePreference): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pref));
    return true;
  } catch {
    return false;
  }
}

const systemDark = () => typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
export const resolveMode = (mode: ThemeMode): "light" | "dark" => (mode === "system" ? (systemDark() ? "dark" : "light") : mode);

export function applyTheme(pref: ThemePreference) {
  const root = document.documentElement;
  const resolved = resolveMode(pref.mode);
  const a = ACCENTS[pref.accent];
  root.dataset.theme = resolved;
  root.dataset.themeMode = pref.mode;
  root.dataset.accent = pref.accent;
  root.style.colorScheme = resolved;
  root.style.setProperty("--lt-accent", a.accent);
  root.style.setProperty("--lt-accent-contrast", a.contrast);
  root.style.setProperty("--lt-accent-soft", resolved === "dark" ? `color-mix(in srgb, ${a.accent} 28%, #1b1819)` : a.soft);
  root.style.setProperty("--lt-accent-ink", resolved === "dark" ? a.darkInk : a.ink);
}

/** Apply the saved theme and keep "system" in step with the OS. Returns a cleanup function. */
export function initTheme() {
  applyTheme(loadThemePreference());
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const onSystem = () => { if (loadThemePreference().mode === "system") applyTheme(loadThemePreference()); };
  const onStorage = (e: StorageEvent) => { if (e.key === STORAGE_KEY) applyTheme(loadThemePreference()); };
  media.addEventListener("change", onSystem);
  window.addEventListener("storage", onStorage);
  return () => {
    media.removeEventListener("change", onSystem);
    window.removeEventListener("storage", onStorage);
  };
}

/** React hook: current preference + setter that saves, applies, and notifies other components. */
export function useThemePreference() {
  const [pref, setPref] = useState<ThemePreference>(loadThemePreference);
  const [resolved, setResolved] = useState(() => resolveMode(pref.mode));
  const [persisted, setPersisted] = useState(true);
  const current = useRef(pref);
  current.current = pref;

  useEffect(() => {
    const sync = (e: Event) => {
      const detail = (e as CustomEvent<ThemePreference>).detail;
      const next = isPreference(detail) ? detail : loadThemePreference();
      setPref(next);
      setResolved(resolveMode(next.mode));
    };
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onSystem = () => setResolved(resolveMode(loadThemePreference().mode));
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    media.addEventListener("change", onSystem);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
      media.removeEventListener("change", onSystem);
    };
  }, []);

  const update = useCallback((patch: Partial<ThemePreference>) => {
    const next = { ...current.current, ...patch };
    current.current = next;
    setPersisted(saveThemePreference(next));
    applyTheme(next);
    setPref(next);
    setResolved(resolveMode(next.mode));
    window.dispatchEvent(new CustomEvent(EVENT, { detail: next }));
  }, []);

  const reset = useCallback(() => update(DEFAULT_THEME), [update]);

  return { preference: pref, resolvedMode: resolved, persisted, update, reset };
}