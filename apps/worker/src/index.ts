import { ORIGINAL_IMAGE_LIMITS as IMAGE_LIMITS, type OriginalImage } from "@machigai/shared";
import { validateOriginalSlots } from "@machigai/drawing";
import { readPixels, pixelsToPng } from "./original-image";
import { DurableObject } from "cloudflare:workers";
import { AnswerSchema, ClientCommandSchema, DrawingSubmissionSchema, GAME_DEFAULTS, IMAGES, LIMITS, NicknameSchema, RoomCodeSchema, SettingsUpdateSchema, chooseImage, type AnswerFeedback, type Difference, type GameSettings, type Participant, type RoomSnapshot, type ServerEvent } from "@machigai/shared";
import { buildHitRegion, hitTest, type HitRegion } from "@machigai/drawing";
import { AREA_RULES, areaPoints } from "@machigai/shared";
import { validateDifferenceSlots, visibleHit, type SourcePixels, type VisibleArea } from "@machigai/drawing";

interface Env { ROOMS: DurableObjectNamespace<Room>; ASSETS: Fetcher }
type InternalParticipant = Omit<Participant, "isHost"> & { secretHash: string; kicked: boolean; lastSeenAt: string; drawingSubmitted?: boolean };
type InternalDifference = Difference & { hitRegion: HitRegion; visible?: VisibleArea };
type StoredRoom = { originalImage?: OriginalImage; imageChunks?: number; imageOperations?: string[]; uploadWindow?: {at:number;count:number;last:number}; roomId: string; roomCode: string; phase: RoomSnapshot["phase"]; revision: number; gameNo: number; imageUrl: string; phaseEndsAt?: string; drawingFinalizingStartedAt?: string; hostTransferAt?: string; expiresAt?: string; hostId: string; participants: InternalParticipant[]; differences: InternalDifference[]; processedCommands: string[]; settings: GameSettings; gameScores?: Record<string,{found:number;unfound:number;penalty:number;total:number}> };
type SocketSession = { participantId?: string };
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8" } });
const randomCode = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), value => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[value % 32]).join("");
const secret = () => crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "");
async function sha256(value: string) { return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))), b => b.toString(16).padStart(2, "0")).join(""); }
class CommandError extends Error { constructor(readonly code: string) { super(code); } }

