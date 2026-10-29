import * as THREE from 'three';
import { canvasTexture, FONT, makeCanvas } from './textures.js';
import { formatDateTime } from '../format.js';

const W = 2048;
const H = 1024;

/** Wall counter for weekly usage. Shows "No reading yet" until a real reading has been pushed. */
export function usageBoard({ width, height }) {
  const canvas = makeCanvas(W, H);
  const g = canvas.getContext('2d');
  const tex = canvasTexture(canvas);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map: tex, color: '#d9dee3', toneMapped: false }));
  let lastKey = null;

  function draw(usage) {
    g.fillStyle = '#18202a';
    g.fillRect(0, 0, W, H);
    g.strokeStyle = '#2f3b48';
    g.lineWidth = 12;
    g.strokeRect(6, 6, W - 12, H - 12);
    g.textBaseline = 'alphabetic';
    g.fillStyle = '#9fb2c5';
    g.font = `600 84px ${FONT}`;
    g.fillText('WEEKLY USAGE LEFT', 110, 190);

    if (!usage) {
      g.fillStyle = '#8193a5';
      g.font = `500 150px ${FONT}`;
      g.fillText('No reading yet', 110, 560);
      g.font = `400 64px ${FONT}`;
      g.fillStyle = '#6f8091';
      g.fillText('Waiting for the first usage reading to be pushed.', 110, 720);
      tex.needsUpdate = true;
      return;
    }

    const pct = Math.max(0, Math.min(100, usage.percentLeft));
    const tone = pct <= 15 ? '#c9796f' : pct <= 35 ? '#cfae6a' : '#8fbf95';
    g.fillStyle = tone;
    g.font = `700 330px ${FONT}`;
    const label = `${pct % 1 === 0 ? pct.toFixed(0) : pct.toFixed(1)}%`;
    g.fillText(label, 100, 520);

    const bx = 110;
    const by = 600;
    const bw = W - 220;
    const bh = 70;
    g.fillStyle = '#26313d';
    g.fillRect(bx, by, bw, bh);
    g.fillStyle = tone;
    g.fillRect(bx, by, (bw * pct) / 100, bh);

    g.font = `500 72px ${FONT}`;
    g.fillStyle = '#b8c6d3';
    g.fillText(usage.resetsAt ? `Resets ${formatDateTime(usage.resetsAt)}` : 'Reset time not reported', 110, 800);
    g.font = `400 60px ${FONT}`;
    g.fillStyle = '#7f91a3';
    g.fillText(`As of ${formatDateTime(usage.readAt)}`, 110, 900);
    if (usage.used != null && usage.limit != null) {
      const t = `${usage.used} / ${usage.limit} used`;
      g.fillText(t, W - 110 - g.measureText(t).width, 900);
    }
    tex.needsUpdate = true;
  }

  draw(null);
  return {
    mesh,
    set(usage) {
      const key = JSON.stringify(usage ?? null);
      if (key === lastKey) return;
      lastKey = key;
      draw(usage);
    },
  };
}
