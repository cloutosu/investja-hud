import { getStore } from '@netlify/blobs';
import { makeClient } from '../../server/core.js';

export const env = () => process.env;
export const TARGET = (accountId = '11780') => resolveAccount(accountId).team;

export function resolveAccount(accId = '11780') {
  const norm = String(accId || '').trim();
  if (norm === '11778' || norm === '11788' || norm === 'Rahman Power') {
    return {
      id: '11778',
      displayUser: '11788',
      user: process.env.ACCOUNT_2_USER || '11778',
      pass: process.env.ACCOUNT_2_PASS || '989154',
      team: process.env.ACCOUNT_2_TEAM || 'Rahman Power',
    };
  }
  return {
    id: '11780',
    displayUser: '11780',
    user: process.env.ACCOUNT_1_USER || process.env.INVESTJA_USER || '11780',
    pass: process.env.ACCOUNT_1_PASS || process.env.INVESTJA_PASS || '455535',
    team: process.env.ACCOUNT_1_TEAM || process.env.TARGET_TEAM || 'Rahman Power Squared',
  };
}

export function getAllAccounts() {
  return [resolveAccount('11780'), resolveAccount('11778')];
}

const clientSessions = new Map();

export const session = (accountId = '11780') => {
  const acc = resolveAccount(accountId);
  const key = acc.id;
  if (!clientSessions.has(key)) {
    clientSessions.set(
      key,
      makeClient({
        baseUrl: process.env.BASE_URL || 'https://investja.org',
        user: acc.user,
        pass: acc.pass,
      })
    );
  }
  return clientSessions.get(key);
};

const mem = new Map();
const memStore = {
  get: async (k, fb) => (mem.has(k) ? structuredClone(mem.get(k)) : fb),
  set: async (k, v) => { mem.set(k, structuredClone(v)); },
  del: async (k) => { mem.delete(k); },
  list: async (prefix) => [...mem.keys()].filter((k) => k.startsWith(prefix)),
};

export function openStore() {
  try {
    const s = getStore({ name: 'investja', consistency: 'strong' });
    return {
      get: async (k, fb) => (await s.get(k, { type: 'json' })) ?? fb,
      set: (k, v) => s.setJSON(k, v),
      del: (k) => s.delete(k),
      list: async (prefix) => (await s.list({ prefix })).blobs.map((b) => b.key),
    };
  } catch {
    return memStore; // not on Netlify (local dev and tests)
  }
}
