import { Check, CircleDashed, Hourglass } from "lucide-react";

/** Shows the session value exactly as the API returns it ("Confirmed", another status, or none yet). */
export function SessionBadge({ session }: { session: string | null | undefined }) {
  if (session === "Confirmed") return <span className="mk-badge is-ok"><Check size={11} /> Confirmed</span>;
  if (session) return <span className="mk-badge is-progress"><Hourglass size={11} /> {session}</span>;
  return <span className="mk-badge"><CircleDashed size={11} /> Not confirmed yet</span>;
}
