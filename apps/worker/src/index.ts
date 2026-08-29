import { DurableObject } from "cloudflare:workers";
import { AnswerSchema, DifferenceSchema, GAME_DEFAULTS, NicknameSchema, RoomCodeSchema, SettingsUpdateSchema, type ClientCommand, type Difference, type GameSettings, type Participant, type RoomSnapshot, type ServerEvent } from "@machigai/shared";
import { buildHitRegion, hitTest, type HitRegion } from "@machigai/drawing";

interface Env { ROOMS: DurableObjectNamespace<Room> }
type InternalParticipant = Omit<Participant, "isHost"> & { secretHash: string; kicked: boolean; lastSeenAt: string };
type InternalDifference = Difference & { hitRegion: HitRegion };
type StoredRoom = { roomId: string; roomCode: string; phase: RoomSnapshot["phase"]; revision: number; gameNo: number; stageNo: number; imageUrl: string; phaseEndsAt?: string; hostTransferAt?: string; expiresAt?: string; hostId: string; participants: InternalParticipant[]; differences: InternalDifference[]; processedCommands: string[]; settings: GameSettings };
type SocketSession = { participantId?: string };

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*" } });
const randomCode = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), (value) => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[value % 32]).join("");
const secret = () => `${crypto.randomUUID()}${crypto.randomUUID()}`.replaceAll("-", "");
async function sha256(value: string) { return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))), (b) => b.toString(16).padStart(2, "0")).join(""); }

