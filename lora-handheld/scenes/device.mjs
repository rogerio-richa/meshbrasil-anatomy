// Scene 1: the handheld. Geometry only; the browser code that makes it live is client/device.js.
import * as k from "../../kit/iso-kit.mjs";
import * as G from "../../kit/lathe.mjs";
import { WIDTH, HEIGHT } from "./layout.mjs";

let STR = {};

// World: ~1.5 units per mm. x across the device, y from its top edge (-) to its bottom edge (+), z up.
const DEV = { x: -52, y: -84, w: 104, d: 168, r: 16 };
const FEET_H = 2;
const TOP = 21;
const SEAM = 7;
const RIGHT = DEV.x + DEV.w;
const NEAR = DEV.y + DEV.d;

const GLASS = { x: -40, y: -64, w: 80, d: 60, r: 1.6 };
const BEZEL = { x: -44, y: -68, w: 88, d: 68, r: 4 };
const DEPTH = 1.3;
const GLASS_Z = TOP - DEPTH;

const BALL = [0, 8.5];
const KEY_H = 1.8;
const PITCH = 9.2;
const FRETS = [20.6, 32.6, 44.6, 56.6];
const ROW_Y = [22.8, 34.8, 46.8, 58.8];
const ROW_D = [9, 9, 9, 8.2];
const ROWS = [
  ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
  ["a", "s", "d", "f", "g", "h", "j", "k", "l", "Backspace"],
  ["alt", "z", "x", "c", "v", "b", "n", "m", "$", "Enter"],
];
const GLYPH = { Backspace: "⌫", Enter: "↵", alt: "alt", $: "$" };

// The SMA bulkhead leaves the top edge and the straight whip lies back from it.
const SMA = { x: 30, z: 14 };
const FAR = DEV.y;
const WHIP_FROM = 11.5; // along the connector axis, where the whip leaves the coupling nut
const WHIP_LEN = 112;
const WAVE_AT = [SMA.x, FAR - WHIP_FROM - WHIP_LEN * 0.5, SMA.z]; // the radiating section's middle
const WAVE_R = 50;

const P = k.fitProjection(
  [...k.boxCorners(DEV, 0, TOP), [SMA.x, FAR - WHIP_FROM - WHIP_LEN, SMA.z], ...[[1, 0, 0], [0, 1, 0], [0, 0, 1]].flatMap((a) => [1, -1].map((sign) => WAVE_AT.map((v, i) => v + sign * a[i] * WAVE_R)))],
  WIDTH,
  HEIGHT,
  { pad: 18, azimuth: 60, elevation: 40 },
);

const at = (point) => k.iso(point, P);
const S = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);
const D = (points, style) => k.dotsSvg(points, style);
const byDepth = (points) => [...points].sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P));
const topAt = (z) => k.topMatrix([0, 0], z, P, "x");
const sidePlane = (y) => k.sideMatrix([0, y], 0, P, "left"); // local (x, -z) on the face y = const
const rightPlane = (x) => k.sideMatrix([x, 0], 0, P, "right"); // local (-y, -z) on the face x = const
const flatPlan = (plan, steps = 6) => k.pathOf(k.roundedPlan(plan, steps), true);

