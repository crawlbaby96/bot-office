import * as THREE from 'three';
import { canvasTexture, FONT, makeCanvas } from './textures.js';

const W = 3072;
const PAD = 100;
const VALUE_X = 1000;
const TOP_H = 590;
const ROW_H = 268;

const STATUS_COLOR = { ok: '#d4dde6', stale: '#cfae6a', pending: '#8193a5', not_connected: '#8193a5' };

/** Draws `text` at (x, y), shrinking the font until it fits in maxW. */
function fitText(g, text, x, y, maxW, weight, size) {
  let s = size;
  g.font = `${weight} ${s}px ${FONT}`;
  while (s > 20 && g.measureText(text).width > maxW) {
    s -= 2;
    g.font = `${weight} ${s}px ${FONT}`;
  }
  g.fillText(text, x, y);
}

/**
 * Wall board with one row per usage source: Grok Bot's pushed weekly reading on top (percent left, reset, as-of),
 * then one row per AI provider. Rows come from `usageRows()`, so the board only ever shows real readings, or
 * "No reading yet" / "Not connected" / "Stale since".
 */
export function usageBoard({ width, height }) {
  const H = Math.round((W * height) / width);
  const canvas = makeCanvas(W, H);
  const g = canvas.getContext('2d');
  const tex = canvasTexture(canvas);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map: tex, color: '#d9dee3', toneMapped: false }));
  let lastKey = null;

  function drawGrok(row) {
    g.fillStyle = '#9fb2c5';
    g.font = `600 64px ${FONT}`;
    g.fillText('GROK BOT  ·  WEEKLY USAGE LEFT', PAD, 130);
    if (row.percentLeft == null) {
      g.fillStyle = '#8193a5';
      g.font = `500 150px ${FONT}`;
      g.fillText(row.primary, PAD, 360);
      g.font = `400 56px ${FONT}`;
      g.fillStyle = '#6f8091';
      g.fillText(row.secondary, PAD, 480);
      return;
    }
    const pct = row.percentLeft;
    const tone = pct <= 15 ? '#c9796f' : pct <= 35 ? '#cfae6a' : '#8fbf95';
    g.fillStyle = tone;
    g.font = `700 280px ${FONT}`;
    g.fillText(`${pct % 1 === 0 ? pct.toFixed(0) : pct.toFixed(1)}%`, PAD - 10, 450);
    const bw = W - VALUE_X - PAD;
    g.fillStyle = '#26313d';
    g.fillRect(VALUE_X, 215, bw, 64);
    g.fillStyle = tone;
    g.fillRect(VALUE_X, 215, (bw * pct) / 100, 64);
    g.fillStyle = '#b8c6d3';
    fitText(g, row.secondary, VALUE_X, 385, bw, 500, 68);
    g.fillStyle = '#7f91a3';
    fitText(g, row.asOf, VALUE_X, 480, bw * 0.6, 400, 54);
    if (row.usedOfLimit) {
      g.font = `400 54px ${FONT}`;
      g.fillText(row.usedOfLimit, W - PAD - g.measureText(row.usedOfLimit).width, 480);
    }
  }

  function drawProvider(row, y0) {
    g.fillStyle = '#c3cfda';
    fitText(g, row.label, PAD, y0 + 100, VALUE_X - PAD - 60, 600, 66);
    g.fillStyle = '#76889a';
    fitText(g, row.sub, PAD, y0 + 168, VALUE_X - PAD - 60, 400, 44);

    const maxW = W - VALUE_X - PAD;
    g.fillStyle = STATUS_COLOR[row.status] ?? STATUS_COLOR.pending;
    fitText(g, row.primary, VALUE_X, y0 + 100, maxW, row.status === 'not_connected' ? 500 : 650, 72);
    g.fillStyle = '#8fa0b1';
    fitText(g, row.secondary, VALUE_X, y0 + 168, maxW, 400, 46);
    if (row.asOf) {
      g.fillStyle = row.status === 'stale' ? '#cfae6a' : '#6f8193';
      fitText(g, row.asOf, VALUE_X, y0 + 230, maxW, 400, 42);
    }
  }

  function draw(rows) {
    g.fillStyle = '#18202a';
    g.fillRect(0, 0, W, H);
    g.strokeStyle = '#2f3b48';
    g.lineWidth = 12;
    g.strokeRect(6, 6, W - 12, H - 12);
    g.textBaseline = 'alphabetic';
    drawGrok(rows[0]);
    rows.slice(1).forEach((row, i) => {
      const y0 = TOP_H + i * ROW_H;
      g.fillStyle = '#26313d';
      g.fillRect(PAD, y0, W - PAD * 2, 4);
      drawProvider(row, y0);
    });
    tex.needsUpdate = true;
  }

  return {
    mesh,
    set(rows) {
      const key = JSON.stringify(rows);
      if (key === lastKey) return;
      lastKey = key;
      draw(rows);
    },
  };
}
