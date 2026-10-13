// Scene 3: a suburban street where a message floods across Meshtastic nodes on the house roofs.
// World units: x and y on the ground, z up; a storey is about 13 units.
import * as k from "../../kit/iso-kit.mjs";
import * as G from "../../kit/lathe.mjs";

export const HOP_LIMIT = 3; // Meshtastic's default hop limit
export const RANGE = 150; // how far one node is heard, in world units (a stand-in for a few hundred metres between roofs)

const PLATE = { x: -160, y: -132, w: 320, d: 264, r: 10 };
const PLATE_H = 8;
const ROAD = { y0: -11, y1: 11 }; // the street runs along x
const WALK = 6; // sidewalk width
const KERB = 1.2;

// Houses: footprint, wall height, roof rise, and whether a node sits on the ridge.
const HOUSES = [
  { x: 4, y: -98, w: 40, d: 30, h: 15, rise: 10, node: true },
  { x: -40, y: 44, w: 44, d: 32, h: 15, rise: 10, node: true },
  { x: 32, y: 40, w: 40, d: 30, h: 26, rise: 10, node: true },
  { x: 100, y: 46, w: 42, d: 32, h: 15, rise: 10, node: true },
];
// Leafy trees (canopy radius) and pines (height).
const OAKS = [[-124, 36, 10.5], [-142, 80, 9.5], [-94, 106, 11.5], [-22, -40, 8], [128, -40, 9.5], [60, 108, 8.5], [82, -112, 10]];
const PINES = [[-14, -116, 26], [146, -112, 30], [-150, -120, 24], [80, 22, 22], [148, 104, 26]];
const PERSON = { x: -112, y: 64 };
const PARK = { x: -154, y: 22, w: 76, d: 102, r: 4 };
// Where the two houses on the far side were: a shop with a forecourt and a parked car.
const SHOP = { x: -146, y: -114, w: 126, d: 54, h: 30 };
const CAR = { x: -102, y: -54, w: 17, d: 34 };
// Where the last house on that side was: a second park, with people and the person who receives the message.
const PARK2 = { x: 66, y: -126, w: 88, d: 104, r: 4 };
const FOLKS = [[96, -62, 1.3], [104, -60, 1.0], [132, -96, 1.35]];
const RECEIVER = { x: 112, y: -84 };

const hash = (a, b) => { let h = Math.imul(a * 374761393 + b * 668265263, 1274126177); h ^= h >>> 13; return ((Math.imul(h, 1103515245) >>> 0) % 1000) / 1000; };

