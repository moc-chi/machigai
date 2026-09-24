import { describe, expect, it } from "vitest";
import { PARTICIPANT_COLORS, participantColor } from "./participant-colors";

describe("participantColor", () => {
  it("assigns a stable distinct color to each supported join order", () => {
    const assigned = Array.from({ length: 10 }, (_, index) => participantColor(index + 1));
    expect(new Set(assigned).size).toBe(10);
    expect(assigned).toEqual([...PARTICIPANT_COLORS]);
  });
});
