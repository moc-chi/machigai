import { AREA_RULES, type Stroke } from "@machigai/shared";

export type SourcePixels = { width: number; height: number; rgb: Uint8Array };
export type VisibleArea = { pixels: number; ratio: number; runs: number[][] };

// Software rasterizer: same quadratic path, round caps and short-edge pen width
// as drawSmoothStroke. Sample pixel centers; no browser/client measurements trusted.
export function rasterize(source: SourcePixels, strokes: Stroke[]): Uint8Array {
  const {width:w,height:h}=source, rgb=source.rgb.slice(); let visits=0;
  for(const stroke of strokes){
    const color=[1,3,5].map(i=>parseInt(stroke.color.slice(i,i+2),16));
    const coverage=new Uint8Array(w*h),touched:number[]=[];
    const radius=stroke.width*Math.min(w,h)/2;
    const segment=(ax:number,ay:number,bx:number,by:number)=>{
      const minX=Math.max(0,Math.floor(Math.min(ax,bx)-radius-.5)),maxX=Math.min(w-1,Math.ceil(Math.max(ax,bx)+radius+.5));
      const minY=Math.max(0,Math.floor(Math.min(ay,by)-radius-.5)),maxY=Math.min(h-1,Math.ceil(Math.max(ay,by)+radius+.5));
      visits+=(maxX-minX+1)*(maxY-minY+1);
      if(visits>AREA_RULES.maxRasterVisits)throw new Error("DRAWING_TOO_COMPLEX");
      const dx=bx-ax,dy=by-ay,len=dx*dx+dy*dy;
      for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++){
        const index=y*w+x;let mask=coverage[index]!;
        for(let s=0;s<4;s++){
          const px=x+(s%2?.75:.25),py=y+(s<2?.25:.75);
          const t=len?Math.max(0,Math.min(1,((px-ax)*dx+(py-ay)*dy)/len)):0;
          if((px-ax-t*dx)**2+(py-ay-t*dy)**2<=radius*radius)mask|=1<<s;
        }
        if(mask&&!coverage[index])touched.push(index);coverage[index]=mask;
      }
    };
    let ax=stroke.points[0]!.x*w,ay=stroke.points[0]!.y*h;
    if(stroke.points.length===1)segment(ax,ay,ax,ay);
    for(let i=1;i<stroke.points.length-1;i++){
      const p=stroke.points[i]!,q=stroke.points[i+1]!,cx=p.x*w,cy=p.y*h,bx=(p.x+q.x)*w/2,by=(p.y+q.y)*h/2;
      const steps=Math.max(1,Math.ceil((Math.hypot(cx-ax,cy-ay)+Math.hypot(bx-cx,by-cy))/2));
      const sx=ax,sy=ay;
      for(let n=1;n<=steps;n++){const t=n/steps,u=1-t,x=u*u*sx+2*u*t*cx+t*t*bx,y=u*u*sy+2*u*t*cy+t*t*by;segment(ax,ay,x,y);ax=x;ay=y;}
    }
    const last=stroke.points.at(-1)!;segment(ax,ay,last.x*w,last.y*h);
    for(const index of touched){const mask=coverage[index]!,alpha=((mask&1)+((mask>>1)&1)+((mask>>2)&1)+((mask>>3)&1))/4;for(let c=0;c<3;c++){const i=index*3+c;rgb[i]=Math.round(rgb[i]!*(1-alpha)+color[c]!*alpha);}}
  }
  return rgb;
}
export function visibleArea(source: SourcePixels, composite: Uint8Array): VisibleArea {
  const {width,height,rgb}=source;let pixels=0;const runs:number[][]=[];
  for(let y=0;y<height;y++){
    let start=-1;
    for(let x=0;x<=width;x++){
      const i=(y*width+x)*3;
      const changed=x<width&&Math.max(Math.abs(rgb[i]!-composite[i]!),Math.abs(rgb[i+1]!-composite[i+1]!),Math.abs(rgb[i+2]!-composite[i+2]!))>=AREA_RULES.channelDifference;
      if(changed){pixels++;if(start<0)start=x;}
      else if(start>=0){runs.push([y,start,x-1]);start=-1;}
    }
  }
  return {pixels,ratio:pixels/(width*height),runs};
}
export function visibleHit(x:number,y:number,area:VisibleArea,width:number,height:number,padding=.025):boolean {
  return area.runs.some(([row,start,end])=>Math.hypot(Math.max(start!/width-x,0,x-(end!+1)/width),Math.max(row!/height-y,0,y-(row!+1)/height))<=padding);
}
export function uncoveredArea(area:VisibleArea,existing:VisibleArea,width:number,height:number):VisibleArea {
  const mask=new Uint8Array(width*height);
  for(const [y,start,end] of existing.runs)mask.fill(1,y!*width+start!,y!*width+end!+1);
  let pixels=0;const runs:number[][]=[];
  for(const [y,start,end] of area.runs){let from=-1;for(let x=start!;x<=end!+1;x++){
    if(x<=end!&&!mask[y!*width+x]){pixels++;if(from<0)from=x;}
    else if(from>=0){runs.push([y!,from,x-1]);from=-1;}
  }}
  return {pixels,ratio:pixels/(width*height),runs};
}
