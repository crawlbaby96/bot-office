import * as THREE from 'three';
import { applyPose, createBotModel } from './bot.js';
import { ROOF_Y } from './layout.js';
import { route } from './nav.js';
import { createTag } from './tags.js';

const DESK_STATES = new Set(['working', 'waiting', 'error']);
const WALK_SPEED = 2.4;
const TURN_RATE = 10;
const TAG_Y = 1.58;
const HANDOFF_REPLAY_MS = 120 * 1000;

const floorY = (floor) => (floor === 'roof' ? ROOF_Y : 0);

function angleLerp(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * Math.min(1, t);
}

class Agent {
  constructor(bot, assignment, manager) {
    this.bot = bot;
    this.assignment = assignment;
    this.manager = manager;
    this.parts = createBotModel(bot);
    this.root = this.parts.root;
    this.tag = createTag(bot);
    this.tag.obj.position.set(0, TAG_Y, 0);
    this.root.add(this.tag.obj);
    this.status = null;
    this.displayState = 'idle';
    this.spot = null;
    this.steps = [];
    this.stepState = null;
    this.handoffQueue = [];
    this.lastHandoffKey = null;
    this.carrying = false;
    this.clock = Math.random() * 10;
  }

  desiredSpot() {
    return DESK_STATES.has(this.displayState) ? this.assignment.desk.seat : this.assignment.idle;
  }

  placeAt(spot) {
    this.spot = spot;
    this.root.position.set(spot.pos[0], floorY(spot.floor), spot.pos[1]);
    this.root.rotation.y = spot.facing;
    this.root.scale.setScalar(1);
    this.tag.obj.position.y = TAG_Y + (spot.tagLift || 0);
    this.tag.obj.visible = true;
    this.onArrive(spot);
    this.applyRestPose();
  }

  applyRestPose() {
    if (!this.spot) return;
    if (this.spot.pose === 'sit') applyPose(this.parts, this.isTyping() ? 'type' : 'sit', this.clock);
    else applyPose(this.parts, 'stand');
  }

  isTyping() {
    return this.spot === this.assignment.desk.seat && this.displayState === 'working';
  }

  onArrive(spot) {
    const desk = this.manager.deskBySeat.get(spot.id);
    if (desk) desk.prop?.setActive(DESK_STATES.has(this.displayState));
  }

  onLeave(spot) {
    const desk = spot && this.manager.deskBySeat.get(spot.id);
    if (desk) desk.prop?.setActive(false);
  }

  get moving() {
    return this.steps.length > 0 || this.stepState != null;
  }

  setStatus(status, { initial, nowMs }) {
    this.status = status;
    this.displayState = status?.effectiveState ?? 'idle';
    this.tag.setState(this.displayState);

    // Only animate handoffs pushed recently, so page loads and simulation stop don't replay old ones.
    if (status?.handoffTo && status.updatedAt !== this.lastHandoffKey) {
      if (nowMs - Date.parse(status.updatedAt) < HANDOFF_REPLAY_MS) this.handoffQueue.push(status.handoffTo);
      this.lastHandoffKey = status.updatedAt;
    }

    if (initial) {
      this.placeAt(this.desiredSpot());
      return;
    }
    if (!this.moving && this.spot) {
      const desk = this.manager.deskBySeat.get(this.spot.id);
      if (desk) desk.prop?.setActive(this.spot === this.desiredSpot() && DESK_STATES.has(this.displayState));
      this.applyRestPose();
    }
  }

  plan() {
    if (this.moving || !this.spot) return;
    if (this.handoffQueue.length) {
      const to = this.handoffQueue.shift();
      const recipient = this.manager.assignments.get(to);
      if (recipient) {
        const deliver = recipient.desk.deliver;
        this.carrying = true;
        this.parts.folder.visible = true;
        this.startSteps([
          ...route(this.spot, deliver),
          { type: 'arrive', spot: deliver },
          { type: 'pause', seconds: 0.6, pose: 'deliver' },
          { type: 'drop', desk: recipient.desk, recipientId: to },
          { type: 'pause', seconds: 0.4 },
        ]);
        return;
      }
    }
    const target = this.desiredSpot();
    if (target !== this.spot) this.startSteps([...route(this.spot, target), { type: 'arrive', spot: target }]);
  }

