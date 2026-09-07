import { z } from "zod";
export { AREA_RULES, areaPoints } from "./scoring";

export const IMAGES = [
  { id: "bakery", src: "/assets/bakery.png", width: 1536, height: 1024, title: "パン屋さん", difficulty: "easy" },
  { id: "harbor", src: "/assets/harbor.png", width: 1448, height: 1086, title: "港町", difficulty: "normal" },
  { id: "camping", src: "/assets/camping.png", width: 1448, height: 1086, title: "キャンプ", difficulty: "normal" },
  { id: "space", src: "/assets/space.png", width: 1448, height: 1086, title: "宇宙旅行", difficulty: "normal" },
  { id: "onsen", src: "/assets/onsen.png", width: 1448, height: 1086, title: "温泉街", difficulty: "normal" },
  { id: "people-market", src: "/assets/people-market.png", width: 1448, height: 1086, title: "市場", difficulty: "normal" },
  { id: "people-park", src: "/assets/people-park.png", width: 1448, height: 1086, title: "公園", difficulty: "easy" },
  { id: "people-kitchen", src: "/assets/people-kitchen.png", width: 1448, height: 1086, title: "キッチン", difficulty: "normal" },
  { id: "people-library", src: "/assets/people-library.png", width: 1448, height: 1086, title: "図書館", difficulty: "normal" },
  { id: "people-festival", src: "/assets/people-festival.png", width: 1448, height: 1086, title: "お祭り広場", difficulty: "normal" },
  { id: "art-gallery", src: "/assets/art-gallery.png", width: 1448, height: 1086, title: "名画ギャラリー", difficulty: "normal" },
  { id: "deep-aquarium", src: "/assets/deep-aquarium.png", width: 1448, height: 1086, title: "深海水族館", difficulty: "normal" },
  { id: "dotonbori-night", src: "/assets/dotonbori-night.png", width: 1448, height: 1086, title: "道頓堀の夜", difficulty: "hard" },
  { id: "cinema-posters", src: "/assets/cinema-posters.png", width: 1448, height: 1086, title: "映画ポスター館", difficulty: "hard" },
  { id: "summer-festival", src: "/assets/summer-festival.png", width: 1448, height: 1086, title: "夏祭り", difficulty: "hard" },
  { id: "haunted-graveyard", src: "/assets/haunted-graveyard.png", width: 1448, height: 1086, title: "幽霊墓地", difficulty: "hard" },
  { id: "wizard-duel", src: "/assets/wizard-duel.png", width: 1448, height: 1086, title: "魔法使いの決闘", difficulty: "normal" },
  { id: "emerald-city", src: "/assets/emerald-city.png", width: 1448, height: 1086, title: "エメラルドの街", difficulty: "hard" },
  { id: "world-map", src: "/assets/world-map.png", width: 1448, height: 1086, title: "せかい地図", difficulty: "hard" },
  { id: "supermarket", src: "/assets/supermarket.png", width: 1448, height: 1086, title: "にぎやかスーパー", difficulty: "hard" },
  { id: "shibuya-crossing", src: "/assets/shibuya-crossing.png", width: 1448, height: 1086, title: "渋谷スクランブル", difficulty: "hard" },
  { id: "toy-room", src: "/assets/toy-room.png", width: 1448, height: 1086, title: "おもちゃの部屋", difficulty: "easy" },
  { id: "animal-park", src: "/assets/animal-park.png", width: 1448, height: 1086, title: "どうぶつ公園", difficulty: "normal" },
  { id: "dragon-attack", src: "/assets/dragon-attack.png", width: 1447, height: 1087, title: "ドラゴン襲来", difficulty: "normal" },
  { id: "survival-room", src: "/assets/survival-room.png", width: 1447, height: 1087, title: "デスゲーム", difficulty: "normal" },
  { id: "demon-council", src: "/assets/demon-council.png", width: 1448, height: 1086, title: "七つの大罪", difficulty: "hard" },
  { id: "time-loop", src: "/assets/time-loop.png", width: 1448, height: 1086, title: "時を越える約束", difficulty: "normal" },
  { id: "yokai-festival", src: "/assets/yokai-festival.png", width: 1446, height: 1087, title: "妖怪夜祭り", difficulty: "hard" },
  { id: "lost-corridor", src: "/assets/lost-corridor.png", width: 1446, height: 1087, title: "迷子の廊下", difficulty: "normal" },
  { id: "cat-bar", src: "/assets/cat-bar.png", width: 1446, height: 1087, title: "ねこのバー", difficulty: "normal" },
  { id: "animal-birthday", src: "/assets/animal-birthday.png", width: 1448, height: 1086, title: "どうぶつ誕生日会", difficulty: "normal" },
  { id: "summer-night", src: "/assets/summer-night.png", width: 1448, height: 1086, title: "夏の夜の冒険", difficulty: "hard" },
] as const;
export type ImageId = typeof IMAGES[number]["id"];
export type ImageSelection = ImageId[];
export const GAME_DEFAULTS = {
  minPlayers: 1, maxPlayers: 10, differencesPerPlayer: 1,
  drawingSeconds: 90, answeringSeconds: 60, pointsForFinder: 100,
  pointsForUnfoundCreator: 100, missPenalty: 20, missCooldownSeconds: 3,
  countdownSeconds: 3, zoomMin: 1, zoomMax: 6, imageIds: ["bakery"] as ImageSelection,
} as const;
export const LIMITS = { maxMessageBytes: 524288, maxStrokes: 100, maxPoints: 2000, markerMs: 3000, drawingFinalizeMinMs: 600, drawingFinalizeMs: 5000, minWidth: .001, maxWidth: .03 } as const;
const ImageIdSchema = z.enum(IMAGES.map(image => image.id) as [ImageId, ...ImageId[]]);
export const SettingsUpdateSchema = z.object({
  differencesPerPlayer: z.number().int().min(1).max(5).optional(),
  drawingSeconds: z.number().int().min(30).max(300).optional(),
  answeringSeconds: z.number().int().min(30).max(300).optional(),
  imageIds: z.array(ImageIdSchema).max(IMAGES.length).optional(),
}).strict().refine(value => Object.keys(value).length > 0);
export type GameSettings = {
  minPlayers: number; maxPlayers: number; differencesPerPlayer: number;
  drawingSeconds: number; answeringSeconds: number; pointsForFinder: number;
  pointsForUnfoundCreator: number; missPenalty: number; missCooldownSeconds: number;
  countdownSeconds: number; zoomMin: number; zoomMax: number; imageIds: ImageSelection;
};
export const PointSchema = z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1), pressure: z.number().min(0).max(1).optional(), t: z.number().nonnegative() });
export const StrokeSchema = z.object({ id: z.string().min(1).max(80), color: z.string().regex(/^#[0-9a-fA-F]{6}$/), width: z.number().min(LIMITS.minWidth).max(.08), points: z.array(PointSchema).min(1).max(LIMITS.maxPoints) });
export const DifferenceSchema = z.object({ strokes: z.array(StrokeSchema).min(1).max(LIMITS.maxStrokes) });
export const DrawingSubmissionSchema = z.object({ differences: z.array(DifferenceSchema).max(5) }).strict();
export const AnswerSchema = z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) });
export const NicknameSchema = z.string().trim().min(1).max(20).refine(value => !/[\u0000-\u001f\u007f]/.test(value));
export const RoomCodeSchema = z.string().trim().toUpperCase().regex(/^[A-Z2-9]{6}$/);
const envelope = z.object({ commandId: z.uuid(), gameNo: z.number().int().nonnegative().optional() });
const empty = z.object({}).strict();
export const ClientCommandSchema = z.discriminatedUnion("type", [
  envelope.extend({ type: z.literal("session.resume"), payload: z.object({ participantId: z.uuid(), reconnectSecret: z.string().min(1).max(256) }) }),
  envelope.extend({ type: z.literal("member.ready"), payload: z.object({ ready: z.boolean() }) }),
  envelope.extend({ type: z.literal("member.kick"), payload: z.object({ participantId: z.uuid() }) }),
  envelope.extend({ type: z.literal("settings.update"), payload: SettingsUpdateSchema }),
  envelope.extend({ type: z.literal("game.start"), payload: empty }),
  envelope.extend({ type: z.literal("drawing.ready"), payload: empty }),
  envelope.extend({ type: z.literal("drawing.submit"), payload: DrawingSubmissionSchema }),
  envelope.extend({ type: z.literal("answer.submit"), payload: AnswerSchema }),
  envelope.extend({ type: z.literal("phase.advance"), payload: empty }),
  envelope.extend({ type: z.literal("game.rematch"), payload: empty }),
  envelope.extend({ type: z.literal("game.terminate"), payload: empty }),
]);
export type ClientCommand = z.infer<typeof ClientCommandSchema>;
export type Point = z.infer<typeof PointSchema>;
export type Stroke = z.infer<typeof StrokeSchema>;
export type DifferenceInput = z.infer<typeof DifferenceSchema>;
export type Phase = "LOBBY" | "DRAWING" | "DRAWING_FINALIZING" | "COUNTDOWN" | "ANSWERING" | "ANSWER_REVEAL" | "FINAL_RESULT" | "ENDED";
export type Participant = { id: string; nickname: string; joinOrder: number; connected: boolean; ready: boolean; score: number; isHost: boolean; confirmed: boolean; confirmedCount?: number; answerBlockedUntil?: string };
export type Difference = { id: string; creatorId: string; strokes: Stroke[]; foundBy?: string; foundAt?: string; points?: {finder:number;unfound:number} };
export type ScoreBreakdown = { participantId: string; found: number; unfound: number; penalty: number; total: number };
export type RoomSnapshot = { roomId: string; roomCode: string; phase: Phase; revision: number; gameNo: number; imageUrl: string; phaseEndsAt?: string; selfId: string; participants: Participant[]; differences: Difference[]; settings: GameSettings; scores?: ScoreBreakdown[] };
export type AnswerFeedback = { participantId: string; result: "CORRECT" | "MISS" | "ALREADY_FOUND" | "COOLDOWN" | "OWN_DIFFERENCE"; differenceId?: string; at: string; blockedUntil?: string; scoreDelta?: number };
export type ServerEvent =
  | { type: "state.snapshot"; revision: number; payload: RoomSnapshot }
  | { type: "command.ack"; revision: number; payload: { commandId: string } }
  | { type: "answer.result"; revision: number; payload: AnswerFeedback }
  | { type: "error"; revision: number; payload: { code: string; message: string; commandId?: string } };
export type CreateRoomResponse = { roomId: string; roomCode: string; participantId: string; reconnectSecret: string; socketUrl: string };
export type JoinRoomResponse = CreateRoomResponse;
export function commandId(): string { return crypto.randomUUID(); }
export function chooseImage(selections: ImageSelection, random = Math.random()): string {
  const index = Math.min(selections.length - 1, Math.floor(Math.max(0, random) * selections.length));
  return IMAGES.find(image => image.id === selections[index])!.src;
}
