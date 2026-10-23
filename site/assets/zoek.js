/* Zoek op naam — overzicht per speler over ranking, clubdrives, Kroegendrive en Drive Gilbert.
   Leest dezelfde databestanden als de uitslagpagina's (via fetch, geen extra index nodig). */
(function () {
  var MAAND = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
  var DAG = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'];
  var res = document.getElementById('res'), inp = document.getElementById('q');
  var REEKS = {
    club: { map: 'data/', lijst: 'data/zittingen.js', pagina: 'uitslagen.html', max: 5 },
    kroeg: { map: 'data/kroegendrive/', lijst: 'data/kroegendrive/lijst.js', pagina: 'kroegendrive.html', max: 3 },
    gilbert: { map: 'data/gilbert/', lijst: 'data/gilbert/lijst.js', pagina: 'gilbert.html', max: 3 },
    recr: { map: 'data/recreanten/', lijst: 'data/recreanten/lijst.js', pagina: 'recreanten.html', max: 3 }
  };
  var lijsten = {}, zit = {}, ranking = {}, basis = null;

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function nl(n, d) { return Number(n).toFixed(d).replace('.', ','); }
  function plat(t) { return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim(); }
  function datum(iso) { var d = new Date(iso + 'T12:00:00'); return DAG[d.getDay()] + ' ' + d.getDate() + ' ' + MAAND[d.getMonth()] + ' ' + d.getFullYear(); }
  function pctKl(p) { return p >= 60 ? 'hoog' : (p < 40 ? 'laag' : ''); }

  function haal(url) { return fetch(url, { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error(url); return r.text(); }); }
  function arr(s) { return JSON.parse(s.slice(s.indexOf('['), s.lastIndexOf(']') + 1)); }
  function obj(s) { return JSON.parse(s.slice(s.indexOf('(') + 1, s.lastIndexOf(')'))); }

  /* "Van Daele, Nicole" -> "Nicole Van Daele" */
  function helften(p) {
    return String(p.naam || '').split('&').map(function (h) {
      var d = h.split(','), achter = d[0].trim(), voor = d.slice(1).join(' ').trim();
      return (voor ? voor + ' ' + achter : achter).replace(/\s+/g, ' ');
    }).filter(Boolean);
  }

  function laadZitting(reeks, id) {
    var k = reeks + '/' + id;
    if (!zit[k]) zit[k] = haal(REEKS[reeks].map + id + '.js').then(obj).catch(function () { return null; });
    return zit[k];
  }
  function laadBasis() {
    if (basis) return basis;
    var taken = ['di', 'wo'].map(function (d) {
      return haal('data/ranking-' + d + '.js').then(function (s) { ranking[d] = obj(s); }).catch(function () {});
    });
    Object.keys(REEKS).forEach(function (r) {
      taken.push(haal(REEKS[r].lijst).then(arr).catch(function () { return []; }).then(function (l) {
        lijsten[r] = l;
        var n = r === 'club' ? 12 : l.length;   /* namenlijst: alle toernooien + recente clubdrives */
        return Promise.all(l.slice(0, n).map(function (z) { return laadZitting(r, z.id); }));
      }));
    });
    basis = Promise.all(taken);
    return basis;
  }

  /* alle bekende namen uit wat al geladen is */
  function namen() {
    var m = {};
    function voeg(n) { var k = plat(n); if (!k) return; if (!m[k]) m[k] = { naam: n, n: 0 }; m[k].n++; }
    ['di', 'wo'].forEach(function (d) { if (ranking[d]) ranking[d].spelers.forEach(function (s) { voeg(s.naam); }); });
    Object.keys(geladen).forEach(function (k) { geladen[k].paren.forEach(function (p) { helften(p).forEach(voeg); }); });
    return m;
  }
  var geladen = {};
  function onthoud(reeks, z) { if (z) geladen[reeks + '/' + z.id] = z; return z; }

  function zoekPaar(z, sleutel) {
    for (var i = 0; i < z.paren.length; i++) {
      var h = helften(z.paren[i]), j = h.map(plat).indexOf(sleutel);
      if (j >= 0) return { p: z.paren[i], partner: h.filter(function (x, n) { return n !== j; }).join(' & ') };
    }
    return null;
  }

  /* doorloop een reeks (nieuwste eerst) tot er genoeg treffers zijn */
  function treffers(reeks, sleutel) {
    var l = lijsten[reeks] || [], max = REEKS[reeks].max, uit = [], i = 0;
    function stap() {
      if (uit.length >= max || i >= l.length) return Promise.resolve(uit);
      var batch = l.slice(i, i + 6); i += 6;
      return Promise.all(batch.map(function (z) { return laadZitting(reeks, z.id).then(function (d) { return onthoud(reeks, d); }); }))
        .then(function (ds) {
          ds.forEach(function (z) {
            if (!z || uit.length >= max) return;
            var t = zoekPaar(z, sleutel);
            if (t) uit.push({ z: z, p: t.p, partner: t.partner });
          });
          return stap();
        });
    }
    return stap();
  }

  function rijHtml(reeks, t) {
    var z = t.z, p = t.p, detail = z.spellen && z.spellen.length;
    var href = REEKS[reeks].pagina + '#/' + z.id + (detail ? '/paar/' + p.id : '');
    var wat = reeks === 'club'
      ? (z.id.slice(-2) === 'wo' ? 'Woensdag' : 'Dinsdag') + '<small>' + esc(datum(z.datum)) + '</small>'
      : esc(z.titel || z.zitting) + '<small>' + esc(datum(z.datum)) + '</small>';
    return '<a class="rij" href="' + href + '">' +
      '<span class="wat">' + wat + '</span>' +
      '<span class="met"><small>met</small>' + esc(t.partner || '–') + '</span>' +
      '<span class="plaats"><b>' + (p.rang === 1 ? '<span class="goud">1</span>' : p.rang + (p.gedeeld ? '=' : '')) + '</b> / ' + z.paren.length + '</span>' +
      '<span class="pct ' + pctKl(p.pct) + '">' + nl(p.pct, 2) + '%</span></a>';
  }
  function blok(titel, link, inhoud) {
    return '<section class="blok"><div class="blok-kop"><h2>' + titel + '</h2>' + (link || '') + '</div>' + inhoud + '</section>';
  }

  function toonSpeler(sleutel, naam) {
    res.innerHTML = '<h2 class="speler">' + esc(naam) + '</h2><p class="muted">Uitslagen opzoeken…</p>';
    var rk = ['di', 'wo'].map(function (d) {
      var r = ranking[d]; if (!r) return '';
      var s = r.spelers.filter(function (x) { return plat(x.naam) === sleutel; })[0];
      if (!s) return '';
      return '<a class="rij" href="ranking.html#' + d + '">' +
        '<span class="wat">' + (d === 'di' ? 'Dinsdag' : 'Woensdag') + '<small>' + esc(r.competitie) + '</small></span>' +
        '<span class="met"><small>gespeeld</small>' + s.aantal + ' zitting' + (s.aantal === 1 ? '' : 'en') + ' · stand op ' + esc(datum(r.stand_op)) + '</span>' +
        '<span class="plaats"><b>' + (s.rang === 1 ? '<span class="goud">1</span>' : s.rang + (s.gedeeld ? '=' : '')) + '</b> / ' + r.spelers.length + '</span>' +
        '<span class="pct ' + pctKl(s.gem) + '">' + nl(s.gem, 2) + '%</span></a>';
    }).join('');
    Promise.all(['club', 'kroeg', 'gilbert', 'recr'].map(function (r) { return treffers(r, sleutel); })).then(function (t) {
      if (plat(inp.value) && location.hash.slice(1) && decodeURIComponent(location.hash.slice(1)) !== naam) return;
      function lijst(reeks, i, leeg) { return t[i].length ? t[i].map(function (x) { return rijHtml(reeks, x); }).join('') : '<p class="geen">' + leeg + '</p>'; }
      res.innerHTML = '<h2 class="speler">' + esc(naam) + '</h2>' +
        blok('Ranking', '<a href="ranking.html">Volledige ranking →</a>', rk || '<p class="geen">Niet in de ranking van dit seizoen.</p>') +
        blok('Laatste 5 clubdrives', '<a href="uitslagen.html">Alle clubdrives →</a>', lijst('club', 0, 'Geen clubdrives gevonden.')) +
        blok('Laatste 3 Kroegendrives', '<a href="kroegendrive.html">Alle Kroegendrives →</a>', lijst('kroeg', 1, 'Nog geen Kroegendrive gespeeld.')) +
        blok('Laatste 3 Drives Gilbert', '<a href="gilbert.html">Alle Drives Gilbert →</a>', lijst('gilbert', 2, 'Nog geen Drive Gilbert gespeeld.')) +
        (t[3].length ? blok('Recreantentornooi', '<a href="recreanten.html">Alle uitslagen →</a>', lijst('recr', 3, '')) : '');
      document.title = naam + ' · Zoek op naam · Bridgeclub Eeklo';
    });
  }

  function zoek(q, direct) {
    var woorden = plat(q).split(' ').filter(Boolean);
    if (!woorden.length) { res.innerHTML = ''; return; }
    res.innerHTML = '<p class="muted">Zoeken…</p>';
    laadBasis().then(function () {
      return Promise.all(Object.keys(zit).map(function (k) {
        var reeks = k.split('/')[0];
        return zit[k].then(function (z) { onthoud(reeks, z); });
      }));
    }).then(function () {
      var m = namen(), k = Object.keys(m).filter(function (s) {
        return woorden.every(function (w) { return (' ' + s).indexOf(' ' + w) >= 0 || s.indexOf(w) >= 0; });
      });
      var exact = k.filter(function (s) { return s === woorden.join(' '); });
      if (exact.length === 1 && (direct || k.length === 1)) return kies(exact[0], m[exact[0]].naam);
      if (k.length === 1) return kies(k[0], m[k[0]].naam);
      if (!k.length) { res.innerHTML = '<p class="leeg muted">Geen speler gevonden met “' + esc(q) + '”. Probeer enkel de familienaam.</p>'; return; }
      k.sort(function (a, b) { return m[b].n - m[a].n || a.localeCompare(b); });
      res.innerHTML = '<p class="muted">' + k.length + ' spelers gevonden — kies de juiste:</p><div class="keuzes">' +
        k.slice(0, 30).map(function (s) { return '<button type="button" data-k="' + esc(s) + '">' + esc(m[s].naam) + '</button>'; }).join('') + '</div>';
      Array.prototype.forEach.call(res.querySelectorAll('[data-k]'), function (b) {
        b.onclick = function () { kies(b.getAttribute('data-k'), b.textContent); };
      });
    });
  }
  function kies(sleutel, naam) {
    if (decodeURIComponent(location.hash.slice(1)) !== naam) history.replaceState(null, '', '#' + encodeURIComponent(naam));
    inp.value = naam;
    toonSpeler(sleutel, naam);
  }

  var timer;
  inp.addEventListener('input', function () {
    clearTimeout(timer);
    var q = inp.value;
    if (plat(q).length < 3) { res.innerHTML = ''; return; }
    timer = setTimeout(function () { zoek(q, false); }, 300);
  });
  document.getElementById('zoekform').addEventListener('submit', function (e) { e.preventDefault(); clearTimeout(timer); zoek(inp.value, true); });
  var start = decodeURIComponent(location.hash.slice(1));
  if (start) { inp.value = start; zoek(start, true); } else { laadBasis(); inp.focus(); }
})();
