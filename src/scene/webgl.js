import * as THREE from 'three';

export const WEBGL_FALLBACK_HINT =
  '3D view unavailable in this browser. Try closing other tabs or turning on hardware acceleration.';

/** Try to construct a WebGLRenderer; returns null instead of throwing when WebGL is unavailable. */
export function tryWebGLRenderer(parameters = {}) {
  try {
    const renderer = new THREE.WebGLRenderer(parameters);
    if (!renderer.getContext()) {
      renderer.dispose();
      return null;
    }
    return renderer;
  } catch {
    return null;
  }
}

export function mountStageFallback(container, { hint = WEBGL_FALLBACK_HINT, onRetry } = {}) {
  container.classList.add('stage-webgl-unavailable');
  let root = container.querySelector('.stage-fallback');
  if (!root) {
    root = document.createElement('div');
    root.className = 'stage-fallback';
    root.setAttribute('role', 'status');
    root.innerHTML =
      '<p class="stage-fallback-title">3D view unavailable</p>' +
      '<p class="stage-fallback-hint"></p>' +
      '<button type="button" class="stage-fallback-retry">Retry 3D view</button>';
    container.appendChild(root);
  }
  root.querySelector('.stage-fallback-hint').textContent = hint;
  const btn = root.querySelector('.stage-fallback-retry');
  btn.onclick = () => onRetry?.();
  return root;
}

export function clearStageFallback(container) {
  container.classList.remove('stage-webgl-unavailable');
  container.querySelector('.stage-fallback')?.remove();
}

/**
 * Listen for context loss/restoration and release GPU resources when the page is hidden (bfcache-friendly).
 * Returns a dispose function that removes listeners and disposes the renderer.
 */
export function bindWebGLRendererLifecycle(renderer, { onLost, onRestored } = {}) {
  const canvas = renderer.domElement;
  const onContextLost = (event) => {
    event.preventDefault();
    onLost?.(event);
  };
  const onContextRestored = () => onRestored?.();
  canvas.addEventListener('webglcontextlost', onContextLost, false);
  canvas.addEventListener('webglcontextrestored', onContextRestored, false);

  const release = () => {
    try {
      renderer.forceContextLoss?.();
    } catch {
      /* ignore */
    }
    renderer.dispose();
  };
  const onPageHide = () => release();
  window.addEventListener('pagehide', onPageHide);

  return () => {
    canvas.removeEventListener('webglcontextlost', onContextLost, false);
    canvas.removeEventListener('webglcontextrestored', onContextRestored, false);
    window.removeEventListener('pagehide', onPageHide);
    release();
  };
}
