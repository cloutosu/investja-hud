import * as cheerio from 'cheerio';

function clean(s) {
  return s.replace(/\s+/g, ' ').trim();
}

function extractErrorMessage(html) {
  const $ = cheerio.load(html);
  const sel = ['.alert-danger', '.alert-warning', '.alert-error', '.alert', '.error', '.message', '.flash'];
  for (const s of sel) {
    const els = $(s);
    for (let i = 0; i < els.length; i++) {
      const t = clean($(els[i]).text());
      if (
        t &&
        !t.includes('username and/or password specified did not match') &&
        !t.includes('successfully logged in') &&
        !t.includes('Welcome Rahman Power') &&
        !t.includes('Warning: You do not have enough cash to make this trade') // this is just loan advisory on buy
      ) {
        return t.slice(0, 240);
      }
    }
  }
  return null;
}

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

async function testVerifiedSell() {
  await fetch('https://investja.org/private/game/login', { redirect: 'manual', headers: { 'User-Agent': UA } }).then(capture);
  const loginRes = await fetch('https://investja.org/private/game/login', {
    method: 'POST',
    redirect: 'manual',
    headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookieHeader() },
    body: 'teamname=11780&teampassword=455535',
  });
  capture(loginRes);

  const res1 = await fetch('https://investja.org/private/game/sell', {
    method: 'POST',
    redirect: 'manual',
    headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded', 'X-Requested-With': 'XMLHttpRequest', Cookie: cookieHeader() },
    body: 'exchange=Nasdaq&ticker=AIOK&quantity=10&action=confirm',
  });
  capture(res1);

  if (res1.status === 302) {
    const loc = res1.headers.get('location');
    const followRes = await fetch(loc, { headers: { 'User-Agent': UA, Cookie: cookieHeader() } });
    const followHtml = await followRes.text();
    const err = extractErrorMessage(followHtml);
    if (err) {
      console.log('DETECTED REJECTION REASON:', err);
      return { success: false, message: err };
    }
  }
}

testVerifiedSell().catch(console.error);
