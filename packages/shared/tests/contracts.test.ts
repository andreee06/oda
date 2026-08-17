import { describe, expect, it } from "vitest";
import type { z } from "zod";
import {
  CreateChannelBody,
  CreateEmojiBody,
  CreateMessageBody,
  CreateServerBody,
  EmbedDTO,
  EmojiDTO,
  GetMessagesQuery,
  GifSearchResponse,
  LoginBody,
  MeResponse,
  MessageDTO,
  RegisterBody,
  SetAvatarBody,
  UserDTO,
  WsClientMessage,
  WsEvent,
} from "../src/index.js";

/**
 * Contract tests: every schema must (a) accept its canonical valid sample,
 * (b) survive a JSON round-trip (what actually crosses the wire),
 * (c) reject the invalid shapes we care about.
 */

function roundTrips<T>(schema: z.ZodType<T>, sample: unknown): T {
  const parsed = schema.parse(sample);
  expect(schema.parse(JSON.parse(JSON.stringify(parsed)))).toEqual(parsed);
  return parsed;
}

const userSample = {
  id: "u1",
  username: "andre",
  displayName: "André",
  avatarUrl: null,
};

const messageSample = {
  id: "m1",
  channelId: "c1",
  author: userSample,
  content: "hello oda",
  editedAt: null,
  createdAt: "2026-08-14T12:00:00.000Z",
};

describe("UserDTO / MessageDTO", () => {
  it("round-trips valid samples", () => {
    roundTrips(UserDTO, userSample);
    roundTrips(MessageDTO, messageSample);
  });

  it("rejects messages with a broken author", () => {
    expect(
      MessageDTO.safeParse({ ...messageSample, author: { id: "u1" } }).success,
    ).toBe(false);
  });
});

describe("RegisterBody", () => {
  const valid = {
    username: "andre",
    displayName: "André",
    password: "correct-horse-battery",
    inviteCode: "INV-123",
  };

  it("accepts a valid registration", () => {
    roundTrips(RegisterBody, valid);
  });

  it.each([
    [{ ...valid, username: "Bad Name!" }, "username with capitals/spaces"],
    [{ ...valid, password: "short" }, "password under 8 chars"],
    [{ ...valid, inviteCode: "" }, "empty invite code"],
  ])("rejects %s", (body) => {
    expect(RegisterBody.safeParse(body).success).toBe(false);
  });
});

describe("LoginBody", () => {
  it("round-trips", () => {
    roundTrips(LoginBody, { username: "andre", password: "x" });
  });
  it("rejects empty password", () => {
    expect(
      LoginBody.safeParse({ username: "andre", password: "" }).success,
    ).toBe(false);
  });
});

describe("CreateMessageBody", () => {
  it("round-trips", () => {
    roundTrips(CreateMessageBody, { content: "hi" });
  });
  it("rejects empty and over-long content", () => {
    expect(CreateMessageBody.safeParse({ content: "" }).success).toBe(false);
    expect(
      CreateMessageBody.safeParse({ content: "x".repeat(4001) }).success,
    ).toBe(false);
  });
});

describe("CreateServerBody", () => {
  it("round-trips", () => {
    roundTrips(CreateServerBody, { name: "The Boys" });
  });
  it("rejects empty name", () => {
    expect(CreateServerBody.safeParse({ name: "" }).success).toBe(false);
  });
});

describe("CreateChannelBody", () => {
  it("defaults type to text", () => {
    const parsed = roundTrips(CreateChannelBody, { name: "general" });
    expect(parsed.type).toBe("text");
  });
  it("rejects Discord-illegal channel names", () => {
    expect(CreateChannelBody.safeParse({ name: "No Spaces!" }).success).toBe(
      false,
    );
  });
});

