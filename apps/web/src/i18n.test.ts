import { describe, expect, it } from "vitest";
import { LANGUAGES, translate, translations } from "./i18n";
describe("translations", () => {
  it("has all nine languages for every UI string", () => {
    expect(LANGUAGES).toHaveLength(9);
    for (const row of translations) {
      expect(row).toHaveLength(10);
      for (const text of row.slice(1)) expect(text.trim()).not.toBe("");
      const placeholders = (value: string) => [...value.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort();
      for (const value of row.slice(1)) expect(placeholders(value)).toEqual(placeholders(row[2]));
    }
  });
  it("updates language and interpolates progress without changing game data", () => {
    expect(translate("ja","progress",{n:2,total:5})).toBe("確定 2 / 5");
    expect(translate("de","progress",{n:2,total:5})).toBe("Bestätigt 2 / 5");
  });
  it("uses the configured drawing count and requested Japanese share copy", () => {
    expect(translate("ja","drawingCount",{n:5})).toBe("間違いを5つ描こう");
    expect(translate("ja","shareText")).toBe("まちがいパーティで間違い探しを作りました！ #DifferenceParty");
  });
});
