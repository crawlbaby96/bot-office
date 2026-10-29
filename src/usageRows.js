import { formatDate, formatDateTime } from './format.js';

const usd = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
const compact = (n) => new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
const pctLabel = (p) => `${p % 1 === 0 ? p.toFixed(0) : p.toFixed(1)}%`;

/** Grok Bot's pushed weekly reading (unchanged behavior: "No reading yet" until one is pushed). */
function grokRow(u) {
  if (!u) {
    return { id: 'grok', label: 'Grok Bot', sub: 'Weekly usage left', status: 'pending', primary: 'No reading yet', secondary: 'Waiting for the first usage reading to be pushed.', asOf: '', percentLeft: null };
  }
  const pct = Math.max(0, Math.min(100, u.percentLeft));
  return {
    id: 'grok',
    label: 'Grok Bot',
    sub: 'Weekly usage left',
    status: 'ok',
    percentLeft: pct,
    primary: `${pctLabel(pct)} left`,
    secondary: u.resetsAt ? `Resets ${formatDateTime(u.resetsAt)}` : 'Reset time not reported',
    asOf: `As of ${formatDateTime(u.readAt)}`,
    usedOfLimit: u.used != null && u.limit != null ? `${u.used} / ${u.limit} used` : '',
  };
}

function values(p) {
  const m = p.metrics ?? {};
  if (p.id === 'cursor') {
    const extra = [`${usd(m.onDemandUsd ?? 0)} on-demand`];
    if (m.cycleStart) extra.push(`cycle since ${formatDate(m.cycleStart)}`);
    if (m.members != null) extra.push(`${m.members} member${m.members === 1 ? '' : 's'}`);
    return { primary: `${usd(m.cycleUsd ?? 0)} this billing cycle`, secondary: extra.join(' · ') };
  }
  const tokens = m.tokens ? `${compact(m.tokens.input)} input · ${compact(m.tokens.output)} output tokens this month` : 'Token counts unavailable';
  return { primary: `${usd(m.monthUsd ?? 0)} this month · ${usd(m.weekUsd ?? 0)} last 7 days`, secondary: tokens };
}

function providerRow(p) {
  const base = { id: p.id, label: p.label, sub: p.sub, status: p.status, detail: p.detail ?? '' };
  if (p.status === 'ok') return { ...base, ...values(p), asOf: `As of ${formatDateTime(p.readAt)}` };
  if (p.status === 'stale') return { ...base, ...values(p), asOf: `Stale since ${formatDateTime(p.staleSince)}${p.detail ? ` · ${p.detail}` : ''}` };
  if (p.status === 'pending') return { ...base, primary: 'No reading yet', secondary: 'Waiting for the first hourly fetch', asOf: '' };
  return { ...base, primary: 'Not connected', secondary: p.detail || 'Not configured', asOf: '' };
}

/** Rows for the usage board and the usage panel, built only from the office snapshot. */
export function usageRows(snap) {
  return [grokRow(snap?.usage ?? null), ...(snap?.providers ?? []).map(providerRow)];
}
