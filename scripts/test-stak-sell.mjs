import * as cheerio from 'cheerio';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const jar = new Map();
const cookieHeader = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
const capture = (res) => {
  for (const line of res.headers.getSetCookie?.() ?? []) {
    const [pair] = line.split(';');
    const eq = pair.indexOf('=');
    if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }
};

async function testStakSell() {
  await fetch('https://investja.org/private/game/login', { redirect: 'manual', headers: { 'User-Agent': UA } }).then(capture);
  const loginRes = await fetch('https://investja.org/private/game/login', {
    method: 'POST',
    redirect: 'manual',
    headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookieHeader() },
    body: 'teamname=11780&teampassword=455535',
  });
  capture(loginRes);

  const step1Body = new URLSearchParams({
    exchange: 'Nasdaq',
    ticker: 'IONS',
    quantity: '1',
    action: 'confirm',
  }).toString();

  const res1 = await fetch('https://investja.org/private/game/sell', {
    method: 'POST',
    redirect: 'manual',
    headers: {
      'User-Agent': UA,
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-Requested-With': 'XMLHttpRequest',
      Cookie: cookieHeader(),
    },
    body: step1Body,
  });
  capture(res1);
  console.log('STAK Step 1 status:', res1.status, 'Location:', res1.headers.get('location'));

  const loc = res1.headers.get('location');
  if (loc) {
    const resFollow = await fetch(loc, { headers: { 'User-Agent': UA, Cookie: cookieHeader() } });
    const textFollow = await resFollow.text();
    const $ = cheerio.load(textFollow);
    $('[class*="alert"]').each((_, el) => {
      console.log('  Alert:', $(el).attr('class'), ':', $(el).text().trim());
    });
  }
}

testStakSell().catch(console.error);
