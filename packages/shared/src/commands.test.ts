import { describe, expect, it } from "vitest";
import { ClientCommandSchema, SettingsUpdateSchema, chooseImage, GAME_DEFAULTS, IMAGES } from "./index";
describe("room commands and decks", () => {
  it("starts with one round using every available series", () => {
    expect(GAME_DEFAULTS.stageCount).toBe(1); expect(GAME_DEFAULTS.deckId).toBe("random");
  });
  it("uses the approved three-second, twenty-point miss penalty", () => {
    expect(GAME_DEFAULTS.missCooldownSeconds).toBe(3);
    expect(GAME_DEFAULTS.missPenalty).toBe(20);
    expect(SettingsUpdateSchema.safeParse({missPenalty:-100}).success).toBe(false);
  });
  it("validates partial automatic settings updates", () => {
    expect(SettingsUpdateSchema.parse({stageCount:4})).toEqual({stageCount:4});
    for (const value of [{stageCount:0},{stageCount:11},{differencesPerPlayer:6},{drawingSeconds:29},{answeringSeconds:301},{deckId:"unknown"},{}]) expect(SettingsUpdateSchema.safeParse(value).success).toBe(false);
  });
  it("does not repeat the previous image", () => {
    for (const image of IMAGES) for (const random of [0,.2,.5,.999]) expect(chooseImage(image.src,random,image.deck)).not.toBe(image.src);
  });
  it("offers five images in each series", () => {
    expect(SettingsUpdateSchema.parse({deckId:"people"})).toEqual({deckId:"people"});
    expect(chooseImage(undefined,0,"people")).toBe("/assets/people-market.png");
    expect(SettingsUpdateSchema.parse({deckId:"random"})).toEqual({deckId:"random"});
    expect(chooseImage(undefined,0,"random")).toBe(IMAGES[0]!.src);
    expect(chooseImage(undefined,.999,"random")).toBe(IMAGES.at(-1)!.src);
    for(const deck of ["animals","people"]) expect(IMAGES.filter(image=>image.deck===deck)).toHaveLength(5);
  });
  it("rejects malformed commands rather than trusting client casts", () => {
    expect(ClientCommandSchema.safeParse({type:"phase.advance",commandId:crypto.randomUUID(),payload:{}}).success).toBe(true);
    expect(ClientCommandSchema.safeParse({type:"drawing.ready",commandId:crypto.randomUUID(),payload:{}}).success).toBe(true);
    expect(ClientCommandSchema.safeParse({type:"drawing.submit",commandId:crypto.randomUUID(),payload:{differences:[]}}).success).toBe(true);
    expect(ClientCommandSchema.safeParse({type:"drawing.submit",commandId:crypto.randomUUID(),payload:{differences:Array(6).fill({strokes:[]})}}).success).toBe(false);
    expect(ClientCommandSchema.safeParse({type:"member.ready",commandId:crypto.randomUUID(),payload:{ready:"yes"}}).success).toBe(false);
  });
});
