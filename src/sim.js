// Browser-only demo of a busy work day. Never talks to the status API; produces status objects in the same
// shape the live feed uses so the scene code path is identical.

const MESSAGES = {
  working: ['Working on a task', 'Processing queue', 'Drafting an update', 'Running checks', 'Reviewing documents', 'Syncing records', 'Preparing a summary'],
  waiting: ['Waiting on Chris', 'Awaiting approval', 'Waiting for input'],
  error: ['Hit an error, retrying', 'Connection error'],
  done: ['Task complete', 'Finished batch', 'Wrapped up'],
  idle: ['On a break'],
};

const DAY_START = 8 * 60 + 30;
const DAY_END = 18 * 60;
const SIM_MINUTES_PER_SEC = 3.2;

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function weighted(options) {
  const total = options.reduce((a, [, w]) => a + w, 0);
  let r = Math.random() * total;
  for (const [v, w] of options) if ((r -= w) <= 0) return v;
  return options[options.length - 1][0];
}

export class Simulation {
  constructor(roster, leadId) {
    this.roster = roster;
    this.leadId = leadId;
    this.running = false;
    this.statuses = {};
  }

  start() {
    this.running = true;
    this.minute = DAY_START;
    this.statuses = {};
    this.next = new Map();
    for (const b of this.roster) {
      this.statuses[b.id] = this.make(b.id, 'idle');
      this.next.set(b.id, DAY_START + 2 + Math.random() * 35);
    }
  }

  stop() {
    this.running = false;
  }

  make(botId, state, handoffTo = null) {
    return {
      botId,
      state,
      effectiveState: state,
      stale: false,
      message: pick(MESSAGES[state]),
      handoffTo,
      updatedAt: new Date(Date.now() + Math.random()).toISOString(),
      simulated: true,
    };
  }

  /** Advance the sim clock; returns true when any status changed. */
  tick(dt) {
    if (!this.running) return false;
    this.minute += dt * SIM_MINUTES_PER_SEC;
    if (this.minute > DAY_END + 25) this.start();
    let changed = false;
    const lunch = this.minute > 12 * 60 && this.minute < 12 * 60 + 40;
    const evening = this.minute > DAY_END - 20;
    for (const b of this.roster) {
      if (this.minute < this.next.get(b.id)) continue;
      const cur = this.statuses[b.id];
      let state;
      let handoffTo = null;
      if (evening) state = cur.state === 'idle' ? 'idle' : 'done';
      else if (lunch) state = weighted([['idle', 6], ['working', 2], ['done', 1]]);
      else if (cur.state === 'idle' || cur.state === 'done') state = weighted([['working', 8], ['idle', 1]]);
      else if (cur.state === 'waiting' || cur.state === 'error') state = 'working';
      else state = weighted([['working', 4], ['waiting', 2], ['error', 0.6], ['done', 2.4]]);
      if (state === 'done' && cur.state === 'working' && b.id !== this.leadId && Math.random() < 0.45) handoffTo = this.leadId;
      if (state !== cur.state || handoffTo || Math.random() < 0.2) {
        this.statuses[b.id] = this.make(b.id, state, handoffTo);
        changed = true;
      }
      this.next.set(b.id, this.minute + (state === 'working' ? 35 + Math.random() * 70 : 18 + Math.random() * 40));
    }
    return changed;
  }

  clockLabel() {
    const m = Math.min(this.minute, DAY_END);
    const h = Math.floor(m / 60);
    const mm = Math.floor(m % 60);
    const ampm = h >= 12 ? 'PM' : 'AM';
    return `${((h + 11) % 12) + 1}:${String(mm).padStart(2, '0')} ${ampm}`;
  }
}
