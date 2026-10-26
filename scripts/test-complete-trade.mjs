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

async function testCompleteTrade() {
  await fetch('https://investja.org/private/game/login', { redirect: 'manual', headers: { 'User-Agent': UA } }).then(capture);
  const loginRes = await fetch('https://investja.org/private/game/login', {
    method: 'POST',
    redirect: 'manual',
    headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookieHeader() },
    body: 'teamname=11780&teampassword=455535',
  });
  capture(loginRes);

  console.log('--- STEP 1: INITIAL POST TO /private/game/buy ---');
  const step1Body = new URLSearchParams({
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
    body: step1Body,
  });
  capture(res1);
  const text1 = await res1.text();
  const $1 = cheerio.load(text1);

  // Extract confirmation serial number
  const serialName = $1('input[name*="serial_number"]').attr('name');
  const serialVal = $1('input[name*="serial_number"]').attr('value');
  console.log('Serial Token:', serialName, '=', serialVal);

  const formAction = $1('form[action*="private/game"]').attr('action') || '/index.php/private/game/buy';
  console.log('Confirm action URL:', formAction);

  // Collect all hidden inputs and the submit button
  const confirmPayload = new URLSearchParams();
  $1('form[action*="private/game"] input').each((_, el) => {
    const name = $1(el).attr('name');
    const val = $1(el).attr('value') ?? '';
    if (name) confirmPayload.set(name, val);
  });
  console.log('Confirm Payload:', confirmPayload.toString());

  console.log('--- STEP 2: POSTING CONFIRMATION ---');
  const res2 = await fetch('https://investja.org' + (formAction.startsWith('/') ? formAction : '/' + formAction), {
    method: 'POST',
    redirect: 'manual',
    headers: {
      'User-Agent': UA,
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-Requested-With': 'XMLHttpRequest',
      Cookie: cookieHeader(),
    },
    body: confirmPayload.toString(),
  });
  capture(res2);
  console.log('Step 2 Status:', res2.status, 'Location:', res2.headers.get('location'));
  const text2 = await res2.text();
  console.log('Step 2 text len:', text2.length);
  const $2 = cheerio.load(text2);
  $2('.alert, .alert-success, .alert-danger, .alert-info').each((_, el) => {
    console.log('Alert:', $2(el).attr('class'), '->', $2(el).text().trim());
  });
}

testCompleteTrade().catch(console.error);
