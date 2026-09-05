import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { Check, Copy, Crown, Download, Eye, Hand, ImagePlus, Pencil, Pipette, QrCode, RotateCcw, Share2, Shuffle, Trash2, Undo2 } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { AREA_RULES, GAME_DEFAULTS, IMAGES, LIMITS, commandId, type AnswerFeedback, type ClientCommand, type CreateRoomResponse, type Difference, type RoomSnapshot, type ServerEvent, type Stroke } from "@machigai/shared";
import { Board, initialView, type Tool } from "./Board";
import { validateDifferenceSlots, type SlotValidation, type SourcePixels, type View } from "@machigai/drawing";
import { LANGUAGES, LanguageContext, errorKey, useText, type Language } from "./i18n";
import { copyImage, downloadImage, makePuzzleImage, makeShareImage } from "./share";
import { RulesDialog } from "./RulesDialog";
type Session = CreateRoomResponse & { nickname: string };
type Send = (type: ClientCommand["type"], payload?: unknown) => Promise<void>;
const DUMMY_GENRES = ["genreSea","genreSpace","genreFood","genreVehicles","genreSports","genreFantasy","genreSchool","genreSeasons"] as const;
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
  const t=useText();const [session,setSession]=useState<Session|null>(()=>{try{return JSON.parse(sessionStorage.getItem(SESSION_KEY)??"null") as Session|null}catch{return null}});const [confirmLeave,setConfirmLeave]=useState(false);
  const room=useRoom(session);
  const join=(next:Session)=>{sessionStorage.setItem(SESSION_KEY,JSON.stringify(next));setSession(next)};
  const leave=()=>{setConfirmLeave(false);sessionStorage.removeItem(SESSION_KEY);setSession(null);room.setError("");history.replaceState(null,"",location.pathname)};
  const requestLeave=()=>setConfirmLeave(true);
  const name=room.snapshot?.participants.find(p=>p.id===room.feedback?.participantId)?.nickname??"";
  const gameActive=!!room.snapshot&&["DRAWING","DRAWING_FINALIZING","COUNTDOWN","ANSWERING","ANSWER_REVEAL"].includes(room.snapshot.phase);
  const inLobby=room.snapshot?.phase==="LOBBY";
  return <div className={"app-shell"+(gameActive?" game-active":"")}>
    {!gameActive&&<header className={inLobby?"lobby-global-top":""}>{inLobby?<button onClick={requestLeave}>← {t("leave")}</button>:<a className="brand" href="#" onClick={event=>{event.preventDefault();if(session)requestLeave()}}><span>?</span><strong>{t("app")}</strong></a>}
      {inLobby&&<strong className="lobby-brand">{t("app")}</strong>}<div className="header-actions">{inLobby&&<RulesDialog/>}<label className="language-picker"><span>Language</span><select aria-label="Language" value={language} onChange={e=>onLanguage(e.target.value as Language)}>{LANGUAGES.map(([code,label])=><option key={code} value={code}>{label}</option>)}</select></label></div>
    </header>}
    <main>{!session?<Home onSession={join}/>:!room.snapshot?<section className="loading"><p>{t("loading")}</p><button onClick={requestLeave}>{t("leave")}</button></section>:<Game key={session.participantId} snapshot={room.snapshot} feedback={room.feedback} send={room.send} pending={room.pendingCount>0} leave={requestLeave}/>}</main>
    {confirmLeave&&<div className="modal-backdrop"><section className="modal compact-modal" role="dialog" aria-modal="true" aria-label={t("leaveConfirmTitle")}><h2>{t("leaveConfirmTitle")}</h2><p>{t("leaveConfirmBody")}</p><button autoFocus onClick={()=>setConfirmLeave(false)}>{t("cancel")}</button><button className="primary" onClick={leave}>{t("leave")}</button></section></div>}
    {room.feedback&&room.feedback.result!=="MISS"&&<div className={"feedback "+room.feedback.result.toLowerCase()} role="status" aria-live="polite">{room.feedback.result==="CORRECT"?t("correct",{name}):room.feedback.result==="ALREADY_FOUND"?t("already"):room.feedback.result==="OWN_DIFFERENCE"?t("own"):t("cooldown",{n:GAME_DEFAULTS.missCooldownSeconds})}</div>}
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
function Game({snapshot,feedback,send,pending,leave}:{snapshot:RoomSnapshot;feedback:AnswerFeedback|null;send:Send;pending:boolean;leave:()=>void}){
  const t=useText();const me=snapshot.participants.find(p=>p.id===snapshot.selfId);
  if(!me)return <button onClick={leave}>{t("leave")}</button>;
  const props={snapshot,send,pending};
  if(snapshot.phase==="LOBBY")return <Lobby {...props} leave={leave}/>;
  if(snapshot.phase==="DRAWING"||snapshot.phase==="DRAWING_FINALIZING")return <Drawing key={snapshot.gameNo+"-"+snapshot.stageNo} {...props}/>;
  if(snapshot.phase==="COUNTDOWN")return <Countdown snapshot={snapshot}/>;
  if(snapshot.phase==="ANSWERING"||snapshot.phase==="ANSWER_REVEAL")return <Answer {...props} feedback={feedback}/>;
  if(snapshot.phase==="ROUND_RESULT"||snapshot.phase==="FINAL_RESULT")return <Results {...props} leave={leave}/>;
  return <section className="loading"><h1>{t("ended")}</h1><button onClick={leave}>{t("leave")}</button></section>;
}
function Lobby({snapshot,send,pending,leave}:{snapshot:RoomSnapshot;send:Send;pending:boolean;leave:()=>void}){
  const t=useText();const me=snapshot.participants.find(p=>p.id===snapshot.selfId)!;const [confirmSolo,setConfirmSolo]=useState(false);
  const invite=location.origin+location.pathname+"?room="+snapshot.roomCode;const [copied,setCopied]=useState(false);const [showQr,setShowQr]=useState(false);const [mobileTab,setMobileTab]=useState<"players"|"settings">("players");const [settingsTab,setSettingsTab]=useState<"illustrations"|"rules">("illustrations");
  const [original,setOriginal]=useState<{name:string;url:string}|null>(null);const [originalSelected,setOriginalSelected]=useState(false);const [selectedDeck,setSelectedDeck]=useState(snapshot.settings.deckId);const originalInput=useRef<HTMLInputElement>(null);
  useEffect(()=>()=>{if(original)URL.revokeObjectURL(original.url)},[original]);
  const update=(key:string,value:number|string)=>void send("settings.update",{[key]:value}).catch(()=>{});
  const copyInvite=async()=>{try{await navigator.clipboard.writeText(invite);setCopied(true);setTimeout(()=>setCopied(false),2000)}catch{setCopied(false)}};
  const settingLabels=[[t("differences"),t("countValue",{n:snapshot.settings.differencesPerPlayer})],[t("rounds"),t("roundValue",{n:snapshot.settings.stageCount})],[t("drawTime"),t("seconds",{n:snapshot.settings.drawingSeconds})],[t("answerTime"),t("seconds",{n:snapshot.settings.answeringSeconds})]];
  return <section className="lobby lobby-console">
    <nav className="lobby-mobile-tabs"><button aria-pressed={mobileTab==="players"} onClick={()=>setMobileTab("players")}>{t("members")}</button><button aria-pressed={mobileTab==="settings"} onClick={()=>setMobileTab("settings")}>{t("settings")}</button></nav>
    <div className="lobby-panels">
      <aside className={mobileTab==="players"?"active":""}><h2>{t("members")} {snapshot.participants.length}/{snapshot.settings.maxPlayers}</h2><ul className="member-list lobby-players">{snapshot.participants.map(p=><li key={p.id}><Avatar name={p.nickname}/><strong>{p.nickname} {p.id===me.id&&"("+t("you")+")"}</strong>{p.isHost&&<span className="host-tag"><Crown/>{t("host")}</span>}{me.isHost&&!p.isHost&&<button aria-label={p.nickname+" "+t("leave")} onClick={()=>void send("member.kick",{participantId:p.id}).catch(()=>{})}>×</button>}</li>)}</ul></aside>
      <section className={"lobby-settings "+(mobileTab==="settings"?"active":"")}><nav className="settings-tabs"><button aria-pressed={settingsTab==="illustrations"} onClick={()=>setSettingsTab("illustrations")}>{t("deck")}</button><button aria-pressed={settingsTab==="rules"} onClick={()=>setSettingsTab("rules")}>{t("settings")}</button></nav>{settingsTab==="illustrations"?<section className="deck-card"><div className="series-scroll"><div className="series-options">{(["random","animals","people"] as const).map(series=><button key={series} disabled={!me.isHost} aria-pressed={!originalSelected&&selectedDeck===series} onClick={()=>{setOriginalSelected(false);setSelectedDeck(series);update("deckId",series)}}><strong>{t(series)}</strong>{series==="random"?<Shuffle/>:<img src={IMAGES.find(image=>image.deck===series)!.src} alt=""/>}</button>)}<button disabled={!me.isHost} aria-pressed={originalSelected} onClick={()=>{setOriginalSelected(true);originalInput.current?.click()}}><strong>{t("originalUpload")}</strong>{original?<img src={original.url} alt=""/>:<ImagePlus/>}</button>{DUMMY_GENRES.map(genre=><button key={genre} className="dummy-genre" disabled aria-disabled="true"><strong>{t(genre)}</strong><ImagePlus/><small>{t("comingSoon")}</small></button>)}</div></div><input ref={originalInput} className="original-file-input" type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>{const file=e.target.files?.[0];if(!file)return;setOriginal(previous=>{if(previous)URL.revokeObjectURL(previous.url);return{name:file.name,url:URL.createObjectURL(file)}});e.currentTarget.value=""}}/>{originalSelected&&original&&<div className="original-upload"><button onClick={()=>{URL.revokeObjectURL(original.url);setOriginal(null)}}><Trash2/>{t("removeImage")}</button></div>}</section>:<section className="game-settings-tab">{me.isHost?<fieldset className="settings lobby-setting-controls"><label>{t("rounds")}<select value={snapshot.settings.stageCount} onChange={e=>update("stageCount",Number(e.target.value))}>{Array.from({length:10},(_,i)=><option key={i} value={i+1}>{i+1}</option>)}</select></label><label>{t("differences")}<select value={snapshot.settings.differencesPerPlayer} onChange={e=>update("differencesPerPlayer",Number(e.target.value))}>{[1,2,3,4,5].map(v=><option key={v}>{v}</option>)}</select></label>{(["drawingSeconds","answeringSeconds"] as const).map(key=><label key={key}>{t(key==="drawingSeconds"?"drawTime":"answerTime")}<select value={snapshot.settings[key]} onChange={e=>update(key,Number(e.target.value))}>{[30,45,60,90,120,180,300].map(v=><option key={v}>{t("seconds",{n:v})}</option>)}</select></label>)}</fieldset>:<dl className="setting-labels">{settingLabels.map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>}</section>}</section>
    </div>
    <div className="lobby-footer"><div className="invite-copy"><button onClick={()=>void copyInvite()}><Copy/>{t(copied?"copied":"invite")}</button><small>{t("roomCode")}: <strong>{snapshot.roomCode}</strong></small></div><button className="qr-button" aria-label={t("showQr")} onClick={()=>setShowQr(true)}><QrCode/></button>{me.isHost?<button className="primary start" disabled={pending||originalSelected||snapshot.participants.filter(p=>p.connected).length<1} onClick={()=>snapshot.participants.filter(p=>p.connected).length===1?setConfirmSolo(true):void send("game.start").catch(()=>{})}>{t("start")} →</button>:<p>{t("waiting")}</p>}</div>
    {confirmSolo&&<div className="modal-backdrop"><section className="modal compact-modal" role="dialog" aria-modal="true" aria-label={t("soloConfirmTitle")}><h2>{t("soloConfirmTitle")}</h2><p>{t("soloConfirmBody")}</p><button autoFocus onClick={()=>setConfirmSolo(false)}>{t("cancel")}</button><button className="primary" disabled={pending} onClick={()=>{setConfirmSolo(false);void send("game.start").catch(()=>{})}}>{t("start")}</button></section></div>}
    {showQr&&<div className="modal-backdrop"><section className="modal compact-modal" role="dialog" aria-modal="true" aria-label={t("showQr")}><h2>{t("showQr")}</h2><QRCodeSVG className="real-qr" value={invite} size={200} marginSize={4}/><strong className="modal-code">{snapshot.roomCode}</strong><button onClick={()=>setShowQr(false)}>{t("close")}</button></section></div>}
  </section>;
}
function Avatar({name}:{name:string}){return <span className="avatar">{Array.from(name)[0]}</span>}
function useNow(){const [now,setNow]=useState(Date.now());useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),200);return()=>clearInterval(timer)},[]);return now}
function Timer({endsAt}:{endsAt?:string}){const now=useNow();const seconds=endsAt?Math.max(0,Math.ceil((Date.parse(endsAt)-now)/1000)):0;return <time className={"timer "+(seconds<15?"danger":"")}>{String(Math.floor(seconds/60)).padStart(2,"0")}:{String(seconds%60).padStart(2,"0")}</time>}
function PhaseControls({snapshot,send,pending}:{snapshot:RoomSnapshot;send:Send;pending:boolean}){
  const t=useText();const host=snapshot.participants.find(p=>p.id===snapshot.selfId)?.isHost;
  return <div className="phase-controls"><Timer endsAt={snapshot.phaseEndsAt}/>{host&&snapshot.phase==="ANSWERING"&&<button className="advance" disabled={pending} onClick={()=>{if(confirm(t("advanceConfirm")))void send("phase.advance").catch(()=>{})}}>{t("advance")}</button>}</div>;
}
function ZoomControls({view,onView}:{view:View;onView:(value:View)=>void}){
  const t=useText();return <div className="zoom-controls"><label>{t("zoom")} <input aria-label={t("zoom")} type="range" min={GAME_DEFAULTS.zoomMin} max={GAME_DEFAULTS.zoomMax} step=".05" value={view.zoom} onChange={e=>onView({...view,zoom:Number(e.target.value)})}/><output>{Math.round(view.zoom*100)}%</output></label><button onClick={()=>onView(initialView)}><RotateCcw/>{t("reset")}</button></div>;
}
function Drawing({snapshot,send,pending}:{snapshot:RoomSnapshot;send:Send;pending:boolean}){
  const t=useText();const me=snapshot.participants.find(p=>p.id===snapshot.selfId)!;
  const slotCount=snapshot.settings.differencesPerPlayer;
  const storageKey=`drawing-${snapshot.roomId}-${snapshot.gameNo}-${snapshot.stageNo}-${snapshot.selfId}`;
  const [slots,setSlots]=useState<Stroke[][]>(()=>{try{const saved=JSON.parse(sessionStorage.getItem(storageKey)??"null");if(Array.isArray(saved))return Array.from({length:slotCount},(_,i)=>Array.isArray(saved[i])?saved[i]:[])}catch{}return Array.from({length:slotCount},()=>[])});
  const slotsRef=useRef(slots);slotsRef.current=slots;
  const [activeSlot,setActiveSlot]=useState<number|"all">(0);const active=typeof activeSlot==="number"?activeSlot:0;
  const drafts=activeSlot==="all"?slots.flat():slots[active]??[];const [view,setView]=useState<View>(initialView);
  const [tool,setTool]=useState<Tool>("draw");const [color,setColor]=useState("#111111");const [width,setWidth]=useState(.008);
  const spaceHeld=useRef(false);const toolBeforeSpace=useRef<Tool>("draw");
  const [validations,setValidations]=useState<SlotValidation[]>(()=>slots.map(strokes=>({valid:false,reason:strokes.length?"small":"empty"})));
  const validationRef=useRef(validations);validationRef.current=validations;const source=useRef<SourcePixels|undefined>(undefined);
  const [submitting,setSubmitting]=useState(false);
  const autoSubmitted=useRef(false);
  useEffect(()=>{sessionStorage.setItem(storageKey,JSON.stringify(slots))},[storageKey,slots]);
  useEffect(()=>{let active=true;const image=IMAGES.find(item=>item.src===snapshot.imageUrl)!;fetch(snapshot.imageUrl+".rgb").then(response=>response.arrayBuffer()).then(buffer=>{if(!active)return;source.current={width:AREA_RULES.sampleWidth,height:Math.round(AREA_RULES.sampleWidth*image.height/image.width),rgb:new Uint8Array(buffer)};setValidations(validateDifferenceSlots(source.current,slotsRef.current))}).catch(()=>{});return()=>{active=false}},[snapshot.imageUrl]);
  useEffect(()=>{if(!source.current)return;const timer=setTimeout(()=>setValidations(validateDifferenceSlots(source.current!,slots)),40);return()=>clearTimeout(timer)},[slots]);
  useEffect(()=>{const editable=(target:EventTarget|null)=>target instanceof HTMLInputElement||target instanceof HTMLSelectElement||target instanceof HTMLTextAreaElement;
    const down=(event:KeyboardEvent)=>{if(event.code!=="Space"||event.repeat||editable(event.target))return;event.preventDefault();spaceHeld.current=true;toolBeforeSpace.current=tool;setTool("pick")};
    const release=(event?:Event)=>{if(event instanceof KeyboardEvent&&event.code!=="Space")return;if(!spaceHeld.current)return;event?.preventDefault();spaceHeld.current=false;setTool(toolBeforeSpace.current)};
    window.addEventListener("keydown",down);window.addEventListener("keyup",release);window.addEventListener("blur",release);return()=>{window.removeEventListener("keydown",down);window.removeEventListener("keyup",release);window.removeEventListener("blur",release)};
  },[tool]);
  useEffect(()=>{if(snapshot.phase!=="DRAWING_FINALIZING"||autoSubmitted.current)return;autoSubmitted.current=true;const results=source.current?validateDifferenceSlots(source.current,slots):validationRef.current;const valid=slots.filter((_,index)=>results[index]?.valid).map(strokes=>({strokes}));void send("drawing.submit",{differences:valid}).catch(()=>{})},[snapshot.phase]);
  const updateActive=(change:(strokes:Stroke[])=>Stroke[])=>{if(typeof activeSlot!=="number")return;setValidations(value=>value.map((result,index)=>index===activeSlot?{valid:false,reason:"small"}:result));setSlots(value=>value.map((strokes,index)=>index===activeSlot?change(strokes):strokes))};
  const allValid=validations.length===slotCount&&validations.every(result=>result.valid);
  if(snapshot.phase==="DRAWING_FINALIZING")return <section className="loading game-phase" role="status"><h1>{t("finalizing")}</h1><p>{t("finalizingHint")}</p></section>;
  return <section className="game-phase drawing-phase"><div className="toolbar game-toolbar drawing-toolbar">
      <PhaseControls snapshot={snapshot} send={send} pending={pending}/>
      <div className="mode-controls"><button aria-pressed={tool==="draw"} onClick={()=>setTool("draw")}><Pencil/>{t("pen")}</button><button aria-pressed={tool==="move"} onClick={()=>setTool("move")}><Hand/>{t("move")}</button><button aria-pressed={tool==="pick"} aria-label={t("pick")} title={t("pick")} onClick={()=>setTool("pick")}><Pipette/></button><button title={t("undo")} aria-label={t("undo")} disabled={activeSlot==="all"||!drafts.length||submitting} onClick={()=>updateActive(value=>value.slice(0,-1))}><Undo2/><span>{t("undo")}</span></button><button title={t("clear")} aria-label={t("clear")} disabled={activeSlot==="all"||!drafts.length||submitting} onClick={()=>updateActive(()=>[])}><Trash2/><span>{t("clear")}</span></button></div>
      <div className="pen-controls"><label>{t("color")}<input aria-label={t("color")} type="color" value={color} onChange={e=>setColor(e.target.value)}/></label>{["#000000","#ffffff"].map(c=><button key={c} className="swatch" style={{background:c}} aria-label={c} aria-pressed={color===c} onClick={()=>setColor(c)}/>)}<label>{t("width")}<input aria-label={t("width")} type="range" min={1} max={30} step={1} value={width*1000} onChange={e=>setWidth(Number(e.target.value)/1000)}/></label><span className="pen-preview" aria-label={t("width")+" "+Math.round(width*1000)}><i style={{background:color,width:Math.max(2,width*1000),height:Math.max(2,width*1000)}}/></span></div>
      <ZoomControls view={view} onView={setView}/>
      <strong className="compact-progress" data-testid="confirmed-progress">{me.confirmed?t("confirmed"):t("notReady")}</strong>
      <button className="primary confirm-draft" data-validation={validations.map(result=>result.reason??"valid").join(",")} disabled={snapshot.phase!=="DRAWING"||me.confirmed||!allValid||submitting} onClick={()=>{setSubmitting(true);void send("drawing.ready").catch(()=>{}).finally(()=>setSubmitting(false))}}>{me.confirmed?<><Check/>{t("confirmed")}</>:submitting?t("saving"):t("confirmShort")}</button>
      {tool==="pick"&&<span className="pick-notice" role="status">{t("pickHint")}</span>}
    </div>
    <div className="drawing-workspace"><Board fullViewport imageUrl={snapshot.imageUrl} drafts={drafts} view={view} onView={setView} tool={activeSlot==="all"?"move":tool} color={color} width={width} disabled={snapshot.phase!=="DRAWING"||activeSlot==="all"||submitting} onStroke={stroke=>updateActive(value=>value.length<LIMITS.maxStrokes?[...value,stroke]:value)} onPick={c=>{setColor(c);if(!spaceHeld.current)setTool("draw")}}/>
      {slotCount>1&&<nav className="difference-slots" aria-label={t("differenceSlots")}>{slots.map((_,index)=>{const result=validations[index];return <button key={index} className={result?.valid?"slot-valid":"slot-invalid"} aria-label={t("differenceNumber",{n:index+1})} aria-pressed={activeSlot===index} onClick={()=>setActiveSlot(index)}>{index+1}{result?.valid&&<Check/>}</button>})}<button className="show-all" aria-pressed={activeSlot==="all"} onClick={()=>setActiveSlot("all")}>{t("all")}</button></nav>}
    </div>
  </section>;
}
function Countdown({snapshot}:{snapshot:RoomSnapshot}){const t=useText();const now=useNow();const n=Math.max(0,Math.ceil((Date.parse(snapshot.phaseEndsAt!)-now)/1000));return <section className="countdown game-phase" role="status"><h1>{t("countdown")}</h1><strong>{n||"…"}</strong></section>}
function Answer({snapshot,feedback,send,pending}:{snapshot:RoomSnapshot;feedback:AnswerFeedback|null;send:Send;pending:boolean}){
  const t=useText();const [view,setView]=useState<View>(initialView);const [tool,setTool]=useState<Tool>("answer");
  const [mobileImage,setMobileImage]=useState<"original"|"changed">("changed");
  const [lastAnswer,setLastAnswer]=useState<{x:number;y:number;changed:boolean;sentAt:number}|null>(null);
  const now=useNow();const me=snapshot.participants.find(p=>p.id===snapshot.selfId)!;const cooldown=Math.max(0,Math.ceil((Date.parse(me.answerBlockedUntil??"")-now)/1000)||0);
  const revealing=snapshot.phase==="ANSWER_REVEAL";
  const ownResult=lastAnswer&&feedback?.participantId===me.id&&Date.parse(feedback.at)>=lastAnswer.sentAt-100&&(feedback.result==="CORRECT"||feedback.result==="MISS")?feedback:null;
  const answer=(x:number,y:number,changed:boolean)=>{setLastAnswer({x,y,changed,sentAt:Date.now()});void send("answer.submit",{x,y}).catch(()=>{})};
  return <section className="game-phase answer-phase"><div className="toolbar game-toolbar answer-toolbar"><PhaseControls snapshot={snapshot} send={send} pending={pending}/><div className="mode-controls"><button aria-pressed={tool==="answer"} onClick={()=>setTool("answer")}><Eye/>{t("answer")}</button><button aria-pressed={tool==="move"} onClick={()=>setTool("move")}><Hand/>{t("move")}</button></div><ZoomControls view={view} onView={setView}/><strong>{snapshot.differences.filter(d=>d.foundBy).length}/{snapshot.differences.length}</strong><div className="answer-switch"><button aria-pressed={mobileImage==="original"} onClick={()=>setMobileImage("original")}>{t("original")}</button><button aria-pressed={mobileImage==="changed"} onClick={()=>setMobileImage("changed")}>{t("changed")}</button></div></div>
    {revealing&&<p className="reveal-notice" role="status">{t("reveal")}</p>}
    <div className={"compare mobile-"+mobileImage}>{[false,true].map(changed=><div key={String(changed)} className={"answer-board "+(changed?"changed":"original")}><Board imageUrl={snapshot.imageUrl} differences={changed?snapshot.differences:[]} view={view} onView={setView} tool={tool} label={t(changed?"changed":"original")} marks hideFound disabled={cooldown>0||revealing} onAnswer={(x,y)=>answer(x,y,changed)} answerPopup={ownResult&&lastAnswer!.changed===changed?{x:lastAnswer!.x,y:lastAnswer!.y,result:ownResult.result==="CORRECT"?"correct":"miss",text:t(ownResult.result==="CORRECT"?"correctScore":"missScore",{n:ownResult.result==="CORRECT"?Math.abs(ownResult.scoreDelta??0):snapshot.settings.missPenalty}),subtext:ownResult.result==="MISS"&&cooldown>0?t("cooldownPopup",{n:cooldown}):undefined}:undefined}/></div>)}</div>
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
  const [tab,setTab]=useState<"ranking"|"artwork">(snapshot.phase==="FINAL_RESULT"?"ranking":"artwork");
  const isFinal=snapshot.phase==="FINAL_RESULT",me=snapshot.participants.find(p=>p.id===snapshot.selfId)!;
  useEffect(()=>setTab(isFinal?"ranking":"artwork"),[isFinal]);
  const round=snapshot.rounds?.find(r=>r.stageNo===roundNo)??{stageNo:snapshot.stageNo,imageUrl:snapshot.imageUrl,differences:snapshot.differences};
  const shown=filter==="all"?round.differences:round.differences.filter(d=>d.creatorId===filter);
  return <section className="results"><div className="result-header"><span className="eyebrow">{t("round",{n:round.stageNo})}</span><h1>{t(isFinal?"final":"result")}</h1></div><nav className="result-tabs"><button aria-pressed={tab==="ranking"} onClick={()=>setTab("ranking")}>{t("ranking")}</button><button aria-pressed={tab==="artwork"} onClick={()=>setTab("artwork")}>{t("artwork")}</button></nav>
    <div className="result-content">{tab==="artwork"?<div className="review"><div className="gallery-tabs">{isFinal&&(snapshot.rounds??[]).map(r=><button key={r.stageNo} aria-pressed={roundNo===r.stageNo} onClick={()=>{setRoundNo(r.stageNo);setView(initialView)}}>{t("round",{n:r.stageNo})}</button>)}</div>
      <div className="toolbar"><ZoomControls view={view} onView={setView}/><label className="check-label"><input type="checkbox" checked={marks} onChange={e=>setMarks(e.target.checked)}/>{t("marks")}</label></div>
      <div className="gallery-tabs"><button aria-pressed={filter==="all"} onClick={()=>setFilter("all")}>{t("all")}</button>{snapshot.participants.map(p=><button key={p.id} aria-pressed={filter===p.id} onClick={()=>setFilter(p.id)}>{p.nickname}</button>)}</div>
      <div className="compare"><ExportBoard imageUrl={round.imageUrl} differences={[]} view={view} onView={setView} label={t("original")} filename="original.png"/><ExportBoard imageUrl={round.imageUrl} differences={shown} view={view} onView={setView} label={t("changed")} filename="spot-the-difference.png" marks={marks}/></div>
      <SharePanel imageUrl={round.imageUrl} differences={shown}/>
    </div>:<div className="ranking-panel"><Scores snapshot={snapshot} highlightWinner={isFinal}/><RoundScores snapshot={snapshot} roundNo={round.stageNo}/></div>}</div><div className="result-actions">{me.isHost?<button className="primary" disabled={pending} onClick={()=>void send(isFinal?"game.rematch":"round.continue").catch(()=>{})}>{t(isFinal?"rematch":snapshot.stageNo>=snapshot.stageCount?"viewFinal":"next")}</button>:<p>{t("waiting")}</p>}<button onClick={leave}>{t("leave")}</button></div>
  </section>;
}
function ExportBoard({imageUrl,differences,view,onView,label,filename,marks=false}:{imageUrl:string;differences:Difference[];view:View;onView:(view:View)=>void;label:string;filename:string;marks?:boolean}){
  const t=useText();const [blob,setBlob]=useState<Blob|null>(null);const [copied,setCopied]=useState(false);const signature=differences.map(d=>d.id).join(",");
  useEffect(()=>{let active=true;setBlob(null);void makePuzzleImage(imageUrl,differences).then(value=>{if(active)setBlob(value)});return()=>{active=false}},[imageUrl,signature]);
  const copy=async()=>{if(!blob)return;try{await copyImage(blob);setCopied(true);setTimeout(()=>setCopied(false),1800)}catch{setCopied(false)}};
  return <div className="export-board"><Board imageUrl={imageUrl} differences={differences} view={view} onView={onView} label={label} marks={marks} persistentMarks/><div className="image-export-actions"><button className="desktop-only icon-button" aria-label={t("copyImage")} title={t("copyImage")} disabled={!blob} onClick={()=>void copy()}><Copy/></button><button className="icon-button" aria-label={t("saveImage")} title={t("saveImage")} disabled={!blob} onClick={()=>blob&&downloadImage(blob,filename)}><Download/></button></div>{copied&&<span className="copy-notice" role="status">{t("imageCopied")}</span>}</div>;
}
function SharePanel({imageUrl,differences}:{imageUrl:string;differences:Difference[]}){
  const t=useText();const language=useContext(LanguageContext);const [blob,setBlob]=useState<Blob|null>(null);const [preview,setPreview]=useState("");const [error,setError]=useState(false);const [copied,setCopied]=useState(false);
  const signature=differences.map(d=>d.id).join(",");
  useEffect(()=>{let active=true,url="";setBlob(null);setPreview("");setError(false);
    void makeShareImage(imageUrl,differences,{title:t("app"),count:t("shareBadge",{n:differences.length}),original:t("original"),changed:t("changed")}).then(result=>{if(active){url=URL.createObjectURL(result);setBlob(result);setPreview(url)}}).catch(()=>{if(active)setError(true)});
    return()=>{active=false;if(url)URL.revokeObjectURL(url)};
  },[imageUrl,signature,language]);
  const share=async()=>{if(!blob)return;const file=new File([blob],"difference-party.png",{type:"image/png"});
    try{if(navigator.canShare?.({files:[file]}))await navigator.share({files:[file],title:t("app"),text:t("shareText")});else downloadImage(blob)}catch(error){if(!(error instanceof DOMException&&error.name==="AbortError"))setError(true)}
  };
  const canShare=!!blob&&!!navigator.canShare?.({files:[new File([blob],"difference-party.png",{type:"image/png"})]});
  const copy=async()=>{if(!blob)return;try{await copyImage(blob);setCopied(true);setTimeout(()=>setCopied(false),1800)}catch{setError(true)}};
  const homeUrl=location.origin+location.pathname;const xUrl="https://twitter.com/intent/tweet?text="+encodeURIComponent(t("shareText"))+"&url="+encodeURIComponent(homeUrl);
  return <section className="share-panel"><div className="share-actions">{canShare&&<button className="mobile-only" disabled={!blob} onClick={()=>void share()}><Share2/>{t("share")}</button>}<button disabled={!blob} onClick={()=>blob&&downloadImage(blob)}><Download/>{t("download")}</button><button className="desktop-only icon-button" aria-label={t("copyImage")} title={t("copyImage")} disabled={!blob} onClick={()=>void copy()}><Copy/></button><a className="desktop-only x-post" href={xUrl} target="_blank" rel="noreferrer">{t("xPost")}</a></div>{copied&&<p role="status">{t("imageCopied")}</p>}{error&&<p role="alert">{t("error")}</p>}{preview&&<details><summary>{t("sharePreview")}</summary><img className="share-preview" src={preview} alt={t("sharePreview")}/></details>}</section>;
}
