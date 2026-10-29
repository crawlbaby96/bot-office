import * as THREE from 'three';
import { FIRE_PIT, ROOF_BOUNDS, ROOF_ELEVATOR, ROOF_LOUNGER_XS, ROOF_SEAT_ANGLES, ROOF_SEAT_R, ROOF_Y } from './layout.js';
import { box, boxGeo, glass, matte, unlit } from './materials.js';
import { firePit, lounger, outdoorChair, palmTree, planterBox, plant, stool, umbrella } from './props.js';
import { canvasTexture, facadeCanvas, FONT, makeCanvas, woodPlanks } from './textures.js';

function rng(seed) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

function facadeMaterial(opts, repeat) {
  const tex = canvasTexture(facadeCanvas(opts), { repeat });
  return new THREE.MeshLambertMaterial({ map: tex });
}

/** Box with UVs scaled to its size so one shared facade texture tiles at a constant window size. */
function building(w, h, d, material, x, z, y = 0, tile = 4) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const uv = geo.attributes.uv;
  const normal = geo.attributes.normal;
  for (let i = 0; i < uv.count; i++) {
    const nx = Math.abs(normal.getX(i));
    const ny = Math.abs(normal.getY(i));
    const sx = ny > 0.5 ? 0 : nx > 0.5 ? d : w;
    uv.setXY(i, uv.getX(i) * (sx / tile), uv.getY(i) * (ny > 0.5 ? 0 : h / tile));
  }
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y + h / 2, z);
  m.castShadow = false;
  m.receiveShadow = true;
  return m;
}

function catenary(a, b, sag, n) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const p = new THREE.Vector3().lerpVectors(a, b, u);
    p.y -= sag * 4 * u * (1 - u);
    pts.push(p);
  }
  return pts;
}

