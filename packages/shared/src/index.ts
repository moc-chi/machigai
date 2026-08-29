import { z } from "zod";

export const GAME_DEFAULTS = {
  minPlayers: 3,
  maxPlayers: 10,
  stageCount: 2,
  differencesPerPlayer: 1,
  drawingSeconds: 90,
  answeringSeconds: 60,
  pointsForFinder: 100,
  pointsForUnfoundCreator: 100,
  missPenalty: 0,
  zoomMin: 1,
  zoomMax: 3,
} as const;

export const PointSchema = z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1), pressure: z.number().min(0).max(1).optional(), t: z.number().nonnegative() });
export const StrokeSchema = z.object({ id: z.string().min(1).max(80), color: z.string().regex(/^#[0-9a-fA-F]{6}$/), width: z.number().min(.001).max(.08), points: z.array(PointSchema).min(1).max(2000) });
export const DifferenceSchema = z.object({ strokes: z.array(StrokeSchema).min(1).max(100) });
export const AnswerSchema = z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) });
export const NicknameSchema = z.string().trim().min(1).max(20).refine((value) => !/[\u0000-\u001f\u007f]/.test(value));
export const RoomCodeSchema = z.string().trim().toUpperCase().regex(/^[A-Z2-9]{6}$/);

export type Point = z.infer<typeof PointSchema>;
export type Stroke = z.infer<typeof StrokeSchema>;
export type DifferenceInput = z.infer<typeof DifferenceSchema>;
export type Phase = "LOBBY" | "DRAWING" | "ANSWERING" | "ROUND_RESULT" | "FINAL_RESULT" | "ENDED";
export type Participant = { id: string; nickname: string; joinOrder: number; connected: boolean; ready: boolean; score: number; isHost: boolean; confirmed: boolean };
export type Difference = { id: string; creatorId: string; strokes: Stroke[]; foundBy?: string; foundAt?: string };
export type RoomSnapshot = { roomId: string; roomCode: string; phase: Phase; revision: number; gameNo: number; stageNo: number; stageCount: number; imageUrl: string; phaseEndsAt?: string; selfId: string; participants: Participant[]; differences: Difference[]; settings: typeof GAME_DEFAULTS };

export type ClientCommand =
  | { type: "session.resume"; commandId: string; payload: { participantId: string; reconnectSecret: string } }
  | { type: "member.ready"; commandId: string; payload: { ready: boolean } }
  | { type: "member.kick"; commandId: string; payload: { participantId: string } }
  | { type: "game.start"; commandId: string; payload: Record<string, never> }
  | { type: "difference.confirm"; commandId: string; payload: DifferenceInput }
  | { type: "answer.submit"; commandId: string; payload: { x: number; y: number } }
  | { type: "round.continue"; commandId: string; payload: Record<string, never> }
  | { type: "game.rematch"; commandId: string; payload: Record<string, never> }
  | { type: "game.terminate"; commandId: string; payload: Record<string, never> };

export type ServerEvent =
  | { type: "state.snapshot"; revision: number; payload: RoomSnapshot }
  | { type: "toast"; revision: number; payload: { message: string } }
  | { type: "answer.result"; revision: number; payload: { result: "CORRECT" | "MISS" | "ALREADY_FOUND"; differenceId?: string } }
  | { type: "error"; revision: number; payload: { code: string; message: string } };

export type CreateRoomResponse = { roomId: string; roomCode: string; participantId: string; reconnectSecret: string; socketUrl: string };
export type JoinRoomResponse = CreateRoomResponse;

export function commandId(): string { return crypto.randomUUID(); }
