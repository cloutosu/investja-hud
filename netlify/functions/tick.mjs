import { tickAll } from '../../server/core.js';
import { openStore, session } from './_shared.mjs';

// Runs every minute on Netlify's scheduler (or dev-api loop): ticks both accounts
export default async () => {
  try {
    const res = await tickAll(openStore(), session);
    console.log('[tick-all]', JSON.stringify(res));
  } catch (e) {
    console.error('[tick] failed:', e.message);
  }
};

export const config = { schedule: '* * * * *' };
