import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { createBotModel, applyPose } from '../scene/bot.js';
import { CHAMPIONS } from './champions.js';

export const PALETTE = { green: 0x154f3a, gold: 0xe5b94f, blue: 0x164b78, sky: 0x46c5e8, cream: 0xffefd0 };
export const BADGE_URL = '/trade/badge.png';
const SEATS = [[-2.6, 3.2, 0.3], [0.3, 3.6, -0.3], [1.2, 1.1, -1.1], [-1, -0.1, 0], [-3.2, 0.8, 1.1], [-3.8, 2, 1.4], [0.8, -0.5, -1.8], [-2, 4.3, 0]];
const COLORS = ['cyan', 'orange', 'violet', 'green', 'blue', 'yellow', 'teal', 'red'];
const materialCache = new Map();
function mat(color) {
  if (!materialCache.has(color)) materialCache.set(color, new THREE.MeshLambertMaterial({ color }));
  return materialCache.get(color);
}
function box(root, w, h, d, color, x, y, z) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  mesh.position.set(x, y, z); root.add(mesh); return mesh;
}
function cylinder(root, r, h, color, x, y, z, r2 = r) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r2, h, 16), mat(color));
  mesh.position.set(x, y, z); root.add(mesh); return mesh;
}
function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function plane(root, w, h, texture, x, y, z) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide }));
  mesh.position.set(x, y, z); root.add(mesh); return mesh;
}
// Emissive neon tubes with a small additive halo, avoiding a full-screen bloom pass.
function neonSign(root, text, w, h, x, y, z, color) {
  const group = new THREE.Group(); group.position.set(x, y, z); root.add(group);
  box(group, w + 0.2, h + 0.12, 0.09, 0x152923, 0, 0, -0.08);
  const draw = (glow) => canvasTexture(1024, 256, (c) => {
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = 'bold 110px sans-serif';
    c.strokeStyle = color; c.fillStyle = color; c.lineWidth = 3;
    if (glow) { c.shadowColor = color; c.shadowBlur = 25; c.fillStyle = color; }
    c.strokeText(text, 512, 132, 910); c.fillText(text, 512, 132, 910);
  });
  const tubes = plane(group, w, h, draw(false), 0, 0, 0);
  tubes.material = new THREE.MeshStandardMaterial({ map: tubes.material.map, emissiveMap: tubes.material.map, emissive: color, emissiveIntensity: 1.8, transparent: true, toneMapped: false });
  const glow = plane(group, w * 1.05, h * 1.05, draw(true), 0, 0, 0.015);
  glow.material.blending = THREE.AdditiveBlending; glow.material.opacity = 0.55;
  glow.material.depthWrite = false; glow.material.toneMapped = false;
  return group;
}
function stool(root, x, z, height = 0.95) {
  cylinder(root, 0.39, 0.16, 0x22584a, x, height, z);
  cylinder(root, 0.09, height, 0x303b3b, x, height / 2, z);
  cylinder(root, 0.34, 0.08, 0x303b3b, x, 0.07, z);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.035, 5, 16), mat(PALETTE.gold));
  ring.rotation.x = Math.PI / 2; ring.position.set(x, 0.38, z); root.add(ring);
}
function pendant(root, x, z, y = 5) {
  cylinder(root, 0.025, 8 - y, 0x282d29, x, (8 + y) / 2, z);
  cylinder(root, 0.16, 0.45, 0x225847, x, y, z, 0.6);
  cylinder(root, 0.49, 0.025, 0xffe8a0, x, y - 0.23, z);
  const light = new THREE.PointLight(0xffc878, 18, 10, 2); light.position.set(x, y - 0.45, z); root.add(light);
}
function bannerTexture(champion, i) {
  return canvasTexture(512, 768, (c) => {
    c.beginPath(); c.moveTo(12, 8); c.lineTo(500, 8); c.lineTo(500, 635); c.lineTo(256, 755); c.lineTo(12, 635); c.closePath();
    c.fillStyle = i % 2 ? '#173d64' : '#174b39'; c.fill(); c.strokeStyle = '#eac35d'; c.lineWidth = 15; c.stroke();
    c.textAlign = 'center'; c.fillStyle = '#f3d681'; c.font = 'bold 27px sans-serif'; c.fillText('GVEGAS GRIDIRON', 256, 72);
    // A simple trophy silhouette keeps the pennants readable without external assets.
    c.fillRect(213, 115, 86, 67); c.fillRect(247, 177, 18, 40); c.fillRect(220, 216, 72, 12);
    c.lineWidth = 12; c.strokeRect(193, 121, 126, 43);
    c.font = `bold ${champion.year.length > 4 ? 67 : 102}px sans-serif`; c.fillText(champion.year, 256, 350);
    c.font = 'bold 28px sans-serif'; c.fillText(champion.distinction || 'LEAGUE CHAMPION', 256, 410);
    c.fillStyle = '#fff4d8';
    if (champion.team) {
      c.font = 'bold 35px sans-serif';
      const words = champion.team === 'South Georgia Catfish' ? ['South Georgia', 'Catfish'] : [champion.team];
      words.forEach((word, n) => c.fillText(word, 256, 485 + n * 43, 450));
    }
    c.font = '32px sans-serif'; c.fillText(champion.manager, 256, 596, 450);
  });
}
function buildRoomGeometry(root, loader) {
  const wood = canvasTexture(1024, 1024, (c) => {
    for (let row = 0; row < 16; row++) for (let col = -1; col < 4; col++) {
      const x = col * 342 + (row % 2) * 171;
      c.fillStyle = ['#97653e', '#ad7d4e', '#b48454', '#a47246'][(row * 3 + col + 4) % 4];
      c.fillRect(x, row * 64, 340, 62);
      c.strokeStyle = '#754b2d'; c.lineWidth = 1;
      for (let k = 1; k < 5; k++) { c.beginPath(); c.moveTo(x + 9, row * 64 + k * 11); c.lineTo(x + 326, row * 64 + k * 11 + 3); c.stroke(); }
    }
  });
  wood.wrapS = wood.wrapT = THREE.RepeatWrapping; wood.repeat.set(3, 2);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(26, 26), new THREE.MeshLambertMaterial({ map: wood }));
  floor.rotation.x = -Math.PI / 2; floor.position.z = 3; root.add(floor);
  // A continuous ceiling and side walls keep the camera inside the clubhouse.
  box(root, 26, 0.22, 26, 0x44372d, 0, 8.65, 3);
  for (const z of [-7, -2, 3, 8, 13]) box(root, 26, 0.32, 0.32, 0x30291f, 0, 8.35, z);
  for (const x of [-12.7, 12.7]) {
    box(root, 0.3, 8.5, 26, 0x624632, x, 4.25, 3);
    box(root, 0.42, 0.22, 26, 0xb28a51, x, 7.95, 3);
    box(root, 1.4, 8.5, 0.35, 0x403328, x, 4.25, 15.8);
  }
  const brick = canvasTexture(512, 512, (c) => {
    c.fillStyle = '#cfb797'; c.fillRect(0, 0, 512, 512);
    for (let row = 0; row < 8; row++) for (let col = -1; col < 4; col++) {
      c.fillStyle = ['#885341', '#a2654d', '#965b47'][(row + col + 4) % 3];
      c.fillRect(col * 171 + (row % 2) * 85, row * 64 + 3, 165, 58);
    }
  });
  brick.wrapS = brick.wrapT = THREE.RepeatWrapping; brick.repeat.set(5, 1.5);
  const wall = box(root, 26, 8.5, 0.3, 0xffffff, 0, 4.25, -7.5);
  wall.material = new THREE.MeshLambertMaterial({ map: brick });
  box(root, 0.3, 8.5, 18, 0x754e36, -13, 4.25, 1.4);
  box(root, 26, 1.5, 0.4, 0x294b3c, 0, 0.75, -7.25);
  for (let x = -12; x <= 12; x++) box(root, 0.055, 1.5, 0.08, 0xb18a53, x, 0.75, -7);
  box(root, 26, 0.1, 0.15, PALETTE.gold, 0, 1.55, -7);
  box(root, 26, 0.1, 0.16, 0x64e0ae, 0, 8.05, -7.2).material = new THREE.MeshBasicMaterial({ color: 0x64e0ae });
  CHAMPIONS.forEach((c, i) => {
    const x = -10.65 + i * 3.55;
    cylinder(root, 0.025, 0.6, PALETTE.gold, x - 1, 7.95, -7);
    cylinder(root, 0.025, 0.6, PALETTE.gold, x + 1, 7.95, -7);
    box(root, 2.8, 0.09, 0.12, PALETTE.gold, x, 7.65, -7);
    plane(root, 2.8, 3.7, bannerTexture(c, i), x, 5.85, -6.95);
  });
  const badge = loader.load(BADGE_URL); badge.colorSpace = THREE.SRGBColorSpace;
  for (const x of [-9.8, -1, 9.8]) {
    box(root, 2.55, 2.55, 0.12, PALETTE.gold, x, 2.95, -7);
    box(root, 2.4, 2.4, 0.12, PALETTE.green, x, 2.95, -6.9);
    plane(root, 2.28, 2.28, badge, x, 2.95, -6.8);
  }
  // Two wall TVs: an illustrated football broadcast and the league's trade desk.
  for (const [i, x] of [-5.5, 4.5].entries()) {
    box(root, 3.65, 2.1, 0.2, 0x19272a, x, 3, -6.95);
    const screen = canvasTexture(768, 432, (c) => {
      c.fillStyle = '#174c71'; c.fillRect(0, 0, 768, 432);
      c.fillStyle = '#267c51'; c.fillRect(25, 80, 718, 280);
      c.strokeStyle = '#d9f3cf'; c.lineWidth = 3;
      for (let k = 0; k < 11; k++) { c.beginPath(); c.moveTo(35 + k * 70, 90); c.lineTo(35 + k * 70, 350); c.stroke(); }
      c.fillStyle = '#fff1c7'; c.font = 'bold 36px sans-serif'; c.textAlign = 'center'; c.fillText(i ? 'GVEGAS • TRADE DESK' : 'GRIDIRON • GAME DAY', 384, 52);
      for (let k = 0; k < 12; k++) { c.fillStyle = k % 2 ? '#f3c64f' : '#53c5ec'; c.fillRect(190 + k % 4 * 99, 140 + Math.floor(k / 4) * 75, 22, 22); }
      c.fillStyle = '#112e41'; c.fillRect(0, 372, 768, 60); c.fillStyle = '#ffe499'; c.font = '24px sans-serif'; c.fillText(i ? 'LIVE DEALS  /  LEAGUE HQ' : 'WELCOME TO THE CLUBHOUSE', 384, 410);
    });
    plane(root, 3.4, 1.9, screen, x, 3, -6.8);
  }
  // Back bar, bottle shelves, and six brass-footed stools.
  box(root, 13, 1.55, 1.25, 0x66402b, -3, 0.8, -4.85);
  for (let x = -9; x <= 3; x += 1.5) box(root, 1.35, 1.2, 0.06, 0x93613c, x, 0.8, -4.18);
  box(root, 13.5, 0.22, 1.65, 0xc39158, -3, 1.65, -4.85);
  const barNeon = box(root, 13.3, 0.055, 0.05, 0xffd46e, -3, 1.48, -4.01);
  barNeon.material = new THREE.MeshStandardMaterial({ color: 0xffdf7a, emissive: 0xffb830, emissiveIntensity: 3, toneMapped: false });
  const wash = plane(root, 13.3, 0.6, canvasTexture(32, 128, (c) => {
    const g = c.createLinearGradient(0, 0, 0, 128); g.addColorStop(0, '#ffb83a88'); g.addColorStop(1, '#ffb83a00'); c.fillStyle = g; c.fillRect(0, 0, 32, 128);
  }), -3, 1.15, -4.005);
  wash.material.blending = THREE.AdditiveBlending; wash.material.depthWrite = false;
  for (let shelf = 0; shelf < 2; shelf++) {
    box(root, 5.6, 0.12, 0.6, 0x513b28, -5.5, 1.8 + shelf * 0.65, -6.9);
    for (let i = 0; i < 15; i++) {
      const x = -8 + i * 0.36, y = 2.05 + shelf * 0.65;
      cylinder(root, 0.095, 0.35, [0x33764e, 0xb77a31, 0x308ea1][i % 3], x, y, -6.65);
      cylinder(root, 0.043, 0.17, 0xd5be78, x, y + 0.25, -6.65);
      box(root, 0.16, 0.12, 0.015, 0xffe4aa, x, y, -6.55);
    }
  }
  for (let i = 0; i < 6; i++) stool(root, -8.5 + i * 2.1, -3.3, 1.1);
  for (const x of [-8.5, 0.8, 3]) pendant(root, x, -4.7, 4.1);
  // Pool table with six pockets, a triangular rack of balls, and two cues.
  const pool = new THREE.Group(); pool.position.set(7.4, 0, 1.6); root.add(pool);
  for (const x of [-1.25, 1.25]) for (const z of [-2.1, 2.1]) box(pool, 0.28, 1.1, 0.28, 0x513b2a, x, 0.55, z);
  box(pool, 3.5, 0.45, 5.7, 0x623d28, 0, 1.2, 0);
  box(pool, 3.1, 0.06, 5.25, 0x198457, 0, 1.46, 0);
  for (const x of [-1.65, 1.65]) box(pool, 0.22, 0.14, 5.65, 0xb17b43, x, 1.5, 0);
  for (const z of [-2.72, 2.72]) box(pool, 3.5, 0.14, 0.2, 0xb17b43, 0, 1.5, z);
  for (const x of [-1.45, 1.45]) for (const z of [-2.45, 0, 2.45]) cylinder(pool, 0.17, 0.03, 0x101f1c, x, 1.51, z);
  let n = 0;
  for (let row = 0; row < 5; row++) for (let col = 0; col <= row; col++) {
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.105, 8, 6), mat([0xffd755, 0x377acb, 0xe15d40, 0xb682cc, 0xf7e7c5][n++ % 5]));
    ball.position.set((col - row / 2) * 0.225, 1.59, -1 + row * 0.2); pool.add(ball);
  }
  cylinder(pool, 0.11, 0.08, 0xffffff, 0.25, 1.56, 1.5);
  for (const x of [-1.9, 1.9]) { const cue = cylinder(pool, 0.035, 4.4, 0xe3bf7e, x, 1.65, 0); cue.rotation.x = Math.PI / 2; cue.rotation.z = 0.1; }
  pendant(root, 7.4, 1.6, 4.8);
  // Central trading table on a woven league-blue rug.
  const rug = box(root, 8.5, 0.025, 7, 0x214c61, -1.4, 0.025, 2);
  for (const z of [-1.3, 5.3]) box(root, 8.2, 0.03, 0.055, PALETTE.gold, -1.4, 0.045, z);
  cylinder(root, 0.55, 1.2, 0x31433b, -1.3, 0.6, 1.7);
  cylinder(root, 2.15, 0.22, 0xc39455, -1.3, 1.35, 1.7);
  cylinder(root, 2.02, 0.035, 0x20634c, -1.3, 1.48, 1.7);
  const crest = plane(root, 1.5, 1.5, badge, -1.3, 1.51, 1.7); crest.rotation.x = -Math.PI / 2;
  SEATS.forEach(([x, z]) => stool(root, x, z, 0.95));
  pendant(root, -1.3, 1.7, 7.4);
  // Two high tops on the left, with drinks and extra seating.
  for (const z of [0, 4.8]) {
    cylinder(root, 0.12, 1.45, 0x344039, -9, 0.75, z);
    cylinder(root, 1.05, 0.16, 0xb38149, -9, 1.5, z);
    for (const dx of [-1.5, 1.5]) stool(root, -9 + dx, z, 0.95);
    cylinder(root, 0.12, 0.3, 0xe8b64f, -9.25, 1.73, z);
    cylinder(root, 0.125, 0.055, 0xfff0d2, -9.25, 1.9, z);
    pendant(root, -9, z, 4.7);
  }
  neonSign(root, 'TRADE DESK', 6.2, 0.65, 4.7, 1.9, -6.7, '#45bcff');
  neonSign(root, 'GVEGAS', 4.5, 0.5, -5.1, 3.65, -6.65, '#49ff9b');
  return root;
}

