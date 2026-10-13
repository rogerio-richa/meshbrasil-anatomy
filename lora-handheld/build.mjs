// Builds the standalone pages: three scenes (the handheld, the LoRa waterfall, the suburb) in one card.
//   node build.mjs                 all four pages (en/pt-BR x dark/light)
//   node build.mjs --lang pt --light   one page
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../kit/iso-kit.mjs";
import { kitScript } from "../kit/inline-kit.mjs";
import { PRESET } from "./model.mjs";
import { WIDTH, HEIGHT } from "./scenes/layout.mjs";
import { deviceScene } from "./scenes/device.mjs";
import { waterfallScene } from "./scenes/waterfall.mjs";
import { suburbScene, HOP_LIMIT, RANGE } from "./scenes/suburb.mjs";
import { STRINGS } from "./strings.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SYNC_WORD = 0x2b; // Meshtastic's LoRa sync word
const CLIENT = ["client/device.js", "client/waterfall.js", "client/suburb.js"]; // order matters: later files use earlier ones
const read = (file) => readFileSync(join(HERE, file), "utf8");
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const fmt = (s, v) => s.replace(/\{(\w+)\}/g, (_, key) => v[key]);

const fileName = (lang, theme) => `lora-handheld${lang === "en" ? "" : "-" + lang}${theme === "light" ? "-light" : ""}.html`;

function footer(lang, theme) {
  const s = STRINGS[lang];
  const links = Object.keys(STRINGS)
    .map((other) => other === lang
      ? `<a aria-current="true" lang="${STRINGS[other].htmlLang}">${STRINGS[other].langName}</a>`
      : `<a href="${fileName(other, theme)}" hreflang="${STRINGS[other].htmlLang}" lang="${STRINGS[other].htmlLang}">${STRINGS[other].langName}</a>`)
    .join("<span>·</span>");
  return `<div class="td-foot"><nav class="td-lang" aria-label="${esc(s.langSwitch)}">${links}</nav><p class="td-copy">&copy; ${esc(s.copyright)} - <a href="https://www.meshbrasil.com">meshbrasil.com</a></p></div>`;
}

function page(lang, theme) {
  const s = STRINGS[lang];
  const device = deviceScene(s);
  const waterfall = waterfallScene(s);
  const suburb = suburbScene({ width: WIDTH, height: HEIGHT, label: s.suburbLabel, personLabel: s.personLabel });

  // Everything the browser code needs from the build, in one object.
  const data = {
    device: { P: device.P, keys: device.keys, wave: device.wave },
    syncWord: SYNC_WORD,
    waterfall: { SPAN: waterfall.SPAN, PLANE: waterfall.PLANE, HEAT: waterfall.HEAT, STAGE: waterfall.STAGE },
    suburb: { P: suburb.P, nodes: suburb.nodes, links: suburb.links, hopLimit: HOP_LIMIT, range: RANGE },
  };
  const prelude = [
    `const DATA = ${JSON.stringify(data)};`,
    `const STR = ${JSON.stringify(s)};`,
    read("model.mjs").replace(/^export /gm, ""),
    `const fmt = (s, v) => s.replace(/\\{(\\w+)\\}/g, (_, key) => v[key]);`,
  ].join("\n");
  const script = kitScript() + "\n" + prelude + "\n" + CLIENT.map(read).join("\n");

  const stage =
    `<div class="iso-stage" tabindex="0" role="group" aria-label="${esc(s.stageLabel)}">` +
    `<button class="td-btn" data-action="ride" type="button">${esc(s.ride)}</button>` +
    `<button class="td-btn" data-action="back" type="button">${esc(s.back)}</button>` +
    `<button class="td-btn" data-action="work" type="button">${esc(s.work)}</button>` +
    `<button class="td-btn" data-action="back-waves" type="button">${esc(s.backWaves)}</button>` +
    `<div class="td-scenes" data-scene="device">` +
    `<div class="td-scene" data-scene-name="device">${device.svg}</div>` +
    `<div class="td-scene" data-scene-name="chirp">${waterfall.html}</div>` +
    `<div class="td-scene" data-scene-name="city">${suburb.svg}</div>` +
    `</div>` +
    `<span class="td-sr" role="status" aria-live="polite" data-status></span></div>`;
  const body =
    `<style>\n${read("style.css")}</style>` +
    k
      .plateHtml({ fig: s.fig, title: s.titleDevice, hint: s.hintDevice, readout: fmt(s.readyLine, { mhz: PRESET.mhz, name: PRESET.name }), body: stage })
      .replace(/<\/figure>$/, `${footer(lang, theme)}</figure>`);
  // The top-left corner shows the M-Powered logo (assets/m-powered.svg, kept as its own file), linked to meshtastic.org.
  const logo = `<a class="td-logo" href="https://meshtastic.org" title="${esc(s.logoTitle)}"><img src="assets/m-powered.svg" alt="${esc(s.logoAlt)}" width="27" height="26"></a>`;
  const corner = `data-corner="fig">${esc(s.fig)}</span>`;
  if (!body.includes(corner)) throw new Error("fig corner not found");
  return k
    .pageHtml({ title: s.pageTitle, theme, body: body.replace(corner, `data-corner="fig">${logo}</span>`), script })
    .replace('<html lang="en">', `<html lang="${s.htmlLang}">`);
}

const arg = (name) => { const i = process.argv.indexOf(name); return i < 0 ? null : process.argv[i + 1]; };
const langs = arg("--lang") ? [arg("--lang")] : Object.keys(STRINGS);
const themes = process.argv.includes("--light") ? ["light"] : arg("--lang") ? ["dark"] : ["dark", "light"];
for (const lang of langs) {
  for (const theme of themes) {
    const name = fileName(lang, theme);
    writeFileSync(join(HERE, name), page(lang, theme));
    console.log("wrote", name);
  }
}
