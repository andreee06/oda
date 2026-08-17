import type { UserDTO } from "@oda/shared";
import { prisma } from "../lib/db.js";
import { toUserDTO } from "../lib/dto.js";

export async function setAvatar(
  userId: string,
  avatarUrl: string,
): Promise<UserDTO> {
  const user = await prisma.user.update({
    where: { id: userId },
    data: { avatarUrl },
  });
  return toUserDTO(user);
}

/** Server ids this user belongs to (for USER_UPDATE fan-out). */
export async function getServerIdsOfUser(userId: string): Promise<string[]> {
  const memberships = await prisma.serverMember.findMany({
    where: { userId },
    select: { serverId: true },
  });
  return memberships.map((m) => m.serverId);
}
