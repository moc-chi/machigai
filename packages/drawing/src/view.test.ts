import { describe, expect, it } from "vitest";
import { imagePoint, zoomView } from "./view";
describe("normalized image coordinates", () => {
  it("maps a transformed image rect back to its source", () => {
    expect(imagePoint(150,100,{left:-150,top:-100,width:600,height:400})).toEqual({x:.5,y:.5});
  });
  it("keeps the zoom anchor stationary", () => {
    expect(zoomView({zoom:1,x:0,y:0},2,{x:.25,y:0})).toEqual({zoom:2,x:-.25,y:0});
  });
});
