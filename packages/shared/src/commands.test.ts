import { describe, expect, it } from "vitest";
import { ClientCommandSchema, SettingsUpdateSchema, chooseImage, GAME_DEFAULTS, IMAGES } from "./index";
describe("room commands and individual illustrations", () => {
  it("defaults to a single-player-capable game with bakery selected", () => {
    expect(GAME_DEFAULTS.minPlayers).toBe(1); expect(GAME_DEFAULTS.imageIds).toEqual(["bakery"]);
  });
  it("validates the configured illustration and rejects removed series settings", () => {
    expect(SettingsUpdateSchema.parse({imageIds:["toy-room","bakery"]})).toEqual({imageIds:["toy-room","bakery"]});
    expect(SettingsUpdateSchema.parse({imageIds:[]})).toEqual({imageIds:[]});
    for (const value of [{imageIds:["unknown"]},{deckId:"people"},{stageCount:2},{}]) expect(SettingsUpdateSchema.safeParse(value).success).toBe(false);
  });
  it("uses an exact selection or samples the complete illustration list", () => {
    expect(chooseImage(["toy-room"])).toBe("/assets/toy-room.png");
    expect(chooseImage(GAME_DEFAULTS.imageIds,0)).toBe(IMAGES[0]!.src);
    expect(chooseImage(IMAGES.map(image=>image.id),.999)).toBe(IMAGES.at(-1)!.src);
    expect(IMAGES).toHaveLength(32);
  });
  it("rejects removed and malformed commands", () => {
    expect(ClientCommandSchema.safeParse({type:"phase.advance",commandId:crypto.randomUUID(),payload:{}}).success).toBe(true);
    expect(ClientCommandSchema.safeParse({type:"round.continue",commandId:crypto.randomUUID(),payload:{}}).success).toBe(false);
    expect(ClientCommandSchema.safeParse({type:"member.ready",commandId:crypto.randomUUID(),payload:{ready:"yes"}}).success).toBe(false);
  });
});
