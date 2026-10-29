import * as THREE from 'three';
import { boxGeo, matte, unlit } from './materials.js';

// Profile color names from the roster mapped to flat, slightly muted tones. null => neutral gray.
const PROFILE_COLORS = {
  cyan: '#3aa7b8',
  yellow: '#d6b03e',
  violet: '#8467c2',
  purple: '#7a55a6',
  green: '#4e9b5c',
  brown: '#8a5b3c',
  magenta: '#b54a8e',
  pink: '#d48aa6',
  gray: '#7f858c',
  grey: '#7f858c',
  red: '#be4740',
  orange: '#d7823b',
  blue: '#4a72bd',
  teal: '#2f8e86',
  white: '#d9d8d3',
  black: '#3b3d41',
};
export const NEUTRAL_GRAY = '#a8aaad';

export function profileColor(avatarColor) {
  if (!avatarColor) return NEUTRAL_GRAY;
  const key = String(avatarColor).trim().toLowerCase();
  if (PROFILE_COLORS[key]) return PROFILE_COLORS[key];
  if (/^#[0-9a-f]{6}$/i.test(key)) return key;
  return NEUTRAL_GRAY;
}

function shade(hex, f) {
  const c = new THREE.Color(hex);
  c.multiplyScalar(f);
  return `#${c.getHexString()}`;
}

function mesh(geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, typeof mat === 'string' ? matte(mat) : mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

const HIP_Y = 0.46;
const SHOULDER_Y = 0.85;
const HEAD_Y = 1.06;

/**
 * Small blocky person in a single flat profile color. Origin is between the feet; faces +z.
 * Returned object exposes the limb pivots so the agent controller can pose it.
 */
export function createBotModel(bot) {
  const color = profileColor(bot.avatarColor);
  const body = matte(color);
  const legsMat = matte(shade(color, 0.84));
  const root = new THREE.Group();
  root.name = `bot:${bot.id}`;

  const legL = new THREE.Group();
  const legR = new THREE.Group();
  legL.position.set(-0.1, HIP_Y, 0);
  legR.position.set(0.1, HIP_Y, 0);
  legL.add(mesh(boxGeo(0.15, HIP_Y, 0.17), legsMat, 0, -HIP_Y / 2, 0));
  legR.add(mesh(boxGeo(0.15, HIP_Y, 0.17), legsMat, 0, -HIP_Y / 2, 0));

  const torso = mesh(boxGeo(0.42, 0.42, 0.24), body, 0, HIP_Y + 0.21, 0);

  const armL = new THREE.Group();
  const armR = new THREE.Group();
  armL.position.set(-0.28, SHOULDER_Y, 0);
  armR.position.set(0.28, SHOULDER_Y, 0);
  armL.add(mesh(boxGeo(0.12, 0.4, 0.14), body, 0, -0.19, 0));
  armR.add(mesh(boxGeo(0.12, 0.4, 0.14), body, 0, -0.19, 0));

  const head = new THREE.Group();
  head.position.set(0, HEAD_Y, 0);
  head.add(mesh(boxGeo(0.36, 0.34, 0.34), body));
  const eyeMat = matte('#25282d');
  head.add(mesh(boxGeo(0.06, 0.07, 0.01), eyeMat, -0.08, 0.02, 0.172));
  head.add(mesh(boxGeo(0.06, 0.07, 0.01), eyeMat, 0.08, 0.02, 0.172));

  root.add(legL, legR, torso, armL, armR, head);

  const handR = new THREE.Group();
  handR.position.set(0, -0.42, 0.04);
  armR.add(handR);
  const handL = new THREE.Group();
  handL.position.set(0, -0.42, 0.04);
  armL.add(handL);

  const parts = { root, legL, legR, torso, armL, armR, head, handR, handL, color };
  addAccessory(bot.accessory, parts);

  const folder = new THREE.Group();
  folder.add(mesh(boxGeo(0.28, 0.22, 0.035), '#d2ad63'));
  folder.add(mesh(boxGeo(0.1, 0.03, 0.036), '#c39c50', -0.07, 0.12, 0));
  folder.rotation.x = -0.25;
  folder.visible = false;
  handL.add(folder);
  parts.folder = folder;

  // Invisible, slightly generous hit volume for hover/tap picking.
  const hit = new THREE.Mesh(boxGeo(0.7, 1.45, 0.7), new THREE.MeshBasicMaterial({ visible: false }));
  hit.position.y = 0.72;
  hit.userData.botId = bot.id;
  root.add(hit);
  parts.hit = hit;

  return parts;
}

function boltShape(scale) {
  const s = new THREE.Shape();
  const pts = [[0.1, 1], [-0.45, -0.05], [0, -0.05], [-0.15, -1], [0.45, 0.15], [0.02, 0.15], [0.25, 1]];
  s.moveTo(pts[0][0] * scale, pts[0][1] * scale);
  for (const [x, y] of pts.slice(1)) s.lineTo(x * scale, y * scale);
  s.closePath();
  return s;
}

function shieldShape(scale) {
  const s = new THREE.Shape();
  s.moveTo(-1 * scale, 1 * scale);
  s.lineTo(1 * scale, 1 * scale);
  s.lineTo(1 * scale, 0);
  s.quadraticCurveTo(0.9 * scale, -0.9 * scale, 0, -1.25 * scale);
  s.quadraticCurveTo(-0.9 * scale, -0.9 * scale, -1 * scale, 0);
  s.closePath();
  return s;
}

const extrude = (shape, depth) => new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });

