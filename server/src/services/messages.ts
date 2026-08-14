import type {
  CreateMessageBody,
  GetMessagesQuery,
  MessageDTO,
  MessagePage,
} from "@oda/shared";
import { prisma } from "../lib/db.js";
import { ApiError } from "../lib/errors.js";
import { toMessageDTO } from "../lib/dto.js";
import { getServerForMember } from "./servers.js";

/** Load channel + verify the user is a member of its server (404 otherwise). */
async function getChannelForMember(channelId: string, userId: string) {
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
  });
  if (!channel) throw new ApiError(404, "channel not found");
  await getServerForMember(channel.serverId, userId);
  return channel;
}

export async function createMessage(
  userId: string,
  channelId: string,
  body: CreateMessageBody,
): Promise<MessageDTO> {
  await getChannelForMember(channelId, userId);
  const message = await prisma.message.create({
    data: { channelId, authorId: userId, content: body.content },
    include: { author: true },
  });
  return toMessageDTO(message);
}

export async function listMessages(
  userId: string,
  channelId: string,
  query: GetMessagesQuery,
): Promise<MessagePage> {
  await getChannelForMember(channelId, userId);

  // Cursor = message id; resolve it to its (createdAt, id) tuple so ordering
  // is stable even when several messages share a millisecond.
  let cursorCondition = {};
  if (query.before) {
    const cursor = await prisma.message.findUnique({
      where: { id: query.before },
    });
    if (!cursor || cursor.channelId !== channelId) {
      throw new ApiError(400, "invalid cursor");
    }
    cursorCondition = {
      OR: [
        { createdAt: { lt: cursor.createdAt } },
        { createdAt: cursor.createdAt, id: { lt: cursor.id } },
      ],
    };
  }

  const rows = await prisma.message.findMany({
    where: { channelId, ...cursorCondition },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: query.limit + 1, // one extra row = "is there a next page?"
    include: { author: true },
  });

  const hasMore = rows.length > query.limit;
  const page = rows.slice(0, query.limit);
  return {
    messages: page.map(toMessageDTO),
    nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
  };
}
