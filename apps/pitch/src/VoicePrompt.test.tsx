import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MOCK_TRANSCRIPT, VoicePrompt } from "./VoicePrompt";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

it("plays the scripted transcript and sends it", () => {
  const onSend = vi.fn();
  render(<VoicePrompt onSend={onSend} />);
  fireEvent.click(screen.getByLabelText("Presentation mode"));
  expect(screen.getByText("Listening")).toBeTruthy();

  act(() => vi.advanceTimersByTime(1500));
  expect(screen.getByLabelText<HTMLTextAreaElement>("Transcript").value).toBe("I'm living in bass");

  act(() => vi.advanceTimersByTime(2000));
  expect(onSend).toHaveBeenCalledWith(MOCK_TRANSCRIPT);
});

it("cancels with Escape", () => {
  const onSend = vi.fn();
  render(<VoicePrompt onSend={onSend} />);
  fireEvent.click(screen.getByLabelText("Presentation mode"));
  fireEvent.keyDown(window, { key: "Escape" });
  act(() => vi.advanceTimersByTime(5000));
  expect(screen.queryByText("Listening")).toBeNull();
  expect(onSend).not.toHaveBeenCalled();
});
