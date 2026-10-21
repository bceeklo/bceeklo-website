// Knop "Uitslagen nu verwerken" (bceeklo.be/verwerk) -> start de GitHub-robot.
// Instellingen in Netlify › Environment variables:
//   GH_ROBOT_TOKEN  fine-grained GitHub-token (enkel repo bceeklo-website; Actions: read & write, Contents: read)
//   VERWERK_CODE    code die de tafelleiders intikken
const REPO = 'bceeklo/bceeklo-website';
const WORKFLOW = 'uitslagen.yml';
const API = 'https://api.github.com/repos/' + REPO;

function antwoord(status, body) {
  return new Response(JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

async function gh(pad, opties = {}) {
  return fetch(API + pad, {
    ...opties,
    headers: {
      authorization: 'Bearer ' + process.env.GH_ROBOT_TOKEN,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      'user-agent': 'bceeklo-verwerk-knop',
      ...(opties.headers || {}),
    },
  });
}

export default async (req) => {
  if (!process.env.GH_ROBOT_TOKEN || !process.env.VERWERK_CODE) {
    return antwoord(500, { fout: 'De knop is nog niet ingesteld (token of code ontbreekt in Netlify).' });
  }
  let data = {};
  try { data = await req.json(); } catch { /* leeg */ }
  if (String(data.code || '').trim() !== String(process.env.VERWERK_CODE).trim()) {
    await new Promise((r) => setTimeout(r, 800)); // raden traag maken
    return antwoord(403, { fout: 'Verkeerde code.' });
  }

  // 1) starten
  if (data.actie === 'start') {
    const r = await gh('/actions/workflows/' + WORKFLOW + '/dispatches', {
      method: 'POST', body: JSON.stringify({ ref: 'main' }),
    });
    if (r.status !== 204) return antwoord(502, { fout: 'GitHub weigerde de opdracht (' + r.status + ').' });
    return antwoord(200, { gestart: new Date().toISOString() });
  }

  // 2) toestand opvragen
  if (data.actie === 'status' && data.sinds) {
    const sinds = new Date(new Date(data.sinds).getTime() - 15000).toISOString();
    const r = await gh('/actions/runs?event=workflow_dispatch&per_page=5');
    if (!r.ok) return antwoord(502, { fout: 'GitHub antwoordt niet (' + r.status + ').' });
    const run = ((await r.json()).workflow_runs || []).find((x) => x.created_at >= sinds);
    if (!run) return antwoord(200, { toestand: 'wachten' });
    if (run.status !== 'completed') return antwoord(200, { toestand: 'bezig' });
    if (run.conclusion !== 'success') return antwoord(200, { toestand: 'fout' });
    const c = await gh('/commits?sha=main&per_page=5&since=' + encodeURIComponent(sinds));
    const nieuw = c.ok ? (await c.json()).some((x) => /^Website bijgewerkt|^Nieuwe uitslagen/.test(x.commit.message)) : false;
    return antwoord(200, { toestand: nieuw ? 'nieuw' : 'niets' });
  }
  return antwoord(400, { fout: 'Onbekende vraag.' });
};

export const config = { path: '/api/verwerk' };
