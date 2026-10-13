// Scene 3: the suburb. Managed flooding across rooftop nodes, drawn as arcs.
const { P: CP, nodes: NODES, links: LINKS, hopLimit: HOP_LIMIT, range: RANGE } = DATA.suburb;
const WAVE_S = 1.1, SPEED = RANGE / WAVE_S; // a ring reaches the edge of range in 1.1 s
// Managed flooding: a node waits before rebroadcasting, shorter when the signal was weak (distance stands in
// for SNR here), and gives up if it hears someone else rebroadcast first. The window is wide enough that the
// farthest nodes really do go first: hearing time + wait = 1.85 - 0.5 * d / RANGE seconds after the send.
// (Real firmware picks a random slot in an SNR-sized window, so it is a tendency there, not a rule.)
const contention = (d) => 0.25 + 1.6 * (1 - d / RANGE);
const ARC_FADE_S = 0.9; // how long an arc lingers after its packet lands
const REPEAT_S = 3.2; // pause after a flood before the person sends again
const ORIGIN = NODES.findIndex((n) => n.origin);
const work = document.querySelector('[data-action="work"]'), backWaves = document.querySelector('[data-action="back-waves"]');
const citySvg = document.querySelector(".ct-svg"), cityWaves = citySvg.querySelector('[data-part="city-waves"]');
const leds = NODES.map((_, i) => citySvg.querySelector('[data-node="' + i + '"]'));
const bubble = citySvg.querySelector('[data-part="bubble"]'), bubbleBox = bubble.querySelector('[data-part="bubble-box"]'), bubbleText = bubble.querySelector('[data-part="bubble-text"]');
function showBubble(text) {
  bubbleText.textContent = text.length > 22 ? text.slice(0, 21) + "…" : text;
  bubble.setAttribute("data-on", "");
  const w = bubbleText.getComputedTextLength() + 12, h = 13;
  // A rounded box above the head with a small tail pointing down at it.
  bubbleBox.setAttribute("d", "M" + (-w / 2 + 3) + " " + (-h - 8) + "h" + (w - 6) + "q3 0 3 3v" + (h - 6) + "q0 3 -3 3h" + (-(w / 2 - 6)) + "l-3 4l-3 -4h" + (-(w / 2 - 6)) + "q-3 0 -3 -3v" + (-(h - 6)) + "q0 -3 3 -3z");
}
let flood = null, cityFrame = 0, cityPrev = 0, cityIdle = 0;
function startFlood() {
  flood = { t: 0, events: [], arcs: [], heard: NODES.map(() => null), pending: NODES.map(() => null), relays: 0, skipped: 0, text: lastMessage() };
  leds.forEach((el) => el.removeAttribute("data-on"));
  bubble.removeAttribute("data-on");
  cityWaves.innerHTML = "";
  flood.heard[ORIGIN] = { hop: 0 };
  leds[ORIGIN].setAttribute("data-on", "");
  transmit(ORIGIN, 0, HOP_LIMIT);
  if (still.matches) { step(60); return; } // reduced motion: show the finished flood at once
  if (!cityFrame && scene === "city") { cityPrev = 0; cityFrame = requestAnimationFrame(cityTick); }
}
// One transmission: an arc from the sender straight to every node in range, its bright head
// arriving exactly when that node hears the packet.
const NS_SVG = "http://www.w3.org/2000/svg";
function transmit(i, t, hl) {
  for (const [j, d] of LINKS[i]) {
    const el = document.createElementNS(NS_SVG, "path"), head = document.createElementNS(NS_SVG, "circle");
    el.setAttribute("class", "ct-arc"); head.setAttribute("class", "ct-head"); head.setAttribute("r", "2.2");
    cityWaves.appendChild(el); cityWaves.appendChild(head);
    flood.arcs.push({ a: NODES[i], b: NODES[j], t0: t, dur: d / SPEED, rise: 0.28 * d + 8, el, head });
    flood.events.push({ t: t + d / SPEED, j, hl, d });
  }
}
function arcPoint(r, s) {
  const { a, b } = r;
  return iso([a.x + (b.x - a.x) * s, a.y + (b.y - a.y) * s, a.z + (b.z - a.z) * s + r.rise * Math.sin(Math.PI * s)], CP);
}
function step(dt) {
  const f = flood;
  f.t += dt;
  f.events.sort((a, b) => a.t - b.t);
  while (f.events.length && f.events[0].t <= f.t) {
    const e = f.events.shift();
    if (e.relay) { if (f.pending[e.j] === e) { f.pending[e.j] = null; f.relays++; transmit(e.j, e.t, e.hl); } continue; }
    if (!f.heard[e.j]) {
      f.heard[e.j] = { hop: HOP_LIMIT - e.hl }; // Meshtastic counts hops away: heard direct = 0, each relay adds 1
      leds[e.j].setAttribute("data-on", "");
      if (NODES[e.j].receiver) { showBubble(f.text); status.textContent = fmt(STR.receivedStatus, { text: f.text }); }
      // A CLIENT_MUTE node (the shop) listens but never rebroadcasts.
      if (e.hl > 0 && !NODES[e.j].origin && !NODES[e.j].mute) { const r = { relay: true, t: e.t + contention(e.d), j: e.j, hl: e.hl - 1 }; f.pending[e.j] = r; f.events.push(r); }
    } else if (f.pending[e.j]) { f.pending[e.j] = null; f.skipped++; }
  }
  for (let i = f.arcs.length - 1; i >= 0; i--) {
    const r = f.arcs[i], u = Math.min(1, (f.t - r.t0) / r.dur), after = f.t - r.t0 - r.dur;
    if (u <= 0) continue;
    if (after > ARC_FADE_S) { r.el.remove(); r.head.remove(); f.arcs.splice(i, 1); continue; }
    const n = Math.max(2, Math.ceil(u * 32)), pts = [];
    for (let k = 0; k <= n; k++) pts.push(arcPoint(r, (u * k) / n));
    r.el.setAttribute("d", "M" + pts.map((p) => p[0].toFixed(1) + " " + p[1].toFixed(1)).join("L"));
    const tip = pts[pts.length - 1];
    r.head.setAttribute("cx", tip[0].toFixed(1)); r.head.setAttribute("cy", tip[1].toFixed(1));
    r.head.style.opacity = after > 0 ? "0" : "1";
    r.el.style.opacity = (after > 0 ? Math.max(0, 1 - after / ARC_FADE_S) : 1).toFixed(2);
  }
  const count = f.heard.filter(Boolean).length - 1, total = NODES.length - 1;
  const hop = Math.max(0, ...f.heard.filter(Boolean).map((h) => h.hop));
  const busy = f.events.length || f.arcs.length;
  const line = busy
    ? fmt(STR.floodLine, { hop, limit: HOP_LIMIT, count, total })
    : fmt(STR.floodDone, { count, total, hop, limit: HOP_LIMIT, relays: f.relays }) + (f.skipped ? fmt(STR.floodSkipped, { skipped: f.skipped }) : "");
  if (readout.textContent !== line) readout.textContent = line;
  return busy;
}
function cityTick(now) {
  const dt = cityPrev ? Math.min((now - cityPrev) / 1000, 1 / 30) : 1 / 60;
  cityPrev = now;
  if (flood) {
    if (step(dt)) cityIdle = 0;
    else if ((cityIdle += dt) > REPEAT_S && !still.matches) startFlood(); // send it again
  }
  cityFrame = scene === "city" ? requestAnimationFrame(cityTick) : 0;
}
function meshAtWork() {
  if (scene !== "chirp") return;
  scene = "city";
  cancelAnimationFrame(chirpFrame); chirpFrame = 0;
  scenes.dataset.scene = "city";
  titleEl.textContent = STR.titleMesh;
  hintEl.textContent = STR.hintMesh;
  status.textContent = fmt(STR.meshStatus, { limit: HOP_LIMIT });
  syncButtons();
  startFlood(); // starts the one animation loop (or, under reduced motion, shows the end state)
}
function backToWaves() {
  if (scene !== "city") return;
  cancelAnimationFrame(cityFrame); cityFrame = 0;
  scene = "chirp";
  scenes.dataset.scene = "chirp";
  titleEl.textContent = STR.titleWaves;
  hintEl.textContent = STR.hintWaves;
  syncButtons();
  if (still.matches) { chirp.t = chirp.total; draw(chirp.t); return; }
  chirpPrev = 0; chirpFrame = requestAnimationFrame(chirpTick);
}
work.addEventListener("click", meshAtWork);
backWaves.addEventListener("click", backToWaves);
const person = citySvg.querySelector('[data-part="person"]');
person.addEventListener("click", () => { cityIdle = 0; startFlood(); });
person.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); cityIdle = 0; startFlood(); } });

// Scene buttons: only the ones on show can be reached by Tab or a screen reader.
function syncButtons() {
  const shown = {
    ride: scene === "device" && ride.hasAttribute("data-show"),
    back: scene === "chirp",
    work: scene === "chirp",
    "back-waves": scene === "city",
  };
  document.querySelectorAll(".td-btn").forEach((btn) => {
    const on = !!shown[btn.dataset.action];
    btn.disabled = !on;
    btn.setAttribute("aria-hidden", String(!on));
  });
}
syncButtons();
