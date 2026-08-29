const base = process.env.BASE_URL ?? "http://127.0.0.1:8787";
const socketBase = base.replace(/^http/, "ws");
const post = async (path, body) => { const response = await fetch(base + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); if (!response.ok) throw new Error(`${path}: ${response.status} ${await response.text()}`); return response.json(); };
const host = await post("/api/v1/rooms", { nickname: "Host" });
const two = await post("/api/v1/rooms/join", { nickname: "Two", roomCode: host.roomCode });
const users = [host, two]; const states = new Map();
const waitFor = (test, timeout = 5000) => new Promise((resolve, reject) => { const start = Date.now(); const timer = setInterval(() => { const result = test(); if (result) { clearInterval(timer); resolve(result); } else if (Date.now() - start > timeout) { clearInterval(timer); reject(new Error("Timed out")); } }, 20); });
for (const user of users) { const ws = new WebSocket(`${socketBase}${user.socketUrl}`); user.ws = ws; ws.addEventListener("message", (event) => { const message = JSON.parse(event.data); if (message.type === "state.snapshot") states.set(user.participantId, message.payload); }); await new Promise((resolve) => ws.addEventListener("open", resolve, { once: true })); ws.send(JSON.stringify({ type: "session.resume", commandId: crypto.randomUUID(), payload: { participantId: user.participantId, reconnectSecret: user.reconnectSecret } })); }
await waitFor(() => states.get(host.participantId)?.participants.length === 2);
host.ws.send(JSON.stringify({ type: "settings.update", commandId: crypto.randomUUID(), payload: { differencesPerPlayer: 2, drawingSeconds: 60, answeringSeconds: 60, imageUrl: "/assets/harbor.png" } }));
await waitFor(() => states.get(host.participantId)?.settings.differencesPerPlayer === 2);
host.ws.send(JSON.stringify({ type: "game.start", commandId: crypto.randomUUID(), payload: {} }));
await waitFor(() => states.get(host.participantId)?.phase === "DRAWING");
for (let round = 0; round < 2; round += 1) for (let index = 0; index < users.length; index += 1) { const x = .15 + index * .3 + round * .1; users[index].ws.send(JSON.stringify({ type: "difference.confirm", commandId: crypto.randomUUID(), payload: { strokes: [{ id: `s${round}-${index}`, color: "#ff6651", width: .01, points: [{ x, y: .3, t: 0 }, { x: x + .04, y: .34, t: 20 }] }] } })); await new Promise((resolve) => setTimeout(resolve, 20)); }
await waitFor(() => states.get(host.participantId)?.phase === "ANSWERING");
two.ws.send(JSON.stringify({ type: "answer.submit", commandId: crypto.randomUUID(), payload: { x: .16, y: .31 } }));
await waitFor(() => states.get(host.participantId)?.differences.some((item) => item.foundBy === two.participantId));
const final = states.get(host.participantId); if (final.participants.length !== 2 || final.differences.length !== 4 || final.imageUrl !== "/assets/harbor.png") throw new Error("Two-player settings were not applied"); if (final.participants.find((p) => p.id === two.participantId).score !== 100) throw new Error("Score was not awarded exactly once");
console.log(JSON.stringify({ roomCode: host.roomCode, participants: final.participants.length, phase: final.phase, differences: final.differences.length, imageUrl: final.imageUrl, finderScore: 100 })); for (const user of users) user.ws.close();
