import { describe, expect, it } from "vitest";
import { GAME_DEFAULTS, SettingsUpdateSchema } from "./index";

describe("game settings", () => {
  it("supports two-player rooms and a larger zoom range", () => {
    expect(GAME_DEFAULTS.minPlayers).toBe(2);
    expect(GAME_DEFAULTS.zoomMax).toBe(6);
  });

  it("accepts host settings within the supported ranges", () => {
    expect(SettingsUpdateSchema.parse({ differencesPerPlayer: 5, drawingSeconds: 300, answeringSeconds: 30, imageUrl: "/assets/space.png" })).toMatchObject({ differencesPerPlayer: 5 });
  });

  it("rejects more than five differences", () => {
    expect(() => SettingsUpdateSchema.parse({ differencesPerPlayer: 6, drawingSeconds: 90, answeringSeconds: 60, imageUrl: "/assets/bakery.png" })).toThrow();
  });
});
