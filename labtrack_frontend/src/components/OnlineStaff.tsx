import { useEffect, useState } from "react";
import { HubConnectionBuilder } from "@microsoft/signalr";
import { API_BASE_URL, getToken } from "@/api/client";
import { ROLE_LABELS, useAuth, type Role } from "@/contexts/AuthContext";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type Staff = { userId: string; fullName: string; role: Role };
const initials = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.length ? `${parts[0][0]}${parts.length > 1 ? parts[parts.length - 1][0] : ""}`.toUpperCase() : "?";
};

export function OnlineStaff() {
  const { user } = useAuth();
  const [people, setPeople] = useState<Staff[]>([]);
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    if (!user) return;
    let disposed = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const connection = new HubConnectionBuilder()
      .withUrl(`${API_BASE_URL.replace(/\/$/, "")}/hubs/presence`, { accessTokenFactory: () => getToken() ?? "" })
      .withAutomaticReconnect().build();
    const update = (users: Staff[]) => { if (!disposed) setPeople(users); };
    connection.on("PresenceChanged", update);
    connection.onreconnecting(() => { if (!disposed) { setConnected(false); setPeople([]); } });
    connection.onreconnected(async () => {
      try { update(await connection.invoke<Staff[]>("GetOnlineUsers")); if (!disposed) setConnected(true); }
      catch { if (!disposed) setConnected(false); }
    });
    const start = async () => {
      try {
        await connection.start();
        if (disposed) { await connection.stop(); return; }
        update(await connection.invoke<Staff[]>("GetOnlineUsers"));
        setConnected(true);
      } catch { if (!disposed) { setConnected(false); setPeople([]); retry = setTimeout(start, 10000); } }
    };
    connection.onclose(() => {
      if (!disposed) { setConnected(false); setPeople([]); retry = setTimeout(start, 10000); }
    });
    void start();
    return () => { disposed = true; clearTimeout(retry); void connection.stop(); };
  }, [user?.userId]);

  return <Popover>
    <PopoverTrigger asChild>
      <button type="button" aria-label={connected ? `View ${people.length} online staff members` : "View staff connection status"}
        className="flex h-10 items-center gap-2 rounded-xl px-1.5 transition hover:bg-white/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#800000]">
        <span className="hidden text-[11px] text-[#70776a] lg:block">Online</span>
        <span className="flex -space-x-2">
          {connected && people.slice(0, 3).map(person => <span key={person.userId} title={person.fullName}
            className="flex size-8 items-center justify-center rounded-full border-2 border-[#e9e8e3] bg-[#800000] text-[10px] font-bold text-[#F4C430]">{initials(person.fullName)}</span>)}
          {connected && people.length > 3 && <span className="flex size-8 items-center justify-center rounded-full border-2 border-[#e9e8e3] bg-[#ddd8d0] text-[10px] font-semibold">+{people.length - 3}</span>}
          {!connected && <span className="size-2 rounded-full bg-[#9b9b93]" />}
        </span>
      </button>
    </PopoverTrigger>
    <PopoverContent align="end" className="w-[min(300px,calc(100vw-24px))] rounded-2xl p-4">
      <h2 className="text-sm font-semibold">Online staff {connected ? `(${people.length})` : ""}</h2>
      <p className="mt-1 text-xs text-[#828878]">{connected ? "Currently connected to LabTrack" : "Live presence is reconnecting?"}</p>
      {connected && <ul className="mt-3 max-h-72 space-y-3 overflow-y-auto">
        {people.map(person => <li key={person.userId} className="flex items-center gap-3">
          <span aria-hidden="true" className="relative flex size-9 shrink-0 items-center justify-center rounded-full bg-[#800000] text-xs font-bold text-[#F4C430]">
            {initials(person.fullName)}<span className="absolute bottom-0 right-0 size-2.5 rounded-full border-2 border-white bg-green-600" />
          </span>
          <span className="min-w-0"><span className="block break-words text-sm font-medium">{person.fullName}{person.userId === user?.userId ? " (you)" : ""}</span>
            <span className="block text-xs text-[#828878]">{ROLE_LABELS[person.role]}</span></span>
        </li>)}
      </ul>}
    </PopoverContent>
  </Popover>;
}
