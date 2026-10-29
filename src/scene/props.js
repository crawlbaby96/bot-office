import * as THREE from 'three';
import { box, boxGeo, cyl, matte, unlit } from './materials.js';

export const COLORS = {
  deskTop: '#b9a58a',
  deskLeg: '#5d6168',
  chair: '#3f454d',
  monitor: '#2a2e34',
  screenOff: '#24292f',
  screenOn: '#3f5d78',
  sofa: '#6c7a86',
  sofaCushion: '#7b8996',
  wood: '#8c6c4f',
  darkWood: '#5e4633',
  potTerracotta: '#a7674a',
  potGray: '#6d7278',
  leaf: '#4f7d4a',
  leafDark: '#3f6a3d',
};

function group(x = 0, z = 0, rot = 0, y = 0) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = rot;
  return g;
}

const SCREEN_ON = () => unlit('#4a6a86');
const SCREEN_OFF = () => matte(COLORS.screenOff);

/** Desk facing -z (monitor toward the chair side at -z) with an office chair. Returns { group, setActive }. */
export function desk({ x, z, width = 1.6, depth = 0.8, chairOffset = 1.0, lead = false }) {
  const g = group(x, z);
  const top = lead ? '#7a5c43' : COLORS.deskTop;
  g.add(box(width, 0.05, depth, top, 0, 0.7, 0));
  for (const sx of [-1, 1]) g.add(box(0.05, 0.7, depth - 0.1, COLORS.deskLeg, sx * (width / 2 - 0.06), 0, 0));
  g.add(box(width - 0.2, 0.3, 0.03, COLORS.deskLeg, 0, 0.4, depth / 2 - 0.06));

  const monitor = group(0, depth / 2 - 0.2);
  monitor.add(box(0.06, 0.25, 0.06, COLORS.monitor, 0, 0.75, 0.02));
  monitor.add(box(0.22, 0.02, 0.16, COLORS.monitor, 0, 0.75, 0.02));
  monitor.add(box(lead ? 0.9 : 0.68, lead ? 0.46 : 0.4, 0.04, COLORS.monitor, 0, 0.95, 0));
  const screen = new THREE.Mesh(boxGeo(lead ? 0.84 : 0.62, lead ? 0.4 : 0.34, 0.005), SCREEN_OFF());
  screen.position.set(0, 0.95 + (lead ? 0.23 : 0.2), -0.023);
  monitor.add(screen);
  g.add(monitor);
  g.add(box(0.42, 0.02, 0.14, '#3a3e44', 0, 0.75, -0.1));
  g.add(box(0.08, 0.02, 0.1, '#3a3e44', 0.32, 0.75, -0.1));

  const chair = group(0, -chairOffset);
  chair.add(cyl(0.035, 0.035, 0.32, COLORS.deskLeg, 0, 0.08, 0, 8));
  chair.add(box(0.5, 0.05, 0.5, '#2f3439', 0, 0.04, 0));
  chair.add(box(0.48, 0.07, 0.46, COLORS.chair, 0, 0.39, 0));
  chair.add(box(0.48, 0.5, 0.07, COLORS.chair, 0, 0.46, -0.24));
  g.add(chair);

  return {
    group: g,
    setActive(on) {
      screen.material = on ? SCREEN_ON() : SCREEN_OFF();
    },
  };
}

export function sofa({ x, z, rot = 0, seats = 3, color = COLORS.sofa }) {
  const g = group(x, z, rot);
  const w = seats * 1.1 + 0.3;
  g.add(box(w, 0.28, 0.9, color, 0, 0.08, 0));
  for (let i = 0; i < seats; i++) {
    g.add(box(1.04, 0.1, 0.78, COLORS.sofaCushion, -((seats - 1) * 1.1) / 2 + i * 1.1, 0.36, 0.04));
  }
  g.add(box(w, 0.5, 0.2, color, 0, 0.36, -0.36));
  for (const sx of [-1, 1]) g.add(box(0.18, 0.32, 0.9, color, sx * (w / 2 - 0.09), 0.36, 0));
  return g;
}

