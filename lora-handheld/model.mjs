// LoRa time on air for a Meshtastic text packet (Semtech AN1200.13), shared by the build and the page.
// build.mjs inlines this file into the page with its exports stripped, so keep it self-contained.
// Region ANZ (used in Brazil): 915-928 MHz, the LongFast slot sits at 919.875 MHz.
export const PRESET = { name: "LongFast", sf: 11, bw: 250e3, cr: 1, preamble: 16, mhz: 919.875 };
export const HEADER_BYTES = 16; // Meshtastic over-the-air header (dest, from, id, flags, channel hash, ...)
export const MAX_TEXT = 200; // bytes of text Meshtastic allows in one message

export const bytesOf = (text) => new TextEncoder().encode(text).length;
const varintBytes = (n) => (n < 128 ? 1 : n < 16384 ? 2 : 3);
// The packet: header + the protobuf Data message (portnum field 2 bytes, payload tag + length + text, bitfield 2 bytes).
export const packetBytes = (text) => {
  const n = bytesOf(text);
  return HEADER_BYTES + 2 + 1 + varintBytes(n) + n + 2;
};

export const symbolMs = ({ sf, bw } = PRESET) => (2 ** sf / bw) * 1000;
// Payload symbols, explicit header, CRC on; low-data-rate optimisation when a symbol is longer than 16 ms.
export function payloadSymbols(payload, preset = PRESET) {
  const { sf, cr } = preset, ldro = symbolMs(preset) > 16 ? 1 : 0;
  return 8 + Math.max(Math.ceil((8 * payload - 4 * sf + 28 + 16) / (4 * (sf - 2 * ldro))) * (cr + 4), 0);
}
// Preamble, then 4.25 symbols of sync word and down-chirps, then the payload.
export function airtimeMs(payload, preset = PRESET) {
  return (preset.preamble + 4.25 + payloadSymbols(payload, preset)) * symbolMs(preset);
}
