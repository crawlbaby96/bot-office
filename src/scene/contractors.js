import * as THREE from 'three';
import { Agent } from './agents.js';
import { createContractorModel } from './bot.js';
import { CONTRACTOR_OVERFLOW, ELEVATOR_SPOTS } from './layout.js';
import { createContractorTag, createOverflowLabel } from './tags.js';

// Pose only: running contractors type; starting / waiting on background work / active sit still at the desk.
const POSE_STATE = { running: 'working', starting: 'waiting', waiting: 'waiting', active: 'waiting' };

/**
 * Cursor cloud agents shown as visiting contractors at the Engineering hot desks. They arrive from the office
 * elevator when an agent starts running, and walk back to it and leave when the agent finishes or expires.
 * Only the agents in the list passed to `apply` are ever shown; anything beyond the desks is counted as overflow.
 */
export class ContractorManager {
  constructor(scene, layout) {
    this.desks = layout.contractors;
    this.exit = ELEVATOR_SPOTS.office;
    this.speed = 1;
    this.deskBySeat = new Map(this.desks.map((d) => [d.seat.id, d]));
    this.agents = new Map();
    this.group = new THREE.Group();
    this.group.name = 'contractors';
    scene.add(this.group);
    this.overflowLabel = createOverflowLabel();
    this.overflowLabel.obj.position.set(CONTRACTOR_OVERFLOW.x, 1.1, CONTRACTOR_OVERFLOW.z);
    scene.add(this.overflowLabel.obj);
    this.overflow = 0;
    this.initialized = false;
  }

  /** `list`: [{ id, title, repo, state, startedAt }]; `running`: total running (may exceed the list). */
  apply({ list = [], running = list.length, runningAtLeast = false } = {}) {
    const initial = !this.initialized;
    this.initialized = true;
    const want = new Map(list.map((c) => [c.id, c]));
    for (const a of this.agents.values()) if (!a.leaving && !want.has(a.contractor.id)) this.leave(a);
    let shown = 0;
    this.arrivals = 0;
    for (const c of list) {
      let a = this.agents.get(c.id);
      if (a?.leaving) {
        this.remove(a);
        a = null;
      }
      a = a ?? this.add(c, initial);
      if (!a) continue;
      shown++;
      a.contractor = c;
      a.bot.name = c.title;
      a.tag.set(c);
      const pose = POSE_STATE[c.state] ?? 'waiting';
      if (a.displayState !== pose) a.setStatus({ effectiveState: pose, updatedAt: c.state }, { initial: false, nowMs: Date.now() });
    }
    this.overflow = Math.max(0, running - shown);
    this.overflowLabel.setCount(this.overflow, runningAtLeast);
  }

  freeDesk() {
    const used = new Set([...this.agents.values()].filter((a) => !a.leaving).map((a) => a.assignment.desk));
    return this.desks.find((d) => !used.has(d)) ?? null;
  }

  add(c, initial) {
    const desk = this.freeDesk();
    if (!desk) return null;
    const a = new Agent({ id: `contractor:${c.id}`, name: c.title }, { desk, idle: this.exit }, this, {
      parts: createContractorModel(c.id),
      tag: createContractorTag(c),
    });
    a.contractor = c;
    a.declutterRank = 5;
    a.displayState = POSE_STATE[c.state] ?? 'waiting';
    this.agents.set(c.id, a);
    this.group.add(a.root);
    if (initial) {
      a.placeAt(desk.seat);
    } else {
      a.placeAt(this.exit);
      a.root.scale.setScalar(0.001);
      a.tag.obj.visible = false;
      // Stagger arrivals so contractors who start together don't walk in on top of each other.
      a.startSteps([{ type: 'pause', seconds: 1.6 * this.arrivals++ }, { type: 'appear', spot: this.exit }]);
    }
    return a;
  }

  leave(a) {
    a.leaving = true;
    a.tag.el.classList.add('leaving');
    a.setStatus({ effectiveState: 'idle', updatedAt: 'leaving' }, { initial: false, nowMs: Date.now() });
  }

  remove(a) {
    a.onLeave(a.spot);
    this.group.remove(a.root);
    a.tag.obj.removeFromParent();
    a.tag.el.remove();
    this.agents.delete(a.contractor.id);
  }

  update(dt) {
    for (const a of [...this.agents.values()]) {
      if (a.leaving && !a.moving && a.spot === this.exit && !a.vanishing) {
        a.vanishing = true;
        a.startSteps([{ type: 'vanish' }]);
      }
      if (!a.vanishing) a.plan();
      a.update(dt);
      if (a.gone) this.remove(a);
    }
  }

  settled() {
    for (const a of this.agents.values()) {
      if (a.leaving || a.moving || (a.spot && a.spot !== a.desiredSpot())) return false;
    }
    return true;
  }

  list() {
    return [...this.agents.values()];
  }

  pickables() {
    return this.list().map((a) => a.parts.hit);
  }

  clear() {
    for (const a of this.list()) this.remove(a);
    this.initialized = false;
  }
}
