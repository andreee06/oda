import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ChatView from "../src/components/ChatView";
import MemberList from "../src/components/MemberList";
import { useAppStore } from "../src/stores/app";
import * as apiModule from "../src/lib/api";

vi.mock("../src/lib/api", () => ({ api: vi.fn() }));
vi.mocked(apiModule.api);

const alice = { id: "u1", username: "alice", displayName: "Alice", avatarUrl: null };
const bob = { id: "u2", username: "bob", displayName: "Bob", avatarUrl: null };
const carol = { id: "u3", username: "carol", displayName: "Carol", avatarUrl: null };

const channel = { id: "c1", serverId: "s1", name: "general", type: "text" as const };
const server = {
  id: "s1",
  name: "Test Server",
  iconUrl: null,
  ownerId: "u1",
  channels: [channel],
};

describe("presence + typing store (slice 3)", () => {
  beforeEach(() => useAppStore.getState().reset());
  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it("applies the READY snapshot and live PRESENCE_UPDATEs", () => {
    useAppStore.getState().setPresences({ u1: "online", u2: "idle" });
    expect(useAppStore.getState().presence).toEqual({ u1: "online", u2: "idle" });

    useAppStore.getState().setPresence("u2", "online");
    useAppStore.getState().setPresence("u1", "offline");
    expect(useAppStore.getState().presence.u2).toBe("online");
    expect(useAppStore.getState().presence.u1).toBe("offline");
  });

  it("typing entries expire after 3s", () => {
    vi.useFakeTimers();
    useAppStore.getState().addTyping("c1", bob);
    expect(useAppStore.getState().typing["c1"]).toEqual({ u2: "Bob" });

    vi.advanceTimersByTime(2900);
    expect(useAppStore.getState().typing["c1"]?.["u2"]).toBe("Bob");
    vi.advanceTimersByTime(200);
    expect(useAppStore.getState().typing["c1"]).toBeUndefined();
  });

  it("a fresh TYPING_START resets the 3s timer", () => {
    vi.useFakeTimers();
    useAppStore.getState().addTyping("c1", bob);
    vi.advanceTimersByTime(2900);
    useAppStore.getState().addTyping("c1", bob); // still typing → reset
    vi.advanceTimersByTime(2900);
    expect(useAppStore.getState().typing["c1"]?.["u2"]).toBe("Bob");
    vi.advanceTimersByTime(200);
    expect(useAppStore.getState().typing["c1"]).toBeUndefined();
  });

  it("a message from the typer clears their typing entry", () => {
    useAppStore.setState({ messages: { c1: [] } });
    useAppStore.getState().addTyping("c1", bob);
    useAppStore.getState().addMessage({
      id: "m1",
      channelId: "c1",
      author: bob,
      content: "done typing",
      attachments: [],
      embeds: [],
      editedAt: null,
      createdAt: "2026-08-19T12:00:00.000Z",
    });
    expect(useAppStore.getState().typing["c1"]).toBeUndefined();
  });
});

describe("MemberList presence", () => {
  beforeEach(() => {
    useAppStore.getState().reset();
    useAppStore.setState({
      user: alice,
      members: [alice, bob, carol],
      presence: { u1: "online", u2: "idle" },
    });
  });
  afterEach(cleanup);

  it("groups members into online/offline sections", () => {
    render(<MemberList />);
    expect(screen.getByText("Online — 2")).toBeTruthy();
    expect(screen.getByText("Offline — 1")).toBeTruthy();
  });

  it("shows status dots and dims offline members", () => {
    render(<MemberList />);
    expect(screen.getByTestId("presence-u1").className).toContain("emerald");
    expect(screen.getByTestId("presence-u2").className).toContain("amber");
    expect(screen.getByTestId("presence-u3").className).toContain("zinc");
    expect(screen.getByText("Carol").className).toContain("text-zinc-500");
    expect(screen.getByText("Alice").className).not.toContain("text-zinc-500");
  });
});

describe("ChatView typing indicator", () => {
  beforeEach(() => {
    useAppStore.getState().reset();
    useAppStore.setState({
      user: alice,
      servers: [server],
      activeServerId: "s1",
      activeChannelId: "c1",
      messages: { c1: [] },
      nextCursors: { c1: null },
    });
  });
  afterEach(cleanup);

  it("shows who is typing, excluding yourself", () => {
    useAppStore.setState({ typing: { c1: { u1: "Alice", u2: "Bob" } } });
    render(<ChatView />);
    expect(screen.getByText("Bob is typing…")).toBeTruthy();
  });

  it("handles two and many typers", () => {
    useAppStore.setState({ typing: { c1: { u2: "Bob", u3: "Carol" } } });
    const { unmount } = render(<ChatView />);
    expect(screen.getByText("Bob and Carol are typing…")).toBeTruthy();
    unmount();

    useAppStore.setState({
      typing: { c1: { u2: "Bob", u3: "Carol", u4: "Dave" } },
    });
    render(<ChatView />);
    expect(screen.getByText("3 people are typing…")).toBeTruthy();
  });
});
