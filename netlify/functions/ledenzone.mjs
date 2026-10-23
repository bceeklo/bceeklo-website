// Ledenzone (TEST) — inloggen met Google + lijst van toegelaten adressen.
// Instellingen in Netlify › Environment variables:
//   LEDENZONE_GOOGLE_CLIENT_ID  OAuth-client-ID uit Google Cloud (type "Web application")
//   LEDENZONE_GEHEIM            lange willekeurige tekst om de login-cookie te ondertekenen
//   LEDENZONE_ADRESSEN          toegelaten e-mailadressen, gescheiden door komma's of nieuwe regels
// Acties:  GET ?actie=config  ·  GET ?actie=wie  ·  POST {actie:"login", credential}  ·  POST {actie:"afmelden"}
import crypto from 'node:crypto';

const COOKIE = 'lz_sessie';
const DUUR = 180 * 24 * 3600; // 180 dagen ingelogd blijven

function env(naam) {
  try { if (globalThis.Netlify && Netlify.env && Netlify.env.get(naam)) return Netlify.env.get(naam); } catch { /* */ }
  return process.env[naam] || '';
}
function antwoord(status, body, extra = {}) {
  return new Response(JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...extra },
  });
}
function adressen() {
  return env('LEDENZONE_ADRESSEN').split(/[\s,;]+/).map((a) => a.trim().toLowerCase()).filter(Boolean);
}
const b64 = (s) => Buffer.from(s).toString('base64url');
function teken(payload) { return crypto.createHmac('sha256', env('LEDENZONE_GEHEIM')).update(payload).digest('base64url'); }
function maakSessie(email) {
  const p = b64(JSON.stringify({ e: email, x: Math.floor(Date.now() / 1000) + DUUR }));
  return p + '.' + teken(p);
}
function leesSessie(req) {
  const m = /(?:^|;\s*)lz_sessie=([^;]+)/.exec(req.headers.get('cookie') || '');
  if (!m) return null;
  const [p, sig] = m[1].split('.');
  if (!p || !sig) return null;
  const goed = teken(p);
  if (goed.length !== sig.length || !crypto.timingSafeEqual(Buffer.from(goed), Buffer.from(sig))) return null;
  try {
    const d = JSON.parse(Buffer.from(p, 'base64url').toString());
    return d.x > Date.now() / 1000 ? d.e : null;
  } catch { return null; }
}
const cookie = (waarde, maxAge) => `${COOKIE}=${waarde}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;

export default async (req) => {
  const ontbreekt = ['LEDENZONE_GOOGLE_CLIENT_ID', 'LEDENZONE_GEHEIM', 'LEDENZONE_ADRESSEN'].filter((n) => !env(n));
  const url = new URL(req.url);

  if (req.method === 'GET') {
    const actie = url.searchParams.get('actie');
    if (actie === 'config') return antwoord(200, { clientId: env('LEDENZONE_GOOGLE_CLIENT_ID'), ontbreekt });
    if (actie === 'wie') {
      const e = ontbreekt.length ? null : leesSessie(req);
      return antwoord(200, { email: e && adressen().includes(e) ? e : null });
    }
    return antwoord(400, { fout: 'Onbekende actie.' });
  }

  let data = {};
  try { data = await req.json(); } catch { /* leeg */ }

  if (data.actie === 'afmelden') return antwoord(200, { ok: true }, { 'set-cookie': cookie('', 0) });

  if (data.actie === 'login') {
    if (ontbreekt.length) return antwoord(500, { fout: 'De ledenzone is nog niet ingesteld: ' + ontbreekt.join(', ') + ' ontbreekt in Netlify.' });
    // Google controleert zelf de handtekening van het token; wij checken voor wie het bedoeld is.
    const r = await fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(String(data.credential || '')));
    if (!r.ok) return antwoord(401, { fout: 'Inloggen bij Google is mislukt. Probeer opnieuw.' });
    const t = await r.json();
    const email = String(t.email || '').toLowerCase();
    if (t.aud !== env('LEDENZONE_GOOGLE_CLIENT_ID') || !['accounts.google.com', 'https://accounts.google.com'].includes(t.iss)
        || String(t.email_verified) !== 'true' || !email) {
      return antwoord(401, { fout: 'Dit Google-antwoord kon niet gecontroleerd worden.' });
    }
    if (!adressen().includes(email)) return antwoord(403, { fout: 'geen-toegang', email });
    return antwoord(200, { ok: true, email }, { 'set-cookie': cookie(maakSessie(email), DUUR) });
  }
  return antwoord(400, { fout: 'Onbekende actie.' });
};
