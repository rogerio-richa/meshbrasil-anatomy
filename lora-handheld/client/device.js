// Scene 1: the handheld. Typing, the screen, the transmit rings, the demo loop.
// DATA, STR and fmt come from the prelude build.mjs writes ahead of these files, and so do the
// LoRa helpers from model.mjs (PRESET, MAX_TEXT, bytesOf, packetBytes, airtimeMs, ...).
const P = DATA.device.P;
const KEYS = DATA.device.keys;
const PHRASES = STR.phrases;
const ANT = DATA.device.wave.at, WAVE_R = DATA.device.wave.r, WHIP_TIP = DATA.device.wave.tip;
const SHOW = 24; // characters of the draft shown on the screen's input line
const ACK_DELAY_S = 2.2; // after sending, when the rebroadcast "comes back" and the message gets its tick
const IDLE_MS = 12000; // after this long untouched, the demo starts typing again (never over a draft)
const stage = document.querySelector(".iso-stage");
const svg = stage.querySelector("svg");
const keyEls = KEYS.map((_, i) => svg.querySelector('[data-key="' + i + '"]'));
const input = svg.querySelector('[data-part="input"]');
const cursor = svg.querySelector('[data-part="cursor"]');
const lines = [0, 1, 2, 3].map((i) => svg.querySelector('[data-line="' + i + '"]'));
const bubbles = [0, 1, 2, 3].map((i) => svg.querySelector('[data-bubble="' + i + '"]'));
const whip = svg.querySelector('[data-part="whip"] .iso-solid');
const led = svg.querySelector('[data-part="led"]');
const backG = svg.querySelector('[data-part="waves-back"]');
const frontG = svg.querySelector('[data-part="waves-front"]');
const readout = document.querySelector("[data-readout]");
const status = document.querySelector("[data-status]");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const down = axisVector(P, [0, 0, -1.1]);

const keyState = KEYS.map(() => ({ at: 0, held: 0 }));
const active = new Set();
const waves = [];
let scene = "device";
let text = "", log = STR.chat.map((m) => ({ ...m }));
let tx = null, rx = null, frame = 0, previous = 0, visible = false, touring = !still.matches, idleTimer = 0;
let tour = { phrase: 0, index: 0, step: "type", wait: 1.2 };

const NS = "http://www.w3.org/2000/svg";
// Each wave is a sphere around the whip; on screen its outline is a circle. The whip runs through
// the circle's plane at its centre: the half on the tip's side is in front of the whip, the other behind.
const C = iso(ANT, P), K = cameraOf(P).k;
const TIP = iso(WHIP_TIP, P), TIP_A = Math.atan2(TIP[1] - C[1], TIP[0] - C[0]);
function arc(r, front) {
  const R = r * K, a0 = TIP_A + (front ? -Math.PI / 2 : Math.PI / 2), pts = [];
  for (let i = 0; i <= 48; i++) {
    const a = a0 + (Math.PI * i) / 48;
    pts.push([C[0] + Math.cos(a) * R, C[1] + Math.sin(a) * R]);
  }
  return "M" + pts.map((p) => p[0].toFixed(1) + " " + p[1].toFixed(1)).join("L");
}
function makeWave() {
  const back = document.createElementNS(NS, "path"), front = document.createElementNS(NS, "path");
  for (const el of [back, front]) { el.setAttribute("class", "iso-line td-wave"); el.setAttribute("data-tone", "lit"); }
  backG.appendChild(back); frontG.appendChild(front);
  waves.push({ t: 0, back, front });
}

function render() {
  const shown = log.slice(-4);
  lines.forEach((el, i) => {
    const m = shown[i], b = bubbles[i];
    if (!m) { el.textContent = ""; b.setAttribute("width", "0"); return; }
    el.textContent = m.mine ? m.text + (m.state === "sent" ? " ✓" : " …") : m.from + ": " + m.text;
    el.setAttribute("text-anchor", m.mine ? "end" : "start");
    el.setAttribute("x", m.mine ? "36.6" : "-36.6");
    el.toggleAttribute("data-mine", !!m.mine);
    const w = Math.min(76, el.getComputedTextLength() + 2.4), y = Number(el.getAttribute("y"));
    b.setAttribute("x", m.mine ? String(37.8 - w) : "-37.8");
    b.setAttribute("y", String(y - 4.3)); b.setAttribute("width", String(w)); b.setAttribute("height", "6");
    b.toggleAttribute("data-mine", !!m.mine);
  });
  const tail = text.length > SHOW ? "…" + text.slice(-SHOW + 1) : text;
  input.textContent = "> " + tail;
  cursor.setAttribute("x", String(-37.6 + input.getComputedTextLength() + 0.4));
  say();
}
function say() {
  if (scene !== "device") return;
  let line;
  if (tx) line = fmt(STR.txLine, { b: tx.bytes, ms: Math.round(tx.ms) });
  else if (rx) line = STR.rxLine;
  else if (text) { const b = packetBytes(text); line = fmt(STR.typingLine, { t: bytesOf(text), b, ms: Math.round(airtimeMs(b)) }); }
  else line = fmt(STR.readyLine, { mhz: PRESET.mhz, name: PRESET.name });
  if (readout.textContent !== line) readout.textContent = line;
}