let clips = 0;
function screen() {
  const id = `td-clip-${clips++}`;
  const gid = `td-glass-${clips++}`;
  const ring = k.roundedPlan(GLASS, 6);
  const toward = k.towardViewer(P);
  const walls = [[], [], [], []];
  const cx = GLASS.x + GLASS.w / 2;
  const cy = GLASS.y + GLASS.d / 2;
  ring.forEach(([ax, ay], i) => {
    const [bx, by] = ring[(i + 1) % ring.length];
    const len = Math.hypot(bx - ax, by - ay) || 1;
    let [nx, ny] = [(by - ay) / len, -(bx - ax) / len];
    if (nx * (cx - (ax + bx) / 2) + ny * (cy - (ay + by) / 2) < 0) [nx, ny] = [-nx, -ny];
    const facing = nx * toward[0] + ny * toward[1];
    if (facing <= 0) return;
    const shade = Math.min(3, Math.floor((1 - facing) * 4));
    walls[shade].push(k.pathOf([at([ax, ay, TOP]), at([bx, by, TOP]), at([bx, by, GLASS_Z]), at([ax, ay, GLASS_Z])], true));
  });
  const shape = flatPlan(GLASS);

  // The Meshtastic device UI, 320 x 240 px drawn at 4 px per unit in the glass plane.
  const ui = [
    `<path class="td-glass" d="${shape}"/>`,
    `<path class="td-glow" d="${flatPlan({ x: -30, y: -56, w: 60, d: 42, r: 18 }, 8)}"/>`,
    `<path class="td-bar" d="M${GLASS.x} -56.6H${GLASS.x + GLASS.w}"/>`,
    `<text class="td-ui" x="-37.6" y="-58.6" font-size="3.4">LongFast</text>`,
    `<text class="td-ui" data-part="nodes" x="-6" y="-58.6" font-size="3.4">${STR.nodes}</text>`,
    `<rect class="td-batt" x="28.4" y="-61.6" width="7.4" height="3.4" rx=".5"/><rect class="td-ui-fill" x="29.2" y="-60.8" width="5" height="1.8"/><rect class="td-ui-fill" x="35.8" y="-60.6" width=".7" height="1.4"/>`,
    ...[0, 1, 2, 3].map((i) => `<rect class="td-bubble" data-bubble="${i}" x="0" y="0" width="0" height="0" rx="1.2"/><text class="td-msg" data-line="${i}" x="0" y="${-46.4 + i * 8.6}" font-size="3.9"></text>`),
    `<path class="td-bar" d="M${GLASS.x} -13.4H${GLASS.x + GLASS.w}"/>`,
    `<text class="td-in" data-part="input" x="-37.6" y="-7.4" font-size="3.9">&gt; </text>`,
    `<rect class="td-cursor" data-part="cursor" x="-33" y="-10.8" width="2" height="4"/>`,
  ].join("");

  return [
    `<clipPath id="${id}"><path transform="${topAt(TOP)}" d="${shape}"/></clipPath>`,
    `<clipPath id="${gid}"><path d="${shape}"/></clipPath>`,
    `<g clip-path="url(#${id})">`,
    ...walls.map((d, shade) => (d.length ? `<path class="iso-shade" data-shade="${shade}" d="${d.join("")}"/>` : "")),
    `<g transform="${topAt(GLASS_Z)}"><g clip-path="url(#${gid})">${ui}</g><path class="iso-line" data-tone="faint" d="${shape}"/></g>`,
    `</g>`,
    `<g transform="${topAt(TOP)}"><path class="iso-line" data-tone="lo" d="${shape}"/></g>`,
  ].join("");
}

function controls() {
  const out = [];
  const [bx, by] = BALL;
  // Decorative rings and chevrons pressed into the face, as on the real device.
  out.push(L(k.ring(bx, by, 13.6, TOP, P, 56) + k.ring(bx, by, 11.2, TOP, P, 56), { tone: "faint" }));
  const chevron = (x0, dir) => [0, 1, 2].map((i) => {
    const x = x0 + dir * i * 6;
    return k.onTop([[x, by - 4], [x + dir * 3, by - 4], [x + dir * 6.6, by], [x + dir * 3, by + 4], [x, by + 4], [x + dir * 3.6, by]], TOP, P, true);
  }).join("");
  out.push(L(chevron(-36, 1) + chevron(36, -1), { tone: "faint" }));
  // Trackball: a bezel ring, a seat, and the ball proud of it.
  out.push(S(k.cylinder(bx, by, 6.6, TOP, 0.7, P, 40, 0.4), { tone: "lo", crease: "none" }));
  out.push(L(k.ring(bx, by, 5.2, TOP + 0.7, P, 40), { tone: "faint" }));
  out.push(S(G.sphereOf([bx, by, TOP + 1.2], 4.4, P), { tone: "lo" }));
  // Mic port and three indicator holes down the left edge.
  out.push(L(k.ring(-46.5, -1, 1.9, TOP, P, 24), { tone: "mid" }));
  out.push(D([at([-46.5, -1, TOP])], { size: 0.6, tone: "mid" }));
  out.push(L([6.5, 10.5, 14.5].map((y) => k.ring(-47.6, y, 1, TOP, P, 16)).join(""), { tone: "lo" }));
  return out.join("");
}