  startSteps(steps) {
    this.onLeave(this.spot);
    this.spot = null;
    this.tag.obj.position.y = TAG_Y;
    this.steps = steps;
    this.stepState = null;
  }

  update(dt) {
    if (!this.moving) {
      if (this.spot && this.isTyping()) {
        this.clock += dt;
        applyPose(this.parts, 'type', this.clock);
      }
      return;
    }
    this.clock += dt;
    if (!this.stepState) {
      const step = this.steps.shift();
      if (!step) return;
      this.stepState = { step, i: 0, t: 0 };
      if (step.type === 'walk') this.root.position.y = floorY(step.floor);
    }
    const s = this.stepState;
    const step = s.step;
    switch (step.type) {
      case 'walk': {
        let remaining = dt * WALK_SPEED * this.manager.speed;
        while (remaining > 0 && s.i < step.points.length) {
          const [tx, tz] = step.points[s.i];
          const dx = tx - this.root.position.x;
          const dz = tz - this.root.position.z;
          const dist = Math.hypot(dx, dz);
          if (dist < 1e-4) {
            s.i++;
            continue;
          }
          const stepLen = Math.min(dist, remaining);
          this.root.position.x += (dx / dist) * stepLen;
          this.root.position.z += (dz / dist) * stepLen;
          this.root.rotation.y = angleLerp(this.root.rotation.y, Math.atan2(dx, dz), dt * TURN_RATE);
          remaining -= stepLen;
          if (stepLen >= dist - 1e-6) s.i++;
        }
        applyPose(this.parts, this.carrying ? 'carry' : 'walk', this.clock);
        if (s.i >= step.points.length) this.stateDone();
        break;
      }
      case 'ride': {
        s.t += dt;
        const shrink = 0.3;
        const hold = 1.1;
        if (s.t < shrink) this.root.scale.setScalar(1 - s.t / shrink);
        else if (s.t < shrink + hold) {
          this.root.scale.setScalar(0.001);
          this.tag.obj.visible = false;
          if (!s.moved) {
            s.moved = true;
            this.root.position.set(step.to.pos[0], floorY(step.to.floor), step.to.pos[1]);
            this.root.rotation.y = step.to.facing;
          }
        } else if (s.t < shrink * 2 + hold) {
          this.tag.obj.visible = true;
          this.root.scale.setScalar((s.t - shrink - hold) / shrink);
        } else {
          this.root.scale.setScalar(1);
          this.stateDone();
        }
        applyPose(this.parts, 'stand');
        break;
      }
      case 'pause': {
        s.t += dt;
        if (step.pose) applyPose(this.parts, step.pose);
        if (s.t >= step.seconds) this.stateDone();
        break;
      }
      case 'drop': {
        this.carrying = false;
        this.parts.folder.visible = false;
        this.manager.addFolder(step.desk, step.recipientId);
        this.stateDone();
        break;
      }
      case 'arrive': {
        const spot = step.spot;
        this.root.position.set(spot.pos[0], floorY(spot.floor), spot.pos[1]);
        this.root.rotation.y = spot.facing;
        this.spot = spot;
        this.tag.obj.position.y = TAG_Y + (spot.tagLift || 0);
        this.stateDone();
        if (!this.steps.length) {
          this.onArrive(spot);
          this.applyRestPose();
        }
        break;
      }
      default:
        this.stateDone();
    }
  }

  stateDone() {
    this.stepState = null;
  }
}

export class AgentManager {
  constructor(scene, layout, roster, leadId) {
    this.scene = scene;
    this.layout = layout;
    this.assignments = layout.assignments;
    this.leadId = leadId;
    this.speed = 1;
    this.deskBySeat = new Map();
    this.folders = new Map();
    this.agents = new Map();
    this.group = new THREE.Group();
    this.group.name = 'agents';
    scene.add(this.group);
    const allDesks = [layout.lead.desk, ...layout.departments.flatMap((d) => d.desks), ...layout.hot];
    for (const d of allDesks) this.deskBySeat.set(d.seat.id, d);
    for (const bot of roster) {
      const a = new Agent(bot, this.assignments.get(bot.id), this);
      this.agents.set(bot.id, a);
      this.group.add(a.root);
    }
    this.initialized = false;
  }

