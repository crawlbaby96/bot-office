// Trade room e2e — public lounge, signed-out room view, admin gated, bot keys unchanged.
export async function runTradeE2e({ server, check, shot, browser, sessionCookie }) {
  const adminDenied = await fetch(`${server.url}/api/trade/admin/rooms`);
  check('Trade admin API rejects signed-out requests', adminDenied.status === 401, String(adminDenied.status));

  const cookie = `office_session=${sessionCookie}`;
  const admin = (path, method, body) =>
    fetch(`${server.url}${path}`, {
      method,
      headers: { 'content-type': 'application/json', cookie },
      body: body ? JSON.stringify(body) : undefined,
    }).then(async (r) => {
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || r.statusText);
      return j;
    });

  const roomRes = await admin('/api/trade/admin/rooms', 'POST', { name: 'E2E GVEGAS room' });
  const room = roomRes.room;
  check('Trade admin creates a room', !!room.id && room.path.startsWith('/trade/r/'), room.id);

  const keyA = await admin('/api/trade/admin/keys', 'POST', { roomId: room.id, label: 'Bot Alpha' });
  const keyB = await admin('/api/trade/admin/keys', 'POST', { roomId: room.id, label: 'Bot Beta' });
  check('Trade admin issues two guest keys', keyA.guestKey.startsWith('gk_') && keyB.guestKey.startsWith('gk_'));

  const bot = (key, path, method, body, participantId) =>
    fetch(`${server.url}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${key}`,
        ...(participantId ? { 'x-trade-participant': participantId } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    }).then(async (r) => {
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || r.statusText);
      return j;
    });

  const joinA = await bot(keyA.guestKey, '/api/trade/bot/join', 'POST', { name: 'Alpha Bot' });
  const joinB = await bot(keyB.guestKey, '/api/trade/bot/join', 'POST', { name: 'Beta Bot' });
  check('Two bots join the same room', joinA.roomId === room.id && joinB.roomId === room.id);

  await bot(keyA.guestKey, '/api/trade/bot/messages', 'POST', { text: 'Need a WR' }, joinA.participantId);
  const offerRes = await bot(
    keyA.guestKey,
    '/api/trade/bot/messages',
    'POST',
    { offer: { give: [{ asset: 'RB', qty: 1 }], want: [{ asset: 'WR', qty: 1 }] } },
    joinA.participantId,
  );
  const offerId = offerRes.offer.id;
  const agreed = await bot(
    keyB.guestKey,
    '/api/trade/bot/messages',
    'PUT',
    { action: 'accept', offerId },
    joinB.participantId,
  );
  check('Bots agree an offer', agreed.offer.state === 'agreed', agreed.offer.state);

  const signedOut = await browser.newContext();
  const lobby = await signedOut.newPage();
  lobby.on('pageerror', (e) => check('Trade lobby no page errors', false, e.message));
  const lobbyResp = await lobby.goto(`${server.url}/trade`);
  check('/trade loads without office login', lobbyResp?.status() === 200 && !lobby.url().includes('/login'), lobby.url());
  await lobby.waitForFunction(() => window.__tradeLobby, null, { timeout: 15000 });
  await lobby.waitForTimeout(1500);
  await shot(lobby, '11-trade-lounge.png', 'Public GVEGAS trade lounge (signed out)');
  const roomLink = lobby.locator(`a.room-link[href="${room.path}"]`);
  check('Room list shows the created room', await roomLink.count() > 0);
  await lobby.goto(`${server.url}${room.path}`, { waitUntil: 'networkidle' });
  await lobby.waitForFunction(() => window.__tradeRoom && document.querySelector('#messages')?.textContent.includes('agreed'), null, {
    timeout: 15000,
  });
  const roomText = await lobby.locator('#messages').innerText();
  check('Public room view shows agreed offer while signed out', /agreed/i.test(roomText) && /WR/.test(roomText), roomText.slice(0, 120));
  await shot(lobby, '11-trade-room.png', 'Public room feed after bots agreed an offer');
  await signedOut.close();

  const adminPage = await browser.newPage();
  await adminPage.goto(`${server.url}/trade/admin`);
  check('/trade/admin redirects signed-out visitors to login', adminPage.url().includes('/login'), adminPage.url());
  await adminPage.close();

  const staffCtx = await browser.newContext();
  await staffCtx.addCookies([
    { name: 'office_session', value: sessionCookie, url: `${server.url}/` },
  ]);
  const staff = await staffCtx.newPage();
  await staff.goto(`${server.url}/trade/admin`);
  await staff.waitForFunction(() => !document.querySelector('#loading')?.offsetParent, null, { timeout: 15000 });
  check('/trade/admin loads for signed-in staff', staff.url().includes('/trade/admin'));
  await staffCtx.close();
}
