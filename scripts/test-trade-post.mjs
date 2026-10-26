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

async function main() {
  await fetch('https://investja.org/private/game/login', { redirect: 'manual', headers: { 'User-Agent': UA } }).then(capture);
  const loginRes = await fetch('https://investja.org/private/game/login', {
    method: 'POST',
    redirect: 'manual',
    headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookieHeader() },
    body: 'teamname=11780&teampassword=455535',
  });
  capture(loginRes);
  console.log('Login status:', loginRes.status, 'Location:', loginRes.headers.get('location'));

  // Test 1: POST to /private/game/buy
  const formBody = new URLSearchParams({
    exchange: 'Nasdaq',
    ticker: 'AIOK',
    quantity: '1',
    action: 'confirm',
  }).toString();

  console.log('Sending trade to /private/game/buy...');
  const res1 = await fetch('https://investja.org/private/game/buy', {
    method: 'POST',
    redirect: 'manual',
    headers: {
      'User-Agent': UA,
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-Requested-With': 'XMLHttpRequest',
      Cookie: cookieHeader(),
    },
    body: formBody,
  });
  capture(res1);
  console.log('Res 1 Status:', res1.status, 'Location:', res1.headers.get('location'));
  const text1 = await res1.text();
  console.log('Res 1 len:', text1.length);
  const $1 = cheerio.load(text1);
  console.log('Res 1 alerts:');
  $1('[class*="alert"]').each((_, el) => console.log('  ', $1(el).attr('class'), ':', $1(el).text().trim()));

  // Test 2: POST to /index.php/private/game/buy
  console.log('Sending trade to /index.php/private/game/buy...');
  const res2 = await fetch('https://investja.org/index.php/private/game/buy', {
    method: 'POST',
    redirect: 'manual',
    headers: {
      'User-Agent': UA,
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-Requested-With': 'XMLHttpRequest',
      Cookie: cookieHeader(),
    },
    body: formBody,
  });
  capture(res2);
  console.log('Res 2 Status:', res2.status, 'Location:', res2.headers.get('location'));
  const text2 = await res2.text();
  console.log('Res 2 len:', text2.length);
  const $2 = cheerio.load(text2);
  console.log('Res 2 alerts:');
  $2('[class*="alert"]').each((_, el) => console.log('  ', $2(el).attr('class'), ':', $2(el).text().trim()));
}

main().catch(console.error);
