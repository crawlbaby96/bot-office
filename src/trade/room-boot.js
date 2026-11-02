const msg = "Couldn't load the room. Refresh to retry.";

import('./room.js').catch((err) => {
  console.error(err);
  const loading = document.getElementById('loading');
  if (loading) {
    loading.hidden = false;
    loading.textContent = msg;
  }
  const line = document.getElementById('room-line');
  if (line) line.textContent = msg;
});
