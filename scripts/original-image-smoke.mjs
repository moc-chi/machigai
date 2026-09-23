import assert from "node:assert/strict";
import {build} from "esbuild";
import {Miniflare,convertV4MiniflareOptions} from "miniflare";
const harness = [
'import {Room} from "./apps/worker/src/index.ts";',
'export class TestRoom extends Room {',
' async fetch(request) {const path=new URL(request.url).pathname;',
' if(path==="/__inspect"){const keys=await this.ctx.storage.list();return Response.json({images:[...keys.keys()].filter(k=>k.startsWith("image:")).length,room:keys.has("room")})}',
' if(path==="/__rate"){this.room.uploadWindow.last=0;await this.ctx.storage.put("room",this.room);return Response.json({ok:true})}',
' if(path==="/__expire"){this.room.expiresAt=new Date(0).toISOString();await this.ctx.storage.put("room",this.room);await this.alarm();return Response.json({ok:true})}',
' return super.fetch(request)} }'
].join("\\n").replaceAll("\\n","\n");
const bundle=await build({stdin:{contents:harness,resolveDir:process.cwd(),sourcefile:"test-harness.ts"},bundle:true,write:false,format:"esm",platform:"browser",external:["cloudflare:workers"]});
const mf=new Miniflare(convertV4MiniflareOptions({workers:[{name:"test",modules:true,script:bundle.outputFiles[0].text,compatibilityDate:"2026-08-29",durableObjects:{ROOMS:{className:"TestRoom",useSQLite:true}}}]}));
const ns=await mf.getDurableObjectNamespace("ROOMS");
const sockets=[];
try{
  const stub=ns.get(ns.idFromName("TESTAA"));
  const call=(path,options)=>stub.fetch("https://test"+path,options);
  const host=await (await call("/create",{method:"POST",body:JSON.stringify({nickname:"Test",roomCode:"TESTAA"})})).json();
  const guest=await (await call("/join",{method:"POST",body:JSON.stringify({nickname:"Test"})})).json();
  const connect=async session=>{
    const response=await call("/socket",{headers:{Upgrade:"websocket"}});const ws=response.webSocket;ws.accept();sockets.push(ws);
    const client={ws,state:null,events:[]};ws.addEventListener("message",e=>{const m=JSON.parse(e.data);client.events.push(m);if(m.type==="state.snapshot")client.state=m.payload});
    ws.send(JSON.stringify({type:"session.resume",commandId:crypto.randomUUID(),payload:{participantId:session.participantId,reconnectSecret:session.reconnectSecret}}));
    await wait(()=>client.state);return client;
  };
  const wait=async(check)=>{for(let n=0;n<500;n++){const v=check();if(v)return v;await new Promise(r=>setTimeout(r,20))}throw new Error("State timeout")};
  const send=async(client,type,payload={})=>{const id=crypto.randomUUID();client.ws.send(JSON.stringify({type,commandId:id,payload}));return wait(()=>client.events.find(e=>e.payload.commandId===id))};
  const a=await connect(host),b=await connect(guest);
  const headers=session=>({"authorization":"Bearer "+session.reconnectSecret,"x-participant-id":session.participantId});
  const pixels=new Uint8Array(8+96*128*3);pixels.set([82,71,66,49,0,96,0,128]);pixels.fill(200,8);
  const mutate=(session,method,body,version="none",id=crypto.randomUUID())=>call("/original-image",{method,headers:{...headers(session),"content-type":"application/x-machigai-rgb","x-image-version":version,"x-command-id":id},body});
  assert.equal((await call("/original-image")).status,403);
  assert.equal((await mutate(guest,"POST",pixels)).status,403);
  const operation=crypto.randomUUID();assert.equal((await mutate(host,"POST",pixels,"none",operation)).status,200);
  await wait(()=>a.state.originalImage&&b.state.originalImage);let meta=a.state.originalImage;
  assert.equal(a.state.settings.deckId,"original");
  assert.equal((await mutate(host,"POST",pixels,"none",operation)).status,200);
  assert.equal((await mutate(host,"POST",pixels,meta.id)).status,429);
  assert.equal((await mutate(host,"DELETE",undefined,"stale")).status,409);
  const read=await call(meta.url,{headers:headers(guest)});assert.equal(read.status,200);assert.equal(read.headers.get("cache-control"),"private, no-store");
  const oldPng=Buffer.from(await read.arrayBuffer());assert.deepEqual([...oldPng.subarray(0,8)],[137,80,78,71,13,10,26,10]);
  await call("/__rate");assert.equal((await mutate(host,"POST",new Uint8Array([1,2,3]),meta.id)).status,400);
  assert.deepEqual(Buffer.from(await (await call(meta.url,{headers:headers(host)})).arrayBuffer()),oldPng);
  await call("/__rate");const oldUrl=meta.url;assert.equal((await mutate(host,"POST",pixels,meta.id)).status,200);
  await wait(()=>a.state.originalImage.id!==meta.id);meta=a.state.originalImage;
  assert.equal((await call(oldUrl,{headers:headers(host)})).status,404);
  assert.equal((await mutate(host,"DELETE",undefined,meta.id)).status,200);
  assert.equal((await (await call("/__inspect")).json()).images,0);
  await wait(()=>!a.state.originalImage);await call("/__rate");
  assert.equal((await mutate(host,"POST",pixels)).status,200);await wait(()=>a.state.originalImage);meta=a.state.originalImage;
  await send(a,"game.start");assert.equal(a.state.imageUrl,meta.url);
  assert.equal((await mutate(host,"DELETE",undefined,meta.id)).status,400);
  await send(a,"drawing.ready");await send(b,"drawing.ready");
  const stroke=x=>({strokes:[{id:crypto.randomUUID(),color:"#c8c8c8",width:.01,points:[{x,y:.3,t:0},{x:x+.07,y:.35,t:10}]}]});
  await send(a,"drawing.submit",{differences:[stroke(.2)]});await send(b,"drawing.submit",{differences:[stroke(.6)]});
  await wait(()=>a.state.phase==="ANSWERING");assert.equal(a.state.differences.length,2);
  assert.deepEqual(a.state.differences[0].points,{finder:100,unfound:100});
  await send(b,"answer.submit",{x:.23,y:.32});assert.equal(b.state.participants.find(p=>p.id===guest.participantId).score,100);
  await send(a,"member.kick",{participantId:guest.participantId});assert.equal((await call(meta.url,{headers:headers(guest)})).status,403);
  await send(a,"member.leave");assert.deepEqual(await (await call("/__inspect")).json(),{images:0,room:false});
  assert.equal((await call(meta.url,{headers:headers(host)})).status,404);
  const fresh=await (await call("/create",{method:"POST",body:JSON.stringify({nickname:"Test",roomCode:"TESTAA"})})).json();
  assert.equal((await mutate(fresh,"POST",pixels)).status,200);await call("/__expire");
  assert.deepEqual(await (await call("/__inspect")).json(),{images:0,room:false});
  console.log("PASS: authenticated uploads, invalid input, quota, retry, replacement/deletion, original gameplay and fixed score, revocation, last leave and expiry remove stored image chunks");
}finally{for(const ws of sockets)try{ws.close()}catch{}await mf.dispose()}
