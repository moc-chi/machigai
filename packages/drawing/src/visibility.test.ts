import { describe,it,expect } from "vitest";
import { AREA_RULES,areaPoints,type Stroke } from "@machigai/shared";
import { rasterize,visibleArea,visibleHit,uncoveredArea } from "./visibility";
const source={width:400,height:300,rgb:new Uint8Array(400*300*3).fill(255)};
const stroke=(color="#000000",width=.03):Stroke=>({id:"test",color,width,points:[{x:.2,y:.5,t:0},{x:.8,y:.5,t:1}]});
describe("authoritative visible-area scoring",()=>{
  it("uses exact approved boundaries",()=>{
    expect(areaPoints(.00999)).toEqual({finder:150,unfound:50});
    expect(areaPoints(.01)).toEqual({finder:100,unfound:100});
    expect(areaPoints(.02999)).toEqual({finder:100,unfound:100});
    expect(areaPoints(.03)).toEqual({finder:50,unfound:150});
  });
  it("ignores identical and nearly identical large paints",()=>{
    for(const color of ["#ffffff","#f0f0f0","#e0e0e0"])expect(visibleArea(source,rasterize(source,[stroke(color,.08)])).pixels).toBe(0);
    expect(visibleArea(source,rasterize(source,[stroke("#dfdfdf",.08)])).pixels).toBeGreaterThan(16);
  });
  it("counts union pixels, not bounding rectangles or repeated paths",()=>{
    const line=stroke();const one=visibleArea(source,rasterize(source,[line]));
    expect(visibleArea(source,rasterize(source,[line,line])).pixels).toBe(one.pixels);
    expect(one.ratio).toBeGreaterThan(.01);expect(one.ratio).toBeLessThan(.03);
    expect(visibleHit(.5,.5,one,400,300)).toBe(true);expect(visibleHit(.5,.7,one,400,300)).toBe(false);
  });
  it("compares final colors, including repainting back to original",()=>{
    // A slightly wider repaint also covers the anti-aliased edge.
    expect(visibleArea(source,rasterize(source,[stroke(),stroke("#ffffff",.04)])).pixels).toBe(0);
  });
  it("supports thin strokes and excludes tiny invisible dots",()=>{
    const dot={...stroke("#000000",.001),points:[{x:.5,y:.5,t:0}]};
    expect(visibleArea(source,rasterize(source,[dot])).pixels).toBeLessThan(AREA_RULES.minimumPixels);
    expect(visibleArea(source,rasterize(source,[stroke("#000000",.005)])).pixels).toBeGreaterThan(AREA_RULES.minimumPixels);
  });
  it("caps expensive payload rasterization",()=>{
    const lines=Array.from({length:100},()=>({...stroke("#000000",.08),points:[{x:0,y:0,t:0},{x:1,y:1,t:1}]}));
    expect(()=>rasterize(source,lines)).toThrow("DRAWING_TOO_COMPLEX");
  });
  it("excludes previously confirmed area from both points and hit regions",()=>{
    const previous=visibleArea(source,rasterize(source,[stroke()]));
    expect(uncoveredArea(previous,previous,400,300).pixels).toBe(0);
    const more=visibleArea(source,rasterize(source,[stroke("#000000",.06)]));
    const fresh=uncoveredArea(more,previous,400,300);
    expect(fresh.pixels).toBe(more.pixels-previous.pixels);
    expect(fresh.ratio).toBeLessThan(more.ratio);
  });
});
