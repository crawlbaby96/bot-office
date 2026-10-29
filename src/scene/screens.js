import * as THREE from 'three';
import { canvasTexture, FONT, makeCanvas } from './textures.js';

const W = 1024;
const H = 576;
const BG = '#121a22';
const GRID = 'rgba(140,170,200,0.10)';
const INK = '#9fb7cc';

// Rough outline of the contiguous United States as [lon, lat] pairs (decorative only).
const US_OUTLINE = [
  [-124.7, 48.4], [-123.0, 48.9], [-117.0, 49.0], [-104.0, 49.0], [-95.2, 49.0], [-94.8, 49.4], [-89.6, 48.0],
  [-84.8, 46.5], [-82.4, 45.3], [-82.5, 43.0], [-79.1, 43.3], [-76.0, 44.2], [-74.9, 45.0], [-71.5, 45.0],
  [-70.0, 46.7], [-67.8, 47.1], [-67.0, 44.8], [-70.2, 43.7], [-70.6, 42.0], [-71.9, 41.3], [-74.0, 40.6],
  [-74.9, 38.9], [-76.0, 37.0], [-75.5, 35.6], [-77.9, 33.9], [-80.9, 32.0], [-81.4, 30.4], [-80.1, 26.9],
  [-80.4, 25.2], [-81.8, 26.1], [-82.7, 28.0], [-83.0, 29.2], [-84.9, 29.7], [-86.5, 30.4], [-89.6, 30.2],
  [-89.4, 29.0], [-91.5, 29.5], [-94.0, 29.7], [-97.2, 27.8], [-97.4, 26.0], [-99.2, 26.6], [-101.4, 29.8],
  [-103.1, 29.0], [-104.7, 29.9], [-106.5, 31.8], [-108.2, 31.3], [-111.1, 31.3], [-114.8, 32.5], [-117.1, 32.5],
  [-118.6, 34.0], [-120.6, 34.6], [-121.9, 36.6], [-122.5, 37.8], [-123.8, 39.8], [-124.2, 41.9], [-124.1, 43.7],
  [-124.0, 46.2], [-124.7, 48.4],
];
const CITIES = [
  [-122.4, 37.8], [-118.2, 34.1], [-122.3, 47.6], [-104.9, 39.7], [-97.7, 30.3], [-87.6, 41.9],
  [-84.4, 33.7], [-74.0, 40.7], [-71.1, 42.4], [-80.2, 25.8], [-112.1, 33.4], [-93.3, 44.9],
];

function project([lon, lat]) {
  const x = ((lon + 126) / (126 - 65)) * (W - 160) + 80;
  const y = ((50 - lat) / (50 - 24)) * (H - 170) + 110;
  return [x, y];
}

function header(g, title) {
  g.fillStyle = BG;
  g.fillRect(0, 0, W, H);
  g.fillStyle = 'rgba(160,190,215,0.08)';
  g.fillRect(0, 0, W, 64);
  g.fillStyle = INK;
  g.font = `600 30px ${FONT}`;
  g.textBaseline = 'middle';
  g.fillText(title, 32, 33);
}

