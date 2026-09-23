export declare const AREA_RULES: {
  readonly version: 1; readonly sampleWidth: 1024; readonly channelDifference: 32;
  readonly minimumPixels: 16; readonly smallBoundary: .01; readonly largeBoundary: .03;
  readonly maxRasterVisits: 8_000_000;
  readonly small: { readonly finder: 150; readonly unfound: 50 };
  readonly medium: { readonly finder: 100; readonly unfound: 100 };
  readonly large: { readonly finder: 50; readonly unfound: 150 };
};