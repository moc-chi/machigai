import type { DifferenceInput, Point, Stroke } from "@machigai/shared";
export { imagePoint, zoomView, type View } from "./view";
export { rasterize, visibleArea, visibleHit, uncoveredArea, validateDifferenceSlots, type SlotValidation, type SourcePixels, type VisibleArea } from "./visibility";

export type Capsule = { ax: number; ay: number; bx: number; by: number; radius: number };
export type HitRegion = { minX: number; minY: number; maxX: number; maxY: number; capsules: Capsule[] };

export function distanceToSegment(point: Point, capsule: Capsule): number {
  const vx = capsule.bx - capsule.ax;
  const vy = capsule.by - capsule.ay;
  const wx = point.x - capsule.ax;
  const wy = point.y - capsule.ay;
  const lengthSquared = vx * vx + vy * vy;
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, (wx * vx + wy * vy) / lengthSquared));
  return Math.hypot(point.x - (capsule.ax + t * vx), point.y - (capsule.ay + t * vy));
}

export function buildHitRegion(input: DifferenceInput, minimumRadius = .025, padding = .01): HitRegion {
  const capsules: Capsule[] = [];
  for (const stroke of input.strokes) {
    const radius = Math.max(minimumRadius, stroke.width / 2 + padding);
    if (stroke.points.length === 1) {
      const p = stroke.points[0]!;
      capsules.push({ ax: p.x, ay: p.y, bx: p.x, by: p.y, radius });
    }
    for (let i = 1; i < stroke.points.length; i += 1) {
      const a = stroke.points[i - 1]!;
      const b = stroke.points[i]!;
      capsules.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y, radius });
    }
  }
  const minX = Math.max(0, Math.min(...capsules.map((c) => Math.min(c.ax, c.bx) - c.radius)));
  const minY = Math.max(0, Math.min(...capsules.map((c) => Math.min(c.ay, c.by) - c.radius)));
  const maxX = Math.min(1, Math.max(...capsules.map((c) => Math.max(c.ax, c.bx) + c.radius)));
  const maxY = Math.min(1, Math.max(...capsules.map((c) => Math.max(c.ay, c.by) + c.radius)));
  return { minX, minY, maxX, maxY, capsules };
}

export function hitTest(point: Point, region: HitRegion): boolean {
  if (point.x < region.minX || point.x > region.maxX || point.y < region.minY || point.y > region.maxY) return false;
  return region.capsules.some((capsule) => distanceToSegment(point, capsule) <= capsule.radius);
}

export function drawSmoothStroke(ctx: CanvasRenderingContext2D, stroke: Stroke, width: number, height: number): void {
  if (!stroke.points.length) return;
  ctx.strokeStyle = stroke.color;
  ctx.fillStyle = stroke.color;
  ctx.lineWidth = stroke.width * Math.min(width, height);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const first = stroke.points[0]!;
  if (stroke.points.length === 1) {
    ctx.beginPath(); ctx.arc(first.x * width, first.y * height, ctx.lineWidth / 2, 0, Math.PI * 2); ctx.fill(); return;
  }
  ctx.beginPath(); ctx.moveTo(first.x * width, first.y * height);
  for (let i = 1; i < stroke.points.length - 1; i += 1) {
    const current = stroke.points[i]!;
    const next = stroke.points[i + 1]!;
    ctx.quadraticCurveTo(current.x * width, current.y * height, (current.x + next.x) * width / 2, (current.y + next.y) * height / 2);
  }
  const last = stroke.points.at(-1)!;
  ctx.lineTo(last.x * width, last.y * height); ctx.stroke();
}
