import * as cheerio from 'cheerio';
import { makeClient } from '../server/core.js';

async function main() {
  const c = makeClient({ baseUrl: 'https://investja.org', user: '11780', pass: '455535' });
  await c.login();
  const d = await c.scrape();
  console.log('Holdings:', d.dashboard.holdings);

  // Let's test selling the full position or 100 shares to see what InvestJA says
  console.log('Testing sell 100 shares of AIOK:');
  const res = await c.trade({ action: 'sell', exchange: 'Nasdaq', ticker: 'AIOK', quantity: 100 });
  console.log('Sell 100 result:', res);
}

main().catch(console.error);
