import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { createBotModel, applyPose } from '../scene/bot.js';

export const PALETTE = {
  green: 0x0f2e1f,
  gold: 0xc9a227,
  blue: 0x00316b,
  sky: 0x0082c3,
  cream: 0xf5ecd8,
};

export const BADGE_URL = '/trade/badge.png';

const LOUNGE_VIEW = {
  target: [0, 1.05, -0.6],
  dir: [0.05, 0.52, 0.85],
  fitWidth: 26,
  fitHeight: 16,
};

const SEAT_SLOTS = [
  { x: 0, z: 2.35, rot: Math.PI },
  { x: 2.1, z: 1.65, rot: Math.PI * 0.72 },
  { x: 2.55, z: -0.2, rot: Math.PI * 0.35 },
  { x: 1.55, z: -2.05, rot: 0 },
  { x: -1.55, z: -2.05, rot: 0 },
  { x: -2.55, z: -0.2, rot: -Math.PI * 0.35 },
  { x: -2.1, z: 1.65, rot: -Math.PI * 0.72 },
  { x: 0.85, z: -2.35, rot: 0.08 },
];

const AVATAR_COLORS = ['cyan', 'blue', 'orange', 'violet', 'green', 'teal', 'yellow', 'red'];

function fitCamera(camera, width, height, view = LOUNGE_VIEW) {
  const aspect = width / Math.max(1, height);
  const vfov = THREE.MathUtils.degToRad(camera.fov);
  const distH = view.fitHeight / 2 / Math.tan(vfov / 2);
  const hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect);
  const distW = view.fitWidth / 2 / Math.tan(hfov / 2);
  const dist = Math.max(distH, distW) * (aspect < 1 ? 0.82 : 1.02);
  const dir = new THREE.Vector3(...view.dir).normalize();
  const target = new THREE.Vector3(...view.target);
  camera.position.copy(target).addScaledVector(dir, dist);
  return target;
}

function createTradeTag(participant) {
  const el = document.createElement('div');
  el.className = 'trade-tag';
  el.dataset.participantId = participant.id;
  const name = document.createElement('span');
  name.className = 'trade-tag-name';
  name.textContent = participant.name;
  const status = document.createElement('span');
  status.className = 'trade-tag-status';
  status.textContent = participant.status || 'At table';
  el.append(name, status);
  const obj = new CSS2DObject(el);
  obj.center.set(0.5, 1);
  obj.position.y = 1.55;
  return { obj, el, update(p) {
    name.textContent = p.name;
    status.textContent = p.status || 'At table';
  } };
}

function buildRoomGeometry(root, textureLoader) {
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(32, 24),
    new THREE.MeshLambertMaterial({ color: PALETTE.green }),
  );
  floor.rotation.x = -Math.PI / 2;
  root.add(floor);

  const rug = new THREE.Mesh(
    new THREE.PlaneGeometry(14, 10),
    new THREE.MeshLambertMaterial({ color: PALETTE.blue }),
  );
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(0, 0.02, -0.2);
  root.add(rug);

  const backWall = new THREE.Mesh(
    new THREE.PlaneGeometry(22, 8),
    new THREE.MeshLambertMaterial({ color: PALETTE.blue }),
  );
  backWall.position.set(0, 4, -7.2);
  root.add(backWall);

  const badgeTex = textureLoader.load(BADGE_URL);
  badgeTex.colorSpace = THREE.SRGBColorSpace;
  const badge = new THREE.Mesh(
    new THREE.PlaneGeometry(4.2, 4.2),
    new THREE.MeshBasicMaterial({ map: badgeTex, transparent: true }),
  );
  badge.position.set(0, 4.2, -7.15);
  root.add(badge);

  const screenFrame = new THREE.Mesh(
    new THREE.BoxGeometry(9.6, 4.8, 0.15),
    new THREE.MeshLambertMaterial({ color: 0x1a1a1a }),
  );
  screenFrame.position.set(0, 2.35, -7.05);
  root.add(screenFrame);

  const screenBezel = new THREE.Mesh(
    new THREE.BoxGeometry(9.9, 5.1, 0.08),
    new THREE.MeshLambertMaterial({ color: PALETTE.gold }),
  );
  screenBezel.position.set(0, 2.35, -7.12);
  root.add(screenBezel);

  const tableTop = new THREE.Mesh(
    new THREE.CylinderGeometry(3.2, 3.35, 0.14, 24),
    new THREE.MeshLambertMaterial({ color: PALETTE.green }),
  );
  tableTop.position.set(0, 0.78, -0.2);
  root.add(tableTop);

  const tableSkirt = new THREE.Mesh(
    new THREE.CylinderGeometry(3.35, 3.5, 0.72, 24),
    new THREE.MeshLambertMaterial({ color: PALETTE.blue }),
  );
  tableSkirt.position.set(0, 0.4, -0.2);
  root.add(tableSkirt);

  const tableGold = new THREE.Mesh(
    new THREE.TorusGeometry(3.22, 0.06, 8, 48),
    new THREE.MeshLambertMaterial({ color: PALETTE.gold }),
  );
  tableGold.rotation.x = Math.PI / 2;
  tableGold.position.set(0, 0.86, -0.2);
  root.add(tableGold);

  for (const seat of SEAT_SLOTS) {
    const chair = new THREE.Group();
    const pad = new THREE.Mesh(
      new THREE.BoxGeometry(0.75, 0.12, 0.75),
      new THREE.MeshLambertMaterial({ color: PALETTE.sky }),
    );
    pad.position.y = 0.48;
    const back = new THREE.Mesh(
      new THREE.BoxGeometry(0.75, 0.7, 0.1),
      new THREE.MeshLambertMaterial({ color: PALETTE.blue }),
    );
    back.position.set(0, 0.85, 0.32);
    chair.add(pad, back);
    chair.position.set(seat.x, 0, seat.z);
    chair.rotation.y = seat.rot;
    root.add(chair);
  }

  const sideWallMat = new THREE.MeshLambertMaterial({ color: 0x0a2418 });
  for (const sx of [-1, 1]) {
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(24, 8), sideWallMat);
    wall.rotation.y = sx * Math.PI / 2;
    wall.position.set(sx * 11, 4, -0.5);
    root.add(wall);
  }
}

