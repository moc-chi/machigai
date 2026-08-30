import { drawSmoothStroke } from "@machigai/drawing";
import type { Difference } from "@machigai/shared";
export async function makeShareImage(imageUrl: string, differences: Difference[], labels: { title: string; count: string; original: string; changed: string }): Promise<Blob> {
  const image = new Image(); image.src = imageUrl; await image.decode();
  await document.fonts.ready;
  const canvas=document.createElement("canvas");canvas.width=1600;canvas.height=900;
  const ctx=canvas.getContext("2d")!;
  // Match mock/app.js createResultImage: navy card, large white/yellow heading,
  // paired images, coral labels and a spacious branded footer. Never fake clear times.
  ctx.fillStyle="#17375e";ctx.fillRect(0,0,1600,900);
  ctx.font='800 54px "M PLUS Rounded 1c", sans-serif';ctx.fillStyle="#ffffff";
  ctx.fillText(labels.title,70,90,850);
  ctx.fillStyle="#ffc94b";ctx.textAlign="right";ctx.fillText(labels.count,1530,90,540);
  ctx.textAlign="left";
  const panelWidth=710,panelHeight=panelWidth*image.naturalHeight/image.naturalWidth;
  const y=155+(540-panelHeight)/2;
  for(const x of [70,820]){
    ctx.fillStyle="#fffaf0";ctx.fillRect(x-4,y-4,panelWidth+8,panelHeight+8);
    ctx.drawImage(image,x,y,panelWidth,panelHeight);
  }
  ctx.save();ctx.translate(820,y);
  for(const difference of differences)for(const stroke of difference.strokes)drawSmoothStroke(ctx,stroke,panelWidth,panelHeight);
  ctx.restore();
  ctx.font='700 24px "M PLUS Rounded 1c", sans-serif';
  for(const [x,text,color] of [[88,labels.original,"#17375e"],[838,labels.changed,"#ef604c"]] as const){
    const width=Math.min(660,ctx.measureText(text).width+40);
    ctx.fillStyle=color;ctx.fillRect(x,y+18,width,44);ctx.fillStyle="#fff";ctx.fillText(text,x+20,y+49,width-40);
  }
  ctx.strokeStyle="#ffffff30";ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(70,749);ctx.lineTo(1530,749);ctx.stroke();
  ctx.fillStyle="#fff";ctx.font='800 34px "M PLUS Rounded 1c", sans-serif';ctx.fillText(labels.title,70,819,850);
  ctx.fillStyle="#ffc94b";ctx.textAlign="right";ctx.fillText("#DifferenceParty",1530,819,530);
  return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error("IMAGE_EXPORT_FAILED")),"image/png"));
}
export function downloadImage(blob: Blob) {
  const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download="difference-party.png";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
