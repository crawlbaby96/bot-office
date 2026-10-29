// Floor plan in meters. Office floor at y=0 spans x[-32,32] z[-22,22]; the camera's default view looks toward -z.
// The rooftop deck sits on the tower behind the office at y=ROOF_Y.

export const ROOF_Y = 9;
export const OFFICE_BOUNDS = { x0: -32, x1: 32, z0: -22, z1: 22 };
export const ROOF_BOUNDS = { x0: -24, x1: 24, z0: -58, z1: -32 };
export const CORRIDOR_Z = { AB: -5.5, BC: 9.5 };

export const face = (dx, dz) => Math.atan2(dx, dz);
const FACE_PZ = 0;
const FACE_NZ = Math.PI;
const FACE_PX = Math.PI / 2;
const FACE_NX = -Math.PI / 2;

export const ROWS = {
  A: { z0: -21, z1: -7, corridorZ: CORRIDOR_Z.AB, deskZs: [-13.5, -17.5], letterZ: -9.2, letterH: 2.6 },
  B: { z0: -4, z1: 8, corridorZ: CORRIDOR_Z.BC, deskZs: [3.0, -0.5], letterZ: 6.2, letterH: 2.4 },
};

export const DEPARTMENTS = [
  { name: 'Engineering', x0: -31, x1: -15, row: 'A', carpet: '#55657a', letter: '#7286a0' },
  { name: 'Finance', x0: -13, x1: 1, row: 'A', carpet: '#556a5b', letter: '#71897a' },
  { name: 'Sales', x0: 3, x1: 15, row: 'A', carpet: '#6f5d4f', letter: '#8f7b6b' },
  { name: 'Marketing', x0: -31, x1: -15, row: 'B', carpet: '#6b5566', letter: '#8c7187' },
  { name: 'Research', x0: -13, x1: 1, row: 'B', carpet: '#4b6369', letter: '#68848b' },
  { name: 'Operations', x0: 3, x1: 15, row: 'B', carpet: '#65644f', letter: '#86846c' },
];

export const AREAS = {
  lead: { x0: 17, x1: 31, z0: -21, z1: -9, doorX: 19 },
  server: { x0: 17, x1: 31, z0: -4, z1: 6 },
  lounge: { x0: -31, x1: -15, z0: 11, z1: 21 },
  breakRoom: { x0: -13, x1: 1, z0: 11, z1: 21 },
  hotDesks: { x0: 3, x1: 15, z0: 11, z1: 21 },
  lobby: { x0: 17, x1: 31, z0: 11, z1: 21 },
};

export const RESEARCH_SCREENS = { z: -3.3, xs: [-10.2, -6, -1.8], width: 3.4, height: 1.9, bottom: 1.05 };
export const USAGE_BOARD = { x: 2, y: 1.05, z: -21.86, width: 7.2, height: 3.3 };
export const LEAD_DESK = { x: 25, z: -16, width: 2.6 };
export const FIRE_PIT = { x: 0, z: -44, r: 0.85 };
export const ROOF_SEAT_R = 4.4;
export const ROOF_SEAT_ANGLES = [-170, -138, -106, -74, -42, -10];
export const OFFICE_ELEVATOR = { x: 31.0, z: 16 };
export const ROOF_ELEVATOR = { x: 20.4, z: -35.5 };
export const ROOF_HUB = [17.6, -35.5];

let spotSeq = 0;
function spot(props) {
  return { id: `s${++spotSeq}`, floor: 'office', facing: 0, pose: 'stand', approach: [], tagLift: 0, ...props };
}

export function deskColumns(n, cx) {
  if (n <= 4) return [{ dx: cx - 1.9, lane: cx - 3.4 }, { dx: cx + 1.9, lane: cx + 3.4 }];
  return [
    { dx: cx - 3.4, lane: cx - 5.1 },
    { dx: cx, lane: cx + 1.7 },
    { dx: cx + 3.4, lane: cx + 5.1 },
  ];
}

/** A desk: chair spot (bot faces +z toward the desk) plus a delivery spot on the far side for handoffs. */
function makeDesk({ dx, lane, deskZ, corridorZ, floor = 'office', zone }) {
  const chairZ = deskZ - 1.0;
  const frontZ = deskZ + 0.95;
  return {
    zone,
    x: dx,
    z: deskZ,
    seat: spot({ floor, pos: [dx, chairZ], facing: FACE_PZ, pose: 'sit', kind: 'desk', approach: [[lane, corridorZ], [lane, chairZ]] }),
    deliver: spot({ floor, pos: [dx, frontZ], facing: FACE_NZ, pose: 'stand', kind: 'deliver', approach: [[lane, corridorZ], [lane, frontZ]] }),
    folderAt: [dx + 0.45, deskZ + 0.05],
    owner: null,
  };
}

