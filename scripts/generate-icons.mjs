import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type);
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function inTriangle(px, py, p0, p1, p2) {
  const dX = px - p2[0];
  const dY = py - p2[1];
  const dX21 = p2[0] - p1[0];
  const dY12 = p1[1] - p2[1];
  const D = dY12 * (p0[0] - p2[0]) + dX21 * (p0[1] - p2[1]);
  const s = dY12 * dX + dX21 * dY;
  const t = (p2[1] - p0[1]) * dX + (p0[0] - p2[0]) * dY;
  if (D < 0) return s <= 0 && t <= 0 && s + t >= D;
  return s >= 0 && t >= 0 && s + t <= D;
}

function generatePng(size) {
  const W = size;
  const H = size;
  const rowSize = 1 + W * 4;
  const raw = Buffer.alloc(rowSize * H);

  // Upper & lower triangles forming the lightning bolt
  const t1_0 = [0.08, -0.42], t1_1 = [-0.22, 0.04], t1_2 = [0.06, 0.04];
  const t2_0 = [0.04, -0.04], t2_1 = [-0.14, 0.44], t2_2 = [0.24, -0.04];

  for (let y = 0; y < H; y++) {
    const rowOffset = y * rowSize;
    raw[rowOffset] = 0; // PNG filter: None

    for (let x = 0; x < W; x++) {
      const pxOffset = rowOffset + 1 + x * 4;
      const nx = (x - W / 2) / (W / 2);
      const ny = (y - H / 2) / (H / 2);
      const dist = Math.sqrt(nx * nx + ny * ny);

      // Background: Dark Slate #0f172a
      let r = 15, g = 23, b = 42, a = 255;

      // Outer Rounded Box
      const cornerDist = Math.max(Math.abs(nx), Math.abs(ny));
      if (cornerDist > 0.96) {
        a = 0; // Transparent edges
      } else if (cornerDist > 0.92) {
        r = 247; g = 147; b = 26; // BTC Gold border
      }

      // Center Circle Shield
      if (dist < 0.62) {
        r = 20; g = 28; b = 48;
      }
      if (dist >= 0.59 && dist <= 0.62) {
        r = 247; g = 147; b = 26;
      }

      // Soundwave bars (Left & Right)
      const absNx = Math.abs(nx);
      if (absNx >= 0.70 && absNx <= 0.74 && Math.abs(ny) < 0.35) {
        r = 251; g = 191; b = 36;
      }
      if (absNx >= 0.80 && absNx <= 0.84 && Math.abs(ny) < 0.22) {
        r = 247; g = 147; b = 26;
      }

      // Lightning Bolt
      if (inTriangle(nx, ny, t1_0, t1_1, t1_2) || inTriangle(nx, ny, t2_0, t2_1, t2_2)) {
        r = 251; g = 191; b = 36; // Amber Gold
      }

      raw[pxOffset] = r;
      raw[pxOffset + 1] = g;
      raw[pxOffset + 2] = b;
      raw[pxOffset + 3] = a;
    }
  }

  const compressed = zlib.deflateSync(raw);
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(W, 0);
  ihdrData.writeUInt32BE(H, 4);
  ihdrData[8] = 8;
  ihdrData[9] = 6; // RGBA
  ihdrData[10] = 0;
  ihdrData[11] = 0;
  ihdrData[12] = 0;

  return Buffer.concat([
    signature,
    createChunk('IHDR', ihdrData),
    createChunk('IDAT', compressed),
    createChunk('IEND', Buffer.alloc(0))
  ]);
}

const publicDir = path.resolve(process.cwd(), 'public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// Generate 192x192 & 512x512
fs.writeFileSync(path.join(publicDir, 'icon-192.png'), generatePng(192));
fs.writeFileSync(path.join(publicDir, 'icon-512.png'), generatePng(512));

console.log('Successfully created public/icon-192.png and public/icon-512.png');