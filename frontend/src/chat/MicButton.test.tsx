import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MicButton from "./MicButton";

vi.mock("../api/client", () => ({ api: { transcribe: vi.fn() } }));
import { api } from "../api/client";

/** Minimal MediaRecorder stand-in: jsdom ships neither MediaRecorder nor getUserMedia. */
class FakeRecorder {
  static instances: FakeRecorder[] = [];
  state: "inactive" | "recording" = "inactive";
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  stream: MediaStream;
  constructor(stream: MediaStream) {
    this.stream = stream;
    FakeRecorder.instances.push(this);
  }
  start() {
    this.state = "recording";
  }
  stop() {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(["audio"]) });
    this.onstop?.();
  }
}

const track = () => ({ stop: vi.fn() });
let tracks: ReturnType<typeof track>[];

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  FakeRecorder.instances = [];
  tracks = [track()];
  vi.stubGlobal("MediaRecorder", FakeRecorder);
  vi.stubGlobal("navigator", {
    ...navigator,
    mediaDevices: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => tracks }) },
  });
  vi.mocked(api.transcribe).mockResolvedValue("transcribed text");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const startRecording = async () => {
  fireEvent.click(screen.getByRole("button", { name: /speak/i }));
  await waitFor(() => expect(screen.getByRole("button", { name: /stop/i })).toBeInTheDocument());
};

describe("MicButton", () => {
  it("shows a visible Speak label when idle, not just a bare icon", () => {
    render(<MicButton disabled={false} onTranscript={vi.fn()} />);
    expect(screen.getByRole("button", { name: /speak/i })).toHaveTextContent(/speak/i);
  });

  it("exposes Stop and Cancel controls and an elapsed timer while recording", async () => {
    render(<MicButton disabled={false} onTranscript={vi.fn()} />);
    await startRecording();

    expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
    expect(screen.getByText(/0:00/)).toBeInTheDocument();

    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(screen.getByText(/0:03/)).toBeInTheDocument();
  });

  it("reports elapsed from the wall clock even when timer ticks are throttled", async () => {
    render(<MicButton disabled={false} onTranscript={vi.fn()} />);
    await startRecording();

    // Browsers throttle timers in hidden tabs to roughly 1/sec, so a lot of wall time
    // passes with very few ticks. Counting ticks would report 0:00 here.
    await act(async () => {
      vi.setSystemTime(Date.now() + 5_000);
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(screen.getByText(/0:05/)).toBeInTheDocument();
  });

  it("transcribes on Stop and hands the text to the parent", async () => {
    const onTranscript = vi.fn();
    render(<MicButton disabled={false} onTranscript={onTranscript} />);
    await startRecording();

    fireEvent.click(screen.getByRole("button", { name: /stop/i }));
    await waitFor(() => expect(onTranscript).toHaveBeenCalledWith("transcribed text"));
    expect(tracks[0].stop).toHaveBeenCalled();
  });

  it("discards the recording on Cancel without transcribing", async () => {
    const onTranscript = vi.fn();
    render(<MicButton disabled={false} onTranscript={onTranscript} />);
    await startRecording();

    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    await waitFor(() => expect(screen.getByRole("button", { name: /speak/i })).toBeInTheDocument());

    expect(api.transcribe).not.toHaveBeenCalled();
    expect(onTranscript).not.toHaveBeenCalled();
    expect(tracks[0].stop).toHaveBeenCalled(); // mic released, not left hot
  });

  it("stops itself at the 60 second cap and still transcribes", async () => {
    const onTranscript = vi.fn();
    render(<MicButton disabled={false} onTranscript={onTranscript} />);
    await startRecording();

    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    await waitFor(() => expect(onTranscript).toHaveBeenCalledWith("transcribed text"));
  });

  it("surfaces an error and recovers when the mic is unavailable", async () => {
    vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValue(new Error("denied"));
    render(<MicButton disabled={false} onTranscript={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /speak/i }));
    await waitFor(() => expect(screen.getByText(/unavailable/i)).toBeInTheDocument());

    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(screen.getByRole("button", { name: /speak/i })).toBeInTheDocument();
  });

  it("releases the mic when unmounted mid-recording", async () => {
    const onTranscript = vi.fn();
    const { unmount } = render(<MicButton disabled={false} onTranscript={onTranscript} />);
    await startRecording();

    unmount();
    expect(tracks[0].stop).toHaveBeenCalled();
    expect(onTranscript).not.toHaveBeenCalled(); // no transcribe into a dead parent
  });
});