const indexOf = (code) => KEYS.indexOf(code);
function press(code, hold = 0.09) {
  const i = indexOf(code);
  if (i < 0) return;
  keyState[i].held = hold; active.add(i); run();
}
function type(ch) {
  if (tx) return;
  const lower = ch.toLowerCase();
  const code = ch === " " ? " " : indexOf(lower) >= 0 ? lower : "sym";
  if (ch !== lower) press("ShiftL", 0.14);
  press(code);
  if (bytesOf(text + ch) <= MAX_TEXT) text += ch;
  render();
}
function erase() { if (tx) return; press("Backspace"); text = text.slice(0, -1); render(); }
function send() {
  press("Enter");
  if (!text.trim() || tx) return;
  if (rx) ack(); // a new send closes out the previous one's wait for its rebroadcast
  const b = packetBytes(text);
  const msg = { mine: true, text, state: "pending" };
  log.push(msg); text = "";
  tx = { bytes: b, ms: airtimeMs(b), t: 0, emit: 0, msg };
  whip.toggleAttribute("data-lit", true); led.toggleAttribute("data-on", true);
  document.querySelector('[data-action="ride"]').toggleAttribute("data-show", true);
  syncButtons();
  status.textContent = fmt(STR.sendingStatus, { b, ms: Math.round(tx.ms) });
  if (still.matches) { finishTx(); ack(); }
  render(); run();
}
function finishTx() {
  const m = tx.msg; tx = null;
  whip.toggleAttribute("data-lit", false); led.toggleAttribute("data-on", false);
  rx = { t: 0, msg: m };
}
function ack() { rx.msg.state = "sent"; status.textContent = STR.ackStatus; rx = null; render(); }

function tourStep(dt) {
  tour.wait -= dt;
  if (tour.wait > 0) return;
  const phrase = PHRASES[tour.phrase];
  if (tour.step === "type") {
    if (tour.index < phrase.length) { type(phrase[tour.index++]); tour.wait = 0.08 + Math.random() * 0.1 + (phrase[tour.index - 1] === " " ? 0.07 : 0); }
    else { tour.step = "send"; tour.wait = 0.9; }
  } else if (tour.step === "send") { send(); tour.step = "wait"; tour.wait = 0.5; }
  else if (tour.step === "wait") {
    if (tx || rx) { tour.wait = 0.2; return; }
    tour.phrase = (tour.phrase + 1) % PHRASES.length; tour.index = 0; tour.step = "type"; tour.wait = 2.6;
  }
}

function tick(now) {
  const real = previous ? (now - previous) / 1000 : 1 / 60;
  const dt = Math.min(real, 1 / 30); // animation steps are capped so a stall doesn't jump
  previous = now;
  const calm = still.matches;
  if (touring && scene === "device") tourStep(dt);
  if (tx) {
    tx.t += real * 1000; tx.emit -= dt; // the transmission itself runs on the wall clock: exactly its time on air
    if (tx.emit <= 0) { makeWave(); tx.emit = 0.16; }
    render();
    if (tx.t >= tx.ms) finishTx();
  } else if (rx) {
    rx.t += dt;
    if (rx.t > ACK_DELAY_S) ack();
    say();
  }
  for (let i = waves.length - 1; i >= 0; i--) {
    const w = waves[i];
    w.t += dt;
    const u = Math.min(1, w.t / 1.5);
    const r = 6 + (WAVE_R - 6) * u;
    const alpha = u < 0.7 ? 1 : 1 - (u - 0.7) / 0.3;
    w.back.setAttribute("d", arc(r, false)); w.front.setAttribute("d", arc(r, true));
    w.back.style.opacity = alpha.toFixed(3); w.front.style.opacity = alpha.toFixed(3);
    if (u >= 1) { w.back.remove(); w.front.remove(); waves.splice(i, 1); }
  }
  for (const i of active) {
    const s = keyState[i];
    s.held = Math.max(0, s.held - dt);
    const want = s.held > 0 ? 1 : 0;
    s.at = calm ? want : s.at + (want - s.at) * (1 - Math.exp(-dt / (want ? 0.025 : 0.07)));
    if (Math.abs(want - s.at) < 0.01) s.at = want;
    keyEls[i].setAttribute("transform", "translate(" + (down[0] * s.at).toFixed(2) + " " + (down[1] * s.at).toFixed(2) + ")");
    keyEls[i].toggleAttribute("data-down", s.at > 0.6);
    if (!s.held && s.at === 0) active.delete(i);
  }
  const busy = scene === "device" && (touring || active.size || tx || rx || waves.length);
  frame = visible && busy ? requestAnimationFrame(tick) : 0;
}
function run() { if (!frame && visible) { previous = 0; frame = requestAnimationFrame(tick); } }
function takeOver() {
  if (touring) { touring = false; if (!tx && !rx) { text = ""; render(); } }
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if (still.matches) return;
    if (text || tx || rx) { takeOver(); return; } // never type over someone's draft
    touring = true; tour = { phrase: 0, index: 0, step: "type", wait: 0.6 }; render(); run();
  }, IDLE_MS);
}
new IntersectionObserver((entries) => { visible = entries[entries.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" }).observe(stage);
stage.addEventListener("keydown", (event) => {
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  const key = event.key;
  if (key === "Tab") return;
  if (scene !== "device" || event.target !== stage) return; // keys on the scene buttons do what buttons do
  takeOver();
  if (key === "Backspace") { event.preventDefault(); erase(); return; }
  if (key === "Enter") { event.preventDefault(); send(); return; }
  if (key === "Shift") { press(event.code === "ShiftRight" ? "ShiftR" : "ShiftL", 0.14); return; }
  if (key.length === 1) { event.preventDefault(); type(key); }
});
svg.addEventListener("click", (event) => {
  const el = event.target.closest("[data-key]");
  if (!el) return;
  takeOver();
  const code = KEYS[Number(el.dataset.key)];
  if (code === "Backspace") erase();
  else if (code === "Enter") send();
  else if (code.length === 1) type(code);
  else press(code);
  stage.focus({ preventScroll: true });
});
render();