export function armchair({ x, z, rot = 0, color = '#7d6a5c' }) {
  const g = group(x, z, rot);
  g.add(box(0.95, 0.36, 0.85, color, 0, 0.06, 0));
  g.add(box(0.95, 0.46, 0.18, color, 0, 0.4, -0.34));
  for (const sx of [-1, 1]) g.add(box(0.16, 0.24, 0.85, color, sx * 0.4, 0.42, 0));
  return g;
}

export function coffeeTable({ x, z, w = 1.8, d = 0.9 }) {
  const g = group(x, z);
  g.add(box(w, 0.06, d, COLORS.wood, 0, 0.36, 0));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(box(0.06, 0.36, 0.06, COLORS.darkWood, sx * (w / 2 - 0.1), 0, sz * (d / 2 - 0.1)));
  g.add(box(0.3, 0.04, 0.22, '#c9b48a', -0.3, 0.42, 0.05));
  g.add(cyl(0.05, 0.05, 0.1, '#d8d4c8', 0.4, 0.42, -0.1, 12));
  return g;
}

export function plant({ x, z, size = 1, pot = COLORS.potTerracotta, y = 0 }) {
  const g = group(x, z, 0, y);
  g.add(cyl(0.22 * size, 0.17 * size, 0.42 * size, pot, 0, 0, 0, 16));
  const leaves = matte(COLORS.leaf, { flat: true });
  const dark = matte(COLORS.leafDark, { flat: true });
  const blobs = [[0, 0.75, 0, 0.36], [0.16, 0.62, 0.08, 0.26], [-0.15, 0.66, -0.06, 0.28], [0.02, 0.98, 0.02, 0.24]];
  blobs.forEach(([bx, by, bz, r], i) => {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r * size, 0), i % 2 ? dark : leaves);
    m.position.set(bx * size, by * size, bz * size);
    m.castShadow = true;
    g.add(m);
  });
  return g;
}

export function tallPlant({ x, z, y = 0 }) {
  const g = group(x, z, 0, y);
  g.add(cyl(0.26, 0.2, 0.5, COLORS.potGray, 0, 0, 0, 16));
  g.add(cyl(0.03, 0.04, 1.1, '#6b5240', 0, 0.45, 0, 6));
  const leaves = matte(COLORS.leaf, { flat: true });
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.7, 4), leaves);
    leaf.position.set(Math.cos(a) * 0.22, 1.45 + (i % 3) * 0.12, Math.sin(a) * 0.22);
    leaf.rotation.set(Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9);
    leaf.castShadow = true;
    g.add(leaf);
  }
  return g;
}

export function palmTree({ x, z, y = 0, height = 5, rot = 0 }) {
  const g = group(x, z, rot, y);
  const trunk = matte('#8a7357', { flat: true });
  const segs = 7;
  for (let i = 0; i < segs; i++) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.13 - i * 0.008, 0.16 - i * 0.008, height / segs, 8), trunk);
    m.position.set(i * 0.05, (i + 0.5) * (height / segs), 0);
    m.castShadow = true;
    g.add(m);
  }
  const frond = matte('#4d7b45', { flat: true });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const f = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.04, 1.9), frond);
    f.position.set(segs * 0.05 + Math.cos(a) * 0.75, height + 0.05, Math.sin(a) * 0.75);
    f.rotation.y = -a + Math.PI / 2;
    f.rotation.x = 0.35;
    f.castShadow = true;
    const pivot = new THREE.Group();
    pivot.add(f);
    g.add(pivot);
  }
  return g;
}

export function bookshelf({ x, z, rot = 0, w = 1.8 }) {
  const g = group(x, z, rot);
  g.add(box(w, 1.9, 0.35, COLORS.darkWood, 0, 0, 0));
  const palette = ['#7a8fa6', '#a6735e', '#6f8f6a', '#b59c62', '#8a7aa0', '#5f6b7a'];
  for (let shelf = 0; shelf < 4; shelf++) {
    g.add(box(w - 0.08, 0.03, 0.3, '#4a3828', 0, 0.12 + shelf * 0.45, 0.04));
    let bx = -w / 2 + 0.12;
    let i = shelf * 3;
    while (bx < w / 2 - 0.2) {
      const bw = 0.06 + ((i * 7) % 5) * 0.012;
      const bh = 0.26 + ((i * 3) % 4) * 0.03;
      g.add(box(bw, bh, 0.22, palette[i % palette.length], bx + bw / 2, 0.15 + shelf * 0.45, 0.05, { cast: false }));
      bx += bw + 0.012;
      i++;
    }
  }
  return g;
}

