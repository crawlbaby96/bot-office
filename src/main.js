import './style.css';
import * as THREE from 'three';
import { formatAgo, formatDateTime, STATE_LABEL } from './format.js';
import { Simulation } from './sim.js';
import { AgentManager } from './scene/agents.js';
import { buildLayout } from './scene/layout.js';
import { buildOffice } from './scene/office.js';
import { buildRooftop, buildSky, buildSurroundings } from './scene/rooftop.js';
import { createWorld } from './scene/world.js';

const STATE_COLOR = { working: 'var(--working)', waiting: 'var(--waiting)', error: 'var(--error)', done: 'var(--done)', idle: 'var(--idle)' };
const $ = (id) => document.getElementById(id);

async function fetchOffice() {
  const res = await fetch('/api/office', { cache: 'no-store', credentials: 'same-origin' });
  if (res.status === 401) {
    location.href = `/login?next=${encodeURIComponent(location.pathname + location.search)}`;
    throw new Error('Signed out');
  }
  if (!res.ok) throw new Error(`Feed error ${res.status}`);
  return res.json();
}

async function boot() {
  const live = { snap: await fetchOffice(), fetchedAt: Date.now(), failures: 0 };
  const { roster, lead } = live.snap;
  const botsById = new Map(roster.map((b) => [b.id, b]));

  const world = createWorld($('stage'));
  buildSky(world.scene);
  buildSurroundings(world.scene);
  buildRooftop(world.scene);
  const layout = buildLayout(roster, lead);
  const office = buildOffice(world.scene, layout);
  const agents = new AgentManager(world.scene, layout, roster, lead);
  const sim = new Simulation(roster, lead);
  const occluders = [];
  world.scene.traverse((o) => o.userData.occluder && occluders.push(o));

  const currentStatuses = () => (sim.running ? sim.statuses : live.snap.statuses);

  function renderHud() {
    const snap = live.snap;
    const feedLine = $('feed-line');
    if (sim.running) {
      feedLine.className = 'sub sim';
      feedLine.innerHTML = '<span class="dot"></span>Simulation (not live)';
    } else {
      feedLine.className = 'sub';
      feedLine.innerHTML = `<span class="dot"></span>Live · ${roster.length} bots · updated ${new Date(live.fetchedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
    }

    const warnings = [...(snap.feed?.warnings ?? [])];
    if (live.failures >= 2) warnings.unshift('Cannot reach the office feed; showing the last known status.');
    const banner = $('banner');
    banner.hidden = sim.running || warnings.length === 0;
    banner.textContent = warnings.join(' ');

    const counts = { working: 0, waiting: 0, error: 0, done: 0, idle: 0 };
    const statuses = currentStatuses();
    for (const b of roster) counts[statuses[b.id]?.effectiveState ?? 'idle']++;
    $('legend').innerHTML = Object.entries(counts)
      .map(([k, n]) => `<span><i style="background:${STATE_COLOR[k]}"></i>${n} ${STATE_LABEL[k].toLowerCase()}</span>`)
      .join('');

    const u = snap.usage;
    $('usage-chip').innerHTML = u
      ? `Weekly usage left <b>${u.percentLeft % 1 === 0 ? u.percentLeft.toFixed(0) : u.percentLeft.toFixed(1)}%</b>${u.resetsAt ? ` · resets ${formatDateTime(u.resetsAt)}` : ''}<br/>as of ${formatDateTime(u.readAt)}`
      : 'Weekly usage: no reading yet';

    $('sim-label').hidden = !sim.running;
  }

  function applyLive() {
    office.usageBoard.set(live.snap.usage);
    if (!sim.running) agents.apply(live.snap.statuses);
    renderHud();
  }

  async function refresh() {
    try {
      live.snap = await fetchOffice();
      live.fetchedAt = Date.now();
      live.failures = 0;
    } catch (err) {
      live.failures++;
      console.warn(err);
    }
    applyLive();
  }

  applyLive();
  world.goTo('office', { instant: true });

  let pollTimer = setInterval(refresh, (live.snap.config?.pollSeconds ?? 12) * 1000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refresh();
  });

  // Simulation.
  const simButton = $('simulate');
  function setSim(on) {
    if (on) {
      sim.start();
      agents.speed = 1.7;
      agents.apply(sim.statuses);
    } else {
      sim.stop();
      agents.speed = 1;
      agents.clearAllFolders();
      agents.apply(live.snap.statuses);
    }
    simButton.textContent = on ? 'Stop Simulation' : 'Simulate Work';
    simButton.classList.toggle('running', on);
    renderHud();
  }
  simButton.addEventListener('click', () => setSim(!sim.running));

  // Camera quick views.
  const viewButtons = [...document.querySelectorAll('[data-view]')];
  for (const b of viewButtons) {
    b.addEventListener('click', () => {
      world.goTo(b.dataset.view);
      viewButtons.forEach((x) => x.classList.toggle('active', x === b));
    });
  }

  // Tag scale follows zoom (changes only when the camera moves, so idle frames stay identical).
  let lastScale = null;
  function updateTagScale() {
    const d = world.camera.position.distanceTo(world.controls.target);
    const s = Math.round(Math.max(0.8, Math.min(1.25, 46 / d)) * 20) / 20;
    if (s !== lastScale) {
      lastScale = s;
      document.documentElement.style.setProperty('--tag-scale', String(s));
    }
  }

  // Hover / tap details.
  const tooltip = $('tooltip');
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let hoverId = null;
  function pick(clientX, clientY) {
    const rect = world.renderer.domElement.getBoundingClientRect();
    ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, world.camera);
    const hit = raycaster.intersectObjects(agents.pickables(), false)[0];
    return hit?.object.userData.botId ?? null;
  }
  function showTooltip(id, x, y) {
    hoverId = id;
    if (!id) {
      tooltip.hidden = true;
      return;
    }
    const bot = botsById.get(id);
    const st = currentStatuses()[id];
    const state = st?.effectiveState ?? 'idle';
    const lines = [];
    lines.push(`<div class="tt-name">${escapeHtml(bot.name)}</div>`);
    lines.push(`<div class="tt-title">${escapeHtml(bot.title)}${bot.id === lead ? ' · Lead' : ''}</div>`);
    lines.push(`<div class="tt-state"><i style="background:${STATE_COLOR[state]}"></i>${STATE_LABEL[state]}</div>`);
    if (st?.message) lines.push(`<div class="tt-msg">${escapeHtml(st.message)}</div>`);
    const meta = [];
    if (!st) meta.push('No status pushed yet');
    else {
      if (st.stale) meta.push('Working status older than 10 min, shown as idle');
      if (st.handoffTo && botsById.get(st.handoffTo)) meta.push(`Handed off to ${escapeHtml(botsById.get(st.handoffTo).name)}`);
      meta.push(st.simulated ? 'Simulated' : `Updated ${formatAgo(st.updatedAt)}`);
    }
    lines.push(`<div class="tt-meta">${meta.join(' · ')}</div>`);
    tooltip.innerHTML = lines.join('');
    tooltip.hidden = false;
    const pad = 14;
    const w = tooltip.offsetWidth;
    const h = tooltip.offsetHeight;
    tooltip.style.left = `${Math.min(window.innerWidth - w - 8, x + pad)}px`;
    tooltip.style.top = `${Math.max(8, Math.min(window.innerHeight - h - 8, y - h - pad))}px`;
  }
  const surface = world.labels.domElement;
  surface.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse' || e.buttons) return;
    showTooltip(pick(e.clientX, e.clientY), e.clientX, e.clientY);
  });
  surface.addEventListener('pointerleave', () => showTooltip(null));
  let down = null;
  surface.addEventListener('pointerdown', (e) => (down = { x: e.clientX, y: e.clientY }));
  surface.addEventListener('pointerup', (e) => {
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) return;
    const id = pick(e.clientX, e.clientY);
    if (e.pointerType !== 'mouse' || id) showTooltip(id, e.clientX, e.clientY);
  });

  let hudTimer = 0;
  let declutterTimer = 0;
  world.onFrame.push((dt, t) => {
    office.update(t);
    if (sim.running) {
      if (sim.tick(dt)) {
        agents.apply(sim.statuses);
        renderHud();
      }
      hudTimer += dt;
      if (hudTimer > 0.5) {
        hudTimer = 0;
        $('sim-label').textContent = `Simulation · ${sim.clockLabel()}`;
      }
    }
    agents.update(dt);
    agents.updateOcclusion(world.camera, occluders);
    updateTagScale();
    declutterTimer += dt;
    if (declutterTimer > 0.25) {
      declutterTimer = 0;
      requestAnimationFrame(() => agents.declutter(lastScale ?? 1));
    }
  });
  world.start();
  $('loading').hidden = true;

  if (new URLSearchParams(location.search).get('simulate') === '1') setSim(true);

  // Hooks for the Playwright verification script.
  window.__office = {
    ready: true,
    refresh,
    settled: () => agents.settled() && !world.tweening,
    view: (name) => world.goTo(name, { instant: true }),
    frame: (x, y, z, width) => world.goTo({ target: [x, y, z], dir: [0.12, 0.62, 0.78], fitWidth: width, fitHeight: width * 0.62 }, { instant: true }),
    quality: world.quality,
    simulating: () => sim.running,
    setSim,
    pollNow() {
      clearInterval(pollTimer);
      pollTimer = setInterval(refresh, (live.snap.config?.pollSeconds ?? 12) * 1000);
      return refresh();
    },
    agentInfo(id) {
      const a = agents.agents.get(id);
      return { x: a.root.position.x, z: a.root.position.z, moving: a.moving, carrying: a.carrying, state: a.displayState };
    },
    screenPos(id, y = 0.8) {
      const a = agents.agents.get(id);
      const p = a.root.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, y, 0)).project(world.camera);
      return { x: ((p.x + 1) / 2) * window.innerWidth, y: ((1 - p.y) / 2) * window.innerHeight };
    },
    botScreenBoxes() {
      const out = [];
      for (const [id, a] of agents.agents) {
        const box = new THREE.Box3().setFromObject(a.root);
        const pts = [];
        for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
          const p = new THREE.Vector3(x, y, z).project(world.camera);
          pts.push([((p.x + 1) / 2) * window.innerWidth, ((1 - p.y) / 2) * window.innerHeight]);
        }
        const tag = a.tag.el.getBoundingClientRect();
        out.push({
          id,
          name: a.bot.name,
          body: { x0: Math.min(...pts.map((p) => p[0])), y0: Math.min(...pts.map((p) => p[1])), x1: Math.max(...pts.map((p) => p[0])), y1: Math.max(...pts.map((p) => p[1])) },
          tag: { x0: tag.left, y0: tag.top, x1: tag.right, y1: tag.bottom },
        });
      }
      return out;
    },
  };
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

boot().catch((err) => {
  console.error(err);
  const el = $('loading');
  el.hidden = false;
  el.textContent = `Could not load the office: ${err.message}`;
});
