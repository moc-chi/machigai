import { createContext, useEffect, useState } from "react";
import { ORIGINAL_IMAGE_LIMITS as L, encodeOriginalPixels, type CreateRoomResponse, type RoomSnapshot } from "@machigai/shared";
export const SessionContext=createContext<CreateRoomResponse|null>(null);
export function imageHeaders(session:CreateRoomResponse){return {"authorization":"Bearer "+session.reconnectSecret,"x-participant-id":session.participantId}}
export async function changeOriginal(session:CreateRoomResponse,snapshot:RoomSnapshot,body?:Uint8Array<ArrayBuffer>){
  const headers={...imageHeaders(session),"x-command-id":crypto.randomUUID(),"x-image-version":snapshot.originalImage?.id??"none","content-type":"application/x-machigai-rgb"};
  for(let attempt=0;attempt<2;attempt++){
    let response:Response;
    try{response=await fetch("/api/v1/rooms/"+snapshot.roomCode+"/original-image",{method:body?"POST":"DELETE",headers,body,signal:AbortSignal.timeout(20000)})}
    catch(error){if(attempt===0)continue;throw error}
    if(!response.ok){const data=await response.json() as {code:string};throw new Error(data.code)}return;
  }
}
export function useOriginal(session:CreateRoomResponse|null,snapshot:RoomSnapshot|null){
  const [loaded,setLoaded]=useState<{id:string;url:string}|null>(null),[error,setError]=useState("");
  const meta=snapshot?.originalImage;
  useEffect(()=>{
    setLoaded(null);setError("");if(!session||!meta)return;
    let active=true,objectUrl="";const controller=new AbortController();
    void (async()=>{
      for(let attempt=0;attempt<3;attempt++){
        try{
          const response=await fetch(meta.url,{headers:imageHeaders(session),signal:controller.signal,cache:"no-store"});
          if(!response.ok)throw new Error("IMAGE_MISSING");
          const blob=await response.blob();if(!active)return;
          objectUrl=URL.createObjectURL(blob);setLoaded({id:meta.id,url:objectUrl});return;
        }catch{if(!active)return;if(attempt===2){setError("IMAGE_MISSING");return}await new Promise(resolve=>setTimeout(resolve,500))}
      }
    })();
    return()=>{active=false;controller.abort();if(objectUrl)URL.revokeObjectURL(objectUrl)};
  },[session,meta?.id]);
  const url=loaded?.id===meta?.id?loaded?.url:undefined;
  const resolve=(src:string)=>meta&&src===meta.url?(url??""):src;
  return {url,error,snapshot:snapshot?{...snapshot,imageUrl:resolve(snapshot.imageUrl)}:null};
}
export function imageDimensions(bytes:Uint8Array,mime:string):{width:number;height:number}{
  const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const text=(start:number,n:number)=>String.fromCharCode(...bytes.subarray(start,start+n));
  if(mime==="image/png"&&bytes.length>=24&&text(1,3)==="PNG"&&bytes[0]===137){
    let at=8;while(at+12<=bytes.length){const size=v.getUint32(at);if(text(at+4,4)==="acTL")throw new Error("IMAGE_INVALID");if(size>bytes.length-at-12)throw new Error("IMAGE_INVALID");at+=size+12}
    return {width:v.getUint32(16),height:v.getUint32(20)};
  }
  if(mime==="image/jpeg"&&bytes[0]===255&&bytes[1]===216){
    let at=2;while(at+4<=bytes.length){
      if(bytes[at++]!==255)break;while(bytes[at]===255)at++;const marker=bytes[at++]!;
      if(marker===0xda||marker===0xd9)break;if(marker===0x01||(marker>=0xd0&&marker<=0xd7))continue;
      const size=v.getUint16(at);if(size<2||at+size>bytes.length)break;
      if([0xc0,0xc1,0xc2].includes(marker)&&size>=8)return {width:v.getUint16(at+5),height:v.getUint16(at+3)};
      at+=size;
    }
  }
  if(mime==="image/webp"&&text(0,4)==="RIFF"&&text(8,4)==="WEBP"){
    const kind=text(12,4),u24=(n:number)=>bytes[n]!+(bytes[n+1]!<<8)+(bytes[n+2]!<<16);
    if(kind==="VP8X"&&bytes.length>=30){if(bytes[20]!&2)throw new Error("IMAGE_INVALID");return {width:1+u24(24),height:1+u24(27)}}
    if(kind==="VP8 "&&bytes.length>=30&&bytes[23]===0x9d&&bytes[24]===1&&bytes[25]===0x2a)return {width:v.getUint16(26,true)&0x3fff,height:v.getUint16(28,true)&0x3fff};
    if(kind==="VP8L"&&bytes.length>=25&&bytes[20]===0x2f){const bits=v.getUint32(21,true);return {width:1+(bits&0x3fff),height:1+((bits>>>14)&0x3fff)}}
  }
  throw new Error("IMAGE_INVALID");
}
export async function prepareOriginal(file:File){
  if(file.size>L.maxFileBytes)throw new Error("IMAGE_TOO_LARGE");
  if(!["image/png","image/jpeg","image/webp"].includes(file.type)||!file.size)throw new Error("IMAGE_INVALID");
  const {width,height}=imageDimensions(new Uint8Array(await file.arrayBuffer()),file.type);
  if(!width||!height||width*height>L.maxInputPixels||Math.max(width,height)>L.maxInputEdge||
    Math.min(width,height)<L.minEdge||Math.max(width,height)/Math.min(width,height)>L.maxAspectRatio)throw new Error("IMAGE_DIMENSIONS");
  const url=URL.createObjectURL(file),image=new Image();
  try{
    image.src=url;await image.decode();
    if(!image.naturalWidth||image.naturalWidth*image.naturalHeight>L.maxInputPixels)throw new Error("IMAGE_DIMENSIONS");
    const scale=Math.min(1,L.maxEdge/Math.max(image.naturalWidth,image.naturalHeight));
    const canvas=document.createElement("canvas");canvas.width=Math.round(image.naturalWidth*scale);canvas.height=Math.round(image.naturalHeight*scale);
    const context=canvas.getContext("2d")!;context.fillStyle="#ffffff";context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0,canvas.width,canvas.height);
    const rgba=context.getImageData(0,0,canvas.width,canvas.height).data,rgb=new Uint8Array(canvas.width*canvas.height*3);
    for(let i=0,j=0;i<rgba.length;i+=4){rgb[j++]=rgba[i]!;rgb[j++]=rgba[i+1]!;rgb[j++]=rgba[i+2]!}
    return encodeOriginalPixels(canvas.width,canvas.height,rgb);
  }finally{image.src="";URL.revokeObjectURL(url)}
}
