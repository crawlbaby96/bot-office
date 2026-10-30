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
  await lobby.waitForFunction(() => window.__tradeLobby?.ready && document.querySelector('#stage canvas'), null, { timeout: 30000 });
  await lobby.waitForTimeout(1500);
  await shot(lobby, '11-trade-lounge.png', 'Public GVEGAS trade lounge (signed out)');
  const roomLink = lobby.locator(`a.room-link[href="${room.path}"]`);
  check('Room list shows the created room', await roomLink.count() > 0);
  await lobby.goto(`${server.url}${room.path}`, { waitUntil: 'networkidle' });
  await lobby.waitForFunction(() => document.querySelector('#loading')?.hidden !== false, null, { timeout: 15000 });
  await lobby.waitForFunction(
    () => {
      if (!window.__tradeRoom) return false;
      const t =
        document.querySelector('.trade-wall-screen')?.textContent ||
        document.querySelector('.trade-offer-card')?.textContent ||
        document.querySelector('#messages')?.textContent ||
        '';
      return /agreed/i.test(t) && /WR/.test(t);
    },
    null,
    { timeout: 20000 },
  );
  check('Two bots shown at the table', (await lobby.locator('.trade-tag').count()) >= 2);
  const roomText =
    (await lobby.locator('.trade-wall-screen, #messages').first().innerText().catch(() => '')) ||
    (await lobby.locator('#messages').innerText());
  check('Public room view shows agreed offer while signed out', /agreed/i.test(roomText) && /WR/.test(roomText) && !/\[\{/.test(roomText), roomText.slice(0, 160));
  await shot(lobby, '11-trade-room.png', '3D trade room: two seated bots, agreed offer on wall screen');
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

  const card = staff.locator(`.room-card[data-room="${room.id}"]`);
  await card.locator('input[name="label"]').fill('UI key');
  await card.locator('.key-form button[type="submit"]').click();
  await staff.waitForSelector('#key-reveal:not([hidden])', { timeout: 10000 });
  await staff.waitForTimeout(1500);
  const shownKey = await staff.inputValue('#key-reveal-value');
  check('Issued guest key stays on screen after the room list refreshes', shownKey.startsWith('gk_'), shownKey.slice(0, 3));
  await staff.click('#key-reveal-done');
  check('Done clears the guest key', (await staff.inputValue('#key-reveal-value')) === '');
  await staffCtx.close();
}
