// Scene 2: the LoRa waterfall. The packet drawn as chirps, as lines or as a computed heat map.
const { SPAN, PLANE, HEAT, STAGE } = DATA.waterfall;
const SYNC = [(DATA.syncWord >> 4) * 8, (DATA.syncWord & 15) * 8]; // sync word 0x2B: one symbol per nibble, shifted by nibble x 8 of 2^SF
const SYMBOL_S = 0.26; // seconds of animation per symbol
const WINDOW = 12; // symbols on the plane at once
const N_BINS = 2 ** PRESET.sf;
const T_SYM = symbolMs();
const REPLAY_S = 2.6; // pause on the finished packet before it draws again
const scenes = document.querySelector(".td-scenes");
const ride = document.querySelector('[data-action="ride"]');
const back = document.querySelector('[data-action="back"]');
const cp = document.querySelector(".cp-fit");
const cpStage = cp.querySelector(".cp-stage");
const trace = cp.querySelector('[data-part="trace"]'), glow = cp.querySelector('[data-part="trace-glow"]'), head = cp.querySelector('[data-part="head"]');
const timeGrid = cp.querySelector('[data-part="time-grid"]'), phaseTicks = cp.querySelector('[data-part="phase-ticks"]');
const labelsG = cp.querySelector('[data-part="labels"]'), packetEl = cp.querySelector('[data-part="packet"]');
const titleEl = document.querySelector('[data-corner="title"]'), hintEl = document.querySelector('[data-corner="hint"]');
let chirp = null, chirpFrame = 0, chirpPrev = 0;

// The stage is laid out at 600 x 480 and scaled to the card, so the 3D plane and the labels stay registered.
new ResizeObserver(() => { cpStage.style.transform = "scale(" + cp.clientWidth / STAGE.w + ")"; }).observe(cp);
// Same transform as the plane's CSS: rotateZ(turn), then rotateX(tilt), then perspective, about the plane's centre.
const RAD = Math.PI / 180;
function out(x, y, dx, dy, dist) {
  const p = proj(x, y), q = proj(x + dx, y + dy), l = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
  return [p[0] + ((q[0] - p[0]) / l) * dist, p[1] + ((q[1] - p[1]) / l) * dist + 3.5];
}
function proj(x, y) {
  const X = x - PLANE.w / 2, Y = y - PLANE.h / 2;
  const c = Math.cos(PLANE.turn * RAD), s = Math.sin(PLANE.turn * RAD);
  const X1 = X * c - Y * s, Y1 = X * s + Y * c;
  const Y2 = Y1 * Math.cos(PLANE.tilt * RAD), Z2 = Y1 * Math.sin(PLANE.tilt * RAD);
  const k = PLANE.persp / (PLANE.persp - Z2);
  return [PLANE.cx + X1 * k, PLANE.cy + Y2 * k];
}