const keyList = [];
function keyCap(code, plan, glyph) {
  const index = keyList.length;
  keyList.push(code);
  const cx = plan.x + plan.w / 2;
  const cy = plan.y + plan.d / 2;
  const dish = k.planOutline(k.insetPlan(plan, 1.2), TOP + KEY_H, P, 3);
  const text = glyph
    ? `<text class="td-cap" transform="${k.topMatrix([cx, cy], TOP + KEY_H, P, "x")}" x="0" y="${glyph.length > 1 ? 1.1 : 1.35}" font-size="${glyph.length > 1 ? 2.8 : 3.8}" text-anchor="middle">${glyph}</text>`
    : "";
  return `<g class="td-key" data-key="${index}">${S(k.slabOf(plan, TOP, KEY_H, P, 3, 0.4), { tone: "mid", crease: "faint", inner: L(dish, { tone: "faint" }) })}${text}</g>`;
}

function keyboard() {
  const out = [];
  const x0 = -PITCH * 5;
  FRETS.forEach((y, r) => {
    out.push(S(k.slabOf({ x: -47, y, w: 94, d: 1.6, r: 0.8 }, TOP, 0.8, P, 3), { tone: "hi", crease: "none" }));
    if (r < 3) {
      ROWS[r].forEach((code, i) => {
        const plan = { x: x0 + i * PITCH + 0.4, y: ROW_Y[r], w: PITCH - 0.8, d: ROW_D[r], r: 1.6 };
        out.push(keyCap(code, plan, GLYPH[code] ?? code.toUpperCase()));
      });
    } else {
      // Bottom row: two thumb keys a side and the space bar between them.
      const plans = [
        ["ShiftL", x0 + 0.4, PITCH - 0.8],
        ["mic", x0 + PITCH + 0.4, PITCH - 0.8],
        [" ", x0 + PITCH * 2 + 0.4, PITCH * 6 - 0.8],
        ["sym", x0 + PITCH * 8 + 0.4, PITCH - 0.8],
        ["ShiftR", x0 + PITCH * 9 + 0.4, PITCH - 0.8],
      ];
      for (const [code, x, w] of plans) {
        const plan = { x, y: ROW_Y[3], w, d: ROW_D[3], r: 1.6 };
        out.push(keyCap(code, plan, ""));
        if (code === " ") out.push(L(k.onTop([[-5, ROW_Y[3] + 4.2], [-5, ROW_Y[3] + 5.4], [5, ROW_Y[3] + 5.4], [5, ROW_Y[3] + 4.2]], TOP + KEY_H, P), { tone: "mid", free: true }));
      }
    }
  });
  return out.join("");
}

function device() {
  const out = [`<path class="iso-halo" d="${k.haloOf(DEV, 0, 10, P)}"/>`];
  for (const [x, y] of byDepth(k.corners(DEV, 14))) out.push(S(k.cylinder(x, y, 4.2, 0, FEET_H, P, 20), { tone: "lo" }));
  const seam = L(k.sideSeam(DEV, SEAM, P, 8), { tone: "lo" });
  out.push(S(k.slabOf(DEV, FEET_H, TOP - FEET_H, P, 8, 1.2), { tone: "mid", inner: seam }));
  out.push(L(k.planOutline(k.insetPlan(DEV, 3), TOP, P, 8), { tone: "faint" }));
  // Earpiece slot, the engraved maker's mark, and the TX LED beside the slot.
  const slot = { x: -15, y: -80.6, w: 30, d: 2.8, r: 1.4 };
  out.push(L(k.planOutline(slot, TOP, P, 4), { tone: "lo" }) + L(k.planOutline(k.insetPlan(slot, 0.7), TOP, P, 4), { tone: "faint" }));
  out.push(L(k.ring(22, -79.2, 1.3, TOP, P, 16), { tone: "lo" }));
  out.push(`<g data-part="led" class="td-led">${D([at([22, -79.2, TOP])], { size: 0.9, tone: "hi" })}</g>`);
  out.push(L(k.planOutline(BEZEL, TOP, P, 6), { tone: "faint" }));
  out.push(screen());
  out.push(controls());
  out.push(keyboard());
  out.push(sideParts());
  return `<g class="td-device">${out.join("")}</g>`;
}

