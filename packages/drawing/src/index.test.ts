import { describe, expect, it } from "vitest";
import { buildHitRegion, distanceToSegment, hitTest } from "./index";

const difference = { strokes: [{ id: "s1", color: "#ff0000", width: .01, points: [{ x: .2, y: .2, t: 0 }, { x: .8, y: .2, t: 10 }] }] };

describe("hit regions", () => {
  it("hits around a drawn curve and rejects distant points", () => {
    const region = buildHitRegion(difference);
    expect(hitTest({ x: .5, y: .21, t: 0 }, region)).toBe(true);
    expect(hitTest({ x: .5, y: .5, t: 0 }, region)).toBe(false);
  });
  it("calculates distance to a segment", () => expect(distanceToSegment({ x: .5, y: .4, t: 0 }, { ax: .2, ay: .2, bx: .8, by: .2, radius: .1 })).toBeCloseTo(.2));
});