function addAccessory(kind, p) {
  const k = String(kind || '').toLowerCase();
  const { head, handR, armL, legL, legR } = p;
  const top = 0.17;

  if (k.includes('headset')) {
    const dark = matte('#2c3035');
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.022, 8, 28, Math.PI), dark);
    band.position.y = 0.02;
    head.add(band);
    for (const sx of [-1, 1]) {
      const cup = mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.05, 16), dark, sx * 0.2, 0.0, 0);
      cup.rotation.z = Math.PI / 2;
      head.add(cup);
    }
    const boom = mesh(boxGeo(0.02, 0.02, 0.2), dark, 0.19, -0.08, 0.1);
    boom.rotation.y = -0.5;
    head.add(boom);
    head.add(mesh(boxGeo(0.04, 0.035, 0.035), dark, 0.13, -0.09, 0.19));
  } else if (k.includes('hard hat')) {
    const hat = matte('#e0a12d');
    head.add(mesh(new THREE.SphereGeometry(0.21, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), hat, 0, top - 0.01, 0));
    head.add(mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.025, 24), hat, 0, top, 0.02));
    head.add(mesh(boxGeo(0.04, 0.03, 0.4), hat, 0, top + 0.2, 0));
  } else if (k.includes('lightning')) {
    p.root.add(mesh(extrude(boltShape(0.075), 0.015), '#efc64a', 0.09, HIP_Y + 0.28, 0.12));
  } else if (k.includes('ethernet')) {
    const coil = mesh(new THREE.TorusGeometry(0.1, 0.022, 8, 24), '#3c79c4', 0, -0.03, 0.06);
    const coil2 = mesh(new THREE.TorusGeometry(0.085, 0.02, 8, 24), '#3c79c4', 0.01, -0.03, 0.09);
    handR.add(coil, coil2);
    handR.add(mesh(boxGeo(0.05, 0.07, 0.035), '#d9d6cc', 0.1, -0.12, 0.08));
  } else if (k.includes('visor')) {
    const green = matte('#3c9658');
    const ring = mesh(new THREE.TorusGeometry(0.185, 0.018, 6, 28), green, 0, 0.1, 0);
    ring.rotation.x = Math.PI / 2;
    head.add(ring);
    const brim = mesh(boxGeo(0.34, 0.018, 0.17), green, 0, 0.1, 0.24);
    brim.rotation.x = 0.18;
    head.add(brim);
  } else if (k.includes('captain')) {
    head.add(mesh(new THREE.CylinderGeometry(0.21, 0.19, 0.11, 24), '#e8e6df', 0, top + 0.06, 0));
    head.add(mesh(new THREE.CylinderGeometry(0.195, 0.195, 0.035, 24), '#23262b', 0, top + 0.02, 0));
    const brim = mesh(boxGeo(0.3, 0.02, 0.12), '#23262b', 0, top + 0.01, 0.2);
    brim.rotation.x = 0.15;
    head.add(brim);
    head.add(mesh(boxGeo(0.07, 0.05, 0.01), '#c9a544', 0, top + 0.07, 0.205));
  } else if (k.includes('briefcase')) {
    handR.add(mesh(boxGeo(0.09, 0.24, 0.32), '#5a3a25', 0.02, -0.14, 0.02));
    handR.add(mesh(boxGeo(0.03, 0.04, 0.12), '#3b2618', 0.02, 0.0, 0.02));
  } else if (k.includes('megaphone')) {
    const cone = mesh(new THREE.CylinderGeometry(0.11, 0.04, 0.28, 20, 1, true), '#e6e2d8', 0, -0.02, 0.17);
    cone.rotation.x = Math.PI / 2;
    cone.material = matte('#e6e2d8', { side: THREE.DoubleSide });
    handR.add(cone);
    const band = mesh(new THREE.CylinderGeometry(0.075, 0.07, 0.04, 20), '#c0463f', 0, -0.02, 0.12);
    band.rotation.x = Math.PI / 2;
    handR.add(band);
    handR.add(mesh(boxGeo(0.04, 0.1, 0.04), '#3a3d42', 0, -0.06, 0.06));
  } else if (k.includes('envelope')) {
    handR.add(mesh(boxGeo(0.02, 0.17, 0.25), '#ece6d6', 0.02, -0.08, 0.04));
    const flap1 = mesh(boxGeo(0.022, 0.012, 0.15), '#cfc6b1', 0.03, -0.02, -0.02);
    flap1.rotation.x = 0.55;
    const flap2 = mesh(boxGeo(0.022, 0.012, 0.15), '#cfc6b1', 0.03, -0.02, 0.1);
    flap2.rotation.x = -0.55;
    handR.add(flap1, flap2);
  } else if (k.includes('magnifying')) {
    const rim = mesh(new THREE.TorusGeometry(0.075, 0.014, 8, 24), '#3a3d42', 0, 0.12, 0.08);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.07, 24), new THREE.MeshLambertMaterial({ color: '#bcd3df', transparent: true, opacity: 0.45, side: THREE.DoubleSide }));
    lens.position.copy(rim.position);
    handR.add(rim, lens, mesh(new THREE.CylinderGeometry(0.015, 0.018, 0.12, 10), '#6b4a2f', 0, 0.0, 0.08));
  } else if (k.includes('chip')) {
    p.root.add(mesh(boxGeo(0.13, 0.13, 0.02), '#22292d', 0, HIP_Y + 0.25, 0.125));
    const core = new THREE.Mesh(boxGeo(0.07, 0.07, 0.01), unlit('#58bccd'));
    core.position.set(0, HIP_Y + 0.25, 0.137);
    p.root.add(core);
    for (const dx of [-0.045, 0, 0.045]) {
      p.root.add(mesh(boxGeo(0.012, 0.03, 0.006), '#b9b39c', dx, HIP_Y + 0.33, 0.124));
      p.root.add(mesh(boxGeo(0.012, 0.03, 0.006), '#b9b39c', dx, HIP_Y + 0.17, 0.124));
    }
  } else if (k.includes('clipboard')) {
    handR.add(mesh(boxGeo(0.02, 0.3, 0.22), '#8a6643', 0.03, -0.06, 0.06));
    handR.add(mesh(boxGeo(0.022, 0.24, 0.18), '#efede6', 0.035, -0.08, 0.06));
    handR.add(mesh(boxGeo(0.03, 0.03, 0.08), '#9da2a8', 0.04, 0.08, 0.06));
  } else if (k.includes('book')) {
    handR.add(mesh(boxGeo(0.06, 0.26, 0.2), '#2f4e84', 0.02, -0.08, 0.04));
    handR.add(mesh(boxGeo(0.05, 0.24, 0.005), '#ece7da', 0.02, -0.08, 0.142));
  } else if (k.includes('lab coat')) {
    const coat = matte('#e9e8e3');
    p.root.add(mesh(boxGeo(0.46, 0.5, 0.27), coat, 0, HIP_Y + 0.17, -0.005));
    p.root.add(mesh(boxGeo(0.1, 0.4, 0.01), matte(p.color), 0, HIP_Y + 0.22, 0.131));
    for (const arm of [p.armL, p.armR]) arm.add(mesh(boxGeo(0.14, 0.3, 0.16), coat, 0, -0.14, 0));
    p.root.add(mesh(boxGeo(0.04, 0.05, 0.01), '#4a72bd', 0.12, HIP_Y + 0.3, 0.14));
  } else if (k.includes('shield')) {
    const sh = mesh(extrude(shieldShape(0.12), 0.025), '#7c8fa3', -0.075, -0.18, 0);
    sh.rotation.y = -Math.PI / 2;
    armL.add(sh);
    const emblem = mesh(boxGeo(0.01, 0.1, 0.03), '#d9d6cc', -0.105, -0.17, 0);
    armL.add(emblem);
  } else if (k.includes('calendar')) {
    handR.add(mesh(boxGeo(0.02, 0.22, 0.2), '#efede6', 0.03, -0.07, 0.05));
    handR.add(mesh(boxGeo(0.022, 0.05, 0.2), '#c0463f', 0.033, 0.035, 0.05));
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
      handR.add(mesh(boxGeo(0.005, 0.03, 0.04), '#9aa0a6', 0.042, -0.04 - r * 0.05, -0.01 + c * 0.06));
    }
  } else if (k.includes('shoe')) {
    for (const leg of [legL, legR]) {
      leg.add(mesh(boxGeo(0.17, 0.08, 0.27), '#e05b3a', 0, -HIP_Y + 0.04, 0.04));
      leg.add(mesh(boxGeo(0.175, 0.025, 0.28), '#f0eee8', 0, -HIP_Y + 0.012, 0.04));
    }
  } else if (k.includes('ball cap') || k.includes('cap')) {
    const capMat = matte('#2e5b89');
    head.add(mesh(new THREE.SphereGeometry(0.195, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), capMat, 0, top - 0.01, 0));
    const bill = mesh(boxGeo(0.26, 0.02, 0.18), capMat, 0, top, 0.24);
    bill.rotation.x = 0.1;
    head.add(bill);
  }
}