function symbolsFor(message) {
  const b = packetBytes(message);
  const n = payloadSymbols(b);
  const list = [];
  for (let i = 0; i < PRESET.preamble; i++) list.push({ kind: "up", shift: 0, phase: "preamble" });
  for (const v of SYNC) list.push({ kind: "up", shift: v / N_BINS, phase: "sync" });
  list.push({ kind: "down", len: 1, phase: "down" }, { kind: "down", len: 1, phase: "down" }, { kind: "down", len: 0.25, phase: "down" });
  // Data symbols: the real count for this packet; the values stand in for the coded bits.
  const data = new TextEncoder().encode(message);
  let h = 2166136261;
  for (let i = 0; i < n; i++) {
    h = Math.imul(h ^ (data[i % Math.max(1, data.length)] || 0) ^ i, 16777619) >>> 0;
    list.push({ kind: "up", shift: (h % N_BINS) / N_BINS, phase: i < 8 ? "header" : "payload" });
  }
  let t = 0;
  for (const s of list) { s.t0 = t; t += s.len ?? 1; }
  return { list, total: t, bytes: b, n };
}
// ---- Heat map: a spectrogram computed from the same chirps ----
const heatCanvas = cp.querySelector('[data-part="heat"]'), heatCtx = heatCanvas.getContext("2d");
const heatImg = heatCtx.createImageData(HEAT.cols, HEAT.rows);
const DB_FLOOR = -121, DB_PEAK = -72; // noise floor and chirp peak, dB
// SDR-style colour ramp: deep blue noise, cyan shoulders, yellow-white core.
const RAMP = [[0, [2, 8, 40]], [0.3, [8, 30, 120]], [0.5, [22, 90, 200]], [0.66, [30, 190, 200]], [0.82, [235, 225, 70]], [1, [255, 250, 200]]];
const LUT = new Uint8Array(256 * 3);
for (let i = 0; i < 256; i++) {
  const v = i / 255;
  let j = 0;
  while (j < RAMP.length - 2 && v > RAMP[j + 1][0]) j++;
  const [a, ca] = RAMP[j], [b, cb] = RAMP[j + 1], u = (v - a) / (b - a);
  for (let c = 0; c < 3; c++) LUT[i * 3 + c] = Math.round(ca[c] + (cb[c] - ca[c]) * u);
}
const noise = (n, c) => { let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(c + 0x632be5ab, 0xc2b2ae35); h ^= h >>> 13; h = Math.imul(h, 0x27d4eb2d); return ((h ^ (h >>> 15)) >>> 0) / 4294967296; };
// Which symbol is on air at time t (in symbol periods): the last one that started at or before t.
function symbolAt(list, t) {
  let lo = 0, hi = list.length - 1;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (list[m].t0 <= t) lo = m; else hi = m - 1; }
  return lo;
}
// The transmitter's frequency at time t (in symbol periods), or null when it is silent.
function freqAt(list, t) {
  if (t < 0) return null;
  let lo = 0, hi = list.length - 1;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (list[m].t0 <= t) lo = m; else hi = m - 1; }
  const s = list[lo], tau = t - s.t0;
  if (tau >= (s.len ?? 1)) return null;
  if (s.kind === "down") return 1 - tau;
  const w = 1 - s.shift;
  return tau < w ? s.shift + tau : tau - w;
}
function heat(top, t0) {
  const { list } = chirp, data = heatImg.data, dtRow = WINDOW / HEAT.rows;
  const peak = Math.pow(10, DB_PEAK / 10);
  for (let r = 0; r < HEAT.rows; r++) {
    const t = t0 + (HEAT.rows - r - 0.5) * dtRow; // row 0 is the newest
    const n = Math.floor(t / dtRow) + 100000;
    const f = t <= top ? freqAt(list, t) : null;
    for (let c = 0; c < HEAT.cols; c++) {
      const i = (r * HEAT.cols + c) * 4;
      const fc = (1 - (c + 0.5) / HEAT.cols - 0.5) * SPAN + 0.5; // in channel units; high frequency at the left, the channel is 0..1
      let p = Math.pow(10, (DB_FLOOR + (noise(n, c) - 0.5) * 9) / 10);
      if (f !== null) {
        const df = Math.abs(fc - f);
        p += peak * (Math.exp(-((df / 0.015) ** 2)) + 0.05 * Math.exp(-((df / 0.03) ** 2)));
      }
      const db = 10 * Math.log10(p);
      const v = Math.max(0, Math.min(255, Math.round(((db - (DB_FLOOR - 8)) / (DB_PEAK - DB_FLOOR + 8)) * 255)));
      data[i] = LUT[v * 3]; data[i + 1] = LUT[v * 3 + 1]; data[i + 2] = LUT[v * 3 + 2]; data[i + 3] = 255;
    }
  }
  heatCtx.putImageData(heatImg, 0, 0);
}
let heatMode = true;
function setMode(mode) {
  heatMode = mode === "heat";
  cp.toggleAttribute("data-heat", heatMode);
  cp.querySelectorAll("[data-mode]").forEach((el) => { el.toggleAttribute("data-on", el.dataset.mode === mode); el.setAttribute("aria-pressed", String(el.dataset.mode === mode)); });
  if (chirp) draw(chirp.t);
}
cp.querySelectorAll("[data-mode]").forEach((el) => {
  el.addEventListener("click", () => setMode(el.dataset.mode));
  el.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setMode(el.dataset.mode); } });
});

