// Server-authoritative, versioned visual-area rules. RGB distance is a conservative
// visibility heuristic, not a guarantee of human perception on every display.
export const AREA_RULES = {
  version: 1, sampleWidth: 1024, channelDifference: 32, minimumPixels: 16,
  smallBoundary: .01, largeBoundary: .03, maxRasterVisits: 8_000_000,
  small: { finder: 150, unfound: 50 }, medium: { finder: 100, unfound: 100 },
  large: { finder: 50, unfound: 150 },
} as const;
export function areaPoints(ratio: number) {
  return ratio < AREA_RULES.smallBoundary ? AREA_RULES.small : ratio < AREA_RULES.largeBoundary ? AREA_RULES.medium : AREA_RULES.large;
}
