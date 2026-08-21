import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ChannelSidebar from "../src/components/ChannelSidebar";
import VoicePanel from "../src/components/VoicePanel";
import { useAppStore } from "../src/stores/app";
import * as voiceModule from "../src/lib/voice";

vi.mock("../src/lib/voice", () => ({
  joinVoice: vi.fn().mockResolvedValue(undefined),
  leaveVoice: vi.fn().mockResolvedValue(undefined),
  toggleMute: vi.fn().mockResolvedValue(undefined),
  toggleDeafen: vi.fn().mockResolvedValue(undefined),
}));
const voiceMock = vi.mocked(voiceModule);

const alice = { id: "u1", username: "alice", displayName: "Alice", avatarUrl: null };
const bob = { id: "u2", username: "bob", displayName: "Bob", avatarUrl: null };

const textChannel = { id: "c1", serverId: "s1", name: "general", type: "text" as const };
const voiceChannel = { id: "v1", serverId: "s1", name: "lounge", type: "voice" as const };
const server = {
  id: "s1",
  name: "Test Server",
  iconUrl: null,
  ownerId: "u1",
  channels: [textChannel, voiceChannel],
};

describe("voice store (slice 4)", () => {
  beforeEach(() => useAppStore.getState().reset());
  afterEach(cleanup);

  it("tracks rosters, own channel, and speaking", () => {
    const s = useAppStore.getState();
    s.setVoiceState("v1", [{ user: bob, muted: false, deafened: false }]);
    expect(useAppStore.getState().voiceStates["v1"]).toHaveLength(1);

    s.setVoiceStates({ v1: [{ user: alice, muted: true, deafened: true }] });
    expect(useAppStore.getState().voiceStates["v1"]?.[0]?.muted).toBe(true);

    s.setMyVoiceChannel("v1");
    expect(useAppStore.getState().myVoiceChannelId).toBe("v1");

    s.setSpeaking(["u1", "u2"]);
    expect(useAppStore.getState().speaking).toEqual(["u1", "u2"]);

    useAppStore.getState().reset();
    expect(useAppStore.getState().voiceStates).toEqual({});
    expect(useAppStore.getState().myVoiceChannelId).toBeNull();
    expect(useAppStore.getState().speaking).toEqual([]);
  });
});

describe("ChannelSidebar voice roster", () => {
  beforeEach(() => {
    useAppStore.getState().reset();
    useAppStore.setState({
      user: alice,
      servers: [server],
      activeServerId: "s1",
      activeChannelId: "c1",
      voiceStates: {
        v1: [
          { user: bob, muted: true, deafened: false },
          { user: alice, muted: false, deafened: false },
        ],
      },
      speaking: ["u1"],
    });
    vi.clearAllMocks();
  });
  afterEach(cleanup);

  it("lists participants under the voice channel with mute + speaking states", () => {
    render(<ChannelSidebar />);
    expect(screen.getByText("Bob")).toBeTruthy();
    expect(screen.getByTestId("voice-muted-u2")).toBeTruthy(); // bob is muted
    expect(screen.queryByTestId("voice-muted-u1")).toBeNull(); // alice is not
    expect(screen.getByTestId("voice-speaking-u1").className).toContain("ring-green-500");
  });

  it("clicking a voice channel joins it when not connected", () => {
    render(<ChannelSidebar />);
    fireEvent.click(screen.getByText("lounge"));
    expect(voiceMock.joinVoice).toHaveBeenCalledWith("v1");
  });

  it("clicking the voice channel you're in does not rejoin", () => {
    useAppStore.setState({ myVoiceChannelId: "v1" });
    render(<ChannelSidebar />);
    fireEvent.click(screen.getByText("lounge"));
    expect(voiceMock.joinVoice).not.toHaveBeenCalled();
  });
});

describe("VoicePanel", () => {
  beforeEach(() => {
    useAppStore.getState().reset();
    useAppStore.setState({
      user: alice,
      servers: [server],
      activeServerId: "s1",
      myVoiceChannelId: "v1",
      voiceStates: { v1: [{ user: alice, muted: false, deafened: false }] },
    });
    vi.clearAllMocks();
  });
  afterEach(cleanup);

  it("renders nothing when not in voice", () => {
    useAppStore.setState({ myVoiceChannelId: null });
    const { container } = render(<VoicePanel />);
    expect(container.firstChild).toBeNull();
  });

  it("mute / deafen / disconnect call the voice client", () => {
    render(<VoicePanel />);
    fireEvent.click(screen.getByTitle("Mute"));
    expect(voiceMock.toggleMute).toHaveBeenCalled();
    fireEvent.click(screen.getByTitle("Deafen"));
    expect(voiceMock.toggleDeafen).toHaveBeenCalled();
    fireEvent.click(screen.getByTitle("Disconnect"));
    expect(voiceMock.leaveVoice).toHaveBeenCalled();
  });

  it("shows current mute state", () => {
    useAppStore.setState({
      voiceStates: { v1: [{ user: alice, muted: true, deafened: false }] },
    });
    render(<VoicePanel />);
    expect(screen.getByTitle("Unmute")).toBeTruthy();
  });
});
