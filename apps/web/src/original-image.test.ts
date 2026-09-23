import {describe,it,expect} from "vitest";
import sharp from "sharp";
import {imageDimensions,prepareOriginal} from "./original-image";
describe("image selection checks",()=>{
  it("reads PNG JPEG and WebP dimensions before decode",async()=>{
    for(const format of ["png","jpeg","webp"] as const){
      const file=await sharp({create:{width:123,height:321,channels:3,background:"#aabbcc"}}).toFormat(format).toBuffer();
      expect(imageDimensions(file,"image/"+format)).toEqual({width:123,height:321});
    }
  });
  it("rejects nonimages, forged MIME and oversized files before browser decode",async()=>{
    const svg=new TextEncoder().encode("<svg></svg>");
    expect(()=>imageDimensions(svg,"image/png")).toThrow();
    await expect(prepareOriginal(new File([svg],"test.svg",{type:"image/svg+xml"}))).rejects.toThrow("IMAGE_INVALID");
    await expect(prepareOriginal(new File([new Uint8Array(5*1024*1024+1)],"test.png",{type:"image/png"}))).rejects.toThrow("IMAGE_TOO_LARGE");
  });
});
