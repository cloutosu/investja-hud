import * as cheerio from 'cheerio';
import { makeClient } from '../server/core.js';

async function main() {
  const c = makeClient({ baseUrl: 'https://investja.org', user: '11788', pass: '989154' });
  await c.login();
  console.log('Account 11788 login OK!');
  const data = await c.scrape();
  console.log('Holdings:', data.dashboard.holdings);
  console.log('Cash:', data.dashboard.cash, 'Loan:', data.dashboard.loan);

  // Check team name
  const dHtml = await (await fetch('https://investja.org/private/game', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      Cookie: [...c._jar ? c._jar : []].map(([k,v]) => k+'='+v).join('; ')
    }
  })).text();

  const $ = cheerio.load(dHtml);
  $('*').each((_, el) => {
    const t = $(el).text().trim();
    if (t.startsWith('Welcome ') && t.includes('you have')) {
      console.log('Team identity alert:', t.replace(/\s+/g, ' '));
    }
  });

  // Find in leaderboard
  const myTeamInBoard = data.leaderboard.find(t => t.equity === (data.dashboard.holdings.reduce((s, h) => s + h.totalValue, 0) + data.dashboard.cash - data.dashboard.loan));
  console.log('Matched in leaderboard by equity:', myTeamInBoard);
}

main().catch(console.error);
