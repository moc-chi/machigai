import { ORIGINAL_IMAGE_LIMITS as L, decodeOriginalPixels } from "@machigai/shared";

export async function readPixels(request:Request) {
  if(request.headers.get("content-type")!=="application/x-machigai-rgb")throw new Error("IMAGE_INVALID");
  const length=request.headers.get("content-length");
  if(length && (!/^\d+$/.test(length)||Number(length)>L.maxWireBytes))throw new Error("IMAGE_TOO_LARGE");
  if(!request.body)throw new Error("IMAGE_INVALID");
  const reader=request.body.getReader(), chunks:Uint8Array[]=[];let total=0,timer:ReturnType<typeof setTimeout>|undefined;
  const timeout=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{void reader.cancel().catch(()=>{});reject(new Error("IMAGE_TIMEOUT"))},L.readTimeoutMs)});
  try {
    await Promise.race([(async()=>{
      while(true){const {value,done}=await reader.read();if(done)break;total+=value.length;if(total>L.maxWireBytes)throw new Error("IMAGE_TOO_LARGE");chunks.push(value)}
    })(),timeout]);
    const bytes=new Uint8Array(total);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}
    return decodeOriginalPixels(bytes);
  } finally {clearTimeout(timer);void reader.cancel().catch(()=>{})}
}
function chunk(type:string,data:Uint8Array) {
  const out=new Uint8Array(data.length+12),view=new DataView(out.buffer);
  view.setUint32(0,data.length);out.set(new TextEncoder().encode(type),4);out.set(data,8);
  let crc=0xffffffff;for(const b of out.subarray(4,out.length-4)){crc^=b;for(let j=0;j<8;j++)crc=(crc>>>1)^((crc&1)?0xedb88320:0)}
  view.setUint32(out.length-4,(crc^0xffffffff)>>>0);return out;
}
// Generate a fresh, static RGB PNG. No uploaded encoded data or metadata survives.
export async function pixelsToPng({width,height,rgb}:{width:number;height:number;rgb:Uint8Array}) {
  const rows=new Uint8Array(height*(width*3+1));
  for(let y=0;y<height;y++)rows.set(rgb.subarray(y*width*3,(y+1)*width*3),y*(width*3+1)+1);
  const compressed=new Uint8Array(await new Response(new Blob([rows]).stream().pipeThrough(new CompressionStream("deflate"))).arrayBuffer());
  const header=new Uint8Array(13),view=new DataView(header.buffer);view.setUint32(0,width);view.setUint32(4,height);header[8]=8;header[9]=2;
  const parts=[new Uint8Array([137,80,78,71,13,10,26,10]),chunk("IHDR",header),chunk("IDAT",compressed),chunk("IEND",new Uint8Array())];
  const png=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let offset=0;for(const part of parts){png.set(part,offset);offset+=part.length}return png;
}
