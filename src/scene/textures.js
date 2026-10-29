import * as THREE from 'three';

let maxAnisotropy = 8;
export function setMaxAnisotropy(n) {
  maxAnisotropy = n;
}

export function canvasTexture(canvas, { repeat = null, srgb = true } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = maxAnisotropy;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  return t;
}

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

export const FONT = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

/**
 * Department name lettered into the carpet: transparent canvas with spaced capitals,
 * a few shades off the carpet color so it reads clearly without glaring.
 */
export function carpetLettering(text, { widthM, heightM, color, pxPerM = 140 }) {
  const w = Math.min(4096, Math.round(widthM * pxPerM));
  const h = Math.round((w / widthM) * heightM);
  const c = makeCanvas(w, h);
  const g = c.getContext('2d');
  g.clearRect(0, 0, w, h);
  g.fillStyle = color;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  let size = h * 0.62;
  const spacing = 0.14;
  const measure = () => {
    g.font = `700 ${size}px ${FONT}`;
    return [...text].reduce((acc, ch) => acc + g.measureText(ch).width, 0) + size * spacing * (text.length - 1);
  };
  while (measure() > w * 0.92) size *= 0.95;
  const total = measure();
  let x = (w - total) / 2;
  for (const ch of text) {
    const cw = g.measureText(ch).width;
    g.fillText(ch, x + cw / 2, h / 2 + size * 0.04);
    x += cw + size * spacing;
  }
  return canvasTexture(c);
}

export function woodPlanks({ base = '#9a7a5c', w = 1024, h = 1024, planks = 8 } = {}) {
  const c = makeCanvas(w, h);
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, w, h);
  const ph = h / planks;
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < planks; i++) {
    const shade = (rnd() - 0.5) * 18;
    g.fillStyle = `rgba(${shade > 0 ? 255 : 0},${shade > 0 ? 240 : 0},${shade > 0 ? 220 : 0},${Math.abs(shade) / 255})`;
    g.fillRect(0, i * ph, w, ph);
    g.fillStyle = 'rgba(40,28,18,0.35)';
    g.fillRect(0, i * ph, w, 3);
    const off = rnd() * w;
    g.fillRect(off, i * ph, 3, ph);
    g.fillRect((off + w / 2) % w, i * ph, 3, ph);
    g.strokeStyle = 'rgba(60,40,25,0.07)';
    for (let k = 0; k < 6; k++) {
      g.beginPath();
      const y = i * ph + rnd() * ph;
      g.moveTo(0, y);
      g.bezierCurveTo(w * 0.3, y + 4, w * 0.6, y - 4, w, y + 2);
      g.stroke();
    }
  }
  return c;
}

export function facadeCanvas({ base = '#7d8a99', windowColor = '#4d5b6b', litColor = '#c9b98f', w = 512, h = 512, cols = 8, rows = 8, lit = 0.12, seed = 3 } = {}) {
  const c = makeCanvas(w, h);
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, w, h);
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const cw = w / cols;
  const rh = h / rows;
  for (let r = 0; r < rows; r++) {
    for (let k = 0; k < cols; k++) {
      g.fillStyle = rnd() < lit ? litColor : windowColor;
      g.fillRect(k * cw + cw * 0.14, r * rh + rh * 0.18, cw * 0.72, rh * 0.6);
    }
  }
  return c;
}
