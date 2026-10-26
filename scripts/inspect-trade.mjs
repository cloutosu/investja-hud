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
  console.log('1. Initial GET /private/game/login');
  let res = await fetch('https://investja.org/private/game/login', { redirect: 'manual', headers: { 'User-Agent': UA } });
  capture(res);

  console.log('2. POST /private/game/login');
  res = await fetch('https://investja.org/private/game/login', {
    method: 'POST',
    redirect: 'manual',
    headers: {
      'User-Agent': UA,
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: cookieHeader(),
    },
    body: 'teamname=11780&teampassword=455535',
  });
  capture(res);
  console.log('Login redirect:', res.status, res.headers.get('location'));
  console.log('Cookies:', cookieHeader());

  console.log('3. GET /private/game/buy');
  res = await fetch('https://investja.org/private/game/buy', {
    headers: { 'User-Agent': UA, Cookie: cookieHeader() },
  });
  capture(res);
  const text = await res.text();
  console.log('Buy page HTTP status:', res.status);
  const $ = cheerio.load(text);
  console.log('Title:', $('title').text());
  console.log('Alerts:', $('.alert, .alert-danger, .error').text().trim());

  $('form').each((i, form) => {
    console.log(`Form #${i}: action="${$(form).attr('action')}" method="${$(form).attr('method')}"`);
    $(form).find('input, select, textarea').each((_, el) => {
      console.log(`  field: name="${$(el).attr('name')}" type="${$(el).attr('type')}" value="${$(el).attr('value')}"`);
    });
  });

  // Now test sending buy POST with the exact form fields found
}

main().catch(console.error);