function createTradeTag(p) {
  const el = document.createElement('div'); el.className = 'trade-tag'; el.dataset.participantId = p.id;
  const name = document.createElement('span'); name.className = 'trade-tag-name';
  const status = document.createElement('span'); status.className = 'trade-tag-status'; el.append(name, status);
  const obj = new CSS2DObject(el); obj.position.y = 1.48; obj.center.set(0.5, 1);
  const update = (p) => { name.textContent = p.name; status.textContent = p.status || 'At table'; }; update(p);
  return { obj, update };
}
export function mountTradeScene(container, { wallFeed = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.28;
  container.appendChild(renderer.domElement);
  const labels = new CSS2DRenderer(); labels.domElement.className = 'trade-labels'; container.appendChild(labels.domElement);
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x30271f);
  const root = buildRoomGeometry(new THREE.Group(), new THREE.TextureLoader()); scene.add(root);
  scene.add(new THREE.HemisphereLight(0xfff1d3, 0x99816a, 2.8));
  const sun = new THREE.DirectionalLight(0xffe1ac, 2.2); sun.position.set(0, 12, 8); scene.add(sun);
  const fill = new THREE.DirectionalLight(0xc4e6ff, 1.2); fill.position.set(8, 8, 2); scene.add(fill);
  const camera = new THREE.PerspectiveCamera(43, 1, 0.1, 140);
  // Straight-on banner portrait, behind the pendants, without wide-lens distortion.
  const bannerCamera = new THREE.OrthographicCamera(-13.3, 13.3, 7, -7, 0.01, 30);
  bannerCamera.position.set(0, 4.8, -5.9); bannerCamera.lookAt(0, 4.8, -7);
  const controls = new OrbitControls(camera, labels.domElement);
  controls.enableDamping = true; controls.enablePan = false; controls.minDistance = 7; controls.maxDistance = 55;
  controls.maxPolarAngle = Math.PI * 0.48;
  let bannersFocused = false;
  function frame() {
    const w = container.clientWidth, h = container.clientHeight; camera.aspect = w / h; camera.updateProjectionMatrix();
    bannerCamera.top = 13.3 / camera.aspect; bannerCamera.bottom = -bannerCamera.top; bannerCamera.updateProjectionMatrix();
    renderer.setSize(w, h); labels.setSize(w, h);
    if (bannersFocused) {
      // The orthographic camera stays between the wall and the hanging lights.
    } else if (w < 600) {
      controls.target.set(-0.8, 2.3, 1); camera.position.set(5, 7, 14);
    } else {
      controls.target.set(-0.2, 2.65, 0); camera.position.set(5.2, 6.5, 12.8);
    }
    // Fit the full clubhouse across narrow canvases, retaining a perspective view.
    if (!bannersFocused && w >= 600 && w / h < 1.25) camera.position.sub(controls.target).multiplyScalar(1.25 / (w / h)).add(controls.target);
    controls.update();
  }
  window.addEventListener('resize', frame); frame();
  // Feed lives in the reserved sidebar/bottom sheet, outside the scene and badges.
  const feedEl = document.createElement('div'); feedEl.className = 'trade-wall-screen';
  if (wallFeed) document.getElementById('live-feed')?.appendChild(feedEl);
  const seated = new Map();
  function syncParticipants(list) {
    const ids = new Set(list.slice(0, SEATS.length).map(p => p.id));
    for (const [id, entry] of seated) if (!ids.has(id)) { root.remove(entry.parts.root); entry.tag.obj.element.remove(); seated.delete(id); }
    list.slice(0, SEATS.length).forEach((p, i) => {
      let entry = seated.get(p.id);
      if (!entry) {
        const parts = createBotModel({ id: p.id, name: p.name, avatarColor: COLORS[i] }); applyPose(parts, 'sit');
        parts.root.scale.setScalar(1.8);
        const [x, z, rot] = SEATS[i]; parts.root.position.set(x, 0.2, z); parts.root.rotation.y = rot;
        const tag = createTradeTag(p); parts.root.add(tag.obj); root.add(parts.root);
        entry = { parts, tag }; seated.set(p.id, entry);
      } else entry.tag.update(p);
    });
  }
  function tick() { requestAnimationFrame(tick); controls.update(); const activeCamera = bannersFocused ? bannerCamera : camera; renderer.render(scene, activeCamera); labels.render(scene, activeCamera); }
  requestAnimationFrame(tick);
  return { renderer, scene, camera, syncParticipants, setWallFeedHtml(html) { feedEl.innerHTML = html || '<p>No activity yet.</p>'; }, focusBanners() { bannersFocused = true; document.body.classList.add('banners-view'); frame(); }, resetView() { bannersFocused = false; document.body.classList.remove('banners-view'); frame(); } };
}
export function mountLounge(container) { return mountTradeScene(container); }
export function buildLounge(scene) { const root = buildRoomGeometry(new THREE.Group(), new THREE.TextureLoader()); scene.add(root); return root; }