const px = (f) => (1 - (0.5 + (f - 0.5) / SPAN)) * PLANE.w; // f in channel units (0..1 is the channel)
const txt = (x, y, cls, anchor, body, extra = "") => '<text class="' + cls + '" x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" text-anchor="' + anchor + '"' + extra + ">" + body + "</text>";
function draw(now) {
  const { list, total } = chirp;
  const top = Math.min(now, total);
  const t0 = top - WINDOW; // the newest row sits on the plane's top edge, so the plane is always full
  const py = (t) => PLANE.h - ((t - t0) / WINDOW) * PLANE.h;
  // Line trace, on the plane.
  let d = "", hx = -10, hy = -10;
  for (const s of list) {
    const len = s.len ?? 1;
    if (s.t0 > top || s.t0 + len < t0) continue;
    const end = Math.min(len, top - s.t0);
    const seg = (a, b, fa, fb) => { d += "M" + px(fa).toFixed(1) + " " + py(s.t0 + a).toFixed(1) + "L" + px(fb).toFixed(1) + " " + py(s.t0 + b).toFixed(1); hx = px(fb); hy = py(s.t0 + b); };
    if (s.kind === "down") seg(0, end, 1, 1 - end);
    else {
      const wrap = 1 - s.shift;
      if (end <= wrap) seg(0, end, s.shift, s.shift + end);
      else { seg(0, wrap, s.shift, 1); seg(wrap, end, 0, end - wrap); }
    }
  }
  trace.setAttribute("d", d); glow.setAttribute("d", d);
  head.setAttribute("cx", hx.toFixed(1)); head.setAttribute("cy", hy.toFixed(1));
  head.style.opacity = now < total ? "1" : "0";
  if (heatMode) heat(top, t0);
  // Time: a faint line every symbol on the plane, ms labels under the near edge every second symbol.
  let grid = "", labels = "";
  for (let k = Math.max(0, Math.ceil(t0)); k <= top; k++) {
    const y = py(k);
    grid += "M0 " + y.toFixed(1) + "H" + PLANE.w;
    if (k % 2 === 0 && y > 4 && y < PLANE.h - 4) { const [sx, sy] = out(PLANE.w, y, 1, 0, 24); labels += txt(sx, sy, "cp-label", "middle", (k * T_SYM).toFixed(0)); }
  }
  timeGrid.innerHTML = '<path class="cp-grid" d="' + grid + '"/>';
  // Frequency labels down the oldest edge (the left of the screen).
  for (const f of [0.5 - SPAN / 2, 0.5, 0.5 + SPAN / 2]) {
    const [sx, sy] = out(px(f), PLANE.h, 0, 1, 34);
    labels += txt(sx, sy, "cp-label", "middle", (PRESET.mhz + ((f - 0.5) * PRESET.bw) / 1e6).toFixed(3));
  }
  const freqTitle = proj(-22, PLANE.h);
  labels += txt(freqTitle[0] + 6, freqTitle[1] - 18, "cp-title", "middle", STR.freqAxis);
  { const [sx, sy] = proj(PLANE.w, -22); labels += txt(sx + 12, sy + 4, "cp-title", "start", STR.timeAxis); }
  // Sections: a short tick on the far (high-frequency) edge at each boundary, the name above the edge.
  let ticks = "", lastX = -1e9;
  const spans = [["preamble", 0, PRESET.preamble], ["sync", PRESET.preamble, PRESET.preamble + 2], ["down", PRESET.preamble + 2, PRESET.preamble + 4.25], ["payload", PRESET.preamble + 4.25, total]];
  for (const [name, a, b] of spans) {
    const lo = Math.max(a, t0), hi = Math.min(b, top);
    if (hi <= lo) continue;
    if (a > t0 && a > 0) ticks += "M0 " + py(a).toFixed(1) + "h10";
    if (py(hi) > PLANE.h - 30 && hi - lo < 1.2) continue; // too little of it on the plane to name
    const [sx, sy] = out(0, py((lo + hi) / 2), -1, 0, 16);
    if (Math.abs(sx - lastX) < 70) continue; // would collide with the previous name
    if (Math.hypot(sx - freqTitle[0], sy - 10 - (freqTitle[1] - 18)) < 60) continue; // would sit on the frequency axis title
    lastX = sx;
    labels += txt(sx, sy - 10, "cp-phase", "middle", STR.phases[name]);
  }
  phaseTicks.setAttribute("d", ticks);
  labelsG.innerHTML = labels;
  const at = symbolAt(list, top); // by start time: the quarter down-chirp makes symbol periods and indices differ
  const line = now < total
    ? fmt(STR.symbolLine, { phase: STR.phases[list[at].phase], i: at + 1, n: list.length, ms: (top * T_SYM).toFixed(0) })
    : fmt(STR.symbolsDone, { n: total, ms: Math.round(total * T_SYM) });
  if (readout.textContent !== line) readout.textContent = line;
}
function chirpTick(now) {
  const dt = chirpPrev ? Math.min((now - chirpPrev) / 1000, 1 / 30) : 1 / 60;
  chirpPrev = now;
  chirp.t += dt / SYMBOL_S;
  if (chirp.t > chirp.total + REPLAY_S / SYMBOL_S) chirp.t = 0;
  draw(chirp.t);
  chirpFrame = scene === "chirp" ? requestAnimationFrame(chirpTick) : 0;
}
function lastMessage() { const m = [...log].reverse().find((x) => x.mine); return m ? m.text : PHRASES[0]; }
function rideWaves() {
  if (scene === "chirp") return;
  scene = "chirp";
  const message = lastMessage();
  chirp = { ...symbolsFor(message), t: 0 };
  packetEl.textContent = '"' + message + '" · ' + chirp.bytes + " B · SF" + PRESET.sf + " · " + PRESET.bw / 1000 + " kHz · CR 4/" + (PRESET.cr + 4);
  scenes.dataset.scene = "chirp";
  titleEl.textContent = STR.titleWaves;
  hintEl.textContent = STR.hintWaves;
  status.textContent = fmt(STR.wavesStatus, { n: chirp.list.length });
  syncButtons();
  if (still.matches) { chirp.t = chirp.total; draw(chirp.t); return; }
  chirpPrev = 0; chirpFrame = requestAnimationFrame(chirpTick);
}
function backToDevice() {
  if (scene === "device") return;
  scene = "device";
  cancelAnimationFrame(chirpFrame); chirpFrame = 0;
  scenes.dataset.scene = "device";
  titleEl.textContent = STR.titleDevice;
  hintEl.textContent = STR.hintDevice;
  syncButtons();
  say();
  run();
  stage.focus({ preventScroll: true });
}

ride.addEventListener("click", rideWaves);
setMode("heat");
back.addEventListener("click", backToDevice);