function departmentDesks(dept, count) {
  const row = ROWS[dept.row];
  const n = Math.max(4, count);
  const cols = deskColumns(n, (dept.x0 + dept.x1) / 2);
  const desks = [];
  for (const deskZ of row.deskZs) {
    for (const c of cols) desks.push(makeDesk({ ...c, deskZ, corridorZ: row.corridorZ, zone: dept.name }));
  }
  return desks;
}

function hotDesks() {
  const cols = deskColumns(6, (AREAS.hotDesks.x0 + AREAS.hotDesks.x1) / 2);
  const desks = [];
  for (const deskZ of [14, 18]) for (const c of cols) desks.push(makeDesk({ ...c, deskZ, corridorZ: CORRIDOR_Z.BC, zone: 'Hot desks' }));
  return desks;
}

function leadSpots() {
  const { x, z } = LEAD_DESK;
  const door = AREAS.lead.doorX;
  const inside = [door, -10.4];
  const enter = [[door, CORRIDOR_Z.AB], inside];
  return {
    desk: {
      zone: 'Lead',
      x,
      z,
      lead: true,
      seat: spot({ pos: [x, z - 1.0], facing: FACE_PZ, pose: 'sit', kind: 'desk', approach: [...enter, [22.6, -10.4], [22.6, z - 1.0]] }),
      deliver: spot({ pos: [x, z + 1.3], facing: FACE_NZ, pose: 'stand', kind: 'deliver', approach: [...enter] }),
      folderAt: [x + 0.7, z + 0.05],
      owner: null,
    },
    idle: spot({ pos: [29.6, -12.6], facing: FACE_NX, pose: 'sit', kind: 'idle', approach: [...enter, [28.4, -12.6]] }),
  };
}

export const LOUNGE_FURNITURE = {
  sofas: [
    { x: -27.5, z: 20.2, rot: FACE_PZ, seats: 3 },
    { x: -20.5, z: 20.2, rot: FACE_PZ, seats: 3 },
    { x: -30.45, z: 15.5, rot: FACE_PX, seats: 3 },
  ],
  armchairs: [
    { x: -27.5, z: 13.6, rot: FACE_NZ },
    { x: -20.5, z: 13.6, rot: FACE_NZ },
    { x: -16.4, z: 16.5, rot: FACE_NX },
  ],
  tables: [{ x: -27.5, z: 17.2 }, { x: -20.5, z: 17.2 }],
};

function loungeSeats() {
  const entry = [[-23, CORRIDOR_Z.BC], [-23, 11.8]];
  const seats = [];
  const back = (sx) => spot({ pos: [sx, 19.85], facing: FACE_PZ, pose: 'sit', kind: 'idle', approach: [...entry, [-24, 15.2], [-24, 18.8], [sx, 18.8]] });
  for (const sx of [-28.6, -27.5, -26.4]) seats.push(back(sx));
  for (const sx of [-21.6, -20.5, -19.4]) seats.push(back(sx));
  for (const sz of [14.4, 15.5, 16.6]) {
    seats.push(spot({ pos: [-30.2, sz], facing: FACE_PX, pose: 'sit', kind: 'idle', approach: [...entry, [-28.9, 12.2], [-28.9, sz]] }));
  }
  seats.push(spot({ pos: [-27.5, 13.75], facing: FACE_NZ, pose: 'sit', kind: 'idle', approach: [...entry, [-27.5, 12.4]] }));
  seats.push(spot({ pos: [-20.5, 13.75], facing: FACE_NZ, pose: 'sit', kind: 'idle', approach: [...entry, [-20.5, 12.4]] }));
  seats.push(spot({ pos: [-16.55, 16.5], facing: FACE_NX, pose: 'sit', kind: 'idle', approach: [...entry, [-23, 15.5], [-17.6, 16.5]] }));
  // Alternate tag heights on neighbouring seats so name tags don't overlap.
  seats.forEach((s, i) => (s.tagLift = i % 2 ? 0.5 : 0));
  return seats;
}

export const BREAK_TABLES = [{ x: -8.5, z: 15.5 }, { x: -3.5, z: 15.5 }];

function breakRoomSeats() {
  const seats = [];
  for (const t of BREAK_TABLES) {
    for (const side of [-1, 1]) {
      const sx = t.x + side * 0.85;
      seats.push(spot({ pos: [sx, t.z], facing: side < 0 ? FACE_PX : FACE_NX, pose: 'sit', kind: 'idle', approach: [[t.x, CORRIDOR_Z.BC], [sx, 12.5]] }));
    }
  }
  return seats;
}

