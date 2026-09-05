import { drawSmoothStroke } from "@machigai/drawing";
import type { Difference } from "@machigai/shared";

export const SHARE_SIZE = { width:1080, height:1920 } as const;
async function loadImage(imageUrl:string){const image=new Image();image.src=imageUrl;await image.decode();return image}
export async function makePuzzleImage(imageUrl:string,differences:Difference[]):Promise<Blob>{
  const image=await loadImage(imageUrl);const canvas=document.createElement("canvas");canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
  const ctx=canvas.getContext("2d")!;ctx.drawImage(image,0,0);for(const difference of differences)for(const stroke of difference.strokes)drawSmoothStroke(ctx,stroke,canvas.width,canvas.height);
  return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error("IMAGE_EXPORT_FAILED")),"image/png"));
}
export async function makeShareImage(imageUrl: string, differences: Difference[], labels: { title: string; count: string; original: string; changed: string }): Promise<Blob> {
  const image = await loadImage(imageUrl);
  await document.fonts.ready;
  const canvas=document.createElement("canvas");canvas.width=SHARE_SIZE.width;canvas.height=SHARE_SIZE.height;
  const ctx=canvas.getContext("2d")!;
  // Preserve the mock's navy/white/yellow identity, now as a phone-friendly 9:16 card.
  ctx.fillStyle="#17375e";ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.textAlign="center";ctx.font='800 54px "M PLUS Rounded 1c", sans-serif';ctx.fillStyle="#ffffff";
  ctx.fillText(labels.title,540,95,960);
  ctx.fillStyle="#ffc94b";ctx.font='800 44px "M PLUS Rounded 1c", sans-serif';ctx.fillText(labels.count,540,165,960);
  const panelWidth=960,panelHeight=panelWidth*image.naturalHeight/image.naturalWidth;
  for(const [index,label] of [labels.original,labels.changed].entries()){
    const top=250+index*810,y=top+(720-panelHeight)/2,x=60;
    ctx.textAlign="left";ctx.font='800 30px "M PLUS Rounded 1c", sans-serif';
    ctx.fillStyle=index?"#ffc94b":"#ffffff";ctx.fillText(label,x,top-25,panelWidth);
    ctx.fillStyle="#fffaf0";ctx.fillRect(x-5,y-5,panelWidth+10,panelHeight+10);
    ctx.save();ctx.beginPath();ctx.rect(x,y,panelWidth,panelHeight);ctx.clip();
    ctx.drawImage(image,x,y,panelWidth,panelHeight);
    if(index){ctx.translate(x,y);for(const difference of differences)for(const stroke of difference.strokes)drawSmoothStroke(ctx,stroke,panelWidth,panelHeight);}
    ctx.restore();
  }
  ctx.strokeStyle="#ffffff30";ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(60,1820);ctx.lineTo(1020,1820);ctx.stroke();
  ctx.fillStyle="#ffc94b";ctx.textAlign="center";ctx.font='800 32px "M PLUS Rounded 1c", sans-serif';ctx.fillText("#DifferenceParty",540,1880,960);
  return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error("IMAGE_EXPORT_FAILED")),"image/png"));
}
export function downloadImage(blob: Blob,filename="difference-party.png") {
  const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export async function copyImage(blob:Blob){if(!navigator.clipboard?.write||typeof ClipboardItem==="undefined")throw new Error("IMAGE_COPY_UNSUPPORTED");await navigator.clipboard.write([new ClipboardItem({"image/png":blob})])}
