import * as cheerio from 'cheerio';

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

async function test11788() {
  await fetch('https://investja.org/private/game/login', { redirect: 'manual', headers: { 'User-Agent': UA } }).then(capture);
  const loginRes = await fetch('https://investja.org/private/game/login', {
    method: 'POST',
    redirect: 'manual',
    headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookieHeader() },
    body: 'teamname=11788&teampassword=989154',
  });
  capture(loginRes);
  console.log('Login redirect:', loginRes.headers.get('location'));

  const res = await fetch('https://investja.org/private/game', {
    headers: { 'User-Agent': UA, Cookie: cookieHeader() }
  });
  const html = await res.text();
  const $ = cheerio.load(html);
  
  console.log('--- ALL TEXT CONTAINING CASH OR LOAN OR TEAM ---');
  $('*').each((_, el) => {
    const t = $(el).clone().children().remove().end().text().trim();
    if (t.includes('Cash') || t.includes('Loan') || t.includes('Team') || t.includes('Welcome') || t.includes('$')) {
      console.log('  ->', t.replace(/\s+/g, ' '));
    }
  });
}

test11788().catch(console.error);
