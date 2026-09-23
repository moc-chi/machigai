import {describe,it,expect,vi} from "vitest";
import sharp from "sharp";
import {readPixels,pixelsToPng} from "./original-image";
import {encodeOriginalPixels,decodeOriginalPixels,ORIGINAL_IMAGE_LIMITS as L} from "@machigai/shared";
describe("original image validation",()=>{
  it("rejects forged, oversized and truncated pixel bodies",async()=>{
    const good=encodeOriginalPixels(32,32,new Uint8Array(32*32*3));
    expect(()=>decodeOriginalPixels(good.slice(0,-1))).toThrow();
    expect(()=>decodeOriginalPixels(new Uint8Array([...good,0]))).toThrow();
    expect(()=>encodeOriginalPixels(2048,32,new Uint8Array())).toThrow();
    expect(()=>decodeOriginalPixels(new TextEncoder().encode("<svg onload=alert(1)>"))).toThrow();
    await expect(readPixels(new Request("https://test",{method:"POST",headers:{"content-type":"image/png"},body:good}))).rejects.toThrow("IMAGE_INVALID");
    await expect(readPixels(new Request("https://test",{method:"POST",headers:{"content-type":"application/x-machigai-rgb"},body:new Uint8Array(L.maxWireBytes+1)}))).rejects.toThrow("IMAGE_TOO_LARGE");
  });
  it("accepts valid Content-Length and rejects malformed lengths",async()=>{
    const body=encodeOriginalPixels(32,32,new Uint8Array(32*32*3));
    const request=(length:string)=>new Request("https://test",{method:"POST",headers:{"content-type":"application/x-machigai-rgb","content-length":length},body});
    expect((await readPixels(request(String(body.length)))).width).toBe(32);
    await expect(readPixels(request("abc"))).rejects.toThrow("IMAGE_TOO_LARGE");
  });
  it("cancels a stalled upload",async()=>{
    vi.useFakeTimers();const cancel=vi.fn();
    try{
      const body=new ReadableStream<Uint8Array>({cancel});
      const pending=readPixels(new Request("https://test",{method:"POST",headers:{"content-type":"application/x-machigai-rgb"},body,duplex:"half"} as RequestInit));
      const rejected=expect(pending).rejects.toThrow("IMAGE_TIMEOUT");
      await vi.advanceTimersByTimeAsync(L.readTimeoutMs);await rejected;expect(cancel).toHaveBeenCalled();
    }finally{vi.useRealTimers()}
  });
  it("produces a decodable metadata-free PNG containing exactly the supplied pixels",async()=>{
    const rgb=new Uint8Array(48*64*3);for(let i=0;i<rgb.length;i++)rgb[i]=i%251;
    const png=await pixelsToPng({width:48,height:64,rgb});
    const decoded=await sharp(png).raw().toBuffer({resolveWithObject:true});
    expect(decoded.info.width).toBe(48);expect(decoded.info.height).toBe(64);
    expect(new Uint8Array(decoded.data)).toEqual(rgb);
    const metadata=await sharp(png).metadata();expect(metadata.exif).toBeUndefined();expect(metadata.xmp).toBeUndefined();
  });
});
