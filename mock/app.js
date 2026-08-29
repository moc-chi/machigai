const screens = [...document.querySelectorAll("[data-screen]")];
const roomChip = document.querySelector("#room-chip");
const screenMenu = document.querySelector("#screen-menu");
const toast = document.querySelector("#toast");

function goTo(screenName) {
  screens.forEach((screen) => screen.classList.toggle("active", screen.dataset.screen === screenName));
  roomChip.classList.toggle("hidden", screenName === "home");
  screenMenu.classList.remove("open");
  window.scrollTo({ top: 0, behavior: "smooth" });
  window.location.hash = screenName;
  if (screenName === "create") requestAnimationFrame(resizeCanvas);
}

document.querySelectorAll("[data-go]").forEach((button) => {
  button.addEventListener("click", () => goTo(button.dataset.go));
});

document.querySelector("#screen-menu-button").addEventListener("click", () => screenMenu.classList.toggle("open"));
document.querySelector("#close-screen-menu").addEventListener("click", () => screenMenu.classList.remove("open"));

const joinDialog = document.querySelector("#join-dialog");
document.querySelector("[data-open-join]").addEventListener("click", () => joinDialog.showModal());
document.querySelector("[data-close-dialog]").addEventListener("click", () => joinDialog.close());
document.querySelector("[data-join]").addEventListener("click", () => { joinDialog.close(); goTo("lobby"); });

const settingsDialog = document.querySelector("#settings-dialog");
const difficultySettings = {
  easy: { differences: "2個", createTime: "120秒", answerTime: "90秒" },
  normal: { differences: "3個", createTime: "90秒", answerTime: "60秒" },
  hard: { differences: "5個", createTime: "75秒", answerTime: "45秒" }
};

document.querySelector("#open-game-settings").addEventListener("click", () => settingsDialog.showModal());
document.querySelector("[data-close-settings]").addEventListener("click", () => settingsDialog.close());
document.querySelectorAll('input[name="difficulty"]').forEach((input) => input.addEventListener("change", () => {
  document.querySelectorAll(".difficulty-options label").forEach((label) => label.classList.toggle("selected", label.contains(input)));
  const setting = difficultySettings[input.value];
  document.querySelector("#setting-differences").textContent = setting.differences;
  document.querySelector("#setting-create-time").textContent = setting.createTime;
  document.querySelector("#setting-answer-time").textContent = setting.answerTime;
}));
document.querySelector("#save-game-settings").addEventListener("click", () => {
  const selected = document.querySelector('input[name="difficulty"]:checked');
  settingsDialog.close();
  showToast(`難易度を「${selected.closest("label").querySelector("b").textContent}」に設定しました`);
});

document.querySelectorAll("[data-kick]").forEach((button) => button.addEventListener("click", () => {
  const memberName = button.dataset.kick;
  if (!window.confirm(`${memberName}さんを部屋から退出させますか？`)) return;
  button.closest("[data-member]").remove();
  const count = document.querySelectorAll(".member-list li").length;
  document.querySelector(".member-panel h3").textContent = `${count} / 10人`;
  showToast(`${memberName}さんを部屋から退出させました`);
}));

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  window.setTimeout(() => toast.classList.remove("show"), 1800);
}

document.querySelector("#copy-link").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText(`${location.href.split("#")[0]}#lobby`); } catch (_) { /* Preview may block clipboard. */ }
  showToast("招待リンクをコピーしました");
});

const canvas = document.querySelector("#drawing-canvas");
const stage = document.querySelector("#drawing-stage");
const zoomLayer = document.querySelector("#zoom-layer");
const sourceImage = stage.querySelector("img");
const brushCursor = document.querySelector("#brush-cursor");
const ctx = canvas.getContext("2d");
let drawing = false;
let brushColor = "#ff4f3d";
let brushSize = 8;
let snapshots = [];
let pickingColor = false;
let zoom = 1;
let panX = 0;
let panY = 0;
let panMode = false;
let panStart = null;

function resizeCanvas() {
  const rect = stage.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const previous = document.createElement("canvas");
  previous.width = canvas.width;
  previous.height = canvas.height;
  if (canvas.width && canvas.height) previous.getContext("2d").drawImage(canvas, 0, 0);
  canvas.width = Math.round(rect.width * devicePixelRatio);
  canvas.height = Math.round(rect.height * devicePixelRatio);
  canvas.style.width = `${rect.width}px`;
  canvas.style.height = `${rect.height}px`;
  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  if (previous.width) ctx.drawImage(previous, 0, 0, previous.width, previous.height, 0, 0, rect.width, rect.height);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
}