function sideParts() {
  const out = [];
  // Near (bottom) face: USB-C receptacle and a speaker grille of closed slots.
  out.push(`<g transform="${sidePlane(NEAR)}">`);
  out.push(`<path class="td-port" d="${flatPlan({ x: -5, y: -14, w: 10, d: 3.6, r: 1.8 })}"/>`);
  out.push(L(flatPlan({ x: -5, y: -14, w: 10, d: 3.6, r: 1.8 }), { tone: "mid" }));
  out.push(L(flatPlan({ x: -3, y: -12.8, w: 6, d: 1.2, r: 0.6 }, 4), { tone: "lo" }));
  out.push(L(Array.from({ length: 6 }, (_, i) => flatPlan({ x: 14 + i * 3, y: -17.4, w: 1.4, d: 8, r: 0.7 }, 4)).join(""), { tone: "lo" }));
  out.push(`</g>`);
  // Right face: power slide switch, boot button, microSD slot.
  out.push(`<g transform="${rightPlane(RIGHT)}">`);
  out.push(`<path class="td-port" d="${flatPlan({ x: -20, y: -13, w: 12, d: 4, r: 1.2 })}"/>`);
  out.push(L(flatPlan({ x: -20, y: -13, w: 12, d: 4, r: 1.2 }), { tone: "mid" }));
  out.push(L(flatPlan({ x: -48, y: -9.8, w: 18, d: 1.6, r: 0.8 }, 4), { tone: "lo" }));
  out.push(L(flatPlan({ x: -4, y: -12.4, w: 2.8, d: 2.8, r: 1.4 }, 6), { tone: "lo" }));
  out.push(`</g>`);
  out.push(S(k.slabOf({ x: RIGHT, y: 10.6, w: 1.6, d: 3.2, r: 0.6 }, 10, 3.2, P, 2), { tone: "hi" }));
  out.push(S(k.cylinder(RIGHT + 0.5, 5.6, 1.2, 11.4, 1, P, 14), { tone: "mid" }));
  return out.join("");
}

function antenna() {
  const out = [];
  const F = G.frameAlong([SMA.x, FAR, SMA.z], [0, -1, 0]);
  const hex = Array.from({ length: 6 }, (_, i) => [Math.cos((i * Math.PI) / 3 + Math.PI / 6) * 4.8, Math.sin((i * Math.PI) / 3 + Math.PI / 6) * 4.8]);
  out.push(S(G.prismOf(F, hex, 0, 2.2, P), { tone: "mid" }));
  const threads = [2.9, 3.6, 4.3].map((s) => G.arcOf(F, s, 3.2, P)).join("");
  out.push(S(G.disc(2.2, 5, 3.2, F, P), { tone: "mid", inner: L(threads, { tone: "faint" }) }));
  const knurl = G.ribsOf(F, 5, 11.5, 4.3, 30, P, { fade: [0.08, 0.5], seams: true });
  out.push(S(G.disc(5, 11.5, 4.3, F, P), { tone: "hi", inner: k.fadedSvg(knurl, { tone: "lo" }) }));
  // The whip: a ferrule on the coupling, a ribbed rubber grip, a long straight taper, a domed tip.
  const W = G.frameAlong([SMA.x, FAR - WHIP_FROM, SMA.z], [0, -1, 0]);
  out.push(S(G.disc(0, 6, 4, W, P), { tone: "mid", inner: L(G.arcOf(W, 3, 4, P), { tone: "faint" }) }));
  const len = WHIP_LEN;
  const profile = [[6, 3.9], [20, 3.9], [24, 3.4, 1], [len - 6, 2.6], [len - 3, 2.4, 1], [len - 1.2, 1.7, 1], [len, 0, 1]];
  const grip = [9, 11.5, 14, 16.5].map((s) => G.arcOf(W, s, 3.9, P)).join("");
  const bands = [len * 0.55, len * 0.55 + 2].map((s) => G.arcOf(W, s, 3.4 - (0.8 * (s - 24)) / (len - 30), P, { slope: -0.8 / (len - 30) })).join("");
  out.push(`<g data-part="whip">${S(G.solidOf(profile, W, P), { tone: "hi", inner: L(grip, { tone: "lo" }) + L(bands, { tone: "faint" }) })}</g>`);
  // The whip points away from the viewer, so the parts nearest the device paint last.
  return out.reverse().join("");
}

export function deviceScene(strings) {
  STR = strings;
  keyList.length = 0;
  clips = 0;
  const svg = k.figureSvg({
    width: WIDTH,
    height: HEIGHT,
    label: STR.deviceLabel,
    body: [`<g data-part="waves-back"></g>`, antenna(), `<g data-part="waves-front"></g>`, device()],
  });
  return { svg, P, keys: [...keyList], wave: { at: WAVE_AT, r: WAVE_R, tip: [SMA.x, FAR - WHIP_FROM - WHIP_LEN, SMA.z] } };
}
