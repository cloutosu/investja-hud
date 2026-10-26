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

async function inspectSellExecution() {
  await fetch('https://investja.org/private/game/login', { redirect: 'manual', headers: { 'User-Agent': UA } }).then(capture);
  const loginRes = await fetch('https://investja.org/private/game/login', {
    method: 'POST',
    redirect: 'manual',
    headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookieHeader() },
    body: 'teamname=11780&teampassword=455535',
  });
  capture(loginRes);

  console.log('--- 1. POST /private/game/sell ---');
  const step1Body = new URLSearchParams({
    exchange: 'Nasdaq',
    ticker: 'AIOK',
    quantity: '10',
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
  const text1 = await res1.text();
  const $1 = cheerio.load(text1);

  console.log('Step 1 status:', res1.status);
  const formAction = $1('form[action*="private/game"]').attr('action');
  console.log('Step 1 form action:', formAction);

  const confirmFields = {};
  $1('form[action*="private/game"] input, form[action*="private/game"] button').each((_, el) => {
    const name = $1(el).attr('name');
    const val = $1(el).attr('value') ?? '';
    if (name) confirmFields[name] = val;
  });
  console.log('Step 1 fields extracted:', confirmFields);

  console.log('--- 2. POST Step 2 confirmation to:', formAction);
  const res2 = await fetch('https://investja.org' + (formAction.startsWith('/') ? formAction : '/' + formAction), {
    method: 'POST',
    redirect: 'manual',
    headers: {
      'User-Agent': UA,
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-Requested-With': 'XMLHttpRequest',
      Cookie: cookieHeader(),
    },
    body: new URLSearchParams(confirmFields).toString(),
  });
  capture(res2);
  console.log('Step 2 status:', res2.status, 'Location:', res2.headers.get('location'));
  const text2 = await res2.text();
  console.log('Step 2 text length:', text2.length);

  // Now follow the location redirect!
  const nextLoc = res2.headers.get('location');
  if (nextLoc) {
    console.log('--- 3. Following redirect to:', nextLoc);
    const res3 = await fetch(nextLoc, {
      headers: { 'User-Agent': UA, Cookie: cookieHeader() }
    });
    const text3 = await res3.text();
    const $3 = cheerio.load(text3);
    console.log('Redirect page alerts:');
    $3('[class*="alert"]').each((_, el) => {
      console.log('  Alert class:', $3(el).attr('class'), 'Text:', $3(el).text().trim());
    });
  }
}

inspectSellExecution().catch(console.error);
