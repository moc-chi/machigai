import { describe, expect, it } from "vitest";
import { ClientCommandSchema, SettingsUpdateSchema, chooseImage, GAME_DEFAULTS, IMAGES } from "./index";
describe("room commands and decks", () => {
  it("starts with one random animal round", () => {
    expect(GAME_DEFAULTS.stageCount).toBe(1); expect(GAME_DEFAULTS.deckId).toBe("animals");
  });
  it("validates partial automatic settings updates", () => {
    expect(SettingsUpdateSchema.parse({stageCount:4})).toEqual({stageCount:4});
    for (const value of [{stageCount:0},{stageCount:11},{differencesPerPlayer:6},{drawingSeconds:29},{answeringSeconds:301},{deckId:"unknown"},{}]) expect(SettingsUpdateSchema.safeParse(value).success).toBe(false);
  });
  it("does not repeat the previous image", () => {
    for (const image of IMAGES) for (const random of [0,.2,.5,.999]) expect(chooseImage(image.src,random)).not.toBe(image.src);
  });
  it("rejects malformed commands rather than trusting client casts", () => {
    expect(ClientCommandSchema.safeParse({type:"phase.advance",commandId:crypto.randomUUID(),payload:{}}).success).toBe(true);
    expect(ClientCommandSchema.safeParse({type:"member.ready",commandId:crypto.randomUUID(),payload:{ready:"yes"}}).success).toBe(false);
  });
});
