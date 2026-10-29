import * as THREE from 'three';
import { AREAS, BREAK_TABLES, DEPARTMENTS, LEAD_DESK, LOUNGE_FURNITURE, OFFICE_BOUNDS, OFFICE_ELEVATOR, RESEARCH_SCREENS, ROWS, USAGE_BOARD } from './layout.js';
import { box, boxGeo, glass, matte } from './materials.js';
import {
  armchair, bookshelf, coffeeTable, desk, fridge, kitchen, plant, roundTable, serverRack, sofa, stool,
  tallPlant, vending, wallArt, waterCooler, whiteboard,
} from './props.js';
import { animatedScreen } from './screens.js';
import { canvasTexture, carpetLettering, FONT, makeCanvas, woodPlanks } from './textures.js';
import { usageBoard } from './usageBoard.js';

const WALL_H = 4.6;
const WALL = '#d3cec5';

// Floor layers are spaced a few centimeters apart so they never depth-fight at overview distances.
const CARPET_Y = 0.02;
const RUG_Y = 0.04;
const LETTER_Y = 0.05;

function floorPlane(x0, x1, z0, z1, material, y = CARPET_Y) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), material);
  m.rotation.x = -Math.PI / 2;
  m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
  m.receiveShadow = true;
  return m;
}

function lettering(text, { cx, cz, w, h, color, y = LETTER_Y }) {
  const tex = carpetLettering(text, { widthM: w, heightM: h, color });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshLambertMaterial({ map: tex, transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.position.set(cx, y, cz);
  m.receiveShadow = true;
  m.renderOrder = 1;
  return m;
}

function signPlate(text, { w = 2.4, h = 0.5, bg = '#2d3540', fg = '#c9d3dd' }) {
  const c = makeCanvas(1024, Math.round((1024 * h) / w));
  const g = c.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = fg;
  g.font = `600 ${Math.round(c.height * 0.5)}px ${FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, c.width / 2, c.height / 2 + 2);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshLambertMaterial({ map: canvasTexture(c) }));
  return m;
}

function glassWall(x0, z0, x1, z1, height = 3.0) {
  const g = new THREE.Group();
  const len = Math.hypot(x1 - x0, z1 - z0);
  const angle = Math.atan2(x1 - x0, z1 - z0);
  const pane = new THREE.Mesh(new THREE.PlaneGeometry(len, height), glass('#b4cad8', 0.14));
  pane.position.set((x0 + x1) / 2, height / 2, (z0 + z1) / 2);
  pane.rotation.y = angle + Math.PI / 2;
  g.add(pane);
  const frame = matte('#4a5058');
  const rail = new THREE.Mesh(boxGeo(0.06, 0.06, len), frame);
  rail.position.set((x0 + x1) / 2, height, (z0 + z1) / 2);
  rail.rotation.y = angle;
  g.add(rail);
  const base = rail.clone();
  base.position.y = 0.03;
  g.add(base);
  const n = Math.max(1, Math.round(len / 2.4));
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    g.add(box(0.06, height, 0.06, frame, x0 + (x1 - x0) * u, 0, z0 + (z1 - z0) * u, { cast: false }));
  }
  return g;
}

export function buildOffice(scene, layout) {
  const root = new THREE.Group();
  root.name = 'office';
  scene.add(root);
  const { x0, x1, z0, z1 } = OFFICE_BOUNDS;
  const animated = [];

  // Slab and base floor.
  root.add(box(x1 - x0 + 0.6, 0.3, z1 - z0 + 0.6, '#9d978e', 0, -0.3, 0, { cast: false }));
  root.add(floorPlane(x0, x1, z0, z1, matte('#bfb9b0'), 0));

  // Department carpets with the department name lettered into the front strip (desks sit behind it).
  for (const d of DEPARTMENTS) {
    const row = ROWS[d.row];
    root.add(floorPlane(d.x0, d.x1, row.z0, row.z1, matte(d.carpet)));
    root.add(lettering(d.name.toUpperCase(), { cx: (d.x0 + d.x1) / 2, cz: row.letterZ, w: d.x1 - d.x0 - 1.4, h: row.letterH, color: d.letter }));
  }

  // Lead office: wood floor, glass walls, door gap facing the corridor.
  const lead = AREAS.lead;
  const woodTex = canvasTexture(woodPlanks({ base: '#8f6f53' }), { repeat: [3, 3] });
  root.add(floorPlane(lead.x0, lead.x1 + 1, lead.z0 - 1, lead.z1, new THREE.MeshLambertMaterial({ map: woodTex })));
  root.add(lettering('LEAD OFFICE', { cx: 25.5, cz: -10.1, w: 8.5, h: 1.3, color: '#a3866b' }));
  root.add(glassWall(lead.x0, lead.z1, lead.doorX - 0.8, lead.z1));
  root.add(glassWall(lead.doorX + 0.8, lead.z1, x1, lead.z1));
  root.add(glassWall(lead.x0, z0, lead.x0, lead.z1));
  root.add(glassWall(x1 - 0.1, z0, x1 - 0.1, lead.z1));
  const door = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 2.6), glass('#b4cad8', 0.18));
  door.position.set(lead.doorX - 0.8 + 0.53, 1.3, lead.z1 + 0.53);
  door.rotation.y = Math.PI / 4;
  root.add(door);
  const nameplate = signPlate('GROK BOT  ·  LEAD', { w: 2.2, h: 0.36 });
  nameplate.position.set(lead.doorX + 2.4, 2.4, lead.z1 + 0.02);
  root.add(nameplate);
  const leadDesk = desk({ x: LEAD_DESK.x, z: LEAD_DESK.z, width: LEAD_DESK.width, depth: 0.95, lead: true });
  root.add(leadDesk.group);
  layout.lead.desk.prop = leadDesk;
  root.add(armchair({ x: 29.75, z: -12.6, rot: -Math.PI / 2, color: '#6f6255' }));
  root.add(coffeeTable({ x: 29.6, z: -14.4, w: 0.9, d: 0.9 }));
  root.add(bookshelf({ x: 25, z: -21.6, w: 3.2 }));
  root.add(tallPlant({ x: 30.8, z: -20.6 }));
  root.add(plant({ x: 18, z: -20.5, size: 1.1 }));
  const rug = floorPlane(22.5, 28.5, -18.5, -13.2, matte('#6b5a4c'), RUG_Y);
  root.add(rug);

  // Department desks.
  const desks = [];
  for (const d of layout.departments) {
    for (const k of d.desks) {
      const p = desk({ x: k.x, z: k.z });
      root.add(p.group);
      k.prop = p;
      desks.push(k);
    }
  }

  // Back-wall whiteboards behind row A departments; plants at zone corners.
  for (const d of DEPARTMENTS) {
    const cx = (d.x0 + d.x1) / 2;
    if (d.row === 'A') {
      root.add(whiteboard({ x: d.name === 'Sales' ? cx + 2.6 : cx - 3.2, z: z0 + 0.18, w: 2.4, y: 1.2 }));
      root.add(plant({ x: d.x0 + 0.6, z: ROWS.A.z0 + 0.6 }));
      root.add(plant({ x: d.x1 - 0.6, z: ROWS.A.z0 + 0.6, size: 0.9 }));
    } else {
      root.add(plant({ x: d.x0 + 0.6, z: ROWS.B.z0 + 0.6, size: 0.9 }));
      root.add(plant({ x: d.x1 - 0.6, z: ROWS.B.z0 + 0.6 }));
    }
  }

  // Research: video wall with live-looking charts, a US map, and an AI terminal.
  const rs = RESEARCH_SCREENS;
  root.add(box(13.2, 0.08, 0.5, '#3a3f46', -6, 0, rs.z - 0.1));
  for (const sx of [-12.2, 0.2]) root.add(box(0.12, rs.bottom + rs.height + 0.15, 0.12, '#3a3f46', sx, 0, rs.z - 0.12));
  root.add(box(13.0, rs.height + 0.2, 0.08, '#262b31', -6, rs.bottom - 0.1, rs.z - 0.08));
  ['charts', 'map', 'terminal'].forEach((kind, i) => {
    const s = animatedScreen(kind, rs.width, rs.height);
    s.mesh.position.set(rs.xs[i], rs.bottom + rs.height / 2, rs.z);
    root.add(s.mesh);
    animated.push(s);
  });

  // Usage board on the back wall.
  const ub = USAGE_BOARD;
  const board = usageBoard({ width: ub.width, height: ub.height });
  board.mesh.position.set(ub.x, ub.y + ub.height / 2, ub.z + 0.05);
  root.add(box(ub.width + 0.16, ub.height + 0.16, 0.06, '#2a3038', ub.x, ub.y - 0.08, ub.z, { cast: false }));
  root.add(board.mesh);

  // Server room: glass partition, two rows of racks with blinking LEDs.
  const sv = AREAS.server;
  root.add(floorPlane(sv.x0, sv.x1 + 1, sv.z0, sv.z1, matte('#5c636b')));
  root.add(glassWall(sv.x0, sv.z0, sv.x0, sv.z1, 2.6));
  root.add(glassWall(sv.x0, sv.z1, sv.x1 + 1, sv.z1, 2.6));
  root.add(glassWall(sv.x0, sv.z0, sv.x1 + 1, sv.z0, 2.6));
  root.add(lettering('SERVER ROOM', { cx: 24, cz: 5.0, w: 7, h: 1.1, color: '#76808a' }));
  const ledPositions = [];
  for (const rz of [-2.2, 1.6]) {
    for (let i = 0; i < 11; i++) {
      const r = serverRack({ x: 18.6 + i * 1.0, z: rz });
      root.add(r.group);
      ledPositions.push(...r.leds);
    }
  }
  const ledMesh = new THREE.InstancedMesh(boxGeo(0.045, 0.03, 0.01), new THREE.MeshBasicMaterial({ toneMapped: false }), ledPositions.length);
  const tmp = new THREE.Object3D();
  ledPositions.forEach((p, i) => {
    tmp.position.set(...p);
    tmp.updateMatrix();
    ledMesh.setMatrixAt(i, tmp.matrix);
  });
  const ledOn = [new THREE.Color('#57b26a'), new THREE.Color('#5aa0c8'), new THREE.Color('#c99a4a')];
  const ledOff = new THREE.Color('#1f3326');
  let ledFrame = -1;
  const ledState = ledPositions.map((_, i) => (i * 7919) % 5);
  const updateLeds = (t) => {
    const frame = Math.floor(t * 5);
    if (frame === ledFrame) return;
    ledFrame = frame;
    for (let i = 0; i < ledPositions.length; i++) {
      ledState[i] = (ledState[i] * 1103515245 + 12345 + i) % 2147483648;
      const on = ledState[i] % 7 < 4;
      ledMesh.setColorAt(i, on ? ledOn[(i >> 1) % 3 === 0 && i % 2 ? 2 : i % 2] : ledOff);
    }
    ledMesh.instanceColor.needsUpdate = true;
  };
  updateLeds(0);
  root.add(ledMesh);
  animated.push({ update: updateLeds });

  // Lounge.
  const lg = AREAS.lounge;
  root.add(floorPlane(lg.x0, lg.x1, lg.z0, lg.z1, matte('#8a8275')));
  root.add(floorPlane(-29.6, -17.2, 12.6, 18.4, matte('#6f7d78'), RUG_Y));
  for (const s of LOUNGE_FURNITURE.sofas) root.add(sofa(s));
  for (const a of LOUNGE_FURNITURE.armchairs) root.add(armchair(a));
  for (const t of LOUNGE_FURNITURE.tables) root.add(coffeeTable(t));
  root.add(bookshelf({ x: -24, z: 21.5, rot: Math.PI, w: 2.4 }));
  root.add(tallPlant({ x: -30.6, z: 20.6 }));
  root.add(tallPlant({ x: -15.6, z: 20.6 }));
  root.add(plant({ x: -30.5, z: 11.6 }));
  root.add(lettering('LOUNGE', { cx: -23, cz: 20.85, w: 3.2, h: 0.55, color: '#9a9284' }));
  const tv = box(2.6, 1.5, 0.08, '#1c2026', 0, 0, 0, { cast: false });
  tv.position.set(-31.84, 2.2, 15.5);
  tv.rotation.y = Math.PI / 2;
  root.add(tv);

  // Break room.
  const br = AREAS.breakRoom;
  root.add(floorPlane(br.x0, br.x1, br.z0, br.z1, matte('#c8c2b6')));
  root.add(kitchen({ x: -6, z: 20.5, w: 8, rot: Math.PI }));
  root.add(fridge({ x: -11.6, z: 20.4, rot: Math.PI }));
  root.add(vending({ x: 0.0, z: 20.4, rot: Math.PI }));
  root.add(waterCooler({ x: -12.4, z: 12.0 }));
  for (const t of BREAK_TABLES) {
    root.add(roundTable(t));
    root.add(stool({ x: t.x - 0.85, z: t.z }));
    root.add(stool({ x: t.x + 0.85, z: t.z }));
  }
  root.add(lettering('BREAK ROOM', { cx: -6, cz: 18.6, w: 5, h: 0.8, color: '#aaa396' }));
  root.add(plant({ x: 0.4, z: 11.6, size: 0.9 }));

  // Hot desks for rooftop bots when they are working.
  const hd = AREAS.hotDesks;
  root.add(floorPlane(hd.x0, hd.x1, hd.z0, hd.z1, matte('#6a7179')));
  for (const k of layout.hot) {
    const p = desk({ x: k.x, z: k.z });
    root.add(p.group);
    k.prop = p;
  }
  root.add(lettering('HOT DESKS', { cx: 9, cz: 20.15, w: 6, h: 1.2, color: '#858c94' }));

  // Lobby with the elevator up to the rooftop.
  const lb = AREAS.lobby;
  root.add(floorPlane(lb.x0, lb.x1 + 1, lb.z0, lb.z1 + 1, matte('#a9a59d')));
  const ex = OFFICE_ELEVATOR.x;
  const ez = OFFICE_ELEVATOR.z;
  const shaft = box(1.8, 3.2, 3.0, '#59606a', ex + 0.6, 0, ez);
  shaft.userData.occluder = true;
  root.add(shaft);
  root.add(box(0.05, 2.5, 1.0, '#8a929b', ex - 0.32, 0, ez - 0.51));
  root.add(box(0.05, 2.5, 1.0, '#8a929b', ex - 0.32, 0, ez + 0.51));
  const upSign = signPlate('ROOFTOP  ↑', { w: 1.8, h: 0.4 });
  upSign.position.set(ex - 0.33, 2.85, ez);
  upSign.rotation.y = -Math.PI / 2;
  root.add(upSign);
  root.add(tallPlant({ x: 30.5, z: 12.2 }));
  root.add(tallPlant({ x: 30.5, z: 19.8 }));
  root.add(box(2.4, 0.45, 0.6, '#6c7a86', 21.5, 0, 20.6));
  root.add(plant({ x: 18, z: 20.6 }));

  // Corridor plants.
  for (const [px, pz] of [[-14, -5.5 + 1.2], [2, 9.5 - 1.1], [16, 9.5 + 1.1], [-31.2, 9.5], [31.2, -5.5]]) {
    root.add(plant({ x: px, z: pz, size: 0.8, pot: '#6d7278' }));
  }

  // Walls: tall back and left walls, low ledges on the open (camera-facing) sides.
  for (const wall of [box(x1 - x0 + 0.6, WALL_H, 0.3, WALL, 0, 0, z0 - 0.15), box(0.3, WALL_H, z1 - z0 + 0.6, WALL, x0 - 0.15, 0, 0)]) {
    wall.userData.occluder = true;
    root.add(wall);
  }
  root.add(box(x1 - x0 + 0.6, 0.45, 0.25, '#b3ada3', 0, 0, z1 + 0.13));
  root.add(box(0.25, 0.45, z1 - z0 + 0.6, '#b3ada3', x1 + 0.13, 0, 0));
  root.add(box(x1 - x0 + 0.6, 0.12, 0.34, '#9f998f', 0, WALL_H, z0 - 0.15, { cast: false }));
  root.add(wallArt({ x: -31.8, y: 2.3, z: -14, rot: Math.PI / 2 }));
  root.add(wallArt({ x: -31.8, y: 2.3, z: 2, rot: Math.PI / 2, colors: ['#b0806a', '#7d93ab'] }));
  root.add(wallArt({ x: 10, y: 2.6, z: z0 + 0.02, w: 1.8, h: 1.1, colors: ['#6e8f73', '#c09a6b', '#8a7aa0'] }));
  root.add(wallArt({ x: -6, y: 3.3, z: z0 + 0.02, w: 1.2, h: 0.8 }));
  const logo = signPlate('SPARA  ·  BOT OFFICE', { w: 4.2, h: 0.6, bg: '#3a4552', fg: '#cdd6df' });
  logo.position.set(-23, 3.8, z0 + 0.02);
  root.add(logo);

  const allDesks = [layout.lead.desk, ...desks, ...layout.hot];

  return {
    root,
    usageBoard: board,
    desks: allDesks,
    update(t) {
      for (const a of animated) a.update(t);
    },
  };
}

