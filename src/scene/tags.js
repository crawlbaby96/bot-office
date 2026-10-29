import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

/** Small, low-contrast name tag pinned above a bot's head, with a tiny state badge. */
export function createTag(bot) {
  const el = document.createElement('div');
  el.className = 'tag';
  el.dataset.botId = bot.id;
  const badge = document.createElement('span');
  badge.className = 'badge';
  const name = document.createElement('span');
  name.className = 'name';
  name.textContent = bot.name;
  el.append(badge, name);
  const obj = new CSS2DObject(el);
  obj.center.set(0.5, 1);
  return {
    obj,
    el,
    setState(state, { message, simulated } = {}) {
      el.dataset.state = state;
      el.classList.toggle('simulated', !!simulated);
      badge.textContent = state === 'waiting' ? '?' : state === 'done' ? '✓' : '';
      let needs = el.querySelector('.needs');
      let wmsg = el.querySelector('.wmsg');
      if (state === 'waiting') {
        if (!needs) {
          needs = document.createElement('span');
          needs.className = 'needs';
          el.insertBefore(needs, name);
        }
        needs.textContent = 'Needs Chris';
        const text = String(message ?? '').trim();
        if (text) {
          if (!wmsg) {
            wmsg = document.createElement('span');
            wmsg.className = 'wmsg';
            el.append(wmsg);
          }
          wmsg.textContent = text.length > 44 ? `${text.slice(0, 43).trimEnd()}…` : text;
        } else if (wmsg) wmsg.remove();
      } else {
        needs?.remove();
        wmsg?.remove();
      }
    },
  };
}

export const CONTRACTOR_STATE_LABEL = { running: 'Running', starting: 'Starting', waiting: 'Background work', active: 'Active' };
const TAG_TITLE_MAX = 26;

/** Low-contrast tag for a cloud-agent contractor: run-state dot, short title, and repo name. */
export function createContractorTag(contractor) {
  const el = document.createElement('div');
  el.className = 'tag contractor';
  el.dataset.contractorId = contractor.id;
  const badge = document.createElement('span');
  badge.className = 'cbadge';
  const name = document.createElement('span');
  name.className = 'name';
  const repo = document.createElement('span');
  repo.className = 'repo';
  el.append(badge, name, repo);
  const obj = new CSS2DObject(el);
  obj.center.set(0.5, 1);
  const tag = {
    obj,
    el,
    setState() {},
    set(c) {
      const t = c.title.length > TAG_TITLE_MAX ? `${c.title.slice(0, TAG_TITLE_MAX - 1).trimEnd()}…` : c.title;
      if (name.textContent !== t) name.textContent = t;
      const r = c.repo ? `· ${c.repo}` : '';
      if (repo.textContent !== r) repo.textContent = r;
      el.dataset.cstate = c.state;
      badge.title = CONTRACTOR_STATE_LABEL[c.state] ?? c.state;
    },
  };
  tag.set(contractor);
  return tag;
}

export function createOverflowLabel() {
  const el = document.createElement('div');
  el.className = 'tag overflow';
  const obj = new CSS2DObject(el);
  obj.center.set(0.5, 1);
  obj.visible = false;
  return {
    obj,
    el,
    setCount(n, atLeast) {
      obj.visible = n > 0;
      el.textContent = n > 0 ? `+${n}${atLeast ? '+' : ''} more cloud agent${n === 1 ? '' : 's'}` : '';
    },
  };
}
