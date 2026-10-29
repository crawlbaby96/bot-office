import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { ROOF_Y, USAGE_BOARD } from './layout.js';
import { setMaxAnisotropy } from './textures.js';

const VIEWS = {
  office: { target: [0.5, 0, 1.5], dir: [0.1, 0.64, 0.76], fitWidth: 70, fitHeight: 50, portrait: { target: [0, 0, -6], dir: [0.05, 0.86, 0.5] } },
  rooftop: { target: [2, ROOF_Y + 2, -50], dir: [0.1, 0.34, 0.93], fitWidth: 34, fitHeight: 22 },
  board: { target: [USAGE_BOARD.x, USAGE_BOARD.y + USAGE_BOARD.height / 2, USAGE_BOARD.z], dir: [0, 0.18, 1], fitWidth: USAGE_BOARD.width + 1.2, fitHeight: USAGE_BOARD.height + 1.1 },
  lead: { target: [24, 0.6, -14.2], dir: [-0.2, 0.75, 0.62], fitWidth: 18, fitHeight: 13.5 },
};

export function createWorld(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  // Always render at native device resolution; quality fallbacks drop effects, never resolution.
  renderer.setPixelRatio(window.devicePixelRatio || 1);
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);
  setMaxAnisotropy(renderer.capabilities.getMaxAnisotropy());

  const labels = new CSS2DRenderer();
  labels.setSize(container.clientWidth, container.clientHeight);
  labels.domElement.className = 'labels';
  container.appendChild(labels.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, container.clientWidth / container.clientHeight, 1, 1400);

  const hemi = new THREE.HemisphereLight('#dfe8f1', '#8a7f70', 1.55);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff3e2', 1.9);
  sun.position.set(38, 70, 34);
  sun.target.position.set(0, 0, -16);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  const sc = sun.shadow.camera;
  sc.left = -62;
  sc.right = 62;
  sc.top = 62;
  sc.bottom = -62;
  sc.near = 10;
  sc.far = 220;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);

  const controls = new OrbitControls(camera, labels.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.12;
  controls.screenSpacePanning = true;
  controls.maxPolarAngle = Math.PI * 0.47;
  controls.minDistance = 4;
  controls.maxDistance = 190;
  controls.zoomToCursor = true;

  function viewPose(name) {
    const aspect = container.clientWidth / Math.max(1, container.clientHeight);
    const base = typeof name === 'string' ? VIEWS[name] : name;
    const v = aspect < 1 && base.portrait ? { ...base, ...base.portrait } : base;
    const vfov = THREE.MathUtils.degToRad(camera.fov);
    const distH = v.fitHeight / 2 / Math.tan(vfov / 2);
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect);
    const distW = v.fitWidth / 2 / Math.tan(hfov / 2);
    const dist = Math.max(distH, distW) * (aspect < 1 ? 0.78 : 1);
    const dir = new THREE.Vector3(...v.dir).normalize();
    const target = new THREE.Vector3(...v.target);
    return { target, position: target.clone().addScaledVector(dir, dist) };
  }

  let tween = null;
  function goTo(name, { instant = false } = {}) {
    const pose = viewPose(name);
    if (instant) {
      camera.position.copy(pose.position);
      controls.target.copy(pose.target);
      controls.update();
      tween = null;
      return;
    }
    tween = { from: camera.position.clone(), fromT: controls.target.clone(), to: pose.position, toT: pose.target, t: 0, dur: 1.1 };
  }

  function resize() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    quality.pixelRatio = renderer.getPixelRatio();
    quality.devicePixelRatio = window.devicePixelRatio || 1;
    renderer.setSize(w, h);
    labels.setSize(w, h);
  }
  window.addEventListener('resize', resize);

  // Adaptive quality: if frames are slow after warm-up, turn shadows off. Resolution is never reduced.
  const quality = { shadows: true, fps: null, pixelRatio: renderer.getPixelRatio(), devicePixelRatio: window.devicePixelRatio || 1 };
  let samples = [];
  let checked = false;
  function trackFps(dt) {
    if (checked) return;
    samples.push(dt);
    if (samples.length < 90) return;
    const recent = samples.slice(30);
    const fps = recent.length / recent.reduce((a, b) => a + b, 0);
    quality.fps = Math.round(fps);
    checked = true;
    if (fps < 28 && quality.shadows) setShadows(false);
  }
  function setShadows(on) {
    quality.shadows = on;
    renderer.shadowMap.enabled = on;
    sun.castShadow = on;
    scene.traverse((o) => {
      if (o.material) for (const m of [].concat(o.material)) m.needsUpdate = true;
    });
  }

  const onFrame = [];
  const clock = new THREE.Clock();
  let elapsed = 0;
  function frame() {
    const dt = Math.min(clock.getDelta(), 0.1);
    elapsed += dt;
    trackFps(dt);
    if (tween) {
      tween.t += dt / tween.dur;
      const k = tween.t >= 1 ? 1 : 1 - Math.pow(1 - tween.t, 3);
      camera.position.lerpVectors(tween.from, tween.to, k);
      controls.target.lerpVectors(tween.fromT, tween.toT, k);
      if (tween.t >= 1) tween = null;
    }
    controls.update();
    for (const f of onFrame) f(dt, elapsed);
    renderer.render(scene, camera);
    labels.render(scene, camera);
    requestAnimationFrame(frame);
  }

  return {
    renderer,
    scene,
    camera,
    controls,
    labels,
    quality,
    goTo,
    setShadows,
    onFrame,
    start() {
      clock.start();
      requestAnimationFrame(frame);
    },
    get tweening() {
      return tween != null;
    },
  };
}
