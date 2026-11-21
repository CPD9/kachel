import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Chat } from "./Chat";
import { call, fakeData, scriptedModel } from "./fixtures";

afterEach(cleanup);

describe("chat panel", () => {
  it("answers an example question with a tool card and its sources", async () => {
    const { model } = scriptedModel([
      { toolCalls: [call("heat_now")], thinking: "The tank tool." },
      { content: "The tank holds 31.2 kWh of heat, 89% full (a replay of 15 July 2025)." },
    ]);
    render(<Chat model={model} data={fakeData()} />);
    fireEvent.click(await screen.findByRole("button", { name: "How warm is the tank?" }));
    expect(await screen.findByText(/The tank holds 31.2 kWh/)).toBeTruthy();
    expect(screen.getByText("heat_state at 14:00 on 15 July 2025: soc_kwh")).toBeTruthy();
    expect(screen.getByText("Heat stored in the tank")).toBeTruthy();
    // The reasoning is there but folded away.
    const details = screen.getByText("The model's reasoning").closest("details");
    expect(details?.open).toBe(false);
    expect(screen.queryByRole("note")).toBeNull();
  });

  it("warns when the answer has a number no tool gave", async () => {
    const { model } = scriptedModel([{ content: "Your servers earned CHF 99 today." }]);
    render(<Chat model={model} data={fakeData()} />);
    fireEvent.change(await screen.findByLabelText("Your question"), {
      target: { value: "What did my servers earn?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Ask" }));
    expect((await screen.findByRole("note")).textContent).toMatch(/No tool gave 99/);
    expect(screen.getByText(/answered without reading any data/)).toBeTruthy();
  });

  it("says so when Ollama is not running, and offers no questions", async () => {
    const { model } = scriptedModel([], "offline");
    render(<Chat model={model} data={fakeData()} />);
    expect((await screen.findByRole("status")).textContent).toMatch(/not running/);
    expect(screen.queryByRole("button", { name: "Ask" })).toBeNull();
  });

  it("shows a plain message when the model fails, never the raw error", async () => {
    const { model } = scriptedModel([]);
    model.reply = () => Promise.reject(new TypeError("fetch failed: ECONNRESET"));
    render(<Chat model={model} data={fakeData()} />);
    fireEvent.click(await screen.findByRole("button", { name: "What would solar save me?" }));
    expect((await screen.findByRole("alert")).textContent).toBe(
      "The local model could not answer.",
    );
  });
});