function drawCharts(g, t) {
  header(g, 'Research · Signals');
  const x0 = 60;
  const y0 = 100;
  const w = 560;
  const h = 400;
  g.strokeStyle = GRID;
  g.lineWidth = 2;
  for (let i = 0; i <= 5; i++) {
    g.beginPath();
    g.moveTo(x0, y0 + (h / 5) * i);
    g.lineTo(x0 + w, y0 + (h / 5) * i);
    g.stroke();
  }
  const series = [
    { color: '#6fa8d6', a: 0.9, f: 0.9, p: 0 },
    { color: '#86b884', a: 0.6, f: 1.4, p: 2 },
  ];
  for (const s of series) {
    g.strokeStyle = s.color;
    g.lineWidth = 4;
    g.beginPath();
    for (let i = 0; i <= 60; i++) {
      const u = i / 60;
      const v = 0.5 + 0.28 * Math.sin(u * 7 * s.f + t * 0.9 + s.p) * s.a + 0.12 * Math.sin(u * 23 + t * 1.7 + s.p);
      const px = x0 + u * w;
      const py = y0 + h - v * h;
      if (i === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    }
    g.stroke();
  }
  const bx = 680;
  for (let i = 0; i < 6; i++) {
    const v = 0.35 + 0.5 * Math.abs(Math.sin(t * 0.7 + i * 1.3));
    g.fillStyle = i % 2 ? '#5d86aa' : '#7aa0c2';
    g.fillRect(bx + i * 48, y0 + h - v * h, 32, v * h);
  }
  g.fillStyle = 'rgba(160,185,205,0.55)';
  g.font = `24px ${FONT}`;
  g.fillText('trend', x0, y0 + h + 34);
  g.fillText('volume', bx, y0 + h + 34);
}

function drawMap(g, t) {
  header(g, 'Research · Coverage map');
  g.beginPath();
  US_OUTLINE.forEach((p, i) => {
    const [x, y] = project(p);
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  });
  g.closePath();
  g.fillStyle = '#1d2d3b';
  g.fill();
  g.strokeStyle = '#6f93b4';
  g.lineWidth = 3;
  g.stroke();
  const hub = project(CITIES[0]);
  CITIES.forEach((c, i) => {
    const [x, y] = project(c);
    if (i > 0) {
      g.strokeStyle = 'rgba(120,170,210,0.22)';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(hub[0], hub[1]);
      g.quadraticCurveTo((hub[0] + x) / 2, Math.min(hub[1], y) - 60, x, y);
      g.stroke();
    }
    const pulse = (Math.sin(t * 2 + i * 0.9) + 1) / 2;
    g.fillStyle = `rgba(130,190,230,${0.18 + 0.25 * pulse})`;
    g.beginPath();
    g.arc(x, y, 10 + pulse * 10, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#a9d0ec';
    g.beginPath();
    g.arc(x, y, 6, 0, Math.PI * 2);
    g.fill();
  });
}

const TERMINAL_LINES = [
  '$ agent run --task summarize',
  'loading context ............ ok',
  'tokens: 4,812  model: ready',
  '> reading source documents',
  '> extracting key points',
  '> drafting summary',
  '> checking against sources',
  'eval: consistency ...... pass',
  '> formatting output',
  'done in 12.4s',
  '$ agent run --task classify',
  '> scoring 128 items',
  'batch 1/4 ............... ok',
  'batch 2/4 ............... ok',
  'batch 3/4 ............... ok',
  'batch 4/4 ............... ok',
  'done in 8.1s',
];

function drawTerminal(g, t) {
  header(g, 'AI terminal');
  g.font = `26px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
  const lineH = 36;
  const visible = 12;
  const charsPerSec = 28;
  const totalChars = TERMINAL_LINES.reduce((a, l) => a + l.length + 6, 0);
  let c = Math.floor((t * charsPerSec) % totalChars);
  const shown = [];
  for (const line of TERMINAL_LINES) {
    if (c <= 0) break;
    shown.push(line.slice(0, Math.min(line.length, c)));
    c -= line.length + 6;
  }
  const start = Math.max(0, shown.length - visible);
  shown.slice(start).forEach((line, i) => {
    g.fillStyle = line.startsWith('$') ? '#9cc7a0' : line.startsWith('>') ? '#a9bfd3' : '#7f97ab';
    g.fillText(line, 36, 106 + i * lineH);
  });
  if (Math.floor(t * 2) % 2 === 0) {
    const last = shown[shown.length - 1] ?? '';
    const w = g.measureText(last).width;
    g.fillStyle = '#a9bfd3';
    g.fillRect(36 + w + 4, 106 + (Math.min(shown.length, visible) - 1) * lineH - 14, 14, 28);
  }
}

const DRAW = { charts: drawCharts, map: drawMap, terminal: drawTerminal };

/** Self-lit animated screen (dim so it never glares). Call update(t) every frame; redraws ~8 times a second. */
export function animatedScreen(kind, width, height) {
  const canvas = makeCanvas(W, H);
  const g = canvas.getContext('2d');
  const tex = canvasTexture(canvas);
  const mat = new THREE.MeshBasicMaterial({ map: tex, color: '#d4dbe2', toneMapped: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), mat);
  let last = -1;
  DRAW[kind](g, 0);
  tex.needsUpdate = true;
  return {
    mesh,
    update(t) {
      const frame = Math.floor(t * 8);
      if (frame === last) return;
      last = frame;
      DRAW[kind](g, t);
      tex.needsUpdate = true;
    },
  };
}