export class Room extends DurableObject<Env> {
  private room?: StoredRoom;
  private sockets = new Map<WebSocket, SocketSession>();
  private pending: Promise<unknown> = Promise.resolve();
  private sourceCache?: { url: string; pixels: SourcePixels };
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.room = await ctx.storage.get<StoredRoom>("room");
      if (this.room) {
        const legacy=this.room.settings as GameSettings&{deckId?:string;stageCount?:number};
        const selected=Array.isArray(legacy.imageIds)?legacy.imageIds.filter(id=>IMAGES.some(image=>image.id===id)):[];
        const {deckId:_deckId,stageCount:_stageCount,...current}=legacy;
        this.room.settings = { ...GAME_DEFAULTS, ...current, imageIds:(selected.length?selected:GAME_DEFAULTS.imageIds) as GameSettings["imageIds"], sourceType:legacy.sourceType==="original"||legacy.deckId==="original"&&!!this.room.originalImage?"original":"standard", minPlayers: GAME_DEFAULTS.minPlayers, missPenalty: GAME_DEFAULTS.missPenalty, missCooldownSeconds: GAME_DEFAULTS.missCooldownSeconds };
        if((this.room.phase as string)==="ROUND_RESULT")this.room.phase="FINAL_RESULT";
        this.room.gameScores ??= {};
      }
    });
  }
  // Authentication awaits and durable writes must not let another command overtake.
  private serial<T>(action: () => Promise<T>): Promise<T> {
    const next = this.pending.then(action); this.pending = next.catch(() => {}); return next;
  }
  async fetch(request: Request): Promise<Response> {
    return this.serial(async () => {
      try {
        const url = new URL(request.url);
        await this.expireIfDue();
        if(url.pathname.endsWith("/original-image")) return await this.originalImage(request);
        if (url.pathname.endsWith("/create") && request.method === "POST") return await this.create(request);
        if (url.pathname.endsWith("/join") && request.method === "POST") return await this.join(request);
        if (url.pathname.endsWith("/socket") && request.headers.get("Upgrade") === "websocket") {
          if (!this.room) return json({ code: "ROOM_NOT_FOUND" }, 404);
          const pair = new WebSocketPair(); const socket = pair[1]; socket.accept();
          this.sockets.set(socket, {});
          socket.addEventListener("message", event => void this.serial(() => this.onMessage(socket, String(event.data))));
          socket.addEventListener("close", () => void this.serial(() => this.onClose(socket)));
          socket.addEventListener("error", () => void this.serial(() => this.onClose(socket)));
          return new Response(null, { status: 101, webSocket: pair[0] });
        }
        return json({ code: "NOT_FOUND" }, 404);
      } catch (error) { const code=error instanceof CommandError?error.code:"INVALID_PAYLOAD";return json({ code },code==="SESSION_REVOKED"||code==="NOT_HOST"?403:code==="ROOM_NOT_FOUND"?404:400); }
    });
  }
  private async destroy() {
    for(const ws of this.sockets.keys()){this.send(ws,"error",{code:"ROOM_NOT_FOUND",message:"ROOM_NOT_FOUND"});ws.close(4000,"expired")}
    this.sockets.clear();await this.ctx.storage.deleteAll();await this.ctx.storage.deleteAlarm();
    this.room=undefined;this.sourceCache=undefined;
  }
  private async expireIfDue() {
    if(this.room && [this.room.expiresAt].some(d=>d&&Date.parse(d)<=Date.now()))await this.destroy();
  }
  private async originalImage(request:Request):Promise<Response> {
    const r=this.room;if(!r)return json({code:"ROOM_NOT_FOUND"},404);
    const id=request.headers.get("x-participant-id"),auth=request.headers.get("authorization");
    if(!auth?.startsWith("Bearer ")||auth.length>300)throw new CommandError("SESSION_REVOKED");
    const member=this.members().find(p=>p.id===id);
    if(!member||member.secretHash!==await sha256(auth.slice(7)))throw new CommandError("SESSION_REVOKED");
    if(request.method==="GET"){
      if(!r.originalImage||new URL(request.url).searchParams.get("version")!==r.originalImage.id)return json({code:"IMAGE_MISSING"},404);
      const parts:Uint8Array[]=[];for(let i=0;i<(r.imageChunks??0);i++){const data=await this.ctx.storage.get<Uint8Array>("image:"+i);if(!data)return json({code:"IMAGE_MISSING"},404);parts.push(data)}
      return new Response(new Blob(parts as BlobPart[],{type:"image/png"}),{headers:{"content-type":"image/png","cache-control":"private, no-store","x-content-type-options":"nosniff","content-security-policy":"default-src 'none'","cross-origin-resource-policy":"same-origin"}});
    }
    if(!["POST","DELETE"].includes(request.method))return json({code:"NOT_FOUND"},405);
    this.requireHost(member.id);this.requirePhase("LOBBY");
    const operation=request.headers.get("x-command-id")??"";
    if(!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(operation))throw new CommandError("INVALID_PAYLOAD");
    const key=member.id+":"+operation;
    if(r.imageOperations?.includes(key))return json({ok:true});
    if(request.headers.get("x-image-version")!==(r.originalImage?.id??"none"))return json({code:"STALE_COMMAND"},409);
    let png:Uint8Array<ArrayBuffer>|undefined,meta:OriginalImage|undefined;
    if(request.method==="POST"){
      const now=Date.now(),rate=r.uploadWindow;
      const current=rate&&now-rate.at<IMAGE_LIMITS.rateWindowMs?rate:{at:now,count:0,last:0};
      if(current.count>=IMAGE_LIMITS.maxUploadsPerHour||now-current.last<IMAGE_LIMITS.uploadIntervalMs)return json({code:"RATE_LIMITED"},429);
      r.uploadWindow={at:current.at,count:current.count+1,last:now};await this.save();
      try{
        const pixels=await readPixels(request);png=await pixelsToPng(pixels);
        const imageId=crypto.randomUUID();
        meta={id:imageId,url:`/api/v1/rooms/${r.roomCode}/original-image?version=${imageId}`,width:pixels.width,height:pixels.height,bytes:png.length,expiresAt:r.expiresAt};
      }catch(error){const code=error instanceof Error?error.message:"IMAGE_INVALID";return json({code:["IMAGE_TOO_LARGE","IMAGE_TIMEOUT"].includes(code)?code:"IMAGE_INVALID"},400)}
    }
    // Fixed keys and one transaction: replacements, metadata and deletion cannot orphan bytes.
    const next={...r,originalImage:meta,imageChunks:png?Math.ceil(png.length/IMAGE_LIMITS.chunkBytes):0,
      imageOperations:[...(r.imageOperations??[]),key].slice(-100),revision:r.revision+1,
      settings:{...r.settings,sourceType:meta?r.settings.sourceType:"standard" as const}};
    await this.ctx.storage.transaction(async txn=>{
      for(let i=0;i<(r.imageChunks??0);i++)await txn.delete("image:"+i);
      if(png)for(let i=0;i<next.imageChunks;i++)await txn.put("image:"+i,png.slice(i*IMAGE_LIMITS.chunkBytes,(i+1)*IMAGE_LIMITS.chunkBytes));
      await txn.put("room",next);
      const dates=[next.phaseEndsAt,next.hostTransferAt,next.expiresAt].filter((d):d is string=>!!d).map(Date.parse);
      if(dates.length)await txn.setAlarm(Math.max(Date.now()+1,Math.min(...dates)));else await txn.deleteAlarm();
    });
    this.room=next;await this.changed();return json({ok:true});
  }
  private async makeParticipant(nickname: string, joinOrder: number) {
    const reconnectSecret = secret();
    const participant: InternalParticipant = { id: crypto.randomUUID(), nickname, joinOrder, connected: false, ready: true, score: 0, confirmed: false, secretHash: await sha256(reconnectSecret), kicked: false, lastSeenAt: new Date().toISOString() };
    return { participant, reconnectSecret };
  }
  private response(participantId: string, reconnectSecret: string, status: number) {
    return json({ roomId: this.room!.roomId, roomCode: this.room!.roomCode, participantId, reconnectSecret, socketUrl: `/api/v1/rooms/${this.room!.roomCode}/socket` }, status);
  }
  private async create(request: Request) {
    if (this.room) return json({ code: "ROOM_EXISTS" }, 409);
    const body = await request.json<{ nickname: string; roomCode: string }>();
    const { participant, reconnectSecret } = await this.makeParticipant(NicknameSchema.parse(body.nickname), 1);
    this.room = { roomId: crypto.randomUUID(), roomCode: RoomCodeSchema.parse(body.roomCode), phase: "LOBBY", revision: 1, gameNo: 1, imageUrl: IMAGES[0].src, hostId: participant.id, participants: [participant], differences: [], processedCommands: [], settings: { ...GAME_DEFAULTS, imageIds:[...GAME_DEFAULTS.imageIds] }, gameScores:{}, expiresAt: new Date(Date.now() + 30 * 60000).toISOString() };
    await this.save(); return this.response(participant.id, reconnectSecret, 201);
  }
  private async join(request: Request) {
    if (!this.room) return json({ code: "ROOM_NOT_FOUND" }, 404);
    if (this.room.phase !== "LOBBY") return json({ code: "GAME_ALREADY_STARTED" }, 409);
    if (this.members().length >= this.room.settings.maxPlayers) return json({ code: "ROOM_FULL" }, 409);
    const body = await request.json<{ nickname: string }>();
    const { participant, reconnectSecret } = await this.makeParticipant(NicknameSchema.parse(body.nickname), Math.max(...this.room.participants.map(p => p.joinOrder)) + 1);
    this.room.participants.push(participant); await this.changed();
    return this.response(participant.id, reconnectSecret, 200);
  }
  private async onMessage(socket: WebSocket, raw: string) {
    let id: string | undefined;
    try {
      await this.expireIfDue();
      if (!this.room) throw new CommandError("ROOM_NOT_FOUND");
      if (new TextEncoder().encode(raw).length > LIMITS.maxMessageBytes) throw new CommandError("INVALID_PAYLOAD");
      const decoded: unknown = JSON.parse(raw);
      const parsed = ClientCommandSchema.safeParse(decoded);
      if (!parsed.success) {
        if (decoded && typeof decoded === "object" && "commandId" in decoded && typeof decoded.commandId === "string") id = decoded.commandId.slice(0, 80);
        throw new CommandError("INVALID_PAYLOAD");
      }
      const command = parsed.data; id = command.commandId;
      if (command.type === "session.resume") {
        const member = this.room.participants.find(p => p.id === command.payload.participantId && !p.kicked);
        if (!member || member.secretHash !== await sha256(command.payload.reconnectSecret)) throw new CommandError("SESSION_REVOKED");
        this.sockets.set(socket, { participantId: member.id }); member.connected = true;
        member.lastSeenAt = new Date().toISOString();
        if (member.id === this.room.hostId) delete this.room.hostTransferAt;
        if (!["FINAL_RESULT", "ENDED"].includes(this.room.phase)) delete this.room.expiresAt;
        await this.changed(); return;
      }
      const memberId = this.sockets.get(socket)?.participantId;
      const member = this.room.participants.find(p => p.id === memberId && !p.kicked);
      if (!member) throw new CommandError("SESSION_REVOKED");
      const key = member.id + ":" + id;
      if (this.room.processedCommands.includes(key)) {
        this.send(socket, "state.snapshot", this.snapshot(member.id));
        this.send(socket, "command.ack", { commandId: id }); return;
      }
      if (command.gameNo !== undefined && command.gameNo !== this.room.gameNo) throw new CommandError("STALE_COMMAND");
      let feedback: AnswerFeedback | undefined;
      switch (command.type) {
        case "member.leave": {
          member.kicked=true;member.connected=false;
          this.send(socket,"command.ack",{commandId:id});
          for(const [ws,session] of this.sockets)if(session.participantId===member.id){this.sockets.delete(ws);ws.close(4001,"left")}
          if(!this.members().length){await this.destroy();return}
          if(!this.members().some(p=>p.connected)&&!["FINAL_RESULT","ENDED"].includes(this.room.phase))this.room.expiresAt=new Date(Date.now()+(this.room.phase==="LOBBY"?1800000:7200000)).toISOString();
          if(member.id===this.room.hostId){this.room.hostId=this.members().sort((a,b)=>Number(b.connected)-Number(a.connected)||a.joinOrder-b.joinOrder)[0]!.id;delete this.room.hostTransferAt}
          await this.changed();return;
        }
        case "member.ready": this.requirePhase("LOBBY"); member.ready = command.payload.ready; break;
        case "settings.update": {
          this.requireHost(member.id); this.requirePhase("LOBBY");
          const settings = SettingsUpdateSchema.parse(command.payload);
          if(settings.sourceType==="original"&&!this.room.originalImage)throw new CommandError("IMAGE_MISSING");
          this.room.settings = { ...this.room.settings, ...settings }; break;
        }
        case "game.start":
          this.requireHost(member.id); this.requirePhase("LOBBY");
          if (this.members().filter(p => p.connected).length < this.room.settings.minPlayers) throw new CommandError("NOT_ENOUGH_PLAYERS");
          if(this.room.settings.sourceType==="original"&&!this.room.originalImage)throw new CommandError("IMAGE_MISSING");
          if(this.room.settings.sourceType==="standard"&&!this.room.settings.imageIds.length)throw new CommandError("INVALID_PAYLOAD");
          this.startDrawing(); break;
        case "member.kick": {
          this.requireHost(member.id);
          if (command.payload.participantId === member.id) throw new CommandError("INVALID_PAYLOAD");
          const target = this.members().find(p => p.id === command.payload.participantId);
          if (target) { target.kicked = true; target.connected = false; for (const [ws, session] of this.sockets) if (session.participantId === target.id) { this.send(ws, "error", { code: "SESSION_REVOKED", message: "SESSION_REVOKED" }); ws.close(4001, "kicked"); } }
          break;
        }
        case "drawing.ready": {
          this.requirePhase("DRAWING");member.confirmed=true;
          if(this.members().every(p=>p.confirmed))this.startDrawingFinalizing();
          break;
        }
        case "drawing.submit": {
          this.requirePhase("DRAWING_FINALIZING");
          if(member.drawingSubmitted)break;
          const input=DrawingSubmissionSchema.parse(command.payload);
          const slots=input.differences.slice(0,this.room.settings.differencesPerPlayer).map(d=>d.strokes);
          const original=this.room.settings.sourceType==="original"?this.room.originalImage:undefined;
          const validations=original?validateOriginalSlots(original.width,original.height,slots):validateDifferenceSlots(await this.sourcePixels(),slots);
          for(let index=0;index<slots.length;index++){
            const strokes=slots[index]!,visible=validations[index]?.visible;if(!validations[index]?.valid||!visible)continue;
            this.room.differences.push({id:crypto.randomUUID(),creatorId:member.id,strokes,hitRegion:buildHitRegion({strokes}),visible,points:original?{finder:GAME_DEFAULTS.pointsForFinder,unfound:GAME_DEFAULTS.pointsForUnfoundCreator}:areaPoints(visible.ratio)});
          }
          member.drawingSubmitted=true;
          if(this.members().filter(p=>p.connected).every(p=>p.drawingSubmitted)){
            const minimumEnd=Date.parse(this.room.drawingFinalizingStartedAt!)+LIMITS.drawingFinalizeMinMs;
            if(Date.now()>=minimumEnd)this.startCountdown();
            else this.room.phaseEndsAt=new Date(minimumEnd).toISOString();
          }
          break;
        }
        case "answer.submit": feedback = this.answer(member, command.payload); break;
        case "phase.advance":
          this.requireHost(member.id);
          if (this.room.phase === "DRAWING") this.startDrawingFinalizing();
          else if (this.room.phase === "ANSWERING") this.finishGame();
          else throw new CommandError("INVALID_PHASE");
          break;
        case "game.rematch":
          this.requireHost(member.id); this.requirePhase("FINAL_RESULT");
          this.room.gameNo++; this.room.phase = "LOBBY"; this.room.differences = []; this.room.gameScores = {};
          delete this.room.expiresAt; delete this.room.phaseEndsAt;
          this.members().forEach(p => { p.score = 0; p.confirmed = false; delete p.answerBlockedUntil; }); break;
        case "game.terminate":
          this.requireHost(member.id); this.room.phase = "ENDED"; delete this.room.phaseEndsAt;
          this.room.expiresAt = new Date(Date.now() + 7200000).toISOString(); break;
      }
      this.room.processedCommands.push(key); this.room.processedCommands = this.room.processedCommands.slice(-1000);
      await this.changed();
      this.send(socket, "command.ack", { commandId: id });
      if (feedback) {
        if (feedback.result === "COOLDOWN" || feedback.result === "OWN_DIFFERENCE") this.send(socket, "answer.result", feedback);
        else for (const [ws, session] of this.sockets) if (session.participantId) this.send(ws, "answer.result", feedback);
      }
    } catch (error) {
      const code = error instanceof CommandError ? error.code : "INVALID_PAYLOAD";
      this.send(socket, "error", { code, message: code, commandId: id });
    }
  }
  private count(id: string) { return this.room!.differences.filter(d => d.creatorId === id).length; }
  private async sourcePixels():Promise<SourcePixels> {
    const url=this.room!.imageUrl;
    if(this.sourceCache?.url===url)return this.sourceCache.pixels;
    const image=IMAGES.find(image=>image.src===url);
    if(!image)throw new CommandError("INVALID_PAYLOAD");
    const width=AREA_RULES.sampleWidth,height=Math.round(width*image.height/image.width);
    const response=await this.env.ASSETS.fetch(new Request("https://assets.invalid"+url+".rgb"));
    const rgb=new Uint8Array(await response.arrayBuffer());
    if(!response.ok||rgb.length!==width*height*3)throw new CommandError("SOURCE_UNAVAILABLE");
    const pixels={width,height,rgb};this.sourceCache={url,pixels};return pixels;
  }
  private hits(x:number,y:number,d:InternalDifference) {
    const image=this.room!.settings.sourceType==="original"?this.room!.originalImage!:IMAGES.find(image=>image.src===this.room!.imageUrl)!;
    return d.visible?visibleHit(x,y,d.visible,AREA_RULES.sampleWidth,Math.round(AREA_RULES.sampleWidth*image.height/image.width)):hitTest({x,y,t:0},d.hitRegion);
  }
  private startDrawing() {
    const r = this.room!; r.phase = "DRAWING"; r.imageUrl = r.settings.sourceType==="original"?r.originalImage!.url:chooseImage(r.settings.imageIds,Math.random());
    r.gameScores = {};
    r.differences = []; this.members().forEach(p => { p.confirmed = false; p.drawingSubmitted=false; delete p.answerBlockedUntil; });
    this.deadline(r.settings.drawingSeconds);
  }
  private startCountdown() {
    delete this.room!.drawingFinalizingStartedAt;
    if (!this.room!.differences.length || this.members().filter(p=>p.connected).length===1) { this.finishGame(); return; }
    this.room!.phase = "COUNTDOWN"; this.deadline(this.room!.settings.countdownSeconds);
  }
  private startDrawingFinalizing() {
    this.room!.phase = "DRAWING_FINALIZING";
    this.room!.drawingFinalizingStartedAt = new Date().toISOString();
    this.room!.differences=[];this.members().forEach(p=>p.drawingSubmitted=false);
    this.deadline(LIMITS.drawingFinalizeMs / 1000);
  }
  private answer(member: InternalParticipant, input: unknown): AnswerFeedback {
    this.requirePhase("ANSWERING");
    const now = Date.now(); const at = new Date(now).toISOString();
    if (member.answerBlockedUntil && Date.parse(member.answerBlockedUntil) > now) return { participantId: member.id, result: "COOLDOWN", at, blockedUntil: member.answerBlockedUntil };
    const point = { ...AnswerSchema.parse(input), t: 0 };
    const found = this.room!.differences.find(d => !d.foundBy && d.creatorId !== member.id && this.hits(point.x,point.y,d));
    if (!found) {
      if (this.room!.differences.some(d => !d.foundBy && d.creatorId === member.id && this.hits(point.x,point.y,d))) return { participantId: member.id, result: "OWN_DIFFERENCE", at };
      if (this.room!.differences.some(d => d.foundBy && this.hits(point.x,point.y,d))) return { participantId: member.id, result: "ALREADY_FOUND", at };
      member.answerBlockedUntil = new Date(now + this.room!.settings.missCooldownSeconds * 1000).toISOString();
      const previousScore = member.score;
      member.score = Math.max(0, member.score - this.room!.settings.missPenalty);
      this.recordScore(member.id, "penalty", member.score - previousScore);
      return { participantId: member.id, result: "MISS", at, blockedUntil: member.answerBlockedUntil, scoreDelta: member.score - previousScore };
    }
    const points=found.points?.finder??this.room!.settings.pointsForFinder;
    found.foundBy = member.id; found.foundAt = at; member.score += points;
    this.recordScore(member.id, "found", points);
    if (this.room!.differences.every(d => d.foundBy)) { this.room!.phase = "ANSWER_REVEAL"; this.deadline(LIMITS.markerMs / 1000); }
    return { participantId: member.id, result: "CORRECT", differenceId: found.id, at, scoreDelta:points };
  }
  private finishGame() {
    const r = this.room!;
    for (const d of r.differences.filter(d => !d.foundBy)) { const creator = r.participants.find(p => p.id === d.creatorId); if (creator) { const points=d.points?.unfound??r.settings.pointsForUnfoundCreator;creator.score += points; this.recordScore(creator.id,"unfound",points); } }
    r.phase = "FINAL_RESULT"; delete r.phaseEndsAt;
    r.expiresAt = new Date(Date.now() + 7200000).toISOString();
  }
  private recordScore(id: string, kind: "found"|"unfound"|"penalty", amount: number) {
    const scores=this.room!.gameScores??={}; const entry=scores[id]??={found:0,unfound:0,penalty:0,total:0}; entry[kind]+=amount;entry.total+=amount;
  }
  private deadline(seconds: number) { this.room!.phaseEndsAt = new Date(Date.now() + seconds * 1000).toISOString(); }
  async alarm() {
    return this.serial(async () => {
      await this.expireIfDue();
      if (!this.room) return; const r = this.room; const now = Date.now();
      if (r.expiresAt && Date.parse(r.expiresAt) <= now) {
        await this.destroy(); return;
      }
      if (r.hostTransferAt && Date.parse(r.hostTransferAt) <= now) {
        const next = this.members().filter(p => p.connected && p.id !== r.hostId).sort((a,b) => a.joinOrder-b.joinOrder)[0];
        if (next) r.hostId = next.id; delete r.hostTransferAt;
      }
      if (r.phaseEndsAt && Date.parse(r.phaseEndsAt) <= now) {
        if (r.phase === "DRAWING") this.startDrawingFinalizing();
        else if (r.phase === "DRAWING_FINALIZING") this.startCountdown();
        else if (r.phase === "COUNTDOWN") { r.phase = "ANSWERING"; this.deadline(r.settings.answeringSeconds); }
        else if (r.phase === "ANSWERING") this.finishGame();
        else if (r.phase === "ANSWER_REVEAL") this.finishGame();
      }
      await this.changed();
    });
  }
  private async onClose(socket: WebSocket) {
    const id = this.sockets.get(socket)?.participantId; this.sockets.delete(socket);
    if (!this.room || !id || [...this.sockets.values()].some(s => s.participantId === id)) return;
    const p = this.room.participants.find(p => p.id === id); if (p) p.connected = false;
    if (id === this.room.hostId) this.room.hostTransferAt = new Date(Date.now() + 30000).toISOString();
    if (!this.members().some(p => p.connected) && !["FINAL_RESULT", "ENDED"].includes(this.room.phase)) this.room.expiresAt = new Date(Date.now() + (this.room.phase === "LOBBY" ? 1800000 : 7200000)).toISOString();
    await this.changed();
  }
  private requireHost(id: string) { if (this.room!.hostId !== id) throw new CommandError("NOT_HOST"); }
  private requirePhase(phase: RoomSnapshot["phase"]) { if (this.room!.phase !== phase) throw new CommandError("INVALID_PHASE"); }
  private members() { return this.room!.participants.filter(p => !p.kicked); }
  private async save() {
    const r = this.room; if (!r) return;
    if(r.originalImage)r.originalImage.expiresAt=r.expiresAt;
    await this.ctx.storage.put("room", r);
    const dates = [r.phaseEndsAt, r.hostTransferAt, r.expiresAt].filter((d): d is string => !!d).map(Date.parse);
    if (dates.length) await this.ctx.storage.setAlarm(Math.max(Date.now() + 1, Math.min(...dates)));
    else await this.ctx.storage.deleteAlarm();
  }
  private async changed() {
    this.room!.revision++; await this.save();
    for (const [ws, session] of this.sockets) if (session.participantId && this.members().some(p => p.id === session.participantId)) this.send(ws, "state.snapshot", this.snapshot(session.participantId));
  }
  private snapshot(selfId: string): RoomSnapshot {
    const r = this.room!; const hidden = r.phase === "DRAWING" || r.phase === "DRAWING_FINALIZING" || r.phase === "COUNTDOWN";
    return { originalImage:r.originalImage, roomId: r.roomId, roomCode: r.roomCode, phase: r.phase, revision: r.revision, gameNo: r.gameNo, imageUrl: r.imageUrl, phaseEndsAt: r.phaseEndsAt, selfId, settings: r.settings,
      participants: this.members().map(p => ({ id: p.id, nickname: p.nickname, joinOrder: p.joinOrder, connected: p.connected, ready: p.ready, score: p.score, confirmed: p.confirmed, confirmedCount: this.count(p.id), answerBlockedUntil: p.answerBlockedUntil, isHost: p.id === r.hostId })),
      differences: r.differences.filter(d => !hidden || d.creatorId === selfId).map(({ hitRegion: _, visible: _visible, ...d }) => d), scores:r.phase==="FINAL_RESULT"?this.members().map(p=>({participantId:p.id,...(r.gameScores?.[p.id]??{found:0,unfound:0,penalty:0,total:0})})):undefined };
  }
  private send(socket: WebSocket, type: ServerEvent["type"], payload: unknown) {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type, revision: this.room?.revision ?? 0, payload }));
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const url = new URL(request.url);
      if (url.pathname === "/api/v1/health") return json({ ok: true });
      if (url.pathname === "/api/v1/images") return json(IMAGES);
      if (url.pathname === "/api/v1/rooms" && request.method === "POST") {
        const body = await request.json<{ nickname: string }>(); const nickname = NicknameSchema.parse(body.nickname);
        const roomCode = randomCode(); return await env.ROOMS.get(env.ROOMS.idFromName(roomCode)).fetch(new Request(url.origin + "/create", { method: "POST", body: JSON.stringify({ nickname, roomCode }) }));
      }
      if (url.pathname === "/api/v1/rooms/join" && request.method === "POST") {
        const body = await request.json<{ roomCode: string; nickname: string }>();
        const roomCode = RoomCodeSchema.parse(body.roomCode); const nickname = NicknameSchema.parse(body.nickname);
        return await env.ROOMS.get(env.ROOMS.idFromName(roomCode)).fetch(new Request(url.origin + "/join", { method: "POST", body: JSON.stringify({ nickname }) }));
      }
      const match = url.pathname.match(/^\/api\/v1\/rooms\/([A-Z2-9]{6})\/(?:socket|original-image)$/);
      if (match) return await env.ROOMS.get(env.ROOMS.idFromName(match[1]!)).fetch(request);
      return json({ code: "NOT_FOUND" }, 404);
    } catch { return json({ code: "INVALID_PAYLOAD" }, 400); }
  }
} satisfies ExportedHandler<Env>;
