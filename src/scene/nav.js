import { CORRIDOR_Z, ELEVATOR_SPOTS } from './layout.js';

// Corridor network on the office floor: two east-west corridors joined by three north-south aisles.
const CORRIDORS = [
  { z: CORRIDOR_Z.AB, xs: [-31, -23, -14, -6, 2, 9, 16, 19, 24, 30] },
  { z: CORRIDOR_Z.BC, xs: [-31, -23, -14, -6, 2, 9, 16, 24, 30] },
];
const CONNECTOR_XS = [-14, 2, 16];

function buildGraph() {
  const nodes = [];
  const edges = new Map();
  const add = (a, b) => {
    const d = Math.hypot(nodes[a][0] - nodes[b][0], nodes[a][1] - nodes[b][1]);
    edges.get(a).push([b, d]);
    edges.get(b).push([a, d]);
  };
  const index = new Map();
  for (const c of CORRIDORS) {
    c.xs.forEach((x, i) => {
      const id = nodes.push([x, c.z]) - 1;
      edges.set(id, []);
      index.set(`${x},${c.z}`, id);
      if (i > 0) add(id - 1, id);
    });
  }
  for (const x of CONNECTOR_XS) add(index.get(`${x},${CORRIDORS[0].z}`), index.get(`${x},${CORRIDORS[1].z}`));
  return { nodes, edges };
}

const BASE = buildGraph();

function corridorOf(p) {
  return CORRIDORS.find((c) => Math.abs(c.z - p[1]) < 0.01) || null;
}

/** Shortest corridor path between two points that lie on corridors. */
export function corridorPath(from, to) {
  const nodes = BASE.nodes.slice();
  const edges = new Map([...BASE.edges].map(([k, v]) => [k, v.slice()]));
  const link = (a, b) => {
    const d = Math.hypot(nodes[a][0] - nodes[b][0], nodes[a][1] - nodes[b][1]);
    edges.get(a).push([b, d]);
    edges.get(b).push([a, d]);
  };
  const attach = (p) => {
    const id = nodes.push(p) - 1;
    edges.set(id, []);
    const c = corridorOf(p);
    if (!c) throw new Error(`point ${p} is not on a corridor`);
    let left = null;
    let right = null;
    BASE.nodes.forEach((n, i) => {
      if (Math.abs(n[1] - c.z) > 0.01) return;
      if (n[0] <= p[0] && (left == null || n[0] > nodes[left][0])) left = i;
      if (n[0] >= p[0] && (right == null || n[0] < nodes[right][0])) right = i;
    });
    if (left != null) link(id, left);
    if (right != null) link(id, right);
    return id;
  };
  const a = attach(from);
  const b = attach(to);
  if (corridorOf(from) === corridorOf(to)) link(a, b);

  const dist = new Map([[a, 0]]);
  const prev = new Map();
  const open = new Set([a]);
  while (open.size) {
    let u = null;
    for (const n of open) if (u == null || dist.get(n) < dist.get(u)) u = n;
    open.delete(u);
    if (u === b) break;
    for (const [v, w] of edges.get(u)) {
      const nd = dist.get(u) + w;
      if (nd < (dist.get(v) ?? Infinity)) {
        dist.set(v, nd);
        prev.set(v, u);
        open.add(v);
      }
    }
  }
  const path = [];
  for (let n = b; n != null; n = prev.get(n)) path.unshift(nodes[n]);
  return path;
}

function dedupe(points) {
  const out = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (!last || Math.hypot(last[0] - p[0], last[1] - p[1]) > 0.05) out.push(p);
  }
  return out;
}

function sameFloorPoints(from, to) {
  const out = [...from.approach].reverse();
  if (from.floor === 'office') out.push(...corridorPath(from.approach[0], to.approach[0]));
  out.push(...to.approach, to.pos);
  return dedupe(out);
}

/**
 * Steps from one spot to another: walk segments, plus an elevator ride when changing between office and rooftop.
 */
export function route(from, to) {
  if (from === to) return [];
  if (from.floor === to.floor) {
    return [{ type: 'walk', floor: from.floor, points: sameFloorPoints(from, to) }];
  }
  const liftFrom = ELEVATOR_SPOTS[from.floor];
  const liftTo = ELEVATOR_SPOTS[to.floor];
  return [
    { type: 'walk', floor: from.floor, points: sameFloorPoints(from, liftFrom) },
    { type: 'ride', from: liftFrom, to: liftTo },
    { type: 'walk', floor: to.floor, points: sameFloorPoints(liftTo, to) },
  ];
}
