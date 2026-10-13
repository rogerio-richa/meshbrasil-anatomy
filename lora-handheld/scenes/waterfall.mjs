// Scene 2: the LoRa waterfall. Static parts only; client/waterfall.js draws the chirps.
import { PRESET } from "../model.mjs";
import { WIDTH, HEIGHT } from "./layout.mjs";

let STR = {};

// The waterfall: a plane of frequency x time, turned 90 degrees and tipped back 30 degrees in perspective.
// On the plane (local px): x is frequency, high at the left, y is time, newest at the top. After the
// turn, time runs left to right across the screen and frequency rises toward the far edge.
const BW_KHZ = PRESET.bw / 1000;
const HEAT = { cols: 160, rows: 300 }; // spectrogram cells: ~1.6 kHz x ~0.27 ms each
const STAGE = { w: WIDTH, h: HEIGHT };
// A parallel projection (no vanishing point), like the device drawing: opposite edges stay parallel.
const PLANE = { w: 300, h: 410, cx: 322, cy: 262, tilt: 56, turn: 122, persp: 1e6 };
// The frequency axis spans the 250 kHz LongFast channel plus 60 kHz of empty spectrum either side.
const GUARD_KHZ = 60;
const SPAN = (BW_KHZ + 2 * GUARD_KHZ) / BW_KHZ;
function chirpPlane() {
  const { w, h, cx, cy, tilt, turn, persp } = PLANE;
  const grid = [];
  const step = 25 / (BW_KHZ * SPAN); // 25 kHz as a fraction of the axis
  for (let i = -7; i <= 7; i++) { const u = 0.5 + i * step; if (u > 0.001 && u < 0.999) grid.push(`M${(w * u).toFixed(1)} 0V${h}`); }
  const onPlane = [
    `<svg class="cp-onplane" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">`,
    `<path class="cp-grid" d="${grid.join("")}"/>`,
    `<g data-part="time-grid"></g>`,
    `<path class="cp-glow" data-part="trace-glow" d=""/><path class="cp-trace" data-part="trace" d=""/><circle class="cp-head" data-part="head" r="2.6" cx="-10" cy="-10"/>`,
    `<path class="cp-rule" data-part="phase-ticks" d=""/>`,
    `<rect class="cp-axis" x="0" y="0" width="${w}" height="${h}"/>`,
    // Time runs along the low-frequency edge toward the newest row; frequency along the oldest edge toward high.
    `<path class="cp-arrow" d="M${w} ${h}V-12M${w} ${h}H-12"/>`,
    `<path class="cp-arrowhead" d="M${w} -22L${w - 4.5} -11L${w + 4.5} -11ZM-22 ${h}L-11 ${h - 4.5}L-11 ${h + 4.5}Z"/>`,
    `</svg>`,
  ].join("");
  const plane = `<div class="cp-plane" style="left:${cx - w / 2}px;top:${cy - h / 2}px;width:${w}px;height:${h}px;transform:perspective(${persp}px) rotateX(${tilt}deg) rotateZ(${turn}deg)"><canvas data-part="heat" width="${HEAT.cols}" height="${HEAT.rows}"></canvas>${onPlane}</div>`;
  const labels = [
    `<svg class="cp-labels" viewBox="0 0 ${STAGE.w} ${STAGE.h}" width="${STAGE.w}" height="${STAGE.h}">`,
    `<text class="cp-caption" data-part="packet" x="40" y="34"></text>`,
    // Right-aligned switch; the mono face is ~6.4 units per character at this size, so "lines" sits clear of "heat map" in any language.
    `<text class="cp-mode" data-mode="lines" tabindex="0" role="button" aria-pressed="false" x="${STAGE.w - 40 - STR.modeHeat.length * 6.4 - 18}" y="34" text-anchor="end">${STR.modeLines}</text><text class="cp-mode" data-mode="heat" tabindex="0" role="button" aria-pressed="false" x="${STAGE.w - 40}" y="34" text-anchor="end">${STR.modeHeat}</text>`,
    `<g data-part="labels"></g>`,
    `</svg>`,
  ].join("");
  return `<div class="cp-fit" role="img" aria-label="${STR.waterfallLabel}"><div class="cp-stage">${plane}${labels}</div></div>`;
}

export function waterfallScene(strings) {
  STR = strings;
  return { html: chirpPlane(), PLANE, HEAT, SPAN, STAGE };
}