function point(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) * (canvas.clientWidth / rect.width),
    y: (event.clientY - rect.top) * (canvas.clientHeight / rect.height)
  };
}

canvas.addEventListener("pointerdown", (event) => {
  if (panMode) {
    panStart = { pointerX: event.clientX, pointerY: event.clientY, panX, panY };
    canvas.setPointerCapture(event.pointerId);
    stage.classList.add("dragging");
    return;
  }
  if (pickingColor) {
    pickColorFromImage(event);
    return;
  }
  drawing = true;
  canvas.setPointerCapture(event.pointerId);
  snapshots.push(canvas.toDataURL());
  const p = point(event);
  ctx.beginPath();
  ctx.moveTo(p.x, p.y);
  document.querySelector(".draw-hint").style.opacity = "0";
});

canvas.addEventListener("pointermove", (event) => {
  updateBrushCursor(event);
  if (panStart) {
    panX = panStart.panX + event.clientX - panStart.pointerX;
    panY = panStart.panY + event.clientY - panStart.pointerY;
    clampPan();
    applyViewport();
    return;
  }
  if (!drawing) return;
  const p = point(event);
  ctx.strokeStyle = brushColor;
  ctx.lineWidth = brushSize;
  ctx.lineTo(p.x, p.y);
  ctx.stroke();
});

function stopPointerAction() {
  drawing = false;
  panStart = null;
  stage.classList.remove("dragging");
}

canvas.addEventListener("pointerup", stopPointerAction);
canvas.addEventListener("pointercancel", stopPointerAction);
canvas.addEventListener("pointerenter", (event) => updateBrushCursor(event));
canvas.addEventListener("pointerleave", () => brushCursor.classList.remove("visible"));

function updateBrushCursor(event) {
  if (panMode || pickingColor) return;
  const stageRect = stage.getBoundingClientRect();
  const visibleSize = Math.max(brushSize * zoom, 5);
  brushCursor.style.left = `${event.clientX - stageRect.left}px`;
  brushCursor.style.top = `${event.clientY - stageRect.top}px`;
  brushCursor.style.width = `${visibleSize}px`;
  brushCursor.style.height = `${visibleSize}px`;
  brushCursor.style.setProperty("--brush-color", brushColor);
  brushCursor.classList.toggle("tiny", brushSize * zoom < 5);
  brushCursor.classList.add("visible");
}

function clampPan() {
  if (zoom === 1) { panX = 0; panY = 0; return; }
  const maxX = stage.clientWidth * (zoom - 1) / 2;
  const maxY = stage.clientHeight * (zoom - 1) / 2;
  panX = Math.max(-maxX, Math.min(maxX, panX));
  panY = Math.max(-maxY, Math.min(maxY, panY));
}

function applyViewport() {
  clampPan();
  zoomLayer.style.transform = `translate3d(${panX}px, ${panY}px, 0) scale(${zoom})`;
  document.querySelector("#zoom-level").textContent = `${Math.round(zoom * 100)}%`;
  document.querySelector("#zoom-out").disabled = zoom <= 1;
  document.querySelector("#zoom-in").disabled = zoom >= 3;
}

function setZoom(nextZoom) {
  zoom = Math.max(1, Math.min(3, Math.round(nextZoom * 4) / 4));
  applyViewport();
}

function setPanMode(active) {
  panMode = active;
  const button = document.querySelector("#pan-tool");
  button.classList.toggle("active", active);
  button.setAttribute("aria-pressed", String(active));
  stage.classList.toggle("panning", active);
  if (active) setPickingColor(false);
}

document.querySelector("#zoom-in").addEventListener("click", () => setZoom(zoom + .25));
document.querySelector("#zoom-out").addEventListener("click", () => setZoom(zoom - .25));
document.querySelector("#pan-tool").addEventListener("click", () => {
  setPanMode(!panMode);
  if (panMode && zoom === 1) showToast("拡大してからドラッグすると位置を動かせます");
});
document.querySelector("#reset-view").addEventListener("click", () => {
  zoom = 1; panX = 0; panY = 0; setPanMode(false); applyViewport();
});

