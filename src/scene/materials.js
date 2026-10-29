import * as THREE from 'three';

const cache = new Map();

/** Flat matte material (no specular, no metalness). Cached per color. */
export function matte(color, opts = {}) {
  const key = `m:${color}:${opts.side ?? ''}:${opts.flat ? 1 : 0}`;
  if (!cache.has(key)) {
    cache.set(key, new THREE.MeshLambertMaterial({ color, side: opts.side ?? THREE.FrontSide, flatShading: !!opts.flat }));
  }
  return cache.get(key);
}

export function glass(color = '#a8c3d4', opacity = 0.16) {
  const key = `g:${color}:${opacity}`;
  if (!cache.has(key)) {
    cache.set(key, new THREE.MeshLambertMaterial({
      color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide,
    }));
  }
  return cache.get(key);
}

/** Unlit material for self-lit surfaces (screens, LEDs, bulbs), kept dim so nothing glares. */
export function unlit(color, opts = {}) {
  const key = `u:${color}:${opts.transparent ? opts.opacity : ''}`;
  if (!cache.has(key)) {
    cache.set(key, new THREE.MeshBasicMaterial({ color, transparent: !!opts.transparent, opacity: opts.opacity ?? 1, toneMapped: false }));
  }
  return cache.get(key);
}

const geoCache = new Map();
export function boxGeo(w, h, d) {
  const key = `b:${w}:${h}:${d}`;
  if (!geoCache.has(key)) geoCache.set(key, new THREE.BoxGeometry(w, h, d));
  return geoCache.get(key);
}

export function cylGeo(rt, rb, h, seg = 20) {
  const key = `c:${rt}:${rb}:${h}:${seg}`;
  if (!geoCache.has(key)) geoCache.set(key, new THREE.CylinderGeometry(rt, rb, h, seg));
  return geoCache.get(key);
}

/** Box mesh positioned by its bottom-center, which makes furniture layout much easier to read. */
export function box(w, h, d, material, x = 0, y = 0, z = 0, { cast = true, receive = true } = {}) {
  const m = new THREE.Mesh(boxGeo(w, h, d), typeof material === 'string' ? matte(material) : material);
  m.position.set(x, y + h / 2, z);
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}

export function cyl(rt, rb, h, material, x = 0, y = 0, z = 0, seg = 20) {
  const m = new THREE.Mesh(cylGeo(rt, rb, h, seg), typeof material === 'string' ? matte(material) : material);
  m.position.set(x, y + h / 2, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