export function whiteboard({ x, z, rot = 0, w = 2.4, y = 1.0 }) {
  const g = group(x, z, rot);
  g.add(box(w + 0.08, 1.28, 0.05, '#9aa0a6', 0, y - 0.04, 0, { cast: false }));
  g.add(box(w, 1.2, 0.06, '#e6e8e6', 0, y, 0.005, { cast: false }));
  const ink = ['#5b7fa8', '#b0605a', '#5f8f63'];
  for (let i = 0; i < 4; i++) g.add(box(w * (0.3 + (i % 3) * 0.15), 0.03, 0.065, ink[i % 3], -w * 0.18 + (i % 2) * 0.2, y + 0.9 - i * 0.22, 0.01, { cast: false }));
  return g;
}

export function wallArt({ x, y, z, rot = 0, w = 1.4, h = 1.0, colors = ['#7d93ab', '#c09a6b', '#6e8f73'] }) {
  const g = group(x, z, rot, y);
  g.add(box(w, h, 0.04, '#3b3f45', 0, 0, 0, { cast: false }));
  g.add(box(w - 0.12, h - 0.12, 0.045, '#e3dfd6', 0, 0.06, 0, { cast: false }));
  colors.forEach((c, i) => g.add(box((w - 0.3) / colors.length, (h - 0.4) * (0.5 + 0.5 * ((i + 1) % 2)), 0.05, c, -((w - 0.3) / 2) + ((w - 0.3) / colors.length) * (i + 0.5), 0.2, 0, { cast: false })));
  return g;
}

export function roundTable({ x, z, r = 0.55 }) {
  const g = group(x, z);
  g.add(cyl(r, r, 0.05, '#cfc5b4', 0, 0.72, 0, 24));
  g.add(cyl(0.05, 0.05, 0.72, COLORS.deskLeg, 0, 0, 0, 10));
  g.add(cyl(0.3, 0.3, 0.03, COLORS.deskLeg, 0, 0, 0, 16));
  return g;
}

export function stool({ x, z, y = 0 }) {
  const g = group(x, z, 0, y);
  g.add(cyl(0.2, 0.2, 0.06, '#8a6a4e', 0, 0.42, 0, 16));
  g.add(cyl(0.03, 0.03, 0.42, COLORS.deskLeg, 0, 0, 0, 8));
  return g;
}

export function kitchen({ x, z, w = 7, rot = 0 }) {
  const g = group(x, z, rot);
  g.add(box(w, 0.9, 0.65, '#6f7780', 0, 0, 0));
  g.add(box(w + 0.04, 0.05, 0.7, '#cfcac0', 0, 0.9, 0));
  g.add(box(0.6, 0.04, 0.4, '#9ea4aa', -1.2, 0.93, 0.02));
  g.add(box(0.4, 0.45, 0.35, '#2f3338', 1.4, 0.95, 0));
  g.add(box(0.12, 0.06, 0.02, unlit('#6aa070'), 1.4, 1.25, 0.18));
  g.add(cyl(0.05, 0.05, 0.12, '#e9e5dc', 1.25, 0.95, 0.12, 10));
  g.add(box(0.5, 0.3, 0.38, '#3d4249', 2.4, 0.95, -0.02));
  return g;
}

export function fridge({ x, z, rot = 0 }) {
  const g = group(x, z, rot);
  g.add(box(0.8, 1.95, 0.75, '#b9bec3', 0, 0, 0));
  g.add(box(0.02, 0.5, 0.04, '#6d7278', 0.3, 1.1, 0.39));
  g.add(box(0.02, 0.3, 0.04, '#6d7278', 0.3, 0.5, 0.39));
  g.add(box(0.78, 0.01, 0.01, '#8d9297', 0, 1.0, 0.38));
  return g;
}

export function waterCooler({ x, z }) {
  const g = group(x, z);
  g.add(box(0.36, 1.0, 0.36, '#d6d8d6', 0, 0, 0));
  g.add(cyl(0.15, 0.15, 0.4, new THREE.MeshLambertMaterial({ color: '#9cc0d6', transparent: true, opacity: 0.7 }), 0, 1.0, 0, 16));
  return g;
}

