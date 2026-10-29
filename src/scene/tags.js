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
    setState(state) {
      el.dataset.state = state;
      badge.textContent = state === 'waiting' ? '?' : state === 'done' ? '✓' : '';
    },
  };
}
