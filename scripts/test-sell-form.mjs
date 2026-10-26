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

async function testSellStep() {
  await fetch('https://investja.org/private/game/login', { redirect: 'manual', headers: { 'User-Agent': UA } }).then(capture);
  const loginRes = await fetch('https://investja.org/private/game/login', {
    method: 'POST',
    redirect: 'manual',
    headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookieHeader() },
    body: 'teamname=11780&teampassword=455535',
  });
  capture(loginRes);

  console.log('--- TESTING SELL FORM ON /private/game/sell ---');
  const sellForm1 = new URLSearchParams({
    exchange: 'Nasdaq',
    ticker: 'AIOK',
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
    body: sellForm1,
  });
  capture(res1);
  const text1 = await res1.text();
  const $ = cheerio.load(text1);

  console.log('Sell page status:', res1.status, 'Location:', res1.headers.get('location'));
  $('form').each((i, form) => {
    console.log(`Sell Form #${i}: action="${$(form).attr('action')}"`);
    $(form).find('input, select, button').each((_, el) => {
      console.log(`  name="${$(el).attr('name')}" type="${$(el).attr('type')}" value="${$(el).attr('value')}"`);
    });
  });
}

testSellStep().catch(console.error);