const HALF_PI = Math.PI / 2;

/** Apply a pose. `t` drives cyclic motion for walking and typing only; idle poses are static. */
export function applyPose(parts, pose, t = 0) {
  const { legL, legR, armL, armR } = parts;
  switch (pose) {
    case 'walk': {
      const s = Math.sin(t * 8.5);
      legL.rotation.x = s * 0.55;
      legR.rotation.x = -s * 0.55;
      armL.rotation.x = -s * 0.4;
      armR.rotation.x = s * 0.4;
      break;
    }
    case 'carry': {
      const s = Math.sin(t * 8.5);
      legL.rotation.x = s * 0.55;
      legR.rotation.x = -s * 0.55;
      armL.rotation.x = -1.0;
      armR.rotation.x = s * 0.4;
      break;
    }
    case 'type': {
      legL.rotation.x = legR.rotation.x = -HALF_PI;
      armL.rotation.x = -1.15 + Math.sin(t * 11) * 0.06;
      armR.rotation.x = -1.15 + Math.sin(t * 11 + 1.7) * 0.06;
      break;
    }
    case 'sit': {
      legL.rotation.x = legR.rotation.x = -HALF_PI;
      armL.rotation.x = armR.rotation.x = -0.45;
      break;
    }
    case 'deliver': {
      legL.rotation.x = legR.rotation.x = 0;
      armL.rotation.x = -1.25;
      armR.rotation.x = 0;
      break;
    }
    default: {
      legL.rotation.x = legR.rotation.x = 0;
      armL.rotation.x = armR.rotation.x = 0;
    }
  }
}