function selectColor(color, matchingButton = null) {
  brushColor = color;
  brushCursor.style.setProperty("--brush-color", color);
  document.querySelector("#custom-color").value = color;
  document.querySelectorAll("[data-color]").forEach((item) => item.classList.toggle("active", item === matchingButton));
}

document.querySelectorAll("[data-color]").forEach((button) => button.addEventListener("click", () => selectColor(button.dataset.color, button)));
document.querySelector("#custom-color").addEventListener("input", (event) => selectColor(event.target.value));

function setPickingColor(active) {
  pickingColor = active;
  if (active) setPanMode(false);
  stage.classList.toggle("picking", active);
  const button = document.querySelector("#eyedropper");
  button.classList.toggle("active", active);
  button.setAttribute("aria-pressed", String(active));
}

function componentToHex(value) {
  return value.toString(16).padStart(2, "0");
}

function pickColorFromImage(event) {
  const rect = stage.getBoundingClientRect();
  const scale = Math.max(rect.width / sourceImage.naturalWidth, rect.height / sourceImage.naturalHeight);
  const renderedWidth = sourceImage.naturalWidth * scale;
  const renderedHeight = sourceImage.naturalHeight * scale;
  const offsetX = (renderedWidth - rect.width) / 2;
  const offsetY = (renderedHeight - rect.height) / 2;
  const sourceX = Math.max(0, Math.min(sourceImage.naturalWidth - 1, Math.floor((event.clientX - rect.left + offsetX) / scale)));
  const sourceY = Math.max(0, Math.min(sourceImage.naturalHeight - 1, Math.floor((event.clientY - rect.top + offsetY) / scale)));
  const sampler = document.createElement("canvas");
  sampler.width = sourceImage.naturalWidth;
  sampler.height = sourceImage.naturalHeight;
  const samplerContext = sampler.getContext("2d", { willReadFrequently: true });
  samplerContext.drawImage(sourceImage, 0, 0);
  const [red, green, blue] = samplerContext.getImageData(sourceX, sourceY, 1, 1).data;
  const color = `#${componentToHex(red)}${componentToHex(green)}${componentToHex(blue)}`;
  selectColor(color);
  setPickingColor(false);
  showToast(`色を取得しました ${color.toUpperCase()}`);
}

document.querySelector("#eyedropper").addEventListener("click", async () => {
  if (window.EyeDropper) {
    try {
      const result = await new EyeDropper().open();
      selectColor(result.sRGBHex);
      showToast(`色を取得しました ${result.sRGBHex.toUpperCase()}`);
      return;
    } catch (_) {
      return;
    }
  }
  setPickingColor(!pickingColor);
  if (pickingColor) showToast("画像の取りたい色をタップしてください");
});
document.querySelector("#brush-size").addEventListener("input", (event) => {
  brushSize = Number(event.target.value);
  document.querySelector("#brush-size-value").textContent = `${brushSize}px`;
});
document.querySelector("#clear-drawing").addEventListener("click", () => { snapshots.push(canvas.toDataURL()); ctx.clearRect(0, 0, canvas.width, canvas.height); });
document.querySelector("#undo-drawing").addEventListener("click", () => {
  const snapshot = snapshots.pop();
  if (!snapshot) return;
  const image = new Image();
  image.onload = () => { ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(image, 0, 0, canvas.width / devicePixelRatio, canvas.height / devicePixelRatio); };
  image.src = snapshot;
});
document.querySelector("#confirm-difference").addEventListener("click", () => showToast("間違いを1つ確定しました（モック）"));

let answerClicks = 0;
document.querySelector("#answer-image").addEventListener("click", (event) => {
  const target = event.currentTarget;
  const rect = target.getBoundingClientRect();
  const feedback = document.querySelector("#tap-feedback");
  feedback.style.left = `${event.clientX - rect.left}px`;
  feedback.style.top = `${event.clientY - rect.top}px`;
  feedback.classList.remove("show");
  void feedback.offsetWidth;
  feedback.classList.add("show");
  answerClicks += 1;
  if (answerClicks === 1) {
    document.querySelector("#found-count").textContent = "2";
    document.querySelector("#your-score").textContent = "200";
    showToast("正解！あなたが一番乗り +100");
  } else {
    showToast("そこは違うみたい…");
  }
});