export function suburbScene({ width, height, label, personLabel }) {
  const P = k.fitProjection([...k.boxCorners(PLATE, -PLATE_H, 0), [0, 0, 70]], width, height, { pad: 30, azimuth: 42, elevation: 34 });
  const at = (p) => k.iso(p, P);
  const S = (paths, style) => k.solidSvg(paths, style);
  const L = (d, style) => k.lineSvg(d, style);
  const D = (points, style) => k.dotsSvg(points, style);
  const depth = (x, y) => k.depthOf([x, y, 0], P);
  const nodes = [];

  // Ground: plate, the street, sidewalks, lawns.
  const ground = [`<path class="iso-halo" d="${k.haloOf(PLATE, -PLATE_H, PLATE_H, P)}"/>`];
  ground.push(S(k.slabOf(PLATE, -PLATE_H, PLATE_H, P, 8, 1.4), { tone: "mid" }));
  const inner = k.insetPlan(PLATE, 6);
  ground.push(`<path class="ct-asphalt" d="${k.onTop(k.roundedPlan(inner, 6), 0, P, true)}"/>`);
  const north = { x: inner.x, y: inner.y, w: inner.w, d: ROAD.y0 - inner.y, r: 3 };
  const south = { x: inner.x, y: ROAD.y1, w: inner.w, d: inner.y + inner.d - ROAD.y1, r: 3 };
  for (const lot of [north, south]) {
    ground.push(S(k.slabOf(lot, 0, KERB, P, 4, 0.4), { tone: "lo", crease: "faint" }));
    // The sidewalk strip along the street edge, the rest is lawn.
    const walk = lot === north ? { x: lot.x, y: lot.y + lot.d - WALK, w: lot.w, d: WALK, r: 0.5 } : { x: lot.x, y: lot.y, w: lot.w, d: WALK, r: 0.5 };
    ground.push(`<path class="ct-walk" d="${k.onTop(k.roundedPlan(walk, 2), KERB, P, true)}"/>`);
    ground.push(L(k.planOutline(walk, KERB, P, 2), { tone: "faint" }));
  }
  for (const park of [PARK, PARK2]) {
    ground.push(`<path class="ct-park" d="${k.onTop(k.roundedPlan(park, 4), KERB, P, true)}"/>`);
    ground.push(L(k.planOutline(park, KERB, P, 4), { tone: "faint" }));
  }
  const court = { x: SHOP.x, y: SHOP.y + SHOP.d, w: SHOP.w, d: ROAD.y0 - WALK - (SHOP.y + SHOP.d), r: 0.6 };
  ground.push(`<path class="ct-walk" d="${k.onTop(k.roundedPlan(court, 2), KERB, P, true)}"/>`);
  const bays = [];
  for (let x = SHOP.x + 6; x + 24 <= SHOP.x + SHOP.w - 4; x += 24) bays.push(k.planOutline({ x, y: court.y + 2, w: 24, d: 36, r: 0.3 }, KERB, P, 2));
  ground.push(L(bays.join(""), { tone: "lo" }));
  const dashes = [];
  for (let x = inner.x + 8; x < inner.x + inner.w - 12; x += 16) dashes.push(k.planOutline({ x, y: -0.6, w: 8, d: 1.2, r: 0.5 }, 0, P, 2));
  ground.push(L(dashes.join(""), { tone: "mid" }));
  // Driveways from each house to the street.
  const drives = HOUSES.map((h) => {
    const n = h.y < 0, x = h.x + h.w - 12;
    return k.onTop(k.roundedPlan(n ? { x, y: h.y + h.d, w: 9, d: ROAD.y0 - WALK - (h.y + h.d), r: 0.4 } : { x, y: ROAD.y1 + WALK, w: 9, d: h.y - ROAD.y1 - WALK, r: 0.4 }, 2), KERB, P, true);
  });
  ground.push(`<path class="ct-walk" d="${drives.join("")}"/>`);
  ground.push(D(k.corners(PLATE, 4).map(([x, y]) => at([x, y, 0])), { size: 0.5 }));

  // Things standing on the ground, painted back to front.
  const items = [];
  for (const h of HOUSES) items.push({ key: depth(h.x + h.w / 2, h.y + h.d / 2), svg: house(h) });
  for (const [x, y, r] of OAKS) items.push({ key: depth(x, y), svg: oak(x, y, r) });
  for (const [x, y, h] of PINES) items.push({ key: depth(x, y), svg: pine(x, y, h) });
  for (const hedge of hedges()) items.push(hedge);
  items.push({ key: depth(PERSON.x, PERSON.y), svg: person(PERSON.x, PERSON.y, { device: "origin" }) });
  items.push({ key: depth(-136, 44), svg: bench(-144, 40) });
  items.push({ key: depth(SHOP.x + SHOP.w / 2, SHOP.y + SHOP.d / 2), svg: shop() });
  items.push({ key: depth(CAR.x + CAR.w / 2, CAR.y + CAR.d / 2), svg: car(CAR) });
  items.push({ key: depth(100, -72), svg: bench(92, -74) });
  for (const [x, y, q] of FOLKS) items.push({ key: depth(x, y), svg: person(x, y, { q }) });
  items.push({ key: depth(RECEIVER.x, RECEIVER.y), svg: person(RECEIVER.x, RECEIVER.y, { device: "receiver" }) });
  items.sort((a, c) => a.key - c.key);

  function house(h) {
    const z0 = KERB, top = z0 + h.h, ov = 2.4;
    const plan = { x: h.x, y: h.y, w: h.w, d: h.d, r: 0.6 };
    const out = [S(k.slabOf(plan, z0, h.h, P, 2, 0.6), { tone: "mid", inner: L(k.sideSeam(plan, z0 + 2, P, 2), { tone: "faint" }) })];
    // Windows and a door on the two faces we see.
    const front = k.sideMatrix([0, h.y + h.d], 0, P, "left"), side = k.sideMatrix([h.x + h.w, 0], 0, P, "right");
    const storeys = h.h > 20 ? [z0 + 3, z0 + 15] : [z0 + 3];
    let fw = "", lw = "", sw = "", ls = "";
    storeys.forEach((z, si) => {
      [0.2, 0.62].forEach((f, i) => { const u = h.x + h.w * f, r = `M${u.toFixed(1)} ${-(z + 8)}h6v6h-6z`; hash(si * 7 + i, h.x) > 0.6 ? (lw += r) : (fw += r); });
      [0.3].forEach((f, i) => { const u = h.y + h.d * f, r = `M${(-(u + 6)).toFixed(1)} ${-(z + 8)}h6v6h-6z`; hash(si * 5 + i, h.y) > 0.5 ? (ls += r) : (sw += r); });
    });
    const door = h.y < 0 ? `M${(h.x + h.w * 0.44).toFixed(1)} ${-(z0 + 10)}h5v10h-5z` : "";
    out.push(`<g transform="${front}"><path class="ct-window" d="${fw}"/><path class="ct-window" data-lit d="${lw}"/><path class="ct-door" d="${door}"/></g>`);
    out.push(`<g transform="${side}"><path class="ct-window" d="${sw}"/><path class="ct-window" data-lit d="${ls}"/></g>`);
    // Chimney first, so the near slope of the roof covers its foot.
    const cx = h.x + h.w * 0.26, cy = h.y + h.d * 0.3;
    out.push(S(k.slabOf({ x: cx - 2.5, y: cy - 2.5, w: 5, d: 5, r: 0.3 }, top, h.rise + 3, P, 2, 0.3), { tone: "lo" }));
    // Gable roof: a triangular prism along x, overhanging the walls.
    const F = G.frameOf([h.x - ov, h.y + h.d / 2, top], [1, 0, 0], [0, 1, 0], [0, 0, 1]);
    const half = h.d / 2 + ov;
    out.push(S(G.prismOf(F, [[-half, -0.6], [half, -0.6], [0, h.rise]], 0, h.w + 2 * ov, P), { tone: "hi", crease: "lo" }));
    if (h.node) out.push(mast(h.x + h.w * 0.7, h.y + h.d / 2, top + h.rise));
    return out.join("");
  }

  function mast(mx, my, mz, { mute = false } = {}) {
    // A node clamped to a short mast, its whip above.
    const out = [];
    out.push(S(k.cylinder(mx, my, 0.7, mz - 1, 13, P, 10), { tone: "mid" }));
    out.push(S(k.slabOf({ x: mx - 2.2, y: my + 0.8, w: 4.4, d: 2.2, r: 0.5 }, mz + 3, 5.4, P, 2, 0.3), { tone: "hi" }));
    out.push(S(k.cylinder(mx, my, 0.4, mz + 12, 10, P, 8), { tone: "hi" }));
    const led = [mx + 1.2, my + 3, mz + 6.8];
    out.push(`<g class="ct-led" data-node="${nodes.length}">${D([at(led)], { size: 0.9, tone: "hi" })}</g>`);
    nodes.push({ x: mx, y: my, z: mz + 20, mute });
    return out.join("");
  }

  function shop() {
    // A two-storey shop: glass storefront under an awning, offices above, a flat roof with a parapet.
    const z0 = KERB, top = z0 + SHOP.h;
    const plan = { x: SHOP.x, y: SHOP.y, w: SHOP.w, d: SHOP.d, r: 0.8 };
    const out = [S(k.slabOf(plan, z0, SHOP.h, P, 2, 0.8), { tone: "mid", inner: L(k.sideSeam(plan, z0 + 15.5, P, 2), { tone: "faint" }) })];
    const front = k.sideMatrix([0, SHOP.y + SHOP.d], 0, P, "left"), side = k.sideMatrix([SHOP.x + SHOP.w, 0], 0, P, "right");
    let glass = "", door = "", upper = "", upLit = "";
    for (let x = SHOP.x + 6; x + 12 <= SHOP.x + SHOP.w - 4; x += 13) {
      if (Math.abs(x - (SHOP.x + 58)) < 6) door += `M${x} ${-(z0 + 12)}h12v12h-12z`;
      else glass += `M${x} ${-(z0 + 12.5)}h12v10.5h-12z`;
      (hash(x, 3) > 0.55 ? (upLit += `M${x + 2} ${-(z0 + 26)}h8v6h-8z`) : (upper += `M${x + 2} ${-(z0 + 26)}h8v6h-8z`));
    }
    let sideUp = "", sideGlass = "";
    for (let y = SHOP.y + 6; y + 10 <= SHOP.y + SHOP.d - 4; y += 12) { sideUp += `M${-(y + 8)} ${-(z0 + 26)}h8v6h-8z`; sideGlass += `M${-(y + 9)} ${-(z0 + 12)}h9v9h-9z`; }
    out.push(`<g transform="${front}"><path class="ct-window" data-lit d="${glass}"/><path class="ct-door" d="${door}"/><path class="ct-window" d="${upper}"/><path class="ct-window" data-lit d="${upLit}"/><path class="ct-sign" d="M${SHOP.x + 40} ${-(z0 + 19)}h38v3.4h-38z"/></g>`);
    out.push(`<g transform="${side}"><path class="ct-window" d="${sideUp}"/><path class="ct-window" data-lit d="${sideGlass}"/></g>`);
    // The awning over the storefront.
    out.push(S(k.slabOf({ x: SHOP.x + 4, y: SHOP.y + SHOP.d, w: SHOP.w - 8, d: 5.5, r: 0.4 }, z0 + 13.4, 1.2, P, 2, 0.3), { tone: "hi" }));
    // Parapet, roof units and the node.
    out.push(L(k.planOutline(k.insetPlan(plan, 2.2), top, P, 2), { tone: "faint" }));
    const roof = [
      { key: depth(SHOP.x + 20, SHOP.y + 14), svg: S(k.slabOf({ x: SHOP.x + 14, y: SHOP.y + 8, w: 12, d: 9, r: 0.6 }, top, 5, P, 2, 0.4), { tone: "lo" }) },
      { key: depth(SHOP.x + 46, SHOP.y + 14), svg: S(k.slabOf({ x: SHOP.x + 40, y: SHOP.y + 8, w: 12, d: 9, r: 0.6 }, top, 5, P, 2, 0.4), { tone: "lo" }) },
      { key: depth(SHOP.x + SHOP.w * 0.72, SHOP.y + SHOP.d * 0.5), svg: mast(SHOP.x + SHOP.w * 0.72, SHOP.y + SHOP.d * 0.5, top, { mute: true }) },
    ].sort((a, b) => a.key - b.key);
    return out.join("") + roof.map((r) => r.svg).join("");
  }

  function car(c) {
    // Parked nose-in: wheels on the far side, the body, a glasshouse, then the near wheels.
    const z0 = KERB, wr = 3.8, wheel = (x, y) => S(G.disc(0, 2.2, wr, G.frameAlong([x, y, z0 + wr], [1, 0, 0]), P), { tone: "lo" });
    const out = [`<path class="iso-halo" d="${k.haloOf(c, z0, 2, P)}"/>`];
    out.push(wheel(c.x - 0.6, c.y + 7), wheel(c.x - 0.6, c.y + c.d - 7));
    out.push(S(k.slabOf({ ...c, r: 3 }, z0 + 2.2, 7, P, 3, 0.5), { tone: "mid" }));
    const cabin = { x: c.x + 1.5, y: c.y + 8, w: c.w - 3, d: 17, r: 2.4 };
    out.push(S(k.slabOf(cabin, z0 + 9.2, 6, P, 3, 0.4), { tone: "lo", inner: L(k.sideSeam(cabin, z0 + 9.8, P, 3), { tone: "faint" }) }));
    out.push(wheel(c.x + c.w - 1.6, c.y + 7), wheel(c.x + c.w - 1.6, c.y + c.d - 7));
    out.push(D([at([c.x + 3.4, c.y + c.d, z0 + 6.4]), at([c.x + c.w - 3.4, c.y + c.d, z0 + 6.4])], { size: 0.8, tone: "hi" }));
    return out.join("");
  }

  function oak(x, y, r) {
    // A trunk and a faceted, low-poly crown: a turned profile with few sides, so each facet takes its own tone.
    const trunkH = r * 1.1, out = [S(k.cylinder(x, y, r * 0.16, KERB, trunkH + r * 0.4, P, 8), { tone: "lo" })];
    const F = G.frameOf([x, y, KERB + trunkH], [0, 0, 1], [Math.cos(r), Math.sin(r), 0], [-Math.sin(r), Math.cos(r), 0]);
    const crown = [[0, r * 0.35], [r * 0.35, r * 0.92], [r * 0.9, r * 1.05], [r * 1.45, r * 0.85], [r * 1.85, r * 0.4], [r * 2.0, 0]];
    out.push(S(G.solidOf(crown, F, P, { steps: 7, smooth: false }), { tone: "mid", crease: "lo" }));
    return out.join("");
  }

  function pine(x, y, h) {
    // Three stacked faceted cones on a short trunk.
    const out = [S(k.cylinder(x, y, 1, KERB, h * 0.22, P, 8), { tone: "lo" })];
    const tiers = [[0.18, 0.5, 0.3], [0.38, 0.42, 0.24], [0.56, 0.44, 0.17]];
    tiers.forEach(([z, len, r], i) => {
      const a = i * 0.7 + x;
      const F = G.frameOf([x, y, KERB + h * z], [0, 0, 1], [Math.cos(a), Math.sin(a), 0], [-Math.sin(a), Math.cos(a), 0]);
      out.push(S(G.solidOf([[0, h * r], [h * len, 0.01]], F, P, { steps: 7, smooth: false }), { tone: "mid", crease: "lo" }));
    });
    return out.join("");
  }

  function hedges() {
    // Low clipped hedges along some lot lines.
    const list = [
      { x: -8, y: -124, w: 3.6, d: 80, r: 1.6 },
      { x: 66, y: -124, w: 3.6, d: 84, r: 1.6 },
      { x: 20, y: 30, w: 3.6, d: 92, r: 1.6 },
      { x: 88, y: 30, w: 3.6, d: 92, r: 1.6 },
      { x: -72, y: 30, w: 3.6, d: 92, r: 1.6 },
    ];
    return list.map((p) => ({ key: depth(p.x + p.w / 2, p.y + p.d / 2), svg: S(k.slabOf(p, KERB, 4.4, P, 3, 0.4), { tone: "mid" }) }));
  }

  function bench(x, y) {
    const seat = { x, y, w: 14, d: 3.4, r: 0.4 };
    return S(k.slabOf({ x: x + 1, y: y + 0.6, w: 1.2, d: 2.2, r: 0.2 }, KERB, 2.4, P, 2), { tone: "lo" }) +
      S(k.slabOf({ x: x + 11.8, y: y + 0.6, w: 1.2, d: 2.2, r: 0.2 }, KERB, 2.4, P, 2), { tone: "lo" }) +
      S(k.slabOf(seat, KERB + 2.4, 0.8, P, 2, 0.2), { tone: "mid" });
  }

  function person(x, y, { device = null, q = 1.35 } = {}) {
    const z0 = KERB, out = [];
    const box = (dx, dy, w, d, r, z, h) => k.slabOf({ x: x + dx * q, y: y + dy * q, w: w * q, d: d * q, r: r * q }, z0 + z * q, h * q, P, 2, 0.3);
    out.push(`<path class="iso-halo" d="${k.haloOf({ x: x - 3 * q, y: y - 2 * q, w: 6 * q, d: 4 * q, r: 2 * q }, z0, 1, P)}"/>`);
    out.push(S(box(-2.2, -0.8, 1.8, 1.8, 0.6, 0, 8), { tone: "lo" })); // legs
    out.push(S(box(0.4, -0.8, 1.8, 1.8, 0.6, 0, 8), { tone: "lo" }));
    out.push(S(box(-2.8, -1.4, 5.6, 3, 1.2, 8, 7), { tone: "mid" })); // torso
    out.push(S(box(-3.8, -0.6, 1.2, 1.4, 0.5, 9, 5.6), { tone: "mid" })); // left arm, down
    if (device) out.push(S(box(2.4, 0.2, 1.3, 3.2, 0.5, 11.4, 1.3), { tone: "mid" })); // right forearm, forward
    else out.push(S(box(2.6, -0.6, 1.2, 1.4, 0.5, 9, 5.6), { tone: "mid" })); // right arm, down
    out.push(S(G.sphereOf([x, y, z0 + 17.4 * q], 2.3 * q, P), { tone: "mid" })); // head
    if (!device) return out.join("");
    out.push(S(box(1.6, 3.2, 3, 4, 0.6, 12.4, 1.2), { tone: "hi" })); // the handheld
    out.push(S(box(3.7, -1.8, 0.7, 5.2, 0.3, 13, 0.7), { tone: "hi" })); // its whip
    const led = [x + 3.1 * q, y + 5.2 * q, z0 + 13.6 * q];
    out.push(`<g class="ct-led" data-node="${nodes.length}"${device === "origin" ? " data-origin" : ""}>${D([at(led)], { size: 0.9, tone: "hi" })}</g>`);
    nodes.push({ x: led[0], y: led[1], z: led[2], origin: device === "origin", receiver: device === "receiver", head: at([x, y, z0 + 22 * q]) });
    const attrs = device === "origin" ? ` data-part="person" tabindex="0" role="button" aria-label="${personLabel}"` : "";
    return `<g class="ct-person"${attrs}>${out.join("")}</g>`;
  }

  const rx = nodes.find((n) => n.receiver).head;
  const bubble = `<g class="ct-bubble" data-part="bubble" transform="translate(${rx[0].toFixed(1)} ${rx[1].toFixed(1)})"><path data-part="bubble-box" d=""/><text data-part="bubble-text" x="0" y="-12" text-anchor="middle"></text></g>`;
  const body = [...ground, ...items.map((i) => i.svg), `<g data-part="city-waves"></g>`, bubble].join("");
  const svg = k.figureSvg({
    width,
    height,
    className: "ct-svg",
    label,
    body: [body],
  });
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  const links = nodes.map((a, i) => nodes.map((b, j) => (i !== j && dist(a, b) <= RANGE ? [j, dist(a, b)] : null)).filter(Boolean));
  return { svg, P, nodes: nodes.map(({ x, y, z, origin, receiver, mute }) => ({ x, y, z, origin: !!origin, receiver: !!receiver, mute: !!mute })), links };
}
