import { z } from "zod";
export { AREA_RULES, areaPoints } from "./scoring";

export const IMAGES = [
  { id: "bakery", src: "/assets/bakery.png", width: 1536, height: 1024, deck: "animals" },
  { id: "harbor", src: "/assets/harbor.png", width: 1456, height: 1092, deck: "animals" },
  { id: "camping", src: "/assets/camping.png", width: 1456, height: 1092, deck: "animals" },
  { id: "space", src: "/assets/space.png", width: 1456, height: 1092, deck: "animals" },
  { id: "onsen", src: "/assets/onsen.png", width: 1456, height: 1092, deck: "animals" },
  { id: "people-market", src: "/assets/people-market.png", width: 1448, height: 1086, deck: "people" },
  { id: "people-park", src: "/assets/people-park.png", width: 1448, height: 1086, deck: "people" },
  { id: "people-kitchen", src: "/assets/people-kitchen.png", width: 1448, height: 1086, deck: "people" },
  { id: "people-library", src: "/assets/people-library.png", width: 1448, height: 1086, deck: "people" },
  { id: "people-festival", src: "/assets/people-festival.png", width: 1448, height: 1086, deck: "people" },
] as const;
export const GAME_DEFAULTS = {
  minPlayers: 2, maxPlayers: 10, stageCount: 1, differencesPerPlayer: 1,
  drawingSeconds: 90, answeringSeconds: 60, pointsForFinder: 100,
  pointsForUnfoundCreator: 100, missPenalty: 20, missCooldownSeconds: 3,
  countdownSeconds: 3, zoomMin: 1, zoomMax: 6, deckId: "animals",
} as const;
export const LIMITS = { maxMessageBytes: 524288, maxStrokes: 100, maxPoints: 2000, markerMs: 3000, minWidth: .001, maxWidth: .03 } as const;
export const SettingsUpdateSchema = z.object({
  stageCount: z.number().int().min(1).max(10).optional(),
  differencesPerPlayer: z.number().int().min(1).max(5).optional(),
  drawingSeconds: z.number().int().min(30).max(300).optional(),
  answeringSeconds: z.number().int().min(30).max(300).optional(),
  deckId: z.enum(["animals", "people"]).optional(),
  // Compatibility for the old preview: individual choices now select their deck.
  imageUrl: z.enum(["/assets/bakery.png", "/assets/harbor.png", "/assets/camping.png", "/assets/space.png", "/assets/onsen.png"]).optional(),
}).strict().refine(value => Object.keys(value).length > 0);
export type GameSettings = { [K in keyof typeof GAME_DEFAULTS]: K extends "deckId" ? string : number };
export const PointSchema = z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1), pressure: z.number().min(0).max(1).optional(), t: z.number().nonnegative() });
export const StrokeSchema = z.object({ id: z.string().min(1).max(80), color: z.string().regex(/^#[0-9a-fA-F]{6}$/), width: z.number().min(LIMITS.minWidth).max(.08), points: z.array(PointSchema).min(1).max(LIMITS.maxPoints) });
export const DifferenceSchema = z.object({ strokes: z.array(StrokeSchema).min(1).max(LIMITS.maxStrokes) });
export const AnswerSchema = z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) });
export const NicknameSchema = z.string().trim().min(1).max(20).refine(value => !/[\u0000-\u001f\u007f]/.test(value));
export const RoomCodeSchema = z.string().trim().toUpperCase().regex(/^[A-Z2-9]{6}$/);
const envelope = z.object({ commandId: z.uuid(), gameNo: z.number().int().nonnegative().optional(), stageNo: z.number().int().nonnegative().optional() });
const empty = z.object({}).strict();
export const ClientCommandSchema = z.discriminatedUnion("type", [
  envelope.extend({ type: z.literal("session.resume"), payload: z.object({ participantId: z.uuid(), reconnectSecret: z.string().min(1).max(256) }) }),
  envelope.extend({ type: z.literal("member.ready"), payload: z.object({ ready: z.boolean() }) }),
  envelope.extend({ type: z.literal("member.kick"), payload: z.object({ participantId: z.uuid() }) }),
  envelope.extend({ type: z.literal("settings.update"), payload: SettingsUpdateSchema }),
  envelope.extend({ type: z.literal("game.start"), payload: empty }),
  envelope.extend({ type: z.literal("difference.confirm"), payload: DifferenceSchema }),
  envelope.extend({ type: z.literal("answer.submit"), payload: AnswerSchema }),
  envelope.extend({ type: z.literal("phase.advance"), payload: empty }),
  envelope.extend({ type: z.literal("round.continue"), payload: empty }),
  envelope.extend({ type: z.literal("game.rematch"), payload: empty }),
  envelope.extend({ type: z.literal("game.terminate"), payload: empty }),
]);
export type ClientCommand = z.infer<typeof ClientCommandSchema>;
export type Point = z.infer<typeof PointSchema>;
export type Stroke = z.infer<typeof StrokeSchema>;
export type DifferenceInput = z.infer<typeof DifferenceSchema>;
export type Phase = "LOBBY" | "DRAWING" | "COUNTDOWN" | "ANSWERING" | "ANSWER_REVEAL" | "ROUND_RESULT" | "FINAL_RESULT" | "ENDED";
export type Participant = { id: string; nickname: string; joinOrder: number; connected: boolean; ready: boolean; score: number; isHost: boolean; confirmed: boolean; confirmedCount?: number; answerBlockedUntil?: string };
export type Difference = { id: string; creatorId: string; strokes: Stroke[]; foundBy?: string; foundAt?: string; points?: {finder:number;unfound:number} };
export type ScoreBreakdown = { participantId: string; found: number; unfound: number; penalty: number; total: number };
export type RoundReview = { stageNo: number; imageUrl: string; differences: Difference[]; scores?: ScoreBreakdown[] };
export type RoomSnapshot = { roomId: string; roomCode: string; phase: Phase; revision: number; gameNo: number; stageNo: number; stageCount: number; imageUrl: string; phaseEndsAt?: string; selfId: string; participants: Participant[]; differences: Difference[]; settings: GameSettings; rounds?: RoundReview[] };
export type AnswerFeedback = { participantId: string; result: "CORRECT" | "MISS" | "ALREADY_FOUND" | "COOLDOWN" | "OWN_DIFFERENCE"; differenceId?: string; at: string; blockedUntil?: string; scoreDelta?: number };
export type ServerEvent =
  | { type: "state.snapshot"; revision: number; payload: RoomSnapshot }
  | { type: "command.ack"; revision: number; payload: { commandId: string } }
  | { type: "answer.result"; revision: number; payload: AnswerFeedback }
  | { type: "error"; revision: number; payload: { code: string; message: string; commandId?: string } };
export type CreateRoomResponse = { roomId: string; roomCode: string; participantId: string; reconnectSecret: string; socketUrl: string };
export type JoinRoomResponse = CreateRoomResponse;
export function commandId(): string { return crypto.randomUUID(); }
export function chooseImage(previous: string | undefined, random = Math.random(), deck = "animals"): string {
  const series = IMAGES.filter(image => image.deck === deck);
  const candidates = series.filter(image => image.src !== previous);
  const choices = candidates.length ? candidates : series;
  return choices[Math.min(choices.length - 1, Math.floor(Math.max(0, random) * choices.length))]!.src;
}
