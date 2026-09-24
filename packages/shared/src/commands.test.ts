import { describe, expect, it } from "vitest";
import { ClientCommandSchema, SettingsUpdateSchema, chooseImage, GAME_DEFAULTS, IMAGES } from "./index";
describe("room commands and illustrations", () => {
  it("starts with the bakery selected", () => {
    expect(GAME_DEFAULTS.imageIds).toEqual(["bakery"]); expect(GAME_DEFAULTS.sourceType).toBe("standard");
  });
  it("uses the approved three-second, twenty-point miss penalty", () => {
    expect(GAME_DEFAULTS.missCooldownSeconds).toBe(3);
    expect(GAME_DEFAULTS.missPenalty).toBe(20);
    expect(SettingsUpdateSchema.safeParse({missPenalty:-100}).success).toBe(false);
  });
  it("validates partial automatic settings updates", () => {
    expect(SettingsUpdateSchema.parse({imageIds:["bakery","harbor"]})).toEqual({imageIds:["bakery","harbor"]});
    expect(SettingsUpdateSchema.parse({sourceType:"original"})).toEqual({sourceType:"original"});
    for (const value of [{differencesPerPlayer:6},{drawingSeconds:29},{answeringSeconds:301},{sourceType:"unknown"},{imageIds:["missing"]},{}]) expect(SettingsUpdateSchema.safeParse(value).success).toBe(false);
  });
  it("chooses only from the selected illustrations", () => {
    expect(chooseImage(["bakery"],.999)).toBe("/assets/bakery.png");
    expect(chooseImage(["harbor","camping"],0)).toBe("/assets/harbor.png");
    expect(chooseImage(["harbor","camping"],.999)).toBe("/assets/camping.png");
  });
  it("keeps titles and difficulty metadata for all illustrations", () => {
    expect(IMAGES).toHaveLength(32);
    expect(IMAGES[0]).toMatchObject({id:"bakery",title:"パン屋さん",difficulty:"easy"});
    expect(IMAGES.some(image=>image.title==="七つの大罪")).toBe(true);
    expect(IMAGES.some(image=>(image.title as string)==="七つの罪")).toBe(false);
  });
  it("rejects malformed commands rather than trusting client casts", () => {
    expect(ClientCommandSchema.safeParse({type:"phase.advance",commandId:crypto.randomUUID(),payload:{}}).success).toBe(true);
    expect(ClientCommandSchema.safeParse({type:"drawing.ready",commandId:crypto.randomUUID(),payload:{}}).success).toBe(true);
    expect(ClientCommandSchema.safeParse({type:"drawing.submit",commandId:crypto.randomUUID(),payload:{differences:[]}}).success).toBe(true);
    expect(ClientCommandSchema.safeParse({type:"drawing.submit",commandId:crypto.randomUUID(),payload:{differences:Array(6).fill({strokes:[]})}}).success).toBe(false);
    expect(ClientCommandSchema.safeParse({type:"member.ready",commandId:crypto.randomUUID(),payload:{ready:"yes"}}).success).toBe(false);
  });
});
