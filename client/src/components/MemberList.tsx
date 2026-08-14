import { useAppStore } from "../stores/app";

export default function MemberList() {
  const members = useAppStore((s) => s.members);

  return (
    <aside className="w-60 shrink-0 overflow-y-auto border-l border-zinc-800 bg-zinc-900 p-3">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
        Members — {members.length}
      </h3>
      {members.map((m) => (
        <div key={m.id} className="flex items-center gap-2 py-1">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-sm font-semibold">
            {m.displayName.slice(0, 1).toUpperCase()}
          </div>
          <span className="truncate text-sm text-zinc-300">
            {m.displayName}
          </span>
        </div>
      ))}
    </aside>
  );
}
