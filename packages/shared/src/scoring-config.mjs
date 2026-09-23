export const AREA_RULES = {
  version: 1, sampleWidth: 1024, channelDifference: 32, minimumPixels: 16,
  smallBoundary: .01, largeBoundary: .03, maxRasterVisits: 8_000_000,
  small: { finder: 150, unfound: 50 }, medium: { finder: 100, unfound: 100 },
  large: { finder: 50, unfound: 150 },
};