  apply(statuses, nowMs = Date.now()) {
    const initial = !this.initialized;
    for (const [id, agent] of this.agents) {
      const prev = agent.status;
      const next = statuses[id] ?? null;
      if (!initial && prev && next && prev.updatedAt === next.updatedAt && prev.effectiveState === next.effectiveState) continue;
      if (!initial && !prev && !next) continue;
      // A new status from the recipient means they picked up whatever was handed to them.
      if (!initial && next && (!prev || prev.updatedAt !== next.updatedAt)) this.clearFolders(id);
      agent.setStatus(next, { initial, nowMs });
    }
    this.initialized = true;
  }

  addFolder(desk, recipientId) {
    const list = this.folders.get(recipientId) ?? [];
    if (list.length >= 4) return;
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.025, 0.24), new THREE.MeshLambertMaterial({ color: '#d2ad63' }));
    const [fx, fz] = desk.folderAt;
    const base = desk === this.layout.lead.desk ? 0.75 : 0.725;
    m.position.set(fx, base + 0.015 + list.length * 0.027, fz);
    m.rotation.y = (list.length % 2 ? 0.12 : -0.08);
    m.castShadow = true;
    this.scene.add(m);
    list.push(m);
    this.folders.set(recipientId, list);
  }

  clearFolders(recipientId) {
    for (const m of this.folders.get(recipientId) ?? []) this.scene.remove(m);
    this.folders.delete(recipientId);
  }

  clearAllFolders() {
    for (const id of [...this.folders.keys()]) this.clearFolders(id);
  }

  update(dt) {
    for (const a of this.agents.values()) {
      a.plan();
      a.update(dt);
    }
  }

  settled() {
    for (const a of this.agents.values()) if (a.moving || a.handoffQueue.length || (a.spot && a.spot !== a.desiredSpot())) return false;
    return true;
  }

  /** Hide tags whose bot is behind a wall or the tower from the current camera (CSS labels ignore depth). */
  updateOcclusion(camera, occluders) {
    const cam = camera.getWorldPosition(this._v1 ?? (this._v1 = new THREE.Vector3()));
    const ray = this._ray ?? (this._ray = new THREE.Raycaster());
    const p = this._v2 ?? (this._v2 = new THREE.Vector3());
    for (const a of this.agents.values()) {
      a.tag.obj.getWorldPosition(p);
      const dir = p.sub(cam);
      const dist = dir.length();
      ray.set(cam, dir.normalize());
      ray.far = Math.max(0, dist - 0.3);
      const hidden = ray.intersectObjects(occluders, false).length > 0;
      if (hidden !== a.occluded) {
        a.occluded = hidden;
        a.tag.el.classList.toggle('occluded', hidden);
      }
    }
  }

  /**
   * When tags overlap on screen, the most informative one keeps its name (error > waiting > working > done > idle,
   * lead first) and the others collapse to just their state badge until the user zooms in. Collision boxes always
   * use the full-size tag, so the result is a pure function of positions and idle frames stay identical.
   */
  declutter(tagScale = 1) {
    const rank = { error: 0, waiting: 1, working: 2, done: 3, idle: 4 };
    const list = [];
    for (const a of this.agents.values()) {
      if (a.occluded || !a.tag.obj.visible) continue;
      const el = a.tag.el;
      const r = el.getBoundingClientRect();
      if (!el.classList.contains('declutter') && r.width > 0) a.fullTag = { w: r.width, h: r.height, scale: tagScale };
      if (!a.fullTag) continue;
      const k = tagScale / a.fullTag.scale;
      const cx = (r.left + r.right) / 2;
      const w = a.fullTag.w * k;
      list.push({ a, rect: { left: cx - w / 2, right: cx + w / 2, top: r.bottom - a.fullTag.h * k, bottom: r.bottom } });
    }
    list.sort((p, q) => (q.a.bot.id === this.leadId) - (p.a.bot.id === this.leadId)
      || rank[p.a.displayState] - rank[q.a.displayState]
      || p.a.bot.name.localeCompare(q.a.bot.name));
    const placed = [];
    for (const { a, rect: r } of list) {
      const hit = placed.some((p) => r.left < p.right + 1 && r.right > p.left - 1 && r.top < p.bottom + 1 && r.bottom > p.top - 1);
      a.tag.el.classList.toggle('declutter', hit);
      if (!hit) placed.push(r);
    }
  }

  pickables() {
    return [...this.agents.values()].map((a) => a.parts.hit);
  }
}