export class Room extends DurableObject<Env> {
  private room?: StoredRoom;
  private sockets = new Map<WebSocket, SocketSession>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => { this.room = await ctx.storage.get<StoredRoom>("room"); });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/create") && request.method === "POST") return this.create(request);
    if (url.pathname.endsWith("/join") && request.method === "POST") return this.join(request);
    if (url.pathname.endsWith("/socket") && request.headers.get("Upgrade") === "websocket") return this.upgradeSocket();
    return json({ code: "NOT_FOUND", message: "見つかりません" }, 404);
  }

  private async create(request: Request) {
    if (this.room) return json({ code: "ROOM_EXISTS", message: "部屋コードが重複しました" }, 409);
    const body = await request.json<{ nickname?: string; roomCode?: string }>();
    const nickname = NicknameSchema.parse(body.nickname);
    const roomCode = RoomCodeSchema.parse(body.roomCode);
    const participantId = crypto.randomUUID();
    const reconnectSecret = secret();
    const participant: InternalParticipant = { id: participantId, nickname, joinOrder: 1, connected: false, ready: true, score: 0, confirmed: false, secretHash: await sha256(reconnectSecret), kicked: false, lastSeenAt: new Date().toISOString() };
    this.room = { roomId: crypto.randomUUID(), roomCode, phase: "LOBBY", revision: 1, gameNo: 1, stageNo: 0, imageUrl: "/assets/bakery.png", hostId: participantId, participants: [participant], differences: [], processedCommands: [], settings: { ...GAME_DEFAULTS } };
    await this.persist();
    return json({ roomId: this.room.roomId, roomCode, participantId, reconnectSecret, socketUrl: `/api/v1/rooms/${roomCode}/socket` }, 201);
  }

  private async join(request: Request) {
    if (!this.room) return json({ code: "ROOM_NOT_FOUND", message: "部屋が見つかりません" }, 404);
    if (this.room.phase !== "LOBBY") return json({ code: "GAME_ALREADY_STARTED", message: "ゲームは開始済みです" }, 409);
    if (this.room.participants.filter((p) => !p.kicked).length >= GAME_DEFAULTS.maxPlayers) return json({ code: "ROOM_FULL", message: "部屋は満員です" }, 409);
    const body = await request.json<{ nickname?: string }>();
    const nickname = NicknameSchema.parse(body.nickname);
    const participantId = crypto.randomUUID();
    const reconnectSecret = secret();
    this.room.participants.push({ id: participantId, nickname, joinOrder: Math.max(0, ...this.room.participants.map((p) => p.joinOrder)) + 1, connected: false, ready: true, score: 0, confirmed: false, secretHash: await sha256(reconnectSecret), kicked: false, lastSeenAt: new Date().toISOString() });
    this.bump(); await this.persist(); this.broadcastSnapshots();
    return json({ roomId: this.room.roomId, roomCode: this.room.roomCode, participantId, reconnectSecret, socketUrl: `/api/v1/rooms/${this.room.roomCode}/socket` }, 200);
  }

  private upgradeSocket() {
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    server.accept();
    this.sockets.set(server, {});
    server.addEventListener("message", (event) => void this.onMessage(server, String(event.data)));
    server.addEventListener("close", () => void this.onClose(server));
    server.addEventListener("error", () => void this.onClose(server));
    return new Response(null, { status: 101, webSocket: client });
  }

  private async onMessage(socket: WebSocket, raw: string) {
    if (!this.room || raw.length > 524_288) return this.send(socket, "error", { code: "INVALID_PAYLOAD", message: "送信データが大きすぎます" });
    let command: ClientCommand;
    try { command = JSON.parse(raw) as ClientCommand; } catch { return this.send(socket, "error", { code: "INVALID_PAYLOAD", message: "データを読み取れません" }); }
    if (!command?.commandId || !command.type) return this.send(socket, "error", { code: "INVALID_PAYLOAD", message: "操作情報が不足しています" });
    if (command.type === "session.resume") return this.resume(socket, command.payload.participantId, command.payload.reconnectSecret);
    const participantId = this.sockets.get(socket)?.participantId;
    if (!participantId) return this.send(socket, "error", { code: "SESSION_REVOKED", message: "部屋へ入り直してください" });
    if (this.room.processedCommands.includes(command.commandId)) return;
    this.room.processedCommands.push(command.commandId); this.room.processedCommands = this.room.processedCommands.slice(-500);
    const participant = this.room.participants.find((p) => p.id === participantId && !p.kicked);
    if (!participant) return;
    try {
      if (command.type === "member.ready") participant.ready = Boolean(command.payload.ready);
      else if (command.type === "settings.update") this.updateSettings(participantId, command.payload);
      else if (command.type === "game.start") this.startGame(participantId);
      else if (command.type === "member.kick") this.kick(participantId, command.payload.participantId);
      else if (command.type === "difference.confirm") this.confirmDifference(participantId, command.payload);
      else if (command.type === "answer.submit") this.answer(socket, participantId, command.payload);
      else if (command.type === "round.continue") this.continueRound(participantId);
      else if (command.type === "game.rematch") this.rematch(participantId);
      else if (command.type === "game.terminate") this.terminate(participantId);
      this.bump(); await this.persist(); this.broadcastSnapshots();
    } catch (error) { this.send(socket, "error", { code: "INVALID_PHASE", message: error instanceof Error ? error.message : "操作できません" }); }
  }

  private async resume(socket: WebSocket, participantId: string, reconnectSecret: string) {
    if (!this.room) return;
    const participant = this.room.participants.find((p) => p.id === participantId && !p.kicked);
    if (!participant || participant.secretHash !== await sha256(reconnectSecret)) return this.send(socket, "error", { code: "SESSION_REVOKED", message: "参加情報を確認できません" });
    this.sockets.set(socket, { participantId }); participant.connected = true; if (this.room.hostId === participantId) delete this.room.hostTransferAt; if (this.room.phase !== "FINAL_RESULT") delete this.room.expiresAt; this.scheduleNextAlarm(); participant.lastSeenAt = new Date().toISOString();
    this.bump(); await this.persist(); this.broadcastSnapshots();
  }

  private updateSettings(id: string, input: unknown) { this.requireHost(id); if (this.room!.phase !== "LOBBY") throw new Error("ロビーで設定してください"); const parsed = SettingsUpdateSchema.parse(input); this.room!.settings = { ...this.room!.settings, ...parsed }; this.room!.imageUrl = parsed.imageUrl; }
  private startGame(id: string) {
    this.requireHost(id); if (this.room!.phase !== "LOBBY") throw new Error("すでに開始しています");
    if (this.activeParticipants().length < GAME_DEFAULTS.minPlayers) throw new Error("2人以上で開始できます");
    this.room!.phase = "DRAWING"; this.room!.stageNo = 1; this.room!.differences = []; this.activeParticipants().forEach((p) => p.confirmed = false); this.setDeadline(this.room!.settings.drawingSeconds);
  }
  private confirmDifference(id: string, input: unknown) {
    if (this.room!.phase !== "DRAWING") throw new Error("今は描画を確定できません");
    const participant = this.room!.participants.find((p) => p.id === id)!; if (participant.confirmed) throw new Error("確定済みです");
    const parsed = DifferenceSchema.parse(input); const hitRegion = buildHitRegion(parsed);
    this.room!.differences.push({ id: crypto.randomUUID(), creatorId: id, strokes: parsed.strokes, hitRegion }); participant.confirmed = this.room!.differences.filter((difference) => difference.creatorId === id).length >= this.room!.settings.differencesPerPlayer;
    if (this.activeParticipants().every((p) => p.confirmed)) this.beginAnswering();
  }
  private answer(socket: WebSocket, id: string, input: unknown) {
    if (this.room!.phase !== "ANSWERING") throw new Error("今は回答できません");
    const point = { ...AnswerSchema.parse(input), t: 0 }; const available = this.room!.differences.filter((d) => !d.foundBy); const found = available.find((d) => hitTest(point, d.hitRegion));
    if (!found) return this.send(socket, "answer.result", { result: "MISS" });
    found.foundBy = id; found.foundAt = new Date().toISOString(); this.room!.participants.find((p) => p.id === id)!.score += GAME_DEFAULTS.pointsForFinder; this.send(socket, "answer.result", { result: "CORRECT", differenceId: found.id });
    if (this.room!.differences.every((d) => d.foundBy)) this.finishRound();
  }
  private continueRound(id: string) { this.requireHost(id); if (this.room!.phase !== "ROUND_RESULT") throw new Error("今は次へ進めません"); if (this.room!.stageNo >= this.room!.settings.stageCount) { this.room!.phase = "FINAL_RESULT"; this.room!.expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(); this.scheduleNextAlarm(); } else { this.room!.stageNo += 1; this.room!.phase = "DRAWING"; this.room!.differences = []; this.activeParticipants().forEach((p) => p.confirmed = false); this.setDeadline(this.room!.settings.drawingSeconds); } }
  private rematch(id: string) { this.requireHost(id); if (this.room!.phase !== "FINAL_RESULT") throw new Error("再試合できません"); this.room!.gameNo += 1; this.room!.stageNo = 0; this.room!.phase = "LOBBY"; this.room!.differences = []; this.room!.participants.forEach((p) => { p.score = 0; p.confirmed = false; }); delete this.room!.phaseEndsAt; }
  private terminate(id: string) { this.requireHost(id); this.room!.phase = "ENDED"; delete this.room!.phaseEndsAt; }
  private kick(hostId: string, targetId: string) { this.requireHost(hostId); if (targetId === hostId) throw new Error("自分は退出させられません"); const target = this.room!.participants.find((p) => p.id === targetId); if (target) { target.kicked = true; target.connected = false; for (const [socket, session] of this.sockets) if (session.participantId === targetId) socket.close(4001, "kicked"); } }
  private beginAnswering() { this.room!.phase = "ANSWERING"; this.setDeadline(this.room!.settings.answeringSeconds); }
  private finishRound() { for (const difference of this.room!.differences.filter((d) => !d.foundBy)) this.room!.participants.find((p) => p.id === difference.creatorId)!.score += GAME_DEFAULTS.pointsForUnfoundCreator; this.room!.phase = "ROUND_RESULT"; delete this.room!.phaseEndsAt; }
  private setDeadline(seconds: number) { this.room!.phaseEndsAt = new Date(Date.now() + seconds * 1000).toISOString(); this.scheduleNextAlarm(); }
  async alarm() {
    if (!this.room) return;
    const now = Date.now();
    if (this.room.expiresAt && new Date(this.room.expiresAt).getTime() <= now) { for (const socket of this.sockets.keys()) socket.close(4000, "expired"); this.sockets.clear(); await this.ctx.storage.deleteAll(); this.room = undefined; return; }
    if (this.room.hostTransferAt && new Date(this.room.hostTransferAt).getTime() <= now) { const next = this.activeParticipants().filter((p) => p.connected && p.id !== this.room!.hostId).sort((a,b)=>a.joinOrder-b.joinOrder)[0]; if (next) this.room.hostId = next.id; delete this.room.hostTransferAt; }
    if (this.room.phaseEndsAt && new Date(this.room.phaseEndsAt).getTime() <= now) { if (this.room.phase === "DRAWING") this.beginAnswering(); else if (this.room.phase === "ANSWERING") this.finishRound(); }
    this.scheduleNextAlarm(); this.bump(); await this.persist(); this.broadcastSnapshots();
  }
  private async onClose(socket: WebSocket) {
    const id = this.sockets.get(socket)?.participantId; this.sockets.delete(socket); if (!this.room || !id) return;
    const participant = this.room.participants.find((p) => p.id === id); if (participant) participant.connected = false;
    if (id === this.room.hostId) this.room.hostTransferAt = new Date(Date.now() + 30_000).toISOString();
    if (!this.activeParticipants().some((p) => p.connected)) this.room.expiresAt = new Date(Date.now() + (this.room.phase === "LOBBY" ? 30 * 60_000 : 2 * 60 * 60_000)).toISOString();
    this.scheduleNextAlarm(); this.bump(); await this.persist(); this.broadcastSnapshots();
  }
  private scheduleNextAlarm() { if (!this.room) return; const dates = [this.room.phaseEndsAt, this.room.hostTransferAt, this.room.expiresAt].filter(Boolean).map((value) => new Date(value!).getTime()).filter((value) => value > Date.now()); if (dates.length) void this.ctx.storage.setAlarm(Math.min(...dates)); }
  private requireHost(id: string) { if (this.room!.hostId !== id) throw new Error("ホストだけが操作できます"); }
  private activeParticipants() { return this.room!.participants.filter((p) => !p.kicked); }
  private bump() { if (this.room) this.room.revision += 1; }
  private async persist() { if (this.room) await this.ctx.storage.put("room", this.room); }
  private snapshot(selfId: string): RoomSnapshot { const r = this.room!; return { roomId: r.roomId, roomCode: r.roomCode, phase: r.phase, revision: r.revision, gameNo: r.gameNo, stageNo: r.stageNo, stageCount: this.room!.settings.stageCount, imageUrl: r.imageUrl, phaseEndsAt: r.phaseEndsAt, selfId, participants: r.participants.filter((p) => !p.kicked).map((p) => ({ id: p.id, nickname: p.nickname, joinOrder: p.joinOrder, connected: p.connected, ready: p.ready, score: p.score, confirmed: p.confirmed, isHost: p.id === r.hostId })), differences: r.phase === "DRAWING" ? [] : r.differences.map(({ hitRegion: _, ...d }) => d), settings: r.settings }; }
  private send(socket: WebSocket, type: ServerEvent["type"], payload: unknown) { if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type, revision: this.room?.revision ?? 0, payload })); }
  private broadcastSnapshots() { for (const [socket, session] of this.sockets) if (session.participantId) this.send(socket, "state.snapshot", this.snapshot(session.participantId)); }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") return new Response(null, { headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type", "access-control-allow-methods": "GET,POST,OPTIONS" } });
    const url = new URL(request.url);
    if (url.pathname === "/api/v1/health") return json({ ok: true });
    if (url.pathname === "/api/v1/images") return json([{ id: "bakery-001", src: "/assets/bakery.png", width: 1536, height: 1024, enabled: true }, { id: "harbor-001", src: "/assets/harbor.png", width: 1456, height: 1092, enabled: true }, { id: "camping-001", src: "/assets/camping.png", width: 1456, height: 1092, enabled: true }, { id: "space-001", src: "/assets/space.png", width: 1456, height: 1092, enabled: true }, { id: "onsen-001", src: "/assets/onsen.png", width: 1456, height: 1092, enabled: true }]);
    if (url.pathname === "/api/v1/rooms" && request.method === "POST") {
      const roomCode = randomCode(); const id = env.ROOMS.idFromName(roomCode); return env.ROOMS.get(id).fetch(new Request(`${url.origin}/create`, { method: "POST", headers: request.headers, body: JSON.stringify({ ...(await request.json<object>()), roomCode }) }));
    }
    if (url.pathname === "/api/v1/rooms/join" && request.method === "POST") {
      const body = await request.json<{ roomCode?: string }>(); const roomCode = RoomCodeSchema.parse(body.roomCode); const id = env.ROOMS.idFromName(roomCode); return env.ROOMS.get(id).fetch(new Request(`${url.origin}/join`, { method: "POST", headers: request.headers, body: JSON.stringify(body) }));
    }
    const match = url.pathname.match(/^\/api\/v1\/rooms\/([A-Z2-9]{6})\/socket$/); if (match) return env.ROOMS.get(env.ROOMS.idFromName(match[1]!)).fetch(request);
    return json({ code: "NOT_FOUND", message: "見つかりません" }, 404);
  }
} satisfies ExportedHandler<Env>;
