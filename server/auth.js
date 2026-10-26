// Node 20 ESM — access codes -> signed tokens. Owner can trade; viewer is read-only.
import crypto from 'node:crypto';

const TTL_MS = 12 * 3600 * 1000;
const MAX_FAILS = 6;
const LOCK_MS = 15 * 60 * 1000;

const secret = (env) =>
  crypto
    .createHash('sha256')
    .update(`${env.ACCESS_CODE || ''}|${env.ACCOUNT_1_PIN || ''}|${env.ACCOUNT_2_PIN || ''}|${env.INVESTJA_PASS || ''}`)
    .digest();

const same = (a, b) => {
  if (a === undefined || b === undefined || a === null || b === null) return false;
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

const mac = (env, body) => crypto.createHmac('sha256', secret(env)).update(body).digest('base64url');

export function getAccountList(env = process.env) {
  return [
    {
      id: '11780',
      user: env.ACCOUNT_1_USER || '11780',
      team: env.ACCOUNT_1_TEAM || 'Rahman Power Squared',
      displayUser: '11780',
      tag: 'Rahman Power Squared',
    },
    {
      id: '11778',
      alias: '11788',
      user: env.ACCOUNT_2_USER || '11778',
      team: env.ACCOUNT_2_TEAM || 'Rahman Power',
      displayUser: env.ACCOUNT_2_ALIAS || '11788',
      tag: 'Rahman Power',
    },
  ];
}

export function authForCode(env, code, requestedAccount = null) {
  if (!code) return null;
  const strCode = String(code).trim();
  const acc1Pin = env.ACCOUNT_1_PIN || env.ACCESS_CODE || '455535';
  const acc1View = env.ACCOUNT_1_VIEW_PIN || env.VIEW_CODE || '11780';
  const acc2Pin = env.ACCOUNT_2_PIN || '989154';
  const acc2View = env.ACCOUNT_2_VIEW_PIN || '11788';

  // If specific account was picked in UI
  if (requestedAccount === '11778' || requestedAccount === '11788' || requestedAccount === 'Rahman Power') {
    if (same(strCode, acc2Pin)) return { role: 'owner', accountId: '11778', team: env.ACCOUNT_2_TEAM || 'Rahman Power' };
    if (same(strCode, acc2View) || same(strCode, '11778') || same(strCode, '11788'))
      return { role: 'viewer', accountId: '11778', team: env.ACCOUNT_2_TEAM || 'Rahman Power' };
    return null;
  }
  if (requestedAccount === '11780' || requestedAccount === 'Rahman Power Squared') {
    if (same(strCode, acc1Pin)) return { role: 'owner', accountId: '11780', team: env.ACCOUNT_1_TEAM || 'Rahman Power Squared' };
    if (same(strCode, acc1View) || same(strCode, '11780'))
      return { role: 'viewer', accountId: '11780', team: env.ACCOUNT_1_TEAM || 'Rahman Power Squared' };
    return null;
  }

  // Automatic match based on entered code
  if (same(strCode, acc1Pin)) return { role: 'owner', accountId: '11780', team: env.ACCOUNT_1_TEAM || 'Rahman Power Squared' };
  if (same(strCode, acc2Pin)) return { role: 'owner', accountId: '11778', team: env.ACCOUNT_2_TEAM || 'Rahman Power' };
  if (same(strCode, acc1View) || same(strCode, '11780'))
    return { role: 'viewer', accountId: '11780', team: env.ACCOUNT_1_TEAM || 'Rahman Power Squared' };
  if (same(strCode, acc2View) || same(strCode, '11778') || same(strCode, '11788'))
    return { role: 'viewer', accountId: '11778', team: env.ACCOUNT_2_TEAM || 'Rahman Power' };

  return null;
}

export function roleForCode(env, code) {
  const res = authForCode(env, code);
  return res ? res.role : null;
}

export function signToken(env, role, accountId = '11780') {
  const body = `${role}.${accountId}.${Date.now() + TTL_MS}`;
  return `${body}.${mac(env, body)}`;
}

export function verifyToken(env, token) {
  const parts = String(token || '').split('.');
  if (parts.length === 3) {
    const [role, exp, sig] = parts;
    if ((role !== 'owner' && role !== 'viewer') || !sig || Number(exp) < Date.now()) return null;
    return same(sig, mac(env, `${role}.${exp}`)) ? { role, accountId: '11780' } : null;
  }
  if (parts.length === 4) {
    const [role, accountId, exp, sig] = parts;
    if ((role !== 'owner' && role !== 'viewer') || !sig || Number(exp) < Date.now()) return null;
    return same(sig, mac(env, `${role}.${accountId}.${exp}`)) ? { role, accountId } : null;
  }
  return null;
}

// Per-IP failure counter kept in the store; 6 misses locks that IP for 15 minutes.
export async function checkLock(store, ip) {
  const fails = await store.get('auth-fails', {});
  const f = fails[ip];
  return f && f.until > Date.now() ? Math.ceil((f.until - Date.now()) / 60000) : 0;
}

export async function recordFail(store, ip) {
  const fails = await store.get('auth-fails', {});
  const now = Date.now();
  for (const k of Object.keys(fails)) if ((fails[k].last ?? 0) < now - LOCK_MS) delete fails[k];
  const f = fails[ip] ?? { n: 0, until: 0 };
  f.n += 1;
  f.last = now;
  if (f.n >= MAX_FAILS) { f.until = now + LOCK_MS; f.n = 0; }
  fails[ip] = f;
  await store.set('auth-fails', fails);
  return MAX_FAILS - f.n;
}

export async function clearFails(store, ip) {
  const fails = await store.get('auth-fails', {});
  if (fails[ip]) { delete fails[ip]; await store.set('auth-fails', fails); }
}
