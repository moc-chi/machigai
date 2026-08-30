import { drawSmoothStroke } from "@machigai/drawing";
import type { Difference } from "@machigai/shared";
export async function makeShareImage(imageUrl: string, differences: Difference[], labels: { title: string; count: string; original: string; changed: string }): Promise<Blob> {
  const image = new Image(); image.src = imageUrl; await image.decode();
  await document.fonts.ready;
  const canvas = document.createElement("canvas"); canvas.width = 1600;
  const panelWidth=750, panelHeight=Math.round(panelWidth*image.naturalHeight/image.naturalWidth);
  canvas.height=panelHeight+210; const ctx=canvas.getContext("2d")!;
  ctx.fillStyle="#fffaf0";ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle="#17375e";ctx.textAlign="center";ctx.font="bold 32px sans-serif";ctx.fillText(labels.title,800,48,1500);
  ctx.font="bold 26px sans-serif";ctx.fillStyle="#d74632";ctx.fillText(labels.count,800,92,1500);
  ctx.font="22px sans-serif";ctx.fillStyle="#17375e";
  ctx.fillText(labels.original,405,137);ctx.fillText(labels.changed,1195,137);
  ctx.drawImage(image,30,155,panelWidth,panelHeight);ctx.drawImage(image,820,155,panelWidth,panelHeight);
  ctx.save();ctx.translate(820,155);
  for(const difference of differences)for(const stroke of difference.strokes)drawSmoothStroke(ctx,stroke,panelWidth,panelHeight);
  ctx.restore();
  return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error("IMAGE_EXPORT_FAILED")),"image/png"));
}
export function downloadImage(blob: Blob) {
  const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download="difference-party.png";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
