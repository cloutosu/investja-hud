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

async function testLogin(user, pass) {
  jar.clear();
  const p1 = await fetch('https://investja.org/private/game/login', { redirect: 'manual', headers: { 'User-Agent': UA } });
  capture(p1);

  const p2 = await fetch('https://investja.org/private/game/login', {
    method: 'POST',
    redirect: 'manual',
    headers: {
      'User-Agent': UA,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Referer': 'https://investja.org/private/game/login',
      Cookie: cookieHeader(),
    },
    body: new URLSearchParams({ teamname: user, teampassword: pass }).toString(),
  });
  capture(p2);
  const loc = p2.headers.get('location');
  console.log(`User ${user} -> HTTP ${p2.status} | Location: ${loc}`);

  if (loc) {
    const p3 = await fetch(loc, { headers: { 'User-Agent': UA, Cookie: cookieHeader() } });
    const t = await p3.text();
    const $ = cheerio.load(t);
    const alerts = [];
    $('.alert').each((_, el) => alerts.push($(el).text().replace(/\s+/g, ' ').trim()));
    console.log(`User ${user} alerts:`, alerts);
    return { status: p2.status, loc, alerts, html: t };
  }
}

async function main() {
  await testLogin('11780', '455535');
  await testLogin('11788', '989154');
}

main().catch(console.error);
