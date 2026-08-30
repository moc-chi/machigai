import { useCallback, useEffect, useRef, useState } from "react";
import { GAME_DEFAULTS, IMAGES, LIMITS, commandId, type Difference, type Stroke } from "@machigai/shared";
import { drawSmoothStroke } from "@machigai/drawing";
import { imagePoint, zoomView, type View } from "@machigai/drawing";
import { useText } from "./i18n";
export type Tool = "draw" | "answer" | "move" | "pick";
export const initialView: View = { zoom: 1, x: 0, y: 0 };

export function Board({ imageUrl, differences = [], drafts = [], view, onView, tool = "move", color = "#111111", width = .008, disabled = false, onStroke, onPick, onAnswer, marks = false, persistentMarks = false, hideFound = false, label }: {
  imageUrl: string; differences?: Difference[]; drafts?: Stroke[]; view: View; onView: (view: View) => void;
  tool?: Tool; color?: string; width?: number; disabled?: boolean; onStroke?: (stroke: Stroke) => void;
  onPick?: (color: string) => void; onAnswer?: (x: number,y: number) => void; marks?: boolean; persistentMarks?: boolean; hideFound?: boolean; label?: string;
}) {
  const t = useText(); const viewport = useRef<HTMLDivElement>(null); const layer = useRef<HTMLDivElement>(null); const canvas = useRef<HTMLCanvasElement>(null);
  const source = useRef<HTMLImageElement | null>(null); const current = useRef<Stroke | null>(null);
  const pointers = useRef(new Map<number,{x:number;y:number}>());
  const gesture = useRef<{view:View; x:number; y:number; distance:number; multi:boolean} | null>(null);
  const moved = useRef(false); const started = useRef(0); const viewRef = useRef(view); viewRef.current = view;
  const [loaded,setLoaded] = useState(false); const [cursor,setCursor] = useState<{x:number;y:number;size:number}|null>(null);
  const [now,setNow] = useState(Date.now());
  const image = IMAGES.find(i => i.src === imageUrl) ?? IMAGES[0];
  const render = useCallback(() => {
    const ctx = canvas.current?.getContext("2d"); const img = source.current; if (!ctx || !img) return;
    const w=canvas.current!.width,h=canvas.current!.height; ctx.clearRect(0,0,w,h); ctx.drawImage(img,0,0,w,h);
    for (const difference of differences) {
      if (hideFound && difference.foundAt && now - Date.parse(difference.foundAt) >= LIMITS.markerMs) continue;
      if (marks && (persistentMarks || (difference.foundAt && now - Date.parse(difference.foundAt) < LIMITS.markerMs))) {
        ctx.save(); ctx.globalAlpha=.5;
        for (const stroke of difference.strokes) drawSmoothStroke(ctx,{...stroke,color:"#24b990",width:stroke.width+.018},w,h);
        ctx.restore();
      }
      for (const stroke of difference.strokes) drawSmoothStroke(ctx,stroke,w,h);
    }
    for (const stroke of drafts) drawSmoothStroke(ctx,stroke,w,h);
    if (current.current) drawSmoothStroke(ctx,current.current,w,h);
  },[differences,drafts,marks,persistentMarks,hideFound,now]);
  useEffect(() => { const img=new Image(); let active=true; setLoaded(false); img.onload=()=>{if(active){source.current=img;setLoaded(true)}}; img.src=imageUrl; return()=>{active=false}; },[imageUrl]);
  useEffect(()=>{render()},[render,loaded]);
  useEffect(()=>{if(!marks||persistentMarks)return;const timer=setInterval(()=>setNow(Date.now()),200);return()=>clearInterval(timer)},[marks,persistentMarks]);
  useEffect(()=>{
    const node=viewport.current; if(!node)return;
    const wheel=(e:WheelEvent)=>{e.preventDefault();const r=node.getBoundingClientRect();const v=viewRef.current;onView(zoomView(v,Math.max(GAME_DEFAULTS.zoomMin,Math.min(GAME_DEFAULTS.zoomMax,v.zoom*Math.exp(-e.deltaY*.002))),{x:(e.clientX-r.left)/r.width-.5,y:(e.clientY-r.top)/r.height-.5}))};
    node.addEventListener("wheel",wheel,{passive:false});return()=>node.removeEventListener("wheel",wheel);
  },[onView]);
  const point=(e:{clientX:number;clientY:number})=>imagePoint(e.clientX,e.clientY,layer.current!.getBoundingClientRect());
  const down=(e:React.PointerEvent<HTMLDivElement>)=>{
    if(!loaded)return;e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId,{x:e.clientX,y:e.clientY});
    const ps=[...pointers.current.values()];
    if(ps.length===2){current.current=null;render();moved.current=true;gesture.current={view:viewRef.current,x:(ps[0]!.x+ps[1]!.x)/2,y:(ps[0]!.y+ps[1]!.y)/2,distance:Math.hypot(ps[0]!.x-ps[1]!.x,ps[0]!.y-ps[1]!.y),multi:true};return}
    if(ps.length!==1)return;
    moved.current=false;gesture.current={view:viewRef.current,x:e.clientX,y:e.clientY,distance:0,multi:false};
    const p=point(e);if(p.x<0||p.x>1||p.y<0||p.y>1)return;
    if(tool==="pick"&&!disabled){const c=canvas.current!;const rgb=c.getContext("2d")!.getImageData(Math.min(c.width-1,Math.floor(p.x*c.width)),Math.min(c.height-1,Math.floor(p.y*c.height)),1,1).data;onPick?.("#"+[rgb[0]!,rgb[1]!,rgb[2]!].map(v=>v.toString(16).padStart(2,"0")).join(""));return}
    if(tool==="draw"&&!disabled){started.current=Date.now();current.current={id:commandId(),color,width,points:[{...p,t:0}]};render()}
  };
  const move=(e:React.PointerEvent<HTMLDivElement>)=>{
    if(e.pointerType==="mouse"&&tool==="draw"){const r=viewport.current!.getBoundingClientRect();const ir=layer.current!.getBoundingClientRect();setCursor({x:e.clientX-r.left,y:e.clientY-r.top,size:Math.max(2,width*Math.min(ir.width,ir.height))})}
    if(!pointers.current.has(e.pointerId))return;
    pointers.current.set(e.pointerId,{x:e.clientX,y:e.clientY});
    const g=gesture.current;if(!g)return;const ps=[...pointers.current.values()];const r=viewport.current!.getBoundingClientRect();
    if(ps.length>=2){const a=ps[0]!,b=ps[1]!;const ratio=Math.hypot(a.x-b.x,a.y-b.y)/Math.max(1,g.distance);const v=zoomView(g.view,Math.max(1,Math.min(GAME_DEFAULTS.zoomMax,g.view.zoom*ratio)),{x:(g.x-r.left)/r.width-.5,y:(g.y-r.top)/r.height-.5});onView({...v,x:v.x+((a.x+b.x)/2-g.x)/r.width,y:v.y+((a.y+b.y)/2-g.y)/r.height});return}
    if(g.multi)return;
    const dx=e.clientX-g.x,dy=e.clientY-g.y;if(Math.hypot(dx,dy)>5)moved.current=true;
    if(tool==="move"){onView({...g.view,x:g.view.x+dx/r.width,y:g.view.y+dy/r.height});return}
    if(current.current&&!disabled){const p=point(e);const previous=current.current.points.at(-1)!;if(p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1&&current.current.points.length<LIMITS.maxPoints&&Math.hypot(p.x-previous.x,p.y-previous.y)>.0005){current.current.points.push({...p,t:Date.now()-started.current});render()}}
  };
  const up=(e:React.PointerEvent<HTMLDivElement>,cancel=false)=>{
    const g=gesture.current;
    if(!cancel&&!g?.multi&&pointers.current.size===1){
      const stroke=current.current; current.current=null;
      if(stroke&&!disabled)onStroke?.(stroke);
      if(tool==="answer"&&!disabled&&!moved.current){const p=point(e);if(p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1)onAnswer?.(p.x,p.y)}
    }else current.current=null;
    pointers.current.delete(e.pointerId);if(!pointers.current.size)gesture.current=null;render();
  };
  return <figure className="image-board">{label&&<figcaption>{label}</figcaption>}
    <div ref={viewport} className={"board-viewport tool-"+tool} style={{aspectRatio:image.width+"/"+image.height}} onPointerDown={down} onPointerMove={move} onPointerUp={e=>up(e)} onPointerCancel={e=>up(e,true)} onPointerLeave={()=>setCursor(null)}>
      <div ref={layer} className="board-layer" style={{transform:`translate(${view.x*100}%,${view.y*100}%) scale(${view.zoom})`}}>
        <canvas ref={canvas} width={1200} height={Math.round(1200*image.height/image.width)} aria-label={label??t("drawing")}/>
      </div>
      {!loaded&&<span className="board-loading">{t("loading")}</span>}
      {cursor&&tool==="draw"&&!disabled&&<i className="pen-cursor" style={{left:cursor.x,top:cursor.y,width:cursor.size,height:cursor.size,background:color}}/>}
    </div></figure>;
}
