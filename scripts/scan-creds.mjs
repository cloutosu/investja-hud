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

async function testCreds(u, p) {
  jar.clear();
  await fetch('https://investja.org/private/game/login', { redirect: 'manual', headers: { 'User-Agent': UA } }).then(capture);
  const res = await fetch('https://investja.org/private/game/login', {
    method: 'POST',
    redirect: 'manual',
    headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookieHeader() },
    body: `teamname=${u}&teampassword=${p}`,
  });
  const loc = res.headers.get('location') || '';
  const success = loc.includes('private/game');
  console.log(`[test] User: ${u} | Pass: ${p} -> Success: ${success} (${loc})`);
  if (success) {
    capture(res);
    const dRes = await fetch(loc, { headers: { 'User-Agent': UA, Cookie: cookieHeader() } });
    const text = await dRes.text();
    const $ = cheerio.load(text);
    let welcome = '';
    $('*').each((_, el) => {
      const t = $(el).text().trim();
      if (t.startsWith('Welcome ') && t.includes('trade')) welcome = t.replace(/\s+/g, ' ');
    });
    console.log(`  -> Welcome: "${welcome}"`);
  }
  return success;
}

async function scan() {
  // Test permutations the user might have had
  await testCreds('11788', '989154');
  await testCreds('11788', '455535');
  await testCreds('11778', '989154');
  await testCreds('11778', '455535');
  await testCreds('11766', '989154');
  await testCreds('11766', '455535');
  await testCreds('11780', '989154');
}

scan().catch(console.error);
