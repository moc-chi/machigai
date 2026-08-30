import { DurableObject } from "cloudflare:workers";
import { AnswerSchema, ClientCommandSchema, DifferenceSchema, GAME_DEFAULTS, IMAGES, LIMITS, NicknameSchema, RoomCodeSchema, SettingsUpdateSchema, chooseImage, type AnswerFeedback, type Difference, type GameSettings, type Participant, type RoomSnapshot, type RoundReview, type ServerEvent } from "@machigai/shared";
import { buildHitRegion, hitTest, type HitRegion } from "@machigai/drawing";
import { AREA_RULES, areaPoints } from "@machigai/shared";
import { rasterize, visibleArea, visibleHit, uncoveredArea, type SourcePixels, type VisibleArea } from "@machigai/drawing";

interface Env { ROOMS: DurableObjectNamespace<Room>; ASSETS: Fetcher }
type InternalParticipant = Omit<Participant, "isHost"> & { secretHash: string; kicked: boolean; lastSeenAt: string };
type InternalDifference = Difference & { hitRegion: HitRegion; visible?: VisibleArea };
type StoredRoom = { roomId: string; roomCode: string; phase: RoomSnapshot["phase"]; revision: number; gameNo: number; stageNo: number; imageUrl: string; phaseEndsAt?: string; hostTransferAt?: string; expiresAt?: string; hostId: string; participants: InternalParticipant[]; differences: InternalDifference[]; processedCommands: string[]; settings: GameSettings; rounds: RoundReview[]; roundScores?: Record<string,{found:number;unfound:number;penalty:number;total:number}> };
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
        this.room.settings = { ...GAME_DEFAULTS, ...this.room.settings, missPenalty: GAME_DEFAULTS.missPenalty, missCooldownSeconds: GAME_DEFAULTS.missCooldownSeconds };
        this.room.rounds ??= [];
        this.room.roundScores ??= {};
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
      } catch { return json({ code: "INVALID_PAYLOAD" }, 400); }
    });
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
    this.room = { roomId: crypto.randomUUID(), roomCode: RoomCodeSchema.parse(body.roomCode), phase: "LOBBY", revision: 1, gameNo: 1, stageNo: 0, imageUrl: IMAGES[0].src, hostId: participant.id, participants: [participant], differences: [], rounds: [], processedCommands: [], settings: { ...GAME_DEFAULTS }, expiresAt: new Date(Date.now() + 30 * 60000).toISOString() };
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
      if ((command.gameNo !== undefined && command.gameNo !== this.room.gameNo) || (command.stageNo !== undefined && command.stageNo !== this.room.stageNo)) throw new CommandError("STALE_COMMAND");
      let feedback: AnswerFeedback | undefined;
      switch (command.type) {
        case "member.ready": this.requirePhase("LOBBY"); member.ready = command.payload.ready; break;
        case "settings.update": {
          this.requireHost(member.id); this.requirePhase("LOBBY");
          const { imageUrl: _legacy, ...settings } = SettingsUpdateSchema.parse(command.payload);
          this.room.settings = { ...this.room.settings, ...settings }; break;
        }
        case "game.start":
          this.requireHost(member.id); this.requirePhase("LOBBY");
          if (this.members().filter(p => p.connected).length < this.room.settings.minPlayers) throw new CommandError("NOT_ENOUGH_PLAYERS");
          this.room.rounds = []; this.room.stageNo = 1; this.startDrawing(); break;
        case "member.kick": {
          this.requireHost(member.id);
          if (command.payload.participantId === member.id) throw new CommandError("INVALID_PAYLOAD");
          const target = this.members().find(p => p.id === command.payload.participantId);
          if (target) { target.kicked = true; target.connected = false; for (const [ws, session] of this.sockets) if (session.participantId === target.id) { this.send(ws, "error", { code: "SESSION_REVOKED", message: "SESSION_REVOKED" }); ws.close(4001, "kicked"); } }
          break;
        }
        case "difference.confirm": {
          this.requirePhase("DRAWING");
          if (member.confirmed) throw new CommandError("ALREADY_CONFIRMED");
          const input = DifferenceSchema.parse(command.payload);
          const source=await this.sourcePixels();
          let composite:Uint8Array;
          try { composite=rasterize(source,input.strokes); }
          catch { throw new CommandError("DRAWING_TOO_COMPLEX"); }
          let visible=visibleArea(source,composite);
          if(visible.pixels<AREA_RULES.minimumPixels)throw new CommandError("DRAWING_NOT_VISIBLE");
          // Reject duplicate/invisible additions over this creator's previous work.
          const own=this.room.differences.filter(d=>d.creatorId===member.id);
          if(own.length){
            let rgb=source.rgb;
            try { for(const d of own)rgb=rasterize({...source,rgb},d.strokes);
              visible=uncoveredArea(visible,visibleArea(source,rgb),source.width,source.height);
              if(visible.pixels<AREA_RULES.minimumPixels)throw new CommandError("DRAWING_NOT_VISIBLE");
            } catch(error){if(error instanceof CommandError)throw error;throw new CommandError("DRAWING_TOO_COMPLEX");}
          }
          this.room.differences.push({ id: crypto.randomUUID(), creatorId: member.id, strokes: input.strokes, hitRegion: buildHitRegion(input), visible, points: areaPoints(visible.ratio) });
          member.confirmed = this.count(member.id) >= this.room.settings.differencesPerPlayer;
          if (this.members().every(p => p.confirmed)) this.startCountdown();
          break;
        }
        case "answer.submit": feedback = this.answer(member, command.payload); break;
        case "phase.advance":
          this.requireHost(member.id);
          if (this.room.phase === "DRAWING") this.startCountdown();
          else if (this.room.phase === "ANSWERING") this.finishRound();
          else throw new CommandError("INVALID_PHASE");
          break;
        case "round.continue":
          this.requireHost(member.id); this.requirePhase("ROUND_RESULT");
          if (this.room.stageNo >= this.room.settings.stageCount) {
            this.room.phase = "FINAL_RESULT"; this.room.expiresAt = new Date(Date.now() + 7200000).toISOString();
          } else { this.room.stageNo++; this.startDrawing(); }
          break;
        case "game.rematch":
          this.requireHost(member.id); this.requirePhase("FINAL_RESULT");
          this.room.gameNo++; this.room.stageNo = 0; this.room.phase = "LOBBY"; this.room.differences = []; this.room.rounds = [];
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
    const image=IMAGES.find(image=>image.src===this.room!.imageUrl)!;
    return d.visible?visibleHit(x,y,d.visible,AREA_RULES.sampleWidth,Math.round(AREA_RULES.sampleWidth*image.height/image.width)):hitTest({x,y,t:0},d.hitRegion);
  }
  private startDrawing() {
    const r = this.room!; r.phase = "DRAWING"; r.imageUrl = chooseImage(r.stageNo > 1 ? r.imageUrl : undefined, Math.random(), r.settings.deckId);
    r.roundScores = {};
    r.differences = []; this.members().forEach(p => { p.confirmed = false; delete p.answerBlockedUntil; });
    this.deadline(r.settings.drawingSeconds);
  }
  private startCountdown() {
    if (!this.room!.differences.length) { this.finishRound(); return; }
    this.room!.phase = "COUNTDOWN"; this.deadline(this.room!.settings.countdownSeconds);
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
  private finishRound() {
    const r = this.room!;
    for (const d of r.differences.filter(d => !d.foundBy)) { const creator = r.participants.find(p => p.id === d.creatorId); if (creator) { const points=d.points?.unfound??r.settings.pointsForUnfoundCreator;creator.score += points; this.recordScore(creator.id,"unfound",points); } }
    r.phase = "ROUND_RESULT"; delete r.phaseEndsAt;
    r.rounds = r.rounds.filter(round => round.stageNo !== r.stageNo);
    r.rounds.push({ stageNo: r.stageNo, imageUrl: r.imageUrl, differences: r.differences.map(({ hitRegion: _, visible: _visible, ...d }) => d), scores: this.members().map(p=>({participantId:p.id,...(r.roundScores?.[p.id]??{found:0,unfound:0,penalty:0,total:0})})) });
  }
  private recordScore(id: string, kind: "found"|"unfound"|"penalty", amount: number) {
    const scores=this.room!.roundScores??={}; const entry=scores[id]??={found:0,unfound:0,penalty:0,total:0}; entry[kind]+=amount;entry.total+=amount;
  }
  private deadline(seconds: number) { this.room!.phaseEndsAt = new Date(Date.now() + seconds * 1000).toISOString(); }
  async alarm() {
    return this.serial(async () => {
      if (!this.room) return; const r = this.room; const now = Date.now();
      if (r.expiresAt && Date.parse(r.expiresAt) <= now) {
        for (const ws of this.sockets.keys()) ws.close(4000, "expired");
        this.sockets.clear(); await this.ctx.storage.deleteAll(); this.room = undefined; return;
      }
      if (r.hostTransferAt && Date.parse(r.hostTransferAt) <= now) {
        const next = this.members().filter(p => p.connected && p.id !== r.hostId).sort((a,b) => a.joinOrder-b.joinOrder)[0];
        if (next) r.hostId = next.id; delete r.hostTransferAt;
      }
      if (r.phaseEndsAt && Date.parse(r.phaseEndsAt) <= now) {
        if (r.phase === "DRAWING") this.startCountdown();
        else if (r.phase === "COUNTDOWN") { r.phase = "ANSWERING"; this.deadline(r.settings.answeringSeconds); }
        else if (r.phase === "ANSWERING") this.finishRound();
        else if (r.phase === "ANSWER_REVEAL") this.finishRound();
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
    const r = this.room!; const hidden = r.phase === "DRAWING" || r.phase === "COUNTDOWN";
    return { roomId: r.roomId, roomCode: r.roomCode, phase: r.phase, revision: r.revision, gameNo: r.gameNo, stageNo: r.stageNo, stageCount: r.settings.stageCount, imageUrl: r.imageUrl, phaseEndsAt: r.phaseEndsAt, selfId, settings: r.settings,
      participants: this.members().map(p => ({ id: p.id, nickname: p.nickname, joinOrder: p.joinOrder, connected: p.connected, ready: p.ready, score: p.score, confirmed: p.confirmed, confirmedCount: this.count(p.id), answerBlockedUntil: p.answerBlockedUntil, isHost: p.id === r.hostId })),
      differences: r.differences.filter(d => !hidden || d.creatorId === selfId).map(({ hitRegion: _, visible: _visible, ...d }) => d), rounds: r.rounds };
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
      const match = url.pathname.match(/^\/api\/v1\/rooms\/([A-Z2-9]{6})\/socket$/);
      if (match) return await env.ROOMS.get(env.ROOMS.idFromName(match[1]!)).fetch(request);
      return json({ code: "NOT_FOUND" }, 404);
    } catch { return json({ code: "INVALID_PAYLOAD" }, 400); }
  }
} satisfies ExportedHandler<Env>;