const galleryDetails = {
  all: { title: "みんなの間違い・全部入り", count: "4人分", label: "ALL PLAYERS" },
  you: { title: "あなたが描いた間違い", count: "1個", label: "あなた" },
  mio: { title: "ミオが描いた間違い", count: "1個", label: "ミオ" },
  sota: { title: "ソウタが描いた間違い", count: "1個", label: "ソウタ" },
  hana: { title: "ハナが描いた間違い", count: "1個", label: "ハナ" }
};

document.querySelectorAll("[data-gallery]").forEach((button) => button.addEventListener("click", () => {
  const selected = button.dataset.gallery;
  document.querySelectorAll("[data-gallery]").forEach((item) => {
    const active = item === button;
    item.classList.toggle("active", active);
    item.setAttribute("aria-selected", String(active));
  });
  document.querySelectorAll("[data-drawing]").forEach((drawing) => drawing.classList.toggle("hidden", selected !== "all" && drawing.dataset.drawing !== selected));
  document.querySelector("#gallery-title").textContent = galleryDetails[selected].title;
  document.querySelector("#gallery-count").textContent = galleryDetails[selected].count;
  document.querySelector("#gallery-label").textContent = galleryDetails[selected].label;
}));
async function createResultImage() {
  const image = document.querySelector(".share-image-pair img");
  if (!image.complete) await image.decode();
  const card = document.createElement("canvas");
  card.width = 1600;
  card.height = 900;
  const cardContext = card.getContext("2d");
  cardContext.fillStyle = "#17375e";
  cardContext.fillRect(0, 0, card.width, card.height);
  cardContext.fillStyle = "#ffffff";
  cardContext.font = "800 54px sans-serif";
  cardContext.fillText("まちがいパーティー", 70, 90);
  cardContext.fillStyle = "#ffc94b";
  cardContext.font = "800 64px sans-serif";
  cardContext.fillText("4つ全部発見！", 1020, 90);
  const imageY = 145;
  const imageWidth = 710;
  const imageHeight = 474;
  cardContext.drawImage(image, 70, imageY, imageWidth, imageHeight);
  cardContext.drawImage(image, 820, imageY, imageWidth, imageHeight);
  cardContext.fillStyle = "rgba(23,55,94,.9)";
  cardContext.fillRect(88, 165, 150, 42);
  cardContext.fillStyle = "#ff6651";
  cardContext.fillRect(838, 165, 220, 42);
  cardContext.fillStyle = "#ffffff";
  cardContext.font = "700 25px sans-serif";
  cardContext.fillText("もとの絵", 108, 195);
  cardContext.fillText("みんなの間違い", 858, 195);
  cardContext.font = "800 74px sans-serif";
  cardContext.fillStyle = "#ff6651";
  cardContext.fillText("★", 1010, 350);
  cardContext.fillStyle = "#17375e";
  cardContext.fillText("●", 1390, 280);
  cardContext.fillStyle = "#ffc94b";
  cardContext.fillText("▲", 870, 560);
  cardContext.fillStyle = "#ffffff";
  cardContext.font = "800 38px sans-serif";
  cardContext.fillText("18秒でクリア", 70, 735);
  cardContext.fillStyle = "#ffc94b";
  cardContext.fillText("#まちがいパーティー", 1120, 735);
  cardContext.fillStyle = "rgba(255,255,255,.72)";
  cardContext.font = "500 25px sans-serif";
  cardContext.fillText("みんなが同じ絵に描いた間違いを、いちばん早く見つけよう！", 70, 810);
  return new Promise((resolve) => card.toBlob(resolve, "image/png"));
}

function downloadResultImage(blob) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "machigai-party-result.png";
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

document.querySelector("#share-result").addEventListener("click", async () => {
  const blob = await createResultImage();
  const file = new File([blob], "machigai-party-result.png", { type: "image/png" });
  const shareText = "みんなで作った間違いを4つ全部発見！ #まちがいパーティー";
  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ title: "まちがいパーティー", text: shareText, url: location.origin + location.pathname, files: [file] });
      return;
    } catch (error) {
      if (error.name === "AbortError") return;
    }
  }
  downloadResultImage(blob);
  const intent = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(location.origin + location.pathname)}`;
  window.open(intent, "_blank", "noopener,noreferrer");
  showToast("結果画像を保存しました。Xの投稿画面で添付してください");
});
window.addEventListener("resize", resizeCanvas);
applyViewport();
const initialScreen = location.hash.slice(1);
if (screens.some((screen) => screen.dataset.screen === initialScreen)) goTo(initialScreen);
