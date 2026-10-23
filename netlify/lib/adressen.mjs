// Lijst van e-mailadressen met toegang tot de ledenzone.
// Bron 1: Google Sheet (LEDENZONE_SHEET_ID) — elk e-mailadres in de eerste tab telt, ongeacht kolom of opmaak.
// Bron 2: LEDENZONE_ADRESSEN in Netlify (vaste adressen, bv. de webmaster; werkt ook als de Sheet onbereikbaar is).
// De Sheet wordt gelezen met een service-account (LEDENZONE_SA_JSON = de JSON-sleutel) en 5 minuten onthouden.
// Werkt zowel in de Netlify-functie (Node) als in de edge-functie (Deno): enkel fetch + Web Crypto.

const CACHE_MS = 5 * 60 * 1000;
let cache = { tot: 0, lijst: null };
let token = { tot: 0, waarde: '' };

const MAIL = /[a-z0-9._%+'-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
export function uitTekst(t) { return (String(t || '').match(MAIL) || []).map((a) => a.toLowerCase()); }

function b64url(bytes) {
  let s = ''; for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
const tekstB64 = (t) => b64url(new TextEncoder().encode(t));

async function accessToken(sa) {
  if (token.waarde && Date.now() < token.tot) return token.waarde;
  const pem = String(sa.private_key).replace(/\\n/g, '\n').replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const sleutel = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const nu = Math.floor(Date.now() / 1000);
  const onder = tekstB64(JSON.stringify({ alg: 'RS256', typ: 'JWT' })) + '.' + tekstB64(JSON.stringify({
    iss: sa.client_email, scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
    aud: 'https://oauth2.googleapis.com/token', iat: nu, exp: nu + 3600,
  }));
  const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', sleutel, new TextEncoder().encode(onder)));
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=' + onder + '.' + b64url(sig),
  });
  if (!r.ok) throw new Error('Google-token geweigerd (' + r.status + ')');
  const d = await r.json();
  token = { waarde: d.access_token, tot: Date.now() + (d.expires_in - 120) * 1000 };
  return token.waarde;
}

async function uitSheet(env) {
  const id = env('LEDENZONE_SHEET_ID'), json = env('LEDENZONE_SA_JSON');
  if (!id || !json) return [];
  const sa = JSON.parse(json);
  const r = await fetch('https://sheets.googleapis.com/v4/spreadsheets/' + encodeURIComponent(id) + '/values/A1:Z3000',
    { headers: { authorization: 'Bearer ' + await accessToken(sa) } });
  if (!r.ok) throw new Error('Sheet niet leesbaar (' + r.status + ')');
  const d = await r.json();
  return uitTekst((d.values || []).map((rij) => rij.join(' ')).join('\n'));
}

/** Geeft { lijst: [...adressen], bron, fout } terug. */
export async function toegelaten(env) {
  const vast = uitTekst(env('LEDENZONE_ADRESSEN'));
  if (cache.lijst && Date.now() < cache.tot) return { lijst: [...new Set([...vast, ...cache.lijst])], bron: 'cache' };
  try {
    const s = await uitSheet(env);
    cache = { lijst: s, tot: Date.now() + CACHE_MS };
    return { lijst: [...new Set([...vast, ...s])], bron: s.length ? 'sheet' : 'netlify' };
  } catch (e) {
    // Sheet tijdelijk onbereikbaar: laatste gekende lijst blijft gelden (1 minuut opnieuw proberen)
    if (cache.lijst) cache.tot = Date.now() + 60 * 1000;
    return { lijst: [...new Set([...vast, ...(cache.lijst || [])])], bron: 'fallback', fout: String(e.message || e) };
  }
}
