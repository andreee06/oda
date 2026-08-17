import type { UserDTO } from "@oda/shared";

/** Real avatar image (GIFs animate by themselves) or the initial-circle fallback. */
export default function Avatar({
  user,
  size = "h-9 w-9 text-sm",
}: {
  user: Pick<UserDTO, "displayName" | "avatarUrl">;
  size?: string;
}) {
  if (user.avatarUrl) {
    return (
      <img
        src={user.avatarUrl}
        alt={user.displayName}
        className={`${size} shrink-0 rounded-full object-cover`}
      />
    );
  }
  return (
    <div
      className={`${size} flex shrink-0 items-center justify-center rounded-full bg-indigo-600 font-semibold`}
    >
      {user.displayName.slice(0, 1).toUpperCase()}
    </div>
  );
}
