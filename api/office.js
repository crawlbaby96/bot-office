import { json, requireSession } from '../lib/http.js';
import { officeSnapshot } from '../lib/office.js';

export async function GET(request) {
  const denied = await requireSession(request);
  if (denied) return denied;
  return json(await officeSnapshot());
}