describe("GetMessagesQuery", () => {
  it("applies default limit and coerces string query params", () => {
    expect(GetMessagesQuery.parse({}).limit).toBe(50);
    expect(GetMessagesQuery.parse({ limit: "25" }).limit).toBe(25);
  });
  it("rejects out-of-range limits", () => {
    expect(GetMessagesQuery.safeParse({ limit: 0 }).success).toBe(false);
    expect(GetMessagesQuery.safeParse({ limit: 101 }).success).toBe(false);
  });
});

describe("MeResponse", () => {
  it("round-trips user with servers and channels", () => {
    roundTrips(MeResponse, {
      user: userSample,
      servers: [
        {
          id: "s1",
          name: "The Boys",
          iconUrl: null,
          ownerId: "u1",
          channels: [
            { id: "c1", serverId: "s1", name: "general", type: "text" },
          ],
        },
      ],
    });
  });
});

describe("slice-2 contracts", () => {
  it("MessageDTO defaults attachments/embeds to [] for old payloads", () => {
    const parsed = MessageDTO.parse(messageSample); // sample has neither field
    expect(parsed.attachments).toEqual([]);
    expect(parsed.embeds).toEqual([]);
  });

  it("MessageDTO round-trips with attachments + embeds", () => {
    roundTrips(MessageDTO, {
      ...messageSample,
      attachments: [{ url: "/media/oda-media/x.png" }],
      embeds: [
        { url: "https://example.com", title: "Ex", description: null, imageUrl: null },
      ],
    });
  });

  it("EmbedDTO / EmojiDTO / GifSearchResponse round-trip", () => {
    roundTrips(EmbedDTO, {
      url: "https://example.com",
      title: "t",
      description: "d",
      imageUrl: "https://example.com/i.png",
    });
    roundTrips(EmojiDTO, {
      id: "e1",
      serverId: "s1",
      name: "pepelaugh",
      imageUrl: "/media/oda-media/e.png",
    });
    roundTrips(GifSearchResponse, {
      results: [{ id: "g1", url: "https://t.co/x.gif", previewUrl: "https://t.co/xs.gif" }],
    });
  });

  it("SetAvatarBody requires a /media path", () => {
    roundTrips(SetAvatarBody, { avatarUrl: "/media/oda-media/a.gif" });
    expect(
      SetAvatarBody.safeParse({ avatarUrl: "https://evil.com/a.gif" }).success,
    ).toBe(false);
  });

  it("CreateEmojiBody validates shortcode names", () => {
    roundTrips(CreateEmojiBody, {
      name: "pepe_laugh",
      imageUrl: "/media/oda-media/e.png",
    });
    expect(
      CreateEmojiBody.safeParse({ name: "Bad Name", imageUrl: "/media/x" })
        .success,
    ).toBe(false);
  });

  it("WsEvent parses USER_UPDATE", () => {
    roundTrips(WsEvent, { type: "USER_UPDATE", data: { user: userSample } });
  });
});

describe("WsEvent", () => {
  it("parses every slice-1 event type", () => {
    const server = {
      id: "s1",
      name: "The Boys",
      iconUrl: null,
      ownerId: "u1",
      channels: [],
    };
    for (const event of [
      { type: "READY", data: { user: userSample, servers: [server] } },
      { type: "MESSAGE_CREATE", data: messageSample },
      {
        type: "CHANNEL_CREATE",
        data: { id: "c2", serverId: "s1", name: "memes", type: "text" },
      },
      { type: "CHANNEL_DELETE", data: { id: "c2", serverId: "s1" } },
      { type: "SERVER_CREATE", data: server },
      { type: "PONG", data: {} },
    ]) {
      roundTrips(WsEvent, event);
    }
  });

  it("rejects unknown event types", () => {
    expect(
      WsEvent.safeParse({ type: "HACK_THE_PLANET", data: {} }).success,
    ).toBe(false);
  });
});

describe("WsClientMessage", () => {
  it("accepts PING, rejects anything else", () => {
    roundTrips(WsClientMessage, { type: "PING" });
    expect(WsClientMessage.safeParse({ type: "PONG" }).success).toBe(false);
  });
});
