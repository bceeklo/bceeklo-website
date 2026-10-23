// Schermt bceeklo.be/ledenzone af: zonder geldige login (zie functions/ledenzone.mjs) -> naar de loginpagina.
// De lijst wordt bij elk bezoek opnieuw gecontroleerd: wie geschrapt wordt, verliest meteen de toegang.
import { toegelaten } from '../lib/adressen.mjs';

const env = (n) => (globalThis.Netlify && Netlify.env.get(n)) || '';

async function geldig(waarde, geheim) {
  const [p, sig] = String(waarde || '').split('.');
  if (!p || !sig) return null;
  const sleutel = await crypto.subtle.importKey('raw', new TextEncoder().encode(geheim), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const ruw = new Uint8Array(await crypto.subtle.sign('HMAC', sleutel, new TextEncoder().encode(p)));
  const goed = btoa(String.fromCharCode(...ruw)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  if (goed.length !== sig.length) return null;
  let verschil = 0;
  for (let i = 0; i < goed.length; i++) verschil |= goed.charCodeAt(i) ^ sig.charCodeAt(i);
  if (verschil) return null;
  try {
    const d = JSON.parse(atob(p.replace(/-/g, '+').replace(/_/g, '/')));
    return d.x > Date.now() / 1000 ? String(d.e).toLowerCase() : null;
  } catch { return null; }
}

export default async (req, context) => {
  const geheim = env('LEDENZONE_GEHEIM');
  const email = geheim ? await geldig(context.cookies.get('lz_sessie'), geheim) : null;
  if (email && (await toegelaten(env)).lijst.includes(email)) {
    const res = await context.next();
    res.headers.set('cache-control', 'private, no-store');
    res.headers.set('x-robots-tag', 'noindex, nofollow');
    return res;
  }
  const url = new URL(req.url);
  return Response.redirect(new URL('/ledenzone-login.html?terug=' + encodeURIComponent(url.pathname), url), 302);
};

export const config = { path: ['/ledenzone', '/ledenzone/*'] };
