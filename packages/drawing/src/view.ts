export type View = { zoom: number; x: number; y: number };
export function imagePoint(clientX: number, clientY: number, rect: { left: number; top: number; width: number; height: number }) {
  return { x: (clientX - rect.left) / rect.width, y: (clientY - rect.top) / rect.height };
}
export function zoomView(view: View, zoom: number, anchor: { x: number; y: number }): View {
  const ratio = zoom / view.zoom;
  return { zoom, x: anchor.x - (anchor.x - view.x) * ratio, y: anchor.y - (anchor.y - view.y) * ratio };
}
