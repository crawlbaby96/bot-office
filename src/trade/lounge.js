import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export const PALETTE = {
  green: 0x0f2e1f,
  gold: 0xc9a227,
  blue: 0x00316b,
  sky: 0x0082c3,
  cream: 0xf5ecd8,
};

export function buildLounge(scene) {
  const root = new THREE.Group();
  scene.add(root);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(36, 28),
    new THREE.MeshLambertMaterial({ color: PALETTE.green }),
  );
  floor.rotation.x = -Math.PI / 2;
  root.add(floor);

  const rug = new THREE.Mesh(
    new THREE.PlaneGeometry(18, 12),
    new THREE.MeshLambertMaterial({ color: PALETTE.blue }),
  );
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(0, 0.01, 0);
  root.add(rug);

  const emblem = buildEmblem();
  emblem.position.set(0, 3.2, -6.5);
  root.add(emblem);

  const bar = new THREE.Mesh(
    new THREE.BoxGeometry(14, 1.2, 2),
    new THREE.MeshLambertMaterial({ color: PALETTE.blue }),
  );
  bar.position.set(0, 0.6, 8);
  root.add(bar);

  const goldTrim = new THREE.Mesh(
    new THREE.BoxGeometry(14.2, 0.12, 2.2),
    new THREE.MeshLambertMaterial({ color: PALETTE.gold }),
  );
  goldTrim.position.set(0, 1.25, 8);
  root.add(goldTrim);

  for (let i = -2; i <= 2; i++) {
    const stool = new THREE.Mesh(
      new THREE.CylinderGeometry(0.45, 0.5, 0.9, 12),
      new THREE.MeshLambertMaterial({ color: PALETTE.sky }),
    );
    stool.position.set(i * 2.2, 0.45, 6.2);
    root.add(stool);
  }

  const hemi = new THREE.HemisphereLight(PALETTE.cream, PALETTE.green, 1.1);
  root.add(hemi);
  const spot = new THREE.SpotLight(PALETTE.cream, 120, 40, 0.5, 0.4);
  spot.position.set(0, 12, 4);
  spot.target.position.set(0, 2, -6);
  root.add(spot, spot.target);

  return root;
}

function buildEmblem() {
  const g = new THREE.Group();
  const shield = new THREE.Mesh(
    new THREE.CircleGeometry(2.4, 6),
    new THREE.MeshLambertMaterial({ color: PALETTE.gold }),
  );
  g.add(shield);
  const inner = new THREE.Mesh(
    new THREE.CircleGeometry(1.85, 6),
    new THREE.MeshLambertMaterial({ color: PALETTE.green }),
  );
  inner.position.z = 0.02;
  g.add(inner);
  const letter = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 1.6, 0.15),
    new THREE.MeshLambertMaterial({ color: PALETTE.sky }),
  );
  letter.position.set(0, 0, 0.12);
  g.add(letter);
  return g;
}

export function mountLounge(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio || 1);
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.green);
  scene.fog = new THREE.Fog(PALETTE.green, 18, 55);

  const camera = new THREE.PerspectiveCamera(42, container.clientWidth / container.clientHeight, 0.1, 120);
  camera.position.set(0, 7, 16);

  buildLounge(scene);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 1.5, -1);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.minDistance = 8;
  controls.maxDistance = 28;

  function onResize() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }
  window.addEventListener('resize', onResize);

  function tick() {
    requestAnimationFrame(tick);
    controls.update();
    renderer.render(scene, camera);
  }
  tick();

  return { renderer, scene, camera };
}
