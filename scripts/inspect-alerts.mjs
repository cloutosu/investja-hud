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

  const buyRes = await fetch('https://investja.org/private/game/buy', {
    headers: { 'User-Agent': UA, Cookie: cookieHeader() },
  });
  const text = await buyRes.text();
  const $ = cheerio.load(text);

  console.log('--- ALL ELEMENTS WITH CLASS ALERT OR ERROR ---');
  $('[class*="alert"], [class*="error"], [class*="message"], [class*="notice"]').each((i, el) => {
    console.log(`Class: "${$(el).attr('class')}" | Style: "${$(el).attr('style')}" | Text: "${$(el).text().trim()}"`);
  });
}

main().catch(console.error);
