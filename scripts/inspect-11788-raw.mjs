import * as cheerio from 'cheerio';

const UA = 'Mozilla/5.0';
const jar = new Map();
const cookieHeader = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
const capture = (res) => {
  for (const line of res.headers.getSetCookie?.() ?? []) {
    const [pair] = line.split(';');
    const eq = pair.indexOf('=');
    if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }
};

async function inspect11788() {
  await fetch('https://investja.org/private/game/login', { redirect: 'manual', headers: { 'User-Agent': UA } }).then(capture);
  const loginRes = await fetch('https://investja.org/private/game/login', {
    method: 'POST',
    redirect: 'manual',
    headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookieHeader() },
    body: 'teamname=11788&teampassword=989154',
  });
  capture(loginRes);

  const res = await fetch('https://investja.org/private/game', {
    headers: { 'User-Agent': UA, Cookie: cookieHeader() }
  });
  const text = await res.text();
  console.log('Status:', res.status, 'HTML length:', text.length);
  const $ = cheerio.load(text);
  console.log('Title:', $('title').text().trim());

  $('*').each((_, el) => {
    const t = $(el).text().trim();
    if (t.startsWith('Welcome') && t.includes('trade')) {
      console.log('Welcome alert:', t.replace(/\s+/g, ' '));
    }
  });

  console.log('Tables found:', $('table').length);
  $('table').each((i, table) => {
    console.log(`Table #${i}:`);
    $(table).find('tr').slice(0, 5).each((_, tr) => {
      console.log('  row:', $(tr).text().replace(/\s+/g, ' ').trim());
    });
  });
}

inspect11788().catch(console.error);
