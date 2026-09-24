export const PARTICIPANT_COLORS = [
  "#c43d4d", "#2463a8", "#16735b", "#7a4eab", "#b45309",
  "#0e7490", "#a63d78", "#4d7c0f", "#4755a8", "#8a5a00",
] as const;

export function participantColor(joinOrder: number): string {
  return PARTICIPANT_COLORS[(Math.max(1, joinOrder) - 1) % PARTICIPANT_COLORS.length]!;
}
