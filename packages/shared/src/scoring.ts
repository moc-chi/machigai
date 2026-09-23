// Server-authoritative, versioned visual-area rules. RGB distance is a conservative
// visibility heuristic, not a guarantee of human perception on every display.
import { AREA_RULES as rules } from "./scoring-config.mjs";
export const AREA_RULES = rules as {
  readonly version: 1; readonly sampleWidth: 1024; readonly channelDifference: 32;
  readonly minimumPixels: 16; readonly smallBoundary: .01; readonly largeBoundary: .03;
  readonly maxRasterVisits: 8_000_000;
  readonly small: { readonly finder: 150; readonly unfound: 50 };
  readonly medium: { readonly finder: 100; readonly unfound: 100 };
  readonly large: { readonly finder: 50; readonly unfound: 150 };
};
export function areaPoints(ratio: number) {
  return ratio < AREA_RULES.smallBoundary ? AREA_RULES.small : ratio < AREA_RULES.largeBoundary ? AREA_RULES.medium : AREA_RULES.large;
}