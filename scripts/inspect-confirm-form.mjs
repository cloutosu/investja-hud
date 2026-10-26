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

  const formBody = new URLSearchParams({
    exchange: 'Nasdaq',
    ticker: 'AIOK',
    quantity: '1',
    action: 'confirm',
  }).toString();

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
  const text1 = await res1.text();
  const $ = cheerio.load(text1);

  console.log('--- FORMS ON CONFIRMATION PAGE ---');
  $('form').each((i, form) => {
    console.log(`Form #${i}: action="${$(form).attr('action')}" method="${$(form).attr('method')}"`);
    $(form).find('input, select, button').each((_, el) => {
      console.log(`  name="${$(el).attr('name')}" type="${$(el).attr('type')}" value="${$(el).attr('value')}" text="${$(el).text().trim()}"`);
    });
  });
}

main().catch(console.error);
