import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ChatView from "../src/components/ChatView";
import { useAppStore } from "../src/stores/app";
import * as apiModule from "../src/lib/api";

vi.mock("../src/lib/api", () => ({ api: vi.fn() }));
const apiMock = vi.mocked(apiModule.api);

const user = {
  id: "u1",
  username: "alice",
  displayName: "Alice",
  avatarUrl: null,
};
const channel = {
  id: "c1",
  serverId: "s1",
  name: "general",
  type: "text" as const,
};
const server = {
  id: "s1",
  name: "Test Server",
  iconUrl: null,
  ownerId: "u1",
  channels: [channel],
};

function typeAndSend(text: string) {
  const input = screen.getByPlaceholderText(/message #general/i);
  fireEvent.change(input, { target: { value: text } });
  fireEvent.submit(input.closest("form")!);
}

describe("ChatView", () => {
  afterEach(cleanup);

  beforeEach(() => {
    useAppStore.getState().reset();
    useAppStore.setState({
      user,
      servers: [server],
      activeServerId: "s1",
      activeChannelId: "c1",
      messages: { c1: [] },
      nextCursors: { c1: null },
    });
    apiMock.mockReset();
  });

  it("sends optimistically, then swaps in the server DTO", async () => {
    apiMock.mockResolvedValue({
      id: "m1",
      channelId: "c1",
      author: user,
      content: "hello",
      attachments: [],
      embeds: [],
      editedAt: null,
      createdAt: "2026-08-14T12:00:00.000Z",
    });

    render(<ChatView />);
    typeAndSend("hello");

    // optimistic render: visible immediately, marked as sending
    expect(screen.getByText("hello")).toBeTruthy();
    expect(screen.getByText("sending…")).toBeTruthy();

    await waitFor(() => {
      const list = useAppStore.getState().messages["c1"]!;
      expect(list.some((m) => m.id === "m1")).toBe(true);
      expect(list.some((m) => m.id.startsWith("temp-"))).toBe(false);
    });

    expect(apiMock).toHaveBeenCalledWith("/api/channels/c1/messages", {
      method: "POST",
      body: { content: "hello" },
    });
  });

  it("does not duplicate when the WS echo beats the REST response", async () => {
    const real = {
      id: "m1",
      channelId: "c1",
      author: user,
      content: "hello",
      attachments: [],
      embeds: [],
      editedAt: null,
      createdAt: "2026-08-14T12:00:00.000Z",
    };
    apiMock.mockImplementation(async () => {
      // WS echo arrives before the REST promise resolves
      useAppStore.getState().addMessage(real);
      return real;
    });

    render(<ChatView />);
    typeAndSend("hello");

    await waitFor(() => {
      const list = useAppStore.getState().messages["c1"]!;
      expect(list).toHaveLength(1);
      expect(list[0]!.id).toBe("m1");
    });
  });

  it("renders custom emoji shortcodes and image attachments", () => {
    useAppStore.setState({
      emojis: {
        s1: [
          {
            id: "e1",
            serverId: "s1",
            name: "pepelaugh",
            imageUrl: "/media/oda-media/pepe.png",
          },
        ],
      },
      messages: {
        c1: [
          {
            id: "m9",
            channelId: "c1",
            author: user,
            content: "lol :pepelaugh:",
            attachments: [{ url: "/media/oda-media/cat.png" }],
            embeds: [],
            editedAt: null,
            createdAt: "2026-08-14T12:00:00.000Z",
          },
        ],
      },
    });

    render(<ChatView />);
    const emojiImg = screen.getByAltText(":pepelaugh:");
    expect(emojiImg.getAttribute("src")).toBe("/media/oda-media/pepe.png");
    const attachment = screen.getByAltText("attachment");
    expect(attachment.getAttribute("src")).toBe("/media/oda-media/cat.png");
  });

  it("rolls back the optimistic message on failure", async () => {
    apiMock.mockRejectedValue(new Error("network down"));

    render(<ChatView />);
    typeAndSend("lost message");

    await waitFor(() => {
      expect(useAppStore.getState().messages["c1"]).toHaveLength(0);
    });
    expect(useAppStore.getState().sendError).toBe("network down");
  });
});
