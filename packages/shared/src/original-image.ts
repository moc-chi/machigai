// The wire format carries pixels only: no filename, metadata or encoded file.
export const ORIGINAL_IMAGE_LIMITS = {
  maxFileBytes: 5 * 1024 * 1024, maxInputPixels: 24000000, maxInputEdge: 10000,
  maxEdge: 1024, minEdge: 32, maxAspectRatio: 4,
  headerBytes: 8, maxWireBytes: 8 + 1024 * 1024 * 3,
  chunkBytes: 64 * 1024, readTimeoutMs: 10000,
  uploadIntervalMs: 5000, maxUploadsPerHour: 20, rateWindowMs: 3600000,
} as const;
export type OriginalImage = { id: string; url: string; width: number; height: number; bytes: number; expiresAt?: string };
export function validOriginalDimensions(width: number, height: number) {
  const l = ORIGINAL_IMAGE_LIMITS;
  return Number.isInteger(width) && Number.isInteger(height) &&
    Math.min(width,height) >= l.minEdge && Math.max(width,height) <= l.maxEdge &&
    Math.max(width,height) / Math.min(width,height) <= l.maxAspectRatio;
}
export function encodeOriginalPixels(width: number, height: number, rgb: Uint8Array): Uint8Array<ArrayBuffer> {
  if (!validOriginalDimensions(width,height) || rgb.length !== width*height*3) throw new Error("IMAGE_INVALID");
  const out = new Uint8Array(8+rgb.length); out.set([82,71,66,49]);
  const view = new DataView(out.buffer); view.setUint16(4,width); view.setUint16(6,height); out.set(rgb,8); return out;
}
export function decodeOriginalPixels(data: Uint8Array) {
  if(data.length<8 || data[0]!==82 || data[1]!==71 || data[2]!==66 || data[3]!==49) throw new Error("IMAGE_INVALID");
  const view = new DataView(data.buffer,data.byteOffset,data.byteLength), width=view.getUint16(4),height=view.getUint16(6);
  if(!validOriginalDimensions(width,height)||data.length!==8+width*height*3)throw new Error("IMAGE_INVALID");
  return {width,height,rgb:data.slice(8)};
}
