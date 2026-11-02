const msg = "Couldn't load the lounge. Refresh to retry.";

import('./main.js').catch((err) => {
  console.error(err);
  const loading = document.getElementById('loading');
  if (loading) {
    loading.hidden = false;
    loading.textContent = msg;
  }
});