export function buildRooftop(scene) {
  const root = new THREE.Group();
  root.name = 'rooftop';
  scene.add(root);
  const { x0, x1, z0, z1 } = ROOF_BOUNDS;
  const w = x1 - x0;
  const d = z1 - z0;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;

  // Tower under the deck.
  const towerMat = facadeMaterial({ base: '#8b96a1', windowColor: '#55626f', litColor: '#a9b4bd', cols: 6, rows: 3, lit: 0.0, seed: 11 }, [1, 1]);
  const tower = building(w, ROOF_Y - 0.25, d, towerMat, cx, cz, 0, 4.5);
  tower.castShadow = true;
  tower.userData.occluder = true;
  root.add(tower);

  // Deck.
  const planks = canvasTexture(woodPlanks({ base: '#a07f60', planks: 10 }), { repeat: [w / 4, d / 4] });
  const deck = new THREE.Mesh(new THREE.BoxGeometry(w, 0.25, d), [
    matte('#7d6853'), matte('#7d6853'), new THREE.MeshLambertMaterial({ map: planks }), matte('#7d6853'), matte('#7d6853'), matte('#7d6853'),
  ]);
  deck.position.set(cx, ROOF_Y - 0.125, cz);
  deck.receiveShadow = true;
  deck.userData.occluder = true;
  root.add(deck);

  // Glass railing.
  const rail = glass('#b9cdd9', 0.18);
  const railTop = matte('#5a6067');
  const edges = [
    [x0, z0, x1, z0], [x1, z0, x1, z1], [x1, z1, x0, z1], [x0, z1, x0, z0],
  ];
  for (const [ax, az, bx, bz] of edges) {
    const len = Math.hypot(bx - ax, bz - az);
    const ang = Math.atan2(bx - ax, bz - az);
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(len, 1.05), rail);
    pane.position.set((ax + bx) / 2, ROOF_Y + 0.52, (az + bz) / 2);
    pane.rotation.y = ang + Math.PI / 2;
    root.add(pane);
    const top = new THREE.Mesh(boxGeo(0.07, 0.06, len), railTop);
    top.position.set((ax + bx) / 2, ROOF_Y + 1.06, (az + bz) / 2);
    top.rotation.y = ang;
    root.add(top);
  }

  // Fire-pit lounge (seat furniture matches the idle spots in layout.js).
  root.add(firePit({ x: FIRE_PIT.x, z: FIRE_PIT.z, y: ROOF_Y, r: FIRE_PIT.r }));
  for (const deg of ROOF_SEAT_ANGLES) {
    const t = (deg * Math.PI) / 180;
    const c = Math.cos(t);
    const s = Math.sin(t);
    root.add(outdoorChair({ x: FIRE_PIT.x + ROOF_SEAT_R * c, z: FIRE_PIT.z + ROOF_SEAT_R * s, y: ROOF_Y, rot: Math.atan2(-c, -s) }));
  }
  const rug = new THREE.Mesh(new THREE.CircleGeometry(5.6, 40), matte('#7b7468'));
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(FIRE_PIT.x, ROOF_Y + 0.03, FIRE_PIT.z);
  rug.receiveShadow = true;
  root.add(rug);

  // Loungers facing the skyline, umbrellas between them.
  for (const lx of ROOF_LOUNGER_XS) root.add(lounger({ x: lx, z: -54.2, rot: Math.PI, y: ROOF_Y }));
  for (const ux of [9.25, 14.25]) root.add(umbrella({ x: ux, z: -56.3, y: ROOF_Y }));

  // Bar.
  root.add(box(1.0, 1.1, 8, '#5b4a3b', -19.5, ROOF_Y, -44));
  root.add(box(1.2, 0.06, 8.2, '#c9bfae', -19.5, ROOF_Y + 1.1, -44));
  root.add(box(0.5, 2.2, 8, '#4a3d32', -22.8, ROOF_Y, -44));
  for (let i = 0; i < 6; i++) root.add(box(0.12, 0.3, 0.12, ['#7a9a6a', '#b68b5a', '#8a6a9a'][i % 3], -22.4, ROOF_Y + 1.25, -47 + i * 1.2, { cast: false }));
  for (let i = 0; i < 4; i++) root.add(stool({ x: -18.4, z: -47 + i * 2, y: ROOF_Y }));
  root.add(umbrella({ x: -12, z: -52, y: ROOF_Y, color: '#c9b79a' }));
  root.add(umbrella({ x: -12, z: -36.5, y: ROOF_Y, color: '#c9b79a' }));

  // Greenery.
  for (const [px, pz, h] of [[-22.5, -33.5, 5.2], [-22.5, -56.5, 4.6], [22.5, -56.5, 5.4], [-14, -33.4, 4.2]]) {
    root.add(planterBox({ x: px, z: pz, y: ROOF_Y, w: 1.2, d: 1.2 }));
    root.add(palmTree({ x: px, z: pz, y: ROOF_Y + 0.5, height: h, rot: px }));
  }
  root.add(planterBox({ x: -8, z: -57.4, y: ROOF_Y, w: 6, d: 0.7 }));
  root.add(planterBox({ x: 23.4, z: -46, y: ROOF_Y, w: 6, d: 0.7, rot: Math.PI / 2 }));
  root.add(plant({ x: 14, z: -33, y: ROOF_Y }));
  root.add(plant({ x: -4, z: -33, y: ROOF_Y }));

  // Elevator kiosk back down to the office.
  const ex = ROOF_ELEVATOR.x;
  const ez = ROOF_ELEVATOR.z;
  const kiosk = box(2.8, 3.0, 3.0, '#5f6670', ex + 0.6, ROOF_Y, ez);
  kiosk.userData.occluder = true;
  root.add(kiosk);
  root.add(box(3.0, 0.15, 3.2, '#4a5058', ex + 0.6, ROOF_Y + 3.0, ez));
  root.add(box(0.05, 2.5, 1.0, '#8a929b', ex - 0.82, ROOF_Y, ez - 0.51));
  root.add(box(0.05, 2.5, 1.0, '#8a929b', ex - 0.82, ROOF_Y, ez + 0.51));
  const c = makeCanvas(1024, 256);
  const g = c.getContext('2d');
  g.fillStyle = '#2d3540';
  g.fillRect(0, 0, 1024, 256);
  g.fillStyle = '#c9d3dd';
  g.font = `600 120px ${FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('OFFICE  ↓', 512, 134);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.45), new THREE.MeshLambertMaterial({ map: canvasTexture(c) }));
  sign.position.set(ex - 0.83, ROOF_Y + 2.75, ez);
  sign.rotation.y = -Math.PI / 2;
  root.add(sign);

  // String lights: poles along both long edges, warm bulbs on gently sagging wires.
  const poleMat = matte('#3d4248');
  const bulbs = [];
  const wireMat = new THREE.LineBasicMaterial({ color: '#3a3a38' });
  const poleZs = [-34, -40, -46, -52, -57];
  for (const pz of poleZs) {
    for (const px of [x0 + 0.4, x1 - 0.4]) root.add(box(0.1, 3.6, 0.1, poleMat, px, ROOF_Y, pz));
  }
  const wires = [];
  for (let i = 0; i < poleZs.length; i++) {
    wires.push([new THREE.Vector3(x0 + 0.4, ROOF_Y + 3.5, poleZs[i]), new THREE.Vector3(x1 - 0.4, ROOF_Y + 3.5, poleZs[i])]);
    if (i < poleZs.length - 1) {
      wires.push([new THREE.Vector3(x0 + 0.4, ROOF_Y + 3.5, poleZs[i]), new THREE.Vector3(x1 - 0.4, ROOF_Y + 3.5, poleZs[i + 1])]);
    }
  }
  for (const [a, b] of wires) {
    const pts = catenary(a, b, 0.9, 40);
    root.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), wireMat));
    for (let k = 1; k < pts.length - 1; k += 2) bulbs.push(pts[k]);
  }
  const bulbMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.065, 10, 8), unlit('#f0d29a'), bulbs.length);
  const tmp = new THREE.Object3D();
  bulbs.forEach((p, i) => {
    tmp.position.copy(p).add(new THREE.Vector3(0, -0.08, 0));
    tmp.updateMatrix();
    bulbMesh.setMatrixAt(i, tmp.matrix);
  });
  root.add(bulbMesh);

  return { root };
}

export function buildSurroundings(scene) {
  const root = new THREE.Group();
  root.name = 'surroundings';
  scene.add(root);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), matte('#7f8a6d'));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.31;
  ground.receiveShadow = true;
  root.add(ground);
  const plaza = new THREE.Mesh(new THREE.PlaneGeometry(90, 110), matte('#a8a397'));
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.set(0, -0.3, -14);
  plaza.receiveShadow = true;
  root.add(plaza);
  const road = new THREE.Mesh(new THREE.PlaneGeometry(900, 12), matte('#5d6064'));
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, -0.295, 48);
  root.add(road);
  const road2 = new THREE.Mesh(new THREE.PlaneGeometry(12, 900), matte('#5d6064'));
  road2.rotation.x = -Math.PI / 2;
  road2.position.set(54, -0.296, 0);
  root.add(road2);

  for (const [px, pz] of [[-38, 30], [-20, 32], [0, 32], [20, 32], [38, 30], [44, 10], [44, -12], [44, -34], [-38, -40], [38, -62]]) {
    root.add(palmTree({ x: px, z: pz, y: -0.3, height: 6 + (Math.abs(px + pz) % 3), rot: px * 0.37 }));
  }

  // Skyline: low-rise campus buildings near, taller towers farther back; deterministic layout.
  const rand = rng(42);
  const mats = [
    facadeMaterial({ base: '#8c98a6', windowColor: '#5a6878', litColor: '#b9c3cc', seed: 5, lit: 0.05 }, [1, 1]),
    facadeMaterial({ base: '#a49c90', windowColor: '#66707a', litColor: '#c8c0ad', seed: 9, lit: 0.05 }, [1, 1]),
    facadeMaterial({ base: '#7a8794', windowColor: '#4e5b69', litColor: '#a8b6c2', seed: 13, lit: 0.06 }, [1, 1]),
    facadeMaterial({ base: '#9aa6a0', windowColor: '#5d6a66', litColor: '#bcc6c0', seed: 17, lit: 0.04 }, [1, 1]),
  ];
  for (let i = 0; i < 80; i++) {
    const far = i > 34;
    const x = (rand() - 0.5) * (far ? 520 : 300);
    const z = far ? -230 - rand() * 130 : -115 - rand() * 80;
    const h = far ? 30 + rand() * 70 : 7 + rand() * 18;
    const bw = 12 + rand() * (far ? 18 : 26);
    const bd = 12 + rand() * 18;
    root.add(building(bw, h, bd, mats[i % mats.length], x, z, -0.3, 4));
  }
  for (let i = 0; i < 18; i++) {
    const side = i % 2 ? 1 : -1;
    const x = side * (75 + rand() * 120);
    const z = -40 + rand() * 90;
    root.add(building(12 + rand() * 18, 6 + rand() * 12, 12 + rand() * 16, mats[(i + 1) % mats.length], x, z, -0.3, 4));
  }

  // Hills on the horizon.
  const hillMat = matte('#8c9372', { flat: true });
  for (let i = 0; i < 9; i++) {
    const hill = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), hillMat);
    hill.scale.set(90 + rand() * 80, 30 + rand() * 30, 50);
    hill.position.set(-360 + i * 90, -0.3, -360 - rand() * 40);
    root.add(hill);
  }

  return { root };
}

export function buildSky(scene) {
  const geo = new THREE.SphereGeometry(700, 32, 16);
  const top = new THREE.Color('#8fb3d6');
  const horizon = new THREE.Color('#e9dcc8');
  const colors = [];
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const t = Math.max(0, Math.min(1, pos.getY(i) / 300));
    const c = horizon.clone().lerp(top, Math.pow(t, 0.6));
    colors.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const sky = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, toneMapped: false }));
  scene.add(sky);
  scene.fog = new THREE.Fog('#dcd6ca', 110, 480);
  return sky;
}