/**
 * @param {HTMLElement} container
 * @param {{ wallFeed?: boolean }} [options]
 */
export function mountTradeScene(container, { wallFeed = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio || 1);
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  const labels = new CSS2DRenderer();
  labels.setSize(container.clientWidth, container.clientHeight);
  labels.domElement.className = 'trade-labels';
  container.appendChild(labels.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.green);
  scene.fog = new THREE.Fog(PALETTE.green, 22, 48);

  const camera = new THREE.PerspectiveCamera(38, container.clientWidth / container.clientHeight, 0.2, 80);
  const controlsTarget = fitCamera(camera, container.clientWidth, container.clientHeight);

  const root = new THREE.Group();
  scene.add(root);
  buildRoomGeometry(root, new THREE.TextureLoader());

  const hemi = new THREE.HemisphereLight(PALETTE.cream, PALETTE.green, 1.15);
  root.add(hemi);
  const spot = new THREE.SpotLight(PALETTE.cream, 90, 35, 0.55, 0.35);
  spot.position.set(2, 11, 8);
  spot.target.position.set(0, 1, -2);
  root.add(spot, spot.target);

  const feedEl = document.createElement('div');
  feedEl.className = 'trade-wall-screen';
  if (!wallFeed) {
    feedEl.innerHTML = '<p class="trade-wall-empty">GVEGAS GRIDIRON · Pick a room to watch live trades.</p>';
  }
  const feedObj = new CSS2DObject(feedEl);
  feedObj.position.set(0, 2.35, -6.92);
  root.add(feedObj);

  const botsRoot = new THREE.Group();
  root.add(botsRoot);
  /** @type {Map<string, { root: THREE.Group, tag: ReturnType<typeof createTradeTag>, parts: object }>} */
  const seated = new Map();

  const controls = new OrbitControls(camera, labels.domElement);
  controls.target.copy(controlsTarget);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.maxPolarAngle = Math.PI * 0.48;
  controls.minPolarAngle = Math.PI * 0.18;
  controls.minDistance = 12;
  controls.maxDistance = 32;

  function onResize() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    labels.setSize(w, h);
    const t = fitCamera(camera, w, h);
    controls.target.copy(t);
  }
  window.addEventListener('resize', onResize);

  function syncParticipants(list) {
    const ids = new Set(list.map((p) => p.id));
    for (const [id, entry] of seated) {
      if (!ids.has(id)) {
        botsRoot.remove(entry.root);
        seated.delete(id);
      }
    }
    list.slice(0, SEAT_SLOTS.length).forEach((p, i) => {
      const slot = SEAT_SLOTS[i];
      let entry = seated.get(p.id);
      if (!entry) {
        const color = AVATAR_COLORS[i % AVATAR_COLORS.length];
        const parts = createBotModel({ id: p.id, name: p.name, avatarColor: color });
        applyPose(parts, 'sit');
        const tag = createTradeTag(p);
        parts.root.add(tag.obj);
        parts.root.position.set(slot.x, 0.02, slot.z);
        parts.root.rotation.y = slot.rot + Math.PI;
        botsRoot.add(parts.root);
        entry = { root: parts.root, tag, parts };
        seated.set(p.id, entry);
      } else {
        entry.tag.update(p);
      }
    });
  }

  function setWallFeedHtml(html) {
    feedEl.innerHTML = html || '<p class="trade-wall-empty">No activity yet.</p>';
  }

  let t0 = performance.now();
  function tick(now) {
    requestAnimationFrame(tick);
    const t = (now - t0) / 1000;
    for (const { parts } of seated.values()) applyPose(parts, 'sit', t);
    controls.update();
    renderer.render(scene, camera);
    labels.render(scene, camera);
  }
  requestAnimationFrame(tick);

  return {
    renderer,
    scene,
    camera,
    syncParticipants,
    setWallFeedHtml,
  };
}

/** @deprecated use mountTradeScene */
export function mountLounge(container) {
  return mountTradeScene(container, { wallFeed: false });
}

export function buildLounge(scene) {
  const root = new THREE.Group();
  scene.add(root);
  buildRoomGeometry(root, new THREE.TextureLoader());
  return root;
}
