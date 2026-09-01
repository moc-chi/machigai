import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { Check, Copy, Crown, Download, Eye, Hand, Pencil, Pipette, RotateCcw, Share2, Trash2, Undo2 } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { GAME_DEFAULTS, IMAGES, LIMITS, commandId, type AnswerFeedback, type ClientCommand, type CreateRoomResponse, type Difference, type RoomSnapshot, type ServerEvent, type Stroke } from "@machigai/shared";
import { Board, initialView, type Tool } from "./Board";
import type { View } from "@machigai/drawing";
import { LANGUAGES, LanguageContext, errorKey, useText, type Language } from "./i18n";
import { downloadImage, makeShareImage } from "./share";
import { RulesDialog } from "./RulesDialog";
type Session = CreateRoomResponse & { nickname: string };
type Send = (type: ClientCommand["type"], payload?: unknown) => Promise<void>;
const SESSION_KEY = "machigai-session";
async function api(path:string,body:unknown):Promise<CreateRoomResponse>{
  const r=await fetch(path,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
  const data=await r.json() as CreateRoomResponse&{code?:string};if(!r.ok)throw new Error(data.code??"ERROR");return data;
}
function useRoom(session:Session|null){
  const [snapshot,setSnapshot]=useState<RoomSnapshot|null>(null);const snapshotRef=useRef(snapshot);snapshotRef.current=snapshot;
  const [error,setError]=useState("");const [feedback,setFeedback]=useState<AnswerFeedback|null>(null);
  const [errorVersion,setErrorVersion]=useState(0);
  const [pendingCount,setPendingCount]=useState(0);const socket=useRef<WebSocket|null>(null);
  const pending=useRef(new Map<string,{resolve:()=>void;reject:(error:Error)=>void;timer:number}>());
  useEffect(()=>{
    setSnapshot(null);setFeedback(null);if(!session)return;
    let disposed=false,attempt=0,timer=0;
    const connect=()=>{
      if(disposed)return;
      const ws=new WebSocket((location.protocol==="https:"?"wss:":"ws:")+"//"+location.host+session.socketUrl);socket.current=ws;
      ws.onopen=()=>{attempt=0;ws.send(JSON.stringify({type:"session.resume",commandId:commandId(),payload:{participantId:session.participantId,reconnectSecret:session.reconnectSecret}}))};
      ws.onmessage=event=>{
        if(disposed)return;
        const message=JSON.parse(String(event.data)) as ServerEvent;
        if(message.type==="state.snapshot")setSnapshot(previous=>!previous||message.payload.revision>=previous.revision?message.payload:previous);
        if(message.type==="answer.result")setFeedback(message.payload);
        if(message.type==="error"){
          setError(message.payload.code);
          setErrorVersion(value=>value+1);
          if(message.payload.code==="SESSION_REVOKED"||message.payload.code==="ROOM_NOT_FOUND"){disposed=true;ws.close()}
        }
        if(message.type==="command.ack"||message.type==="error"){
          const id=message.payload.commandId;if(id){const item=pending.current.get(id);if(item){clearTimeout(item.timer);pending.current.delete(id);setPendingCount(pending.current.size);if(message.type==="error")item.reject(new Error(message.payload.code));else item.resolve()}}
        }
      };
      ws.onclose=()=>{if(!disposed)timer=window.setTimeout(connect,Math.min(15000,1000*2**attempt++))};
    };
    connect();return()=>{disposed=true;clearTimeout(timer);socket.current?.close();for(const item of pending.current.values()){clearTimeout(item.timer);item.reject(new Error("ERROR"))}pending.current.clear();setPendingCount(0)};
  },[session]);
  useEffect(()=>{if(!feedback)return;const timer=setTimeout(()=>setFeedback(null),LIMITS.markerMs);return()=>clearTimeout(timer)},[feedback]);
  useEffect(()=>{
    if(error!=="DRAWING_NOT_VISIBLE")return;
    const timer=setTimeout(()=>setError(""),LIMITS.markerMs);return()=>clearTimeout(timer);
  },[error,errorVersion]);
  const send=useCallback<Send>((type,payload={})=>{
    if(socket.current?.readyState!==WebSocket.OPEN){setError("ERROR");return Promise.reject(new Error("ERROR"))}
    const id=commandId();const r=snapshotRef.current;
    return new Promise<void>((resolve,reject)=>{
      const timer=window.setTimeout(()=>{pending.current.delete(id);setPendingCount(pending.current.size);setError("ERROR");reject(new Error("ERROR"))},10000);
      pending.current.set(id,{resolve,reject,timer});setPendingCount(pending.current.size);
      socket.current!.send(JSON.stringify({type,commandId:id,gameNo:r?.gameNo,stageNo:r?.stageNo,payload}));
    });
  },[]);
  return {snapshot,error,setError,feedback,send,pendingCount};
}
export function App(){
  const [language,setLanguage]=useState<Language>(()=>{const saved=localStorage.getItem("language");return LANGUAGES.some(([code])=>code===saved)?saved as Language:"ja"});
  useEffect(()=>{localStorage.setItem("language",language);document.documentElement.lang=language},[language]);
  return <LanguageContext.Provider value={language}><Shell language={language} onLanguage={setLanguage}/></LanguageContext.Provider>;
}
function Shell({language,onLanguage}:{language:Language;onLanguage:(value:Language)=>void}){
  const t=useText();const [session,setSession]=useState<Session|null>(()=>{try{return JSON.parse(sessionStorage.getItem(SESSION_KEY)??"null") as Session|null}catch{return null}});
  const room=useRoom(session);
  const join=(next:Session)=>{sessionStorage.setItem(SESSION_KEY,JSON.stringify(next));setSession(next)};
  const leave=()=>{sessionStorage.removeItem(SESSION_KEY);setSession(null);room.setError("");history.replaceState(null,"",location.pathname)};
  const name=room.snapshot?.participants.find(p=>p.id===room.feedback?.participantId)?.nickname??"";
  return <div className="app-shell">
    <header><a className="brand" href="#" onClick={event=>{event.preventDefault();if(session)leave()}}><span>?</span><strong>{t("app")}</strong></a>
      <label className="language-picker"><span>Language</span><select aria-label="Language" value={language} onChange={e=>onLanguage(e.target.value as Language)}>{LANGUAGES.map(([code,label])=><option key={code} value={code}>{label}</option>)}</select></label>
    </header>
    <main>{!session?<Home onSession={join}/>:!room.snapshot?<section className="loading"><p>{t("loading")}</p><button onClick={leave}>{t("leave")}</button></section>:<Game key={session.participantId} snapshot={room.snapshot} send={room.send} pending={room.pendingCount>0} leave={leave}/>}</main>
    {room.feedback&&<div className={"feedback "+room.feedback.result.toLowerCase()} role="status" aria-live="polite">{room.feedback.result==="CORRECT"?t("correct",{name}):room.feedback.result==="MISS"?t("miss",{name}):room.feedback.result==="ALREADY_FOUND"?t("already"):room.feedback.result==="OWN_DIFFERENCE"?t("own"):t("cooldown",{n:GAME_DEFAULTS.missCooldownSeconds})}</div>}
    {room.error&&<button className="error-toast" role="alert" onClick={()=>room.setError("")}>{t(errorKey(room.error))} ×</button>}
  </div>;
}
function Home({onSession}:{onSession:(session:Session)=>void}){
  const t=useText();const [mode,setMode]=useState<"create"|"join"|null>(()=>new URLSearchParams(location.search).has("room")?"join":null);
  const [nickname,setNickname]=useState("");const [code,setCode]=useState(new URLSearchParams(location.search).get("room")??"");
  const [busy,setBusy]=useState(false);const [error,setError]=useState("");
  const submit=async()=>{setBusy(true);setError("");try{const result=await api(mode==="create"?"/api/v1/rooms":"/api/v1/rooms/join",{nickname,roomCode:code});onSession({...result,nickname})}catch(error){setError(error instanceof Error?error.message:"ERROR")}finally{setBusy(false)}};
  return <section className="home"><div><p className="eyebrow">2–10 PLAYERS</p><h1>{t("homeTitle")}</h1><p className="lead">{t("homeLead")}</p><div className="home-actions"><button className="primary" onClick={()=>setMode("create")}>{t("create")} →</button><button onClick={()=>setMode("join")}>{t("join")}</button></div></div><div className="hero-sample" data-testid="hero-sample">
    <figure><img src="/assets/bakery.png" alt={t("original")}/></figure>
    <figure><img src="/assets/bakery-changed.png" alt={t("changed")}/></figure>
  </div>
    {mode&&<div className="modal-backdrop"><form className="modal" onSubmit={e=>{e.preventDefault();void submit()}}><h2>{t(mode)}</h2><label>{t("nickname")}<input autoFocus required maxLength={20} value={nickname} onChange={e=>setNickname(e.target.value)}/></label>{mode==="join"&&<label>{t("code")}<input required minLength={6} maxLength={6} value={code} onChange={e=>setCode(e.target.value.toUpperCase())}/></label>}<button className="primary" disabled={busy||!nickname.trim()}>{busy?t("loading"):t(mode)}</button><button type="button" onClick={()=>setMode(null)}>{t("cancel")}</button>{error&&<p role="alert">{t(errorKey(error))}</p>}</form></div>}
  </section>;
}
function Game({snapshot,send,pending,leave}:{snapshot:RoomSnapshot;send:Send;pending:boolean;leave:()=>void}){
  const t=useText();const me=snapshot.participants.find(p=>p.id===snapshot.selfId);
  if(!me)return <button onClick={leave}>{t("leave")}</button>;
  const props={snapshot,send,pending};
  if(snapshot.phase==="LOBBY")return <Lobby {...props} leave={leave}/>;
  if(snapshot.phase==="DRAWING")return <Drawing key={snapshot.gameNo+"-"+snapshot.stageNo} {...props}/>;
  if(snapshot.phase==="COUNTDOWN")return <Countdown snapshot={snapshot}/>;
  if(snapshot.phase==="ANSWERING"||snapshot.phase==="ANSWER_REVEAL")return <Answer {...props}/>;
  if(snapshot.phase==="ROUND_RESULT"||snapshot.phase==="FINAL_RESULT")return <Results {...props} leave={leave}/>;
  return <section className="loading"><h1>{t("ended")}</h1><button onClick={leave}>{t("leave")}</button></section>;
}
function Lobby({snapshot,send,pending,leave}:{snapshot:RoomSnapshot;send:Send;pending:boolean;leave:()=>void}){
  const t=useText();const me=snapshot.participants.find(p=>p.id===snapshot.selfId)!;
  const invite=location.origin+location.pathname+"?room="+snapshot.roomCode;const [copied,setCopied]=useState(false);
  const update=(key:string,value:number|string)=>void send("settings.update",{[key]:value}).catch(()=>{});
  return <section className="lobby"><div className="section-head"><h1>{t("members")}</h1><button onClick={leave}>{t("leave")}</button></div>
    <div className="lobby-grid"><aside className="invite-card"><span>{t("code")}</span><strong>{snapshot.roomCode}</strong><QRCodeSVG className="real-qr" value={invite} size={160} marginSize={4} title={t("invite")}/><button onClick={async()=>{try{await navigator.clipboard.writeText(invite);setCopied(true)}catch{setCopied(false)}}}><Copy/>{t(copied?"copied":"invite")}</button></aside>
    <div className="members-card"><ul className="member-list">{snapshot.participants.map(p=><li key={p.id}><Avatar name={p.nickname}/><strong>{p.nickname} {p.id===me.id&&"("+t("you")+")"}</strong>{p.isHost&&<span className="host-tag"><Crown/>{t("host")}</span>}{me.isHost&&!p.isHost&&<button onClick={()=>void send("member.kick",{participantId:p.id}).catch(()=>{})}>{t("leave")}</button>}</li>)}</ul>
      <fieldset className="settings" disabled={!me.isHost}><label>{t("rounds")}<select value={snapshot.settings.stageCount} onChange={e=>update("stageCount",Number(e.target.value))}>{Array.from({length:10},(_,i)=><option key={i} value={i+1}>{i+1}</option>)}</select></label>
      <label>{t("differences")}<select value={snapshot.settings.differencesPerPlayer} onChange={e=>update("differencesPerPlayer",Number(e.target.value))}>{[1,2,3,4,5].map(v=><option key={v}>{v}</option>)}</select></label>
      {(["drawingSeconds","answeringSeconds"] as const).map(key=><label key={key}>{t(key==="drawingSeconds"?"drawTime":"answerTime")}<select value={snapshot.settings[key]} onChange={e=>update(key,Number(e.target.value))}>{[30,45,60,90,120,180,300].map(v=><option key={v} value={v}>{t("seconds",{n:v})}</option>)}</select></label>)}
      </fieldset>
      <RulesDialog/>
      <section className="deck-card"><h2>{t("deck")}</h2><div className="series-options">{(["animals","people"] as const).map(series=><button key={series} disabled={!me.isHost} aria-pressed={snapshot.settings.deckId===series} onClick={()=>update("deckId",series)}><strong>{t(series)}</strong><div className="deck-thumbnails">{IMAGES.filter(image=>image.deck===series).map(image=><img key={image.id} src={image.src} alt={t(series)}/>)}</div></button>)}</div></section>
      {me.isHost?<button className="primary start" disabled={pending||snapshot.participants.filter(p=>p.connected).length<2} onClick={()=>void send("game.start").catch(()=>{})}>{t("start")} →</button>:<p>{t("waiting")}</p>}
      {snapshot.participants.filter(p=>p.connected).length<2&&<p className="muted start-hint">{t("enough")}</p>}
    </div></div>
  </section>;
}
function Avatar({name}:{name:string}){return <span className="avatar">{Array.from(name)[0]}</span>}
function useNow(){const [now,setNow]=useState(Date.now());useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),200);return()=>clearInterval(timer)},[]);return now}
function Timer({endsAt}:{endsAt?:string}){const now=useNow();const seconds=endsAt?Math.max(0,Math.ceil((Date.parse(endsAt)-now)/1000)):0;return <time className={"timer "+(seconds<15?"danger":"")}>{String(Math.floor(seconds/60)).padStart(2,"0")}:{String(seconds%60).padStart(2,"0")}</time>}
function PhaseHeader({snapshot,title,send,pending}:{snapshot:RoomSnapshot;title:string;send:Send;pending:boolean}){
  const t=useText();const host=snapshot.participants.find(p=>p.id===snapshot.selfId)?.isHost;
  return <div className="phase-header"><div><span className="eyebrow">{t("round",{n:snapshot.stageNo})} / {snapshot.stageCount}</span><h1>{title==="find"?t("find"):title}</h1></div><Timer endsAt={snapshot.phaseEndsAt}/>{host&&snapshot.phase!=="ANSWER_REVEAL"&&<button className="advance" disabled={pending} onClick={()=>{if(confirm(t("advanceConfirm")))void send("phase.advance").catch(()=>{})}}>{t("advance")}</button>}</div>;
}
function ZoomControls({view,onView}:{view:View;onView:(value:View)=>void}){
  const t=useText();return <div className="zoom-controls"><label>{t("zoom")} <input aria-label={t("zoom")} type="range" min={GAME_DEFAULTS.zoomMin} max={GAME_DEFAULTS.zoomMax} step=".05" value={view.zoom} onChange={e=>onView({...view,zoom:Number(e.target.value)})}/><output>{Math.round(view.zoom*100)}%</output></label><button onClick={()=>onView(initialView)}><RotateCcw/>{t("reset")}</button></div>;
}
function Drawing({snapshot,send,pending}:{snapshot:RoomSnapshot;send:Send;pending:boolean}){
  const t=useText();const me=snapshot.participants.find(p=>p.id===snapshot.selfId)!;
  const [drafts,setDrafts]=useState<Stroke[]>([]);const [view,setView]=useState<View>(initialView);
  const [tool,setTool]=useState<Tool>("draw");const [color,setColor]=useState("#111111");const [width,setWidth]=useState(.008);
  const [submitting,setSubmitting]=useState(false);const count=me.confirmedCount??0;
  const confirmDraft=async()=>{if(!drafts.length||submitting)return;setSubmitting(true);try{await send("difference.confirm",{strokes:drafts});setDrafts([])}catch{/* Retain the draft until an authoritative acknowledgement. */}finally{setSubmitting(false)}};
  return <section><PhaseHeader snapshot={snapshot} title={t("drawingCount",{n:snapshot.settings.differencesPerPlayer})} send={send} pending={pending}/>
    <div className="toolbar drawing-toolbar">
      <div className="mode-controls"><button aria-pressed={tool==="draw"} onClick={()=>setTool("draw")}><Pencil/>{t("pen")}</button><button aria-pressed={tool==="move"} onClick={()=>setTool("move")}><Hand/>{t("move")}</button><button aria-pressed={tool==="pick"} aria-label={t("pick")} title={t("pick")} onClick={()=>setTool("pick")}><Pipette/></button><button title={t("undo")} aria-label={t("undo")} disabled={!drafts.length||submitting} onClick={()=>setDrafts(value=>value.slice(0,-1))}><Undo2/><span>{t("undo")}</span></button><button title={t("clear")} aria-label={t("clear")} disabled={!drafts.length||submitting} onClick={()=>setDrafts([])}><Trash2/><span>{t("clear")}</span></button></div>
      <div className="pen-controls"><label>{t("color")}<input aria-label={t("color")} type="color" value={color} onChange={e=>setColor(e.target.value)}/></label>{["#000000","#ffffff"].map(c=><button key={c} className="swatch" style={{background:c}} aria-label={c} aria-pressed={color===c} onClick={()=>setColor(c)}/>)}<label>{t("width")}<input aria-label={t("width")} type="range" min={1} max={30} step={1} value={width*1000} onChange={e=>setWidth(Number(e.target.value)/1000)}/></label><span className="pen-preview" aria-label={t("width")+" "+Math.round(width*1000)}><i style={{background:color,width:Math.max(2,width*1000),height:Math.max(2,width*1000)}}/></span></div>
      <ZoomControls view={view} onView={setView}/>
    </div>
    <Board imageUrl={snapshot.imageUrl} differences={snapshot.differences} drafts={drafts} view={view} onView={setView} tool={tool} color={color} width={width} disabled={me.confirmed||submitting} onStroke={stroke=>setDrafts(value=>value.length<LIMITS.maxStrokes?[...value,stroke]:value)} onPick={c=>{setColor(c);setTool("draw")}}/>
    <div className="drawing-footer"><div><strong data-testid="confirmed-progress">{t("progress",{n:count,total:snapshot.settings.differencesPerPlayer})}</strong><p className="muted">{t("submittedHint")}</p></div><button className="primary" disabled={me.confirmed||!drafts.length||submitting} onClick={()=>void confirmDraft()}>{me.confirmed?<><Check/>{t("confirmed")}</>:submitting?t("saving"):t("confirm")}</button></div>
    <div className="progress-list">{snapshot.participants.map(p=><span key={p.id}>{p.nickname}: {p.confirmedCount??0}/{snapshot.settings.differencesPerPlayer}{p.confirmed?" ✓":""}</span>)}</div>
  </section>;
}
function Countdown({snapshot}:{snapshot:RoomSnapshot}){const t=useText();const now=useNow();const n=Math.max(0,Math.ceil((Date.parse(snapshot.phaseEndsAt!)-now)/1000));return <section className="countdown" role="status"><h1>{t("countdown")}</h1><strong>{n||"…"}</strong></section>}
function Answer({snapshot,send,pending}:{snapshot:RoomSnapshot;send:Send;pending:boolean}){
  const t=useText();const [view,setView]=useState<View>(initialView);const [tool,setTool]=useState<Tool>("answer");
  const [originalNotice,setOriginalNotice]=useState(0);
  useEffect(()=>{if(!originalNotice)return;const timer=setTimeout(()=>setOriginalNotice(0),LIMITS.markerMs);return()=>clearTimeout(timer)},[originalNotice]);
  const now=useNow();const me=snapshot.participants.find(p=>p.id===snapshot.selfId)!;const cooldown=Math.max(0,Math.ceil((Date.parse(me.answerBlockedUntil??"")-now)/1000)||0);
  const revealing=snapshot.phase==="ANSWER_REVEAL";
  return <section><PhaseHeader snapshot={snapshot} title="find" send={send} pending={pending}/><div className="toolbar"><div className="mode-controls"><button aria-pressed={tool==="answer"} onClick={()=>setTool("answer")}><Eye/>{t("answer")}</button><button aria-pressed={tool==="move"} onClick={()=>setTool("move")}><Hand/>{t("move")}</button></div><ZoomControls view={view} onView={setView}/><strong>{snapshot.differences.filter(d=>d.foundBy).length}/{snapshot.differences.length}</strong></div>
    {revealing&&<p className="reveal-notice" role="status">{t("reveal")}</p>}
    {cooldown>0&&!revealing&&<p className="cooldown" role="status">{t("cooldown",{n:cooldown})}</p>}
    {originalNotice>0&&<div className="feedback original-notice" role="status">{t("answerOnChanged")}</div>}
    <div className="compare">{[false,true].map(changed=><Board key={String(changed)} imageUrl={snapshot.imageUrl} differences={changed?snapshot.differences:[]} view={view} onView={setView} tool={tool} label={t(changed?"changed":"original")} marks hideFound disabled={(changed&&cooldown>0)||revealing} onAnswer={changed?(x,y)=>{setOriginalNotice(0);void send("answer.submit",{x,y}).catch(()=>{})}:()=>setOriginalNotice(Date.now())}/>)}</div><Scores snapshot={snapshot}/>
  </section>;
}
function Scores({snapshot,highlightWinner=false}:{snapshot:RoomSnapshot;highlightWinner?:boolean}){
  const t=useText();const highest=Math.max(...snapshot.participants.map(p=>p.score));
  return <ol className="scores">{[...snapshot.participants].sort((a,b)=>b.score-a.score).map(p=><li key={p.id} className={highlightWinner&&p.score===highest?"winner":""}><b>{1+snapshot.participants.filter(other=>other.score>p.score).length}</b><Avatar name={p.nickname}/><span>{p.nickname}{highlightWinner&&p.score===highest&&<small className="winner-label"><Crown/>{t("winner")}</small>}</span><strong>{p.score} pt</strong></li>)}</ol>;
}
function RoundScores({snapshot,roundNo}:{snapshot:RoomSnapshot;roundNo:number}){
  const t=useText();const scores=snapshot.rounds?.find(r=>r.stageNo===roundNo)?.scores;
  if(!scores)return null;
  return <section className="score-breakdown"><h2>{t("breakdown")}</h2>{scores.map(score=><div className="score-detail" key={score.participantId}><strong>{snapshot.participants.find(p=>p.id===score.participantId)?.nickname??"—"}</strong><dl><div><dt>{t("foundPoints")}</dt><dd>+{score.found}</dd></div><div><dt>{t("unfoundPoints")}</dt><dd>+{score.unfound}</dd></div><div><dt>{t("missPoints")}</dt><dd>{score.penalty}</dd></div><div><dt>{t("roundTotal")}</dt><dd>{score.total>0?"+":""}{score.total}</dd></div></dl></div>)}</section>;
}
function Results({snapshot,send,pending,leave}:{snapshot:RoomSnapshot;send:Send;pending:boolean;leave:()=>void}){
  const t=useText();const [filter,setFilter]=useState("all");const [roundNo,setRoundNo]=useState(snapshot.stageNo);const [view,setView]=useState<View>(initialView);const [marks,setMarks]=useState(true);
  const isFinal=snapshot.phase==="FINAL_RESULT",me=snapshot.participants.find(p=>p.id===snapshot.selfId)!;
  const round=snapshot.rounds?.find(r=>r.stageNo===roundNo)??{stageNo:snapshot.stageNo,imageUrl:snapshot.imageUrl,differences:snapshot.differences};
  const shown=filter==="all"?round.differences:round.differences.filter(d=>d.creatorId===filter);
  return <section className="results"><div className="result-header"><span className="eyebrow">{t("round",{n:round.stageNo})}</span><h1>{t(isFinal?"final":"result")}</h1></div>
    <div className="result-layout"><div className="review"><div className="gallery-tabs">{isFinal&&(snapshot.rounds??[]).map(r=><button key={r.stageNo} aria-pressed={roundNo===r.stageNo} onClick={()=>{setRoundNo(r.stageNo);setView(initialView)}}>{t("round",{n:r.stageNo})}</button>)}</div>
      <div className="toolbar"><ZoomControls view={view} onView={setView}/><label className="check-label"><input type="checkbox" checked={marks} onChange={e=>setMarks(e.target.checked)}/>{t("marks")}</label></div>
      <div className="gallery-tabs"><button aria-pressed={filter==="all"} onClick={()=>setFilter("all")}>{t("all")}</button>{snapshot.participants.map(p=><button key={p.id} aria-pressed={filter===p.id} onClick={()=>setFilter(p.id)}>{p.nickname}</button>)}</div>
      <div className="compare"><Board imageUrl={round.imageUrl} view={view} onView={setView} label={t("original")}/><Board imageUrl={round.imageUrl} differences={shown} view={view} onView={setView} label={t("changed")} marks={marks} persistentMarks/></div>
      <SharePanel imageUrl={round.imageUrl} differences={shown}/>
    </div><aside><Scores snapshot={snapshot} highlightWinner={isFinal}/><RoundScores snapshot={snapshot} roundNo={round.stageNo}/><div className="result-actions">{me.isHost?<button className="primary" disabled={pending} onClick={()=>void send(isFinal?"game.rematch":"round.continue").catch(()=>{})}>{t(isFinal?"rematch":snapshot.stageNo>=snapshot.stageCount?"viewFinal":"next")}</button>:<p>{t("waiting")}</p>}<button onClick={leave}>{t("leave")}</button></div></aside></div>
  </section>;
}
function SharePanel({imageUrl,differences}:{imageUrl:string;differences:Difference[]}){
  const t=useText();const language=useContext(LanguageContext);const [blob,setBlob]=useState<Blob|null>(null);const [preview,setPreview]=useState("");const [error,setError]=useState(false);
  const signature=differences.map(d=>d.id).join(",");
  useEffect(()=>{let active=true,url="";setBlob(null);setPreview("");setError(false);
    void makeShareImage(imageUrl,differences,{title:t("app"),count:t("shareBadge",{n:differences.length}),original:t("original"),changed:t("changed")}).then(result=>{if(active){url=URL.createObjectURL(result);setBlob(result);setPreview(url)}}).catch(()=>{if(active)setError(true)});
    return()=>{active=false;if(url)URL.revokeObjectURL(url)};
  },[imageUrl,signature,language]);
  const share=async()=>{if(!blob)return;const file=new File([blob],"difference-party.png",{type:"image/png"});
    try{if(navigator.canShare?.({files:[file]}))await navigator.share({files:[file],title:t("app"),text:t("shareText")});else downloadImage(blob)}catch(error){if(!(error instanceof DOMException&&error.name==="AbortError"))setError(true)}
  };
  return <section className="share-panel"><div className="share-actions"><button disabled={!blob} onClick={()=>void share()}><Share2/>{t("share")}</button><button disabled={!blob} onClick={()=>blob&&downloadImage(blob)}><Download/>{t("download")}</button></div>{error&&<p role="alert">{t("error")}</p>}{preview&&<details><summary>{t("sharePreview")}</summary><img className="share-preview" src={preview} alt={t("sharePreview")}/></details>}</section>;
}
