import * as cheerio from 'cheerio';
import { parseTradeConfirmation } from '../server/parsers.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
const jar = new Map();
const cookieHeader = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
const capture = (res) => {
  for (const line of res.headers.getSetCookie?.() ?? []) {
    const [pair] = line.split(';');
    const eq = pair.indexOf('=');
    if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }
};

async function main() {
  await fetch('https://investja.org/private/game/login', { redirect: 'manual', headers: { 'User-Agent': UA } }).then(capture);
  const l = await fetch('https://investja.org/private/game/login', {
    method: 'POST', redirect: 'manual',
    headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookieHeader() },
    body: 'teamname=11780&teampassword=455535'
  });
  capture(l);

  // Check Step 1 confirmation
  const post1 = await fetch('https://investja.org/private/game/buy', {
    method: 'POST',
    headers: {
      'User-Agent': UA,
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-Requested-With': 'XMLHttpRequest',
      Cookie: cookieHeader(),
    },
    body: 'exchange=Nasdaq&ticker=AAPL&quantity=1&action=confirm'
  });
  capture(post1);
  const text1 = await post1.text();
  const parsed = parseTradeConfirmation(text1);
  console.log('parseTradeConfirmation output on buy:', parsed);
}

main().catch(console.error);
