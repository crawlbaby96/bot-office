import { getStore, resetStoreCache } from '../store/index.js';

export async function getTradeStore(env = process.env) {
  const store = await getStore(env);
  if (!store.trade) throw new Error('Trade store is not available');
  return store.trade;
}

export function resetTradeStoreCache() {
  resetStoreCache();
}
