// Generates the pixel-pet tray icons as PNG frames — no image assets to ship.
// Output: assets/pet/<skin>/<state>-<frame>.png
// Self-contained PNG encoder (RGBA) using Node's built-in zlib. Run via:
//   npm run generate-assets
const zlib = require("zlib");
const fs = require("fs");
const path = require("path");

// --- minimal PNG encoder ---------------------------------------------------
const CRC_TABLE = (() => {
  const table = new Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePNG(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter byte 0
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// --- pet artwork -----------------------------------------------------------
const SCALE = 2; // 16px logical art -> 32px output (crisp on retina menu bars)
const TRANSPARENT_ROW = ".".repeat(16);

// Each skin is a 16x16 grid. Row index 8 is "EYES" (swapped per frame).
// Body columns and eye positions are kept consistent across skins so the
// eye/expression rows line up everywhere.
const SKINS = {
  cat: [
    "................",
    ".K............K.",
    ".KK..........KK.",
    ".KBK........KBK.",
    ".KBBKKKKKKKKBBK.",
    "..KBBBBBBBBBBK..",
    "..KBBBBBBBBBBK..",
    "..KBBBBBBBBBBK..",
    "EYES",
    "..KBBBBBBBBBBK..",
    "..KBBBBPPBBBBK..",
    "..KBBBBBBBBBBK..",
    "..KBBBBBBBBBBK..",
    "...KBBBBBBBBK...",
    "....KKKKKKKK....",
    "................",
  ],
  blob: [
    "................",
    "................",
    "....KKKKKKKK....",
    "...KBBBBBBBBK...",
    "..KBBBBBBBBBBK..",
    "..KBBBBBBBBBBK..",
    "..KBBBBBBBBBBK..",
    "..KBBBBBBBBBBK..",
    "EYES",
    "..KBBBBBBBBBBK..",
    "..KBBBBPPBBBBK..",
    "..KBBBBBBBBBBK..",
    "...KBBBBBBBBK...",
    "....KKKKKKKK....",
    "................",
    "................",
  ],
  ghost: [
    "................",
    "....KKKKKKKK....",
    "...KBBBBBBBBK...",
    "..KBBBBBBBBBBK..",
    "..KBBBBBBBBBBK..",
    "..KBBBBBBBBBBK..",
    "..KBBBBBBBBBBK..",
    "..KBBBBBBBBBBK..",
    "EYES",
    "..KBBBBBBBBBBK..",
    "..KBBBBBBBBBBK..",
    "..KBBBBBBBBBBK..",
    "..KBBBBBBBBBBK..",
    "..KBKBKBKBKBKBK.",
    "................",
    "................",
  ],
};

// Eye/expression rows (16 chars; eyes sit at columns 4 and 11).
const EYE_ROWS = {
  open: "..KBEBBBBBBEBK..",
  blink: "..KBBBBBBBBBBK..", // closed by matching body — looks blinked
  closed: "..KBKBBBBBBKBK..", // a dark line — sleepy / closed eyes
};

// Color palettes — each maps state → body RGB.
const COLOR_PALETTES = {
  default: {
    idle:      [244, 162, 97],
    work:      [80,  160, 220],
    break:     [60,  180, 140],
    celebrate: [255, 209, 102],
    sleepy:    [120, 130, 160],
  },
  pink: {
    idle:      [255, 182, 200],
    work:      [240, 100, 150],
    break:     [255, 210, 220],
    celebrate: [255, 160, 180],
    sleepy:    [210, 170, 200],
  },
  purple: {
    idle:      [190, 150, 255],
    work:      [130,  80, 240],
    break:     [210, 180, 255],
    celebrate: [230, 210, 255],
    sleepy:    [150, 130, 190],
  },
  mint: {
    idle:      [140, 220, 190],
    work:      [60,  190, 140],
    break:     [190, 240, 220],
    celebrate: [230, 250, 180],
    sleepy:    [140, 180, 160],
  },
  dark: {
    idle:      [90,  100, 120],
    work:      [50,   80, 160],
    break:     [50,  130, 100],
    celebrate: [180, 150,  60],
    sleepy:    [60,   60,  80],
  },
};

// Per-state mood config (eyes + animation). Color comes from palette.
const STATES = {
  idle:      { eyes: "open",   f1: { eyes: "blink" } },
  work:      { eyes: "open",   f1: { eyes: "blink" } },
  break:     { eyes: "open",   f1: { eyes: "blink" } },
  celebrate: { eyes: "open",   f1: { eyes: "open", yOffset: 1, sparkle: true } },
  sleepy:    { eyes: "closed", f1: { eyes: "closed", zzz: true } },
};

const SPARKLE = { color: [255, 240, 150], px: [[1, 3], [14, 3], [2, 1], [13, 1]] };
const ZZZ = { color: [230, 230, 245], px: [[12, 2], [13, 1], [14, 0]] };

function colorFor(ch, body) {
  switch (ch) {
    case "K": return [43, 43, 43, 255]; // outline
    case "E": return [43, 43, 43, 255]; // eyes
    case "P": return [231, 111, 81, 255]; // nose / cheeks
    case "B": return [body[0], body[1], body[2], 255];
    default: return [0, 0, 0, 0]; // transparent
  }
}

function shiftUp(rows, n) {
  if (!n) return rows;
  const shifted = rows.slice(n);
  while (shifted.length < 16) shifted.push(TRANSPARENT_ROW);
  return shifted;
}

function buildFrame(skinGrid, eyesVariant, body, opts = {}) {
  let grid = skinGrid.map((row) => (row === "EYES" ? EYE_ROWS[eyesVariant] : row));
  grid = shiftUp(grid, opts.yOffset || 0);

  const W = 16 * SCALE;
  const H = 16 * SCALE;
  const rgba = Buffer.alloc(W * H * 4);

  const setLogical = (gx, gy, [r, g, b, a]) => {
    for (let sy = 0; sy < SCALE; sy++) {
      for (let sx = 0; sx < SCALE; sx++) {
        const off = ((gy * SCALE + sy) * W + (gx * SCALE + sx)) * 4;
        rgba[off] = r;
        rgba[off + 1] = g;
        rgba[off + 2] = b;
        rgba[off + 3] = a;
      }
    }
  };

  for (let gy = 0; gy < 16; gy++) {
    for (let gx = 0; gx < 16; gx++) {
      setLogical(gx, gy, colorFor(grid[gy][gx], body));
    }
  }

  if (opts.sparkle) for (const [x, y] of SPARKLE.px) setLogical(x, y, [...SPARKLE.color, 255]);
  if (opts.zzz) for (const [x, y] of ZZZ.px) setLogical(x, y, [...ZZZ.color, 255]);

  return encodePNG(W, H, rgba);
}

// --- write files -----------------------------------------------------------
const petDir = path.join(__dirname, "..", "assets", "pet");
let count = 0;

for (const [skin, grid] of Object.entries(SKINS)) {
  for (const [palette, colors] of Object.entries(COLOR_PALETTES)) {
    const dir = path.join(petDir, skin, palette);
    fs.mkdirSync(dir, { recursive: true });
    for (const [state, cfg] of Object.entries(STATES)) {
      const color = colors[state];
      const f0 = buildFrame(grid, cfg.eyes, color, {});
      const f1cfg = cfg.f1 || {};
      const f1 = buildFrame(grid, f1cfg.eyes || cfg.eyes, color, f1cfg);
      fs.writeFileSync(path.join(dir, `${state}-0.png`), f0);
      fs.writeFileSync(path.join(dir, `${state}-1.png`), f1);
      count += 2;
    }
  }
}

console.log(`Generated ${count} frames — ${Object.keys(SKINS).length} skins × ${Object.keys(COLOR_PALETTES).length} palettes in ${petDir}`);