function roofSeats() {
  const seats = [];
  const { x: px, z: pz } = FIRE_PIT;
  for (const deg of ROOF_SEAT_ANGLES) {
    const t = (deg * Math.PI) / 180;
    const c = Math.cos(t);
    const s = Math.sin(t);
    const side = c < 0 ? -1 : 1;
    seats.push(spot({
      floor: 'roof',
      pos: [px + ROOF_SEAT_R * c, pz + ROOF_SEAT_R * s],
      facing: face(-c, -s),
      pose: 'sit',
      kind: 'idle',
      approach: [ROOF_HUB, [px, -38.6], [px + side * 4.9, -40.6], [px + (ROOF_SEAT_R - 0.9) * c, pz + (ROOF_SEAT_R - 0.9) * s]],
    }));
  }
  for (const lx of [8, 10.5, 13, 15.5]) {
    seats.push(spot({ floor: 'roof', pos: [lx, -54.2], facing: FACE_NZ, pose: 'sit', kind: 'idle', approach: [ROOF_HUB, [lx + 1.25, -48], [lx + 1.25, -54.2]] }));
  }
  seats.forEach((s, i) => (s.tagLift = i % 2 ? 0.62 : 0));
  return seats;
}

export const ROOF_LOUNGER_XS = [8, 10.5, 13, 15.5];

export const ELEVATOR_SPOTS = {
  office: spot({ pos: [OFFICE_ELEVATOR.x, OFFICE_ELEVATOR.z], facing: FACE_NX, kind: 'elevator', approach: [[24, CORRIDOR_Z.BC], [24, 12.5], [29.6, OFFICE_ELEVATOR.z]] }),
  roof: spot({ floor: 'roof', pos: [ROOF_ELEVATOR.x, ROOF_ELEVATOR.z], facing: FACE_NX, kind: 'elevator', approach: [ROOF_HUB] }),
};

// Contractor hot desks for Cursor cloud agents: two columns in the free strips on either side of the Engineering
// desks, three rows each. Contractors arrive and leave through the office elevator. Must match MAX_CONTRACTORS.
const ENGINEERING = DEPARTMENTS.find((d) => d.name === 'Engineering');
export const CONTRACTOR_DESK_XS = [ENGINEERING.x0 + 1.7, ENGINEERING.x1 - 1.9];
export const CONTRACTOR_DESK_ZS = [-11.1, -14.4, -17.7];
export const CONTRACTOR_OVERFLOW = { x: (ENGINEERING.x0 + ENGINEERING.x1) / 2, z: -10.6 };

function contractorDesks() {
  const desks = [];
  for (const deskZ of CONTRACTOR_DESK_ZS) {
    desks.push(makeDesk({ dx: CONTRACTOR_DESK_XS[0], lane: ENGINEERING.x0 + 0.45, deskZ, corridorZ: ROWS.A.corridorZ, zone: 'Contractors' }));
    desks.push(makeDesk({ dx: CONTRACTOR_DESK_XS[1], lane: ENGINEERING.x1 - 0.45, deskZ, corridorZ: ROWS.A.corridorZ, zone: 'Contractors' }));
  }
  desks.forEach((d, i) => (d.seat.tagLift = (i >> 1) % 2 ? 0.42 : 0));
  return desks;
}

export const isRooftopZone = (zone) => !DEPARTMENTS.some((d) => d.name === zone) && zone !== 'Lead corner office';

/**
 * Assign every roster bot a desk (own department, the lead office, or a rooftop hot desk),
 * a delivery spot for receiving handoffs, and an idle seat (lounge, lead sofa, or rooftop).
 */
export function buildLayout(roster, leadId) {
  spotSeq = 0;
  const byZone = new Map();
  for (const b of roster) {
    const zone = b.id === leadId ? 'Lead corner office' : b.zone;
    if (!byZone.has(zone)) byZone.set(zone, []);
    byZone.get(zone).push(b);
  }

  const departments = DEPARTMENTS.map((d) => ({ ...d, desks: departmentDesks(d, (byZone.get(d.name) || []).length) }));
  const lead = leadSpots();
  const hot = hotDesks();
  const lounge = [...loungeSeats(), ...breakRoomSeats()];
  const roof = roofSeats();

  const assignments = new Map();
  let loungeIdx = 0;
  let roofIdx = 0;
  let hotIdx = 0;
  for (const b of roster) {
    if (b.id === leadId) {
      lead.desk.owner = b.id;
      assignments.set(b.id, { home: 'office', desk: lead.desk, idle: lead.idle, rooftop: false });
      continue;
    }
    const dept = departments.find((d) => d.name === b.zone);
    if (dept) {
      const desk = dept.desks.find((k) => !k.owner);
      desk.owner = b.id;
      assignments.set(b.id, { home: 'office', desk, idle: lounge[loungeIdx++ % lounge.length], rooftop: false });
    } else {
      const desk = hot[hotIdx++ % hot.length];
      desk.owner = desk.owner ?? b.id;
      assignments.set(b.id, { home: 'roof', desk, idle: roof[roofIdx++ % roof.length], rooftop: true });
    }
  }

  return { departments, lead, hot, lounge, roof, assignments, contractors: contractorDesks() };
}