export function vending({ x, z, rot = 0 }) {
  const g = group(x, z, rot);
  g.add(box(1.0, 1.9, 0.8, '#5d6e86', 0, 0, 0));
  g.add(box(0.62, 1.2, 0.02, '#2a3038', -0.12, 0.55, 0.405));
  const colors = ['#c0463f', '#d6b03e', '#4e9b5c', '#4a72bd'];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) g.add(box(0.14, 0.18, 0.02, colors[(r + c) % 4], -0.32 + c * 0.2, 0.65 + r * 0.27, 0.41, { cast: false }));
  return g;
}

/** Server rack facing +z; LED positions are returned so the caller can animate them as one instanced mesh. */
export function serverRack({ x, z }) {
  const g = group(x, z);
  g.add(box(0.62, 2.0, 0.95, '#2b2f35', 0, 0, 0));
  const leds = [];
  for (let u = 0; u < 9; u++) {
    g.add(box(0.54, 0.16, 0.02, '#363b42', 0, 0.15 + u * 0.2, 0.476, { cast: false }));
    leds.push([x - 0.2, 0.23 + u * 0.2, z + 0.49]);
    leds.push([x - 0.13, 0.23 + u * 0.2, z + 0.49]);
  }
  return { group: g, leds };
}

export function lounger({ x, z, rot = 0, y = 0 }) {
  const g = group(x, z, rot, y);
  const frame = '#ece8df';
  g.add(box(0.75, 0.08, 1.4, frame, 0, 0.26, 0.25));
  g.add(box(0.7, 0.07, 1.36, '#d9cbb1', 0, 0.34, 0.25));
  const back = box(0.75, 0.08, 0.75, frame, 0, 0, 0);
  back.position.set(0, 0.6, -0.68);
  back.rotation.x = -1.0;
  g.add(back);
  for (const sx of [-1, 1]) for (const sz of [-0.4, 0.85]) g.add(box(0.05, 0.26, 0.05, '#8c8f93', sx * 0.32, 0, sz));
  return g;
}

export function outdoorChair({ x, z, rot = 0, y = 0 }) {
  const g = group(x, z, rot, y);
  g.add(box(0.85, 0.32, 0.8, '#5f6a73', 0, 0.06, 0));
  g.add(box(0.8, 0.1, 0.74, '#d8cdb8', 0, 0.38, 0.02));
  g.add(box(0.85, 0.5, 0.16, '#5f6a73', 0, 0.38, -0.33));
  return g;
}

export function umbrella({ x, z, y = 0, color = '#d9c9a8' }) {
  const g = group(x, z, 0, y);
  g.add(cyl(0.035, 0.035, 2.4, '#8c8f93', 0, 0, 0, 8));
  const canopy = new THREE.Mesh(new THREE.ConeGeometry(1.4, 0.45, 8, 1, true), matte(color, { side: THREE.DoubleSide, flat: true }));
  canopy.position.y = 2.45;
  canopy.castShadow = true;
  g.add(canopy);
  g.add(cyl(0.3, 0.35, 0.08, '#55595e', 0, 0, 0, 12));
  return g;
}

export function planterBox({ x, z, y = 0, w = 2.4, d = 0.7, rot = 0 }) {
  const g = group(x, z, rot, y);
  g.add(box(w, 0.55, d, '#6f5a47', 0, 0, 0));
  const leaves = matte('#557f4a', { flat: true });
  const n = Math.max(2, Math.round(w / 0.5));
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28 + (i % 3) * 0.05, 0), leaves);
    m.position.set(-w / 2 + 0.25 + (i * (w - 0.5)) / (n - 1), 0.72 + (i % 2) * 0.08, 0);
    m.castShadow = true;
    g.add(m);
  }
  return g;
}

export function firePit({ x, z, y = 0, r = 0.85 }) {
  const g = group(x, z, 0, y);
  g.add(cyl(r, r + 0.05, 0.38, '#6d6a66', 0, 0, 0, 24));
  g.add(cyl(r - 0.12, r - 0.12, 0.02, '#2c2a28', 0, 0.38, 0, 24));
  const ember = unlit('#c97a45');
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const m = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.22, 5), ember);
    m.position.set(Math.cos(a) * 0.25, 0.5, Math.sin(a) * 0.25);
    g.add(m);
  }
  return g;
}
