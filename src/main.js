import './style.css';
import * as THREE from 'three';
import { formatAgo, formatDateTime, STATE_LABEL } from './format.js';
import { Simulation } from './sim.js';
import { usageRows } from './usageRows.js';
import { AgentManager } from './scene/agents.js';
import { ContractorManager } from './scene/contractors.js';
import { buildLayout } from './scene/layout.js';
import { buildOffice } from './scene/office.js';
import { buildRooftop, buildSky, buildSurroundings } from './scene/rooftop.js';
import { CONTRACTOR_STATE_LABEL } from './scene/tags.js';
import { createWorld } from './scene/world.js';

const STATE_COLOR = { working: 'var(--working)', waiting: 'var(--waiting)', error: 'var(--error)', done: 'var(--done)', idle: 'var(--idle)' };
const CONTRACTOR_COLOR = { running: 'var(--working)', starting: 'var(--contractor)', waiting: 'var(--waiting)', active: 'var(--contractor)' };
const $ = (id) => document.getElementById(id);
const clock = (iso) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

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
  const contractors = new ContractorManager(world.scene, layout);
  const sim = new Simulation(roster, lead);
  const occluders = [];
  world.scene.traverse((o) => o.userData.occluder && occluders.push(o));

  const currentStatuses = () => (sim.running ? sim.statuses : live.snap.statuses);
  const currentContractors = () => (sim.running ? sim.contractorView() : live.snap.contractors);

  function applyContractors() {
    const v = currentContractors();
    const ok = v?.status === 'ok';
    contractors.apply({ list: ok ? v.agents : [], running: ok ? v.running : 0, runningAtLeast: ok && v.runningAtLeast });
  }

  function contractorLine(v) {
    if (!v) return 'Cloud agents: not connected';
    if (v.simulated) return `Cloud agents: ${v.running} simulated`;
    if (v.status === 'pending') return 'Cloud agents: waiting for the first fetch';
    if (v.status === 'not_connected') return 'Cloud agents: not connected';
    if (v.status === 'stale') return `Cloud agents: stale since ${formatDateTime(v.staleSince)}`;
    const n = v.running === 0 ? 'none running' : `${v.running}${v.runningAtLeast ? '+' : ''} running`;
    const shown = v.running > v.agents.length ? `, ${v.agents.length} at desks` : '';
    return `Cloud agents: ${n}${shown} · as of ${clock(v.asOf)}${v.lastFetchFailed ? ' · last fetch failed' : ''}`;
  }

  function renderUsagePanel(rows) {
    $('usage-panel-rows').innerHTML = rows.map((r) => `
      <div class="up-row" data-provider="${r.id}" data-status="${r.status}">
        <div class="up-label">${escapeHtml(r.label)}<span>${escapeHtml(r.sub)}</span></div>
        <div class="up-primary">${escapeHtml(r.primary)}</div>
        <div class="up-secondary">${escapeHtml(r.secondary)}</div>
        ${r.asOf ? `<div class="up-asof">${escapeHtml(r.asOf)}</div>` : ''}
      </div>`).join('');
  }
  const usagePanel = $('usage-panel');
  const setUsagePanel = (open) => {
    usagePanel.hidden = !open;
    $('usage-chip').setAttribute('aria-expanded', String(open));
  };
  $('usage-chip').addEventListener('click', () => setUsagePanel(usagePanel.hidden));
  $('usage-panel-close').addEventListener('click', () => setUsagePanel(false));

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

    const needsBtn = $('needs-chris');
    const waitingN = counts.waiting;
    if (waitingN > 0) {
      needsBtn.hidden = false;
      needsBtn.textContent = `${waitingN === 1 ? '1 bot needs you' : `${waitingN} bots need you`}${sim.running ? ' (simulated)' : ''}`;
      needsBtn.dataset.simulated = sim.running ? '1' : '0';
    } else {
      needsBtn.hidden = true;
    }

    const u = snap.usage;
    $('usage-chip').innerHTML = (u
      ? `Weekly usage left <b>${u.percentLeft % 1 === 0 ? u.percentLeft.toFixed(0) : u.percentLeft.toFixed(1)}%</b>${u.resetsAt ? ` · resets ${formatDateTime(u.resetsAt)}` : ''}<br/>as of ${formatDateTime(u.readAt)}`
      : 'Weekly usage: no reading yet') + '<span class="more">All usage ›</span>';

    const cv = currentContractors();
    const agentsLine = $('agents-line');
    agentsLine.textContent = contractorLine(cv);
    agentsLine.dataset.status = cv?.simulated ? 'sim' : cv?.status ?? 'not_connected';
    agentsLine.title = cv?.detail ?? '';

    $('sim-label').hidden = !sim.running;
  }

  function applyLive() {
    const rows = usageRows(live.snap);
    office.usageBoard.set(rows);
    renderUsagePanel(rows);
    if (!sim.running) {
      agents.apply(live.snap.statuses);
      applyContractors();
    }
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
      agents.speed = contractors.speed = 1.7;
      agents.apply(sim.statuses);
      applyContractors();
    } else {
      sim.stop();
      agents.speed = contractors.speed = 1;
      agents.clearAllFolders();
      agents.apply(live.snap.statuses);
      applyContractors();
    }
    simButton.textContent = on ? 'Stop Simulation' : 'Simulate Work';
    simButton.classList.toggle('running', on);
    renderHud();
  }
  simButton.addEventListener('click', () => setSim(!sim.running));

  $('needs-chris').addEventListener('click', () => {
    world.goTo('chris');
    viewButtons.forEach((x) => x.classList.toggle('active', x.dataset.view === 'chris'));
  });

  // Camera quick views.
  const viewButtons = [...document.querySelectorAll('[data-view]')];
  for (const b of viewButtons) {
    b.addEventListener('click', () => {
      world.goTo(b.dataset.view);
      viewButtons.forEach((x) => x.classList.toggle('active', x === b));
      // The wall board is too small to read on a phone, so the Usage view also opens the usage panel there.
      if (b.dataset.view === 'board' && window.innerWidth <= 640) setUsagePanel(true);
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
    const hit = raycaster.intersectObjects([...agents.pickables(), ...contractors.pickables()], false)[0];
    const data = hit?.object.userData;
    if (data?.contractorId) return `contractor:${data.contractorId}`;
    return data?.botId ?? null;
  }
  function contractorTooltip(id) {
    const a = contractors.agents.get(id);
    if (!a) return null;
    const c = a.contractor;
    const v = currentContractors();
    const lines = [];
    lines.push(`<div class="tt-name">${escapeHtml(c.title)}</div>`);
    lines.push(`<div class="tt-title">Cursor cloud agent${c.repo ? ` · ${escapeHtml(c.repo)}` : ''}</div>`);
    const label = a.leaving ? 'Finished, leaving' : CONTRACTOR_STATE_LABEL[c.state] ?? c.state;
    lines.push(`<div class="tt-state"><i style="background:${a.leaving ? 'var(--idle)' : CONTRACTOR_COLOR[c.state] ?? 'var(--contractor)'}"></i>${escapeHtml(label)}</div>`);
    const meta = [];
    if (c.startedAt) meta.push(`Started ${formatAgo(c.startedAt)}`);
    meta.push(v?.simulated ? 'Simulated' : v?.asOf ? `As of ${clock(v.asOf)}` : '');
    lines.push(`<div class="tt-meta">${meta.filter(Boolean).join(' · ')}</div>`);
    return lines.join('');
  }
  function showTooltip(id, x, y) {
    hoverId = id;
    if (!id) {
      tooltip.hidden = true;
      return;
    }
    if (id.startsWith('contractor:')) {
      const html = contractorTooltip(id.slice('contractor:'.length));
      if (!html) return showTooltip(null);
      tooltip.innerHTML = html;
      return placeTooltip(x, y);
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
      if (st.stale) {
        if (st.state === 'working') meta.push('Working status older than 10 min, shown as idle');
        else if (st.state === 'waiting') meta.push('Waiting status older than 48 h, shown as idle');
      }
      if (st.handoffTo && botsById.get(st.handoffTo)) meta.push(`Handed off to ${escapeHtml(botsById.get(st.handoffTo).name)}`);
      meta.push(st.simulated ? 'Simulated' : `Updated ${formatAgo(st.updatedAt)}`);
    }
    lines.push(`<div class="tt-meta">${meta.join(' · ')}</div>`);
    tooltip.innerHTML = lines.join('');
    placeTooltip(x, y);
  }
  function placeTooltip(x, y) {
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
        applyContractors();
        renderHud();
      }
      hudTimer += dt;
      if (hudTimer > 0.5) {
        hudTimer = 0;
        $('sim-label').textContent = `Simulation · ${sim.clockLabel()}`;
      }
    }
    agents.update(dt);
    contractors.update(dt);
    agents.updateOcclusion(world.camera, occluders, contractors.list());
    updateTagScale();
    declutterTimer += dt;
    if (declutterTimer > 0.25) {
      declutterTimer = 0;
      requestAnimationFrame(() => agents.declutter(lastScale ?? 1, contractors.list()));
    }
  });
  world.start();
  $('loading').hidden = true;

  if (new URLSearchParams(location.search).get('simulate') === '1') setSim(true);

  // Hooks for the Playwright verification script.
  window.__office = {
    ready: true,
    refresh,
    settled: () => agents.settled() && contractors.settled() && !world.tweening,
    unsettled: () => [...agents.agents.values(), ...contractors.list()]
      .filter((a) => a.moving || a.handoffQueue.length || a.leaving || (a.spot && a.spot !== a.desiredSpot()))
      .map((a) => ({ name: a.bot.name, leaving: !!a.leaving, moving: a.moving, step: a.stepState?.step.type ?? null, queued: a.steps.length, spot: a.spot?.kind ?? null, want: a.desiredSpot().kind })),
    view: (name) => world.goTo(name, { instant: true }),
    frame: (x, y, z, width) => world.goTo({ target: [x, y, z], dir: [0.12, 0.62, 0.78], fitWidth: width, fitHeight: width * 0.62 }, { instant: true }),
    quality: world.quality,
    setShadows: world.setShadows,
    simulating: () => sim.running,
    setSim,
    pollNow() {
      clearInterval(pollTimer);
      pollTimer = setInterval(refresh, (live.snap.config?.pollSeconds ?? 12) * 1000);
      return refresh();
    },
    contractors() {
      return contractors.list().map((a) => ({
        id: a.contractor.id,
        x: a.root.position.x,
        z: a.root.position.z,
        moving: a.moving,
        leaving: !!a.leaving,
        atDesk: a.spot === a.assignment.desk.seat,
        tag: a.tag.el.textContent,
        tagVisible: a.tag.obj.visible && !a.occluded,
      }));
    },
    contractorOverflow: () => ({ count: contractors.overflow, text: contractors.overflowLabel.el.textContent }),
    contractorScreenPos(id, y = 0.8) {
      const a = contractors.agents.get(id);
      const p = a.root.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, y, 0)).project(world.camera);
      return { x: ((p.x + 1) / 2) * window.innerWidth, y: ((1 - p.y) / 2) * window.innerHeight };
    },
    usageRows: () => usageRows(live.snap),
    setUsagePanel,
    agentInfo(id) {
      const a = agents.agents.get(id);
      return {
        x: a.root.position.x,
        z: a.root.position.z,
        moving: a.moving,
        carrying: a.carrying,
        state: a.displayState,
        spotKind: a.spot?.kind ?? null,
        wantKind: a.desiredSpot().kind,
      };
    },
    waitingCount: () => roster.filter((b) => (currentStatuses()[b.id]?.effectiveState ?? 'idle') === 'waiting').length,
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
