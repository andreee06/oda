import type { UserDTO } from "@oda/shared";
import { useAppStore } from "../stores/app";
import Avatar from "./Avatar";

const DOT: Record<string, string> = {
  online: "bg-emerald-500",
  idle: "bg-amber-400",
  offline: "bg-zinc-600",
};

function MemberRow({ member, status }: { member: UserDTO; status: string }) {
  const offline = status === "offline";
  return (
    <div className="flex items-center gap-2 py-1">
      <div className={`relative ${offline ? "opacity-50" : ""}`}>
        <Avatar user={member} size="h-8 w-8 text-xs" />
        <span
          data-testid={`presence-${member.id}`}
          className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-zinc-900 ${DOT[status]}`}
        />
      </div>
      <span
        className={`truncate text-sm ${offline ? "text-zinc-500" : "text-zinc-300"}`}
      >
        {member.displayName}
      </span>
    </div>
  );
}

export default function MemberList() {
  const members = useAppStore((s) => s.members);
  const presence = useAppStore((s) => s.presence);

  const withStatus = members.map((m) => ({
    member: m,
    status: presence[m.id] ?? "offline",
  }));
  const online = withStatus.filter((m) => m.status !== "offline");
  const offline = withStatus.filter((m) => m.status === "offline");

  return (
    <aside className="w-60 shrink-0 overflow-y-auto border-l border-zinc-800 bg-zinc-900 p-3">
      {online.length > 0 && (
        <>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Online — {online.length}
          </h3>
          {online.map(({ member, status }) => (
            <MemberRow key={member.id} member={member} status={status} />
          ))}
        </>
      )}
      {offline.length > 0 && (
        <>
          <h3 className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Offline — {offline.length}
          </h3>
          {offline.map(({ member, status }) => (
            <MemberRow key={member.id} member={member} status={status} />
          ))}
        </>
      )}
    </aside>
  );
}
