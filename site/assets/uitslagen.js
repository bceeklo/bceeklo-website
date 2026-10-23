/* Uitslagen Bridgeclub Eeklo — stand → paar → spel.
   Data: data/zittingen.js (lijst) + data/<id>.js (één zitting, via registreerZitting). */
(function () {
  var cache = {};
  var app = document.getElementById('app');
  var MAAND = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
  var DAG = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'];
  var KW = { '-': 'niemand', 'NZ': 'NZ', 'OW': 'OW', 'Allen': 'allen' };
  var WIND = { N: 'Noord', O: 'Oost', Z: 'Zuid', W: 'West' };

  window.registreerZitting = function (z) {
    var idx = {};
    z.paren.forEach(function (p) { idx[p.id] = p; });
    z.paarIdx = idx;
    cache[z.id] = z;
    toon();
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function nl(n, d) { return Number(n).toFixed(d).replace('.', ','); }
  function datumLang(iso) {
    var d = new Date(iso + 'T12:00:00');
    return DAG[d.getDay()] + ' ' + d.getDate() + ' ' + MAAND[d.getMonth()] + ' ' + d.getFullYear();
  }
  function datumKort(iso) {
    var d = new Date(iso + 'T12:00:00');
    return DAG[d.getDay()].slice(0, 2) + ' ' + d.getDate() + ' ' + MAAND[d.getMonth()] + ' ' + d.getFullYear();
  }
  function kleur(txt) {
    return esc(txt).replace(/[♠♥♦♣]/g, function (s) {
      var k = { '♠': 'sp', '♥': 'h', '♦': 'd', '♣': 'c' }[s];
      return '<i class="s ' + k + '">' + s + '︎</i>';
    });
  }
  function contractHtml(t) {
    if (!t.contract) return '<span class="contract">–</span>';
    var c = t.contract.replace(' xx', '<sup>xx</sup>').replace(' x', '<sup>x</sup>');
    return '<span class="contract">' + kleur(c).replace(/&lt;sup&gt;(x+)&lt;\/sup&gt;/, '<sup>$1</sup>') + '</span>';
  }
  function resTxt(r) { return r === 'C' ? '=' : (r || ''); }
  function signed(n) { return n > 0 ? '+' + n : String(n); }
  function pctClass(p) { return p >= 60 ? 'hoog' : (p < 40 ? 'laag' : ''); }

  function route() {
    var h = decodeURIComponent(location.hash.replace(/^#\/?/, '')).split('/');
    return { z: h[0] || null, soort: h[1] || null, id: h[2] || null, van: h[3] || null };
  }
  function laad(id) {
    if (cache[id] || document.getElementById('zit-' + id)) return;
    var s = document.createElement('script');
    s.src = (window.UITSLAG_MAP || 'data/') + id + '.js';
    s.id = 'zit-' + id;
    s.onerror = function () { app.innerHTML = '<p class="leeg">Deze zitting werd niet gevonden.</p>'; };
    document.body.appendChild(s);
  }

  function toon() {
    var lijst = window.ZITTINGEN || [];
    if (!lijst.length) { app.innerHTML = '<p class="leeg muted">' + (window.UITSLAG_LEEG || 'Nog geen uitslagen gepubliceerd.') + '</p>'; return; }
    var r = route();
    var zid = r.z || lijst[0].id;
    var z = cache[zid];
    if (!z) { laad(zid); return; }
    if (r.soort === 'speler') {  /* vanuit de ranking: zoek het paar van deze speler */
      var pid = zoekPaar(z, r.id, r.van);
      location.replace('#/' + zid + (pid ? '/paar/' + pid : ''));
      return;
    }
    var html;
    var detail = z.spellen && z.spellen.length;
    if (detail && r.soort === 'paar' && z.paarIdx[r.id]) html = paarView(z, r.id);
    else if (detail && r.soort === 'spel') html = spelView(z, parseInt(r.id, 10), r.van);
    else html = standView(z, lijst);
    app.innerHTML = html;
    var sel = document.getElementById('kies');
    if (sel) sel.onchange = function () { location.hash = '#/' + sel.value; };
    var h1 = app.querySelector('h1');
    document.title = (h1 ? h1.textContent + ' · ' : '') + 'Uitslagen · Bridgeclub Eeklo';
  }

  function plat(t) { return String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim(); }
  /* "Hugo De la Ruelle" in "De Backer, Wolfgang & De la Ruelle, Hugo"; anders op percentage */
  function zoekPaar(z, naam, pct) {
    var doel = plat(naam), p, i;
    for (i = 0; i < z.paren.length; i++) {
      p = z.paren[i];
      var hit = String(p.naam).split('&').some(function (helft) {
        var d = helft.split(',');
        return plat(d.length > 1 ? d[1] + ' ' + d[0] : helft) === doel;
      });
      if (hit) return p.id;
    }
    var v = parseFloat(pct);
    if (!isNaN(v)) {
      var zelfde = z.paren.filter(function (q) { return Math.abs(q.pct - v) < 0.005; });
      if (zelfde.length === 1) return zelfde[0].id;
    }
    return null;
  }

  /* "Laureyns, Rita & Arnou, Hugo" -> "Rita Laureyns & Hugo Arnou" */
  function volNaam(p) {
    if (!p) return '';
    if (!p.naam) return p.kort || '';
    return String(p.naam).split('&').map(function (helft) {
      var d = helft.split(',');
      var achter = d[0].trim(), voor = d.slice(1).join(' ').trim();
      return (voor ? voor + ' ' + achter : achter).replace(/\s+/g, ' ');
    }).filter(Boolean).join(' & ');
  }

  /* dag en zittingnummer uniform, wat Bridge-It ook als naam gaf ("Din Z 8", "WOE Z 4", "Di Z2") */
  function dagVan(z) {
    var m = /-(di|wo)$/.exec(z.id || '');
    return m ? m[1] : (String(z.zitting || '').toLowerCase().indexOf('di') === 0 ? 'di' : 'wo');
  }
  function nrVan(z) { var m = /(\d+)\s*$/.exec(z.zitting || ''); return m ? parseInt(m[1], 10) : null; }
  function zitNaam(z) { var n = nrVan(z); return n ? 'Zitting ' + n : (z.zitting || ''); }
  function naamZ(z) { return z.titel || zitNaam(z); }
  function kopZitting(z) {
    if (z.titel) return z.titel + ' · ' + datumLang(z.datum);
    return (dagVan(z) === 'di' ? 'Dinsdagavond' : 'Woensdagnamiddag') + ' · ' + datumLang(z.datum);
  }

  /* ---------- stand */
  function standView(z, lijst) {
    var dagtabs = '';
    if (!window.UITSLAG_MAP) {  /* clubdrives: eerst dinsdag of woensdag kiezen */
      var dag = dagVan(z);
      dagtabs = '<nav class="dagkeuze" aria-label="Dag">' + [['di', 'Dinsdag'], ['wo', 'Woensdag']].map(function (d) {
        var eerste = lijst.filter(function (s) { return dagVan(s) === d[0]; })[0];
        if (!eerste) return '';
        return '<a href="#/' + esc(eerste.id) + '"' + (d[0] === dag ? ' aria-current="page"' : '') + '>' + d[1] + '</a>';
      }).join('') + '</nav>';
      lijst = lijst.filter(function (s) { return dagVan(s) === dag; });
    }
    var opties = lijst.map(function (s) {
      return '<option value="' + esc(s.id) + '"' + (s.id === z.id ? ' selected' : '') + '>' +
        (s.titel ? esc(s.titel) + ' · ' + esc(s.datum.slice(0, 4)) : esc(zitNaam(s)) + ' · ' + esc(datumKort(s.datum))) + '</option>';
    }).join('');
    var detail = !!(z.spellen && z.spellen.length);  /* zonder spellen: enkel eindstand (historiek) */
    var rijen = z.paren.map(function (p) {
      var tag = detail ? 'a' : 'div';
      var sub = (p.paar === null ? '' : 'Paar ' + esc(p.paar || p.id) + ' · ') + p.spellen + ' spellen';
      return '<' + tag + ' class="stand-rij"' + (detail ? ' href="#/' + z.id + '/paar/' + p.id + '"' : ' role="listitem"') + '>' +
        '<span class="rang' + (p.rang === 1 ? ' p1' : '') + '">' + p.rang + '</span>' +
        '<span class="paarnaam">' + esc(volNaam(p)) + '<small>' + sub + '</small></span>' +
        '<span class="balk"><span class="b"><i style="width:' + Math.min(100, p.pct) + '%"></i></span><strong>' + nl(p.pct, 2) + '%</strong></span>' +
        '<span class="mp r">' + nl(p.mp, 1) + ' MP</span></' + tag + '>';
    }).join('');
    var spellen = (z.spellen || []).map(function (s) {
      return '<a class="pil" href="#/' + z.id + '/spel/' + s.nr + '">' + s.nr + '</a>';
    }).join(' ');
    var pos = lijst.map(function (s) { return s.id; }).indexOf(z.id);
    var nieuwer = pos > 0 ? lijst[pos - 1] : null;      // lijst staat nieuwste eerst
    var ouder = pos >= 0 && pos < lijst.length - 1 ? lijst[pos + 1] : null;
    var balk = (lijst.length > 1 || window.UITSLAG_MAP || dagtabs)
      ? '<div class="zittingbalk">' +
        (ouder ? '<a class="pil" href="#/' + esc(ouder.id) + '" aria-label="Vorige zitting">‹</a>' : '<span class="pil uit" aria-hidden="true">‹</span>') +
        '<label class="kiezer"><span class="sr">Kies een zitting</span><select id="kies">' + opties + '</select></label>' +
        (nieuwer ? '<a class="pil" href="#/' + esc(nieuwer.id) + '" aria-label="Volgende zitting">›</a>' : '<span class="pil uit" aria-hidden="true">›</span>') +
        '</div>'
      : '';
    var nSpellen = detail ? z.spellen.length : Math.max.apply(null, z.paren.map(function (p) { return p.spellen || 0; }));
    var info = [z.paren.length + ' paren', nSpellen + ' spellen'];
    if (z.telling) info.push(z.telling);
    return dagtabs + balk +
      '<div class="titelrij"><div><p class="label" style="color:var(--blauw)">Uitslag' + (z.titel ? '' : ' · ' + esc(zitNaam(z).toLowerCase())) + '</p>' +
      '<h1>' + esc(kopZitting(z)) + '</h1><p class="muted">' + esc(info.join(' · ')) +
      (detail ? '. Tik op een paar voor de persoonlijke uitslag.' : '. Enkel de eindstand is beschikbaar.') + '</p></div></div>' +
      (detail ? '<section class="spellenblok" aria-labelledby="spellen-kop">' +
      '<h2 id="spellen-kop">Spellen <span class="muted">· verdeling en alle resultaten</span></h2>' +
      '<div class="spellenrij">' + spellen + '</div></section>' : '') +
      '<div class="stand" role="list"><div class="stand-kop"><span>#</span><span>Paar</span><span class="r">Score</span><span class="r">MP</span></div>' + rijen + '</div>';
  }

  /* ---------- per paar */
  function paarSpellen(z, pid) {
    var uit = [];
    z.spellen.forEach(function (s) {
      s.tafels.forEach(function (t) {
        var ns = t.nsId === pid, ow = t.owId === pid;
        if (!ns && !ow) return;
        uit.push({
          spel: s, t: t, kant: ns ? 'NZ' : 'OW', tegen: ns ? t.owId : t.nsId,
          score: ns ? t.score : -t.score, mp: ns ? t.mpNS : t.mpOW,
          pct: (ns ? t.mpNS : t.mpOW) / s.top * 100
        });
      });
    });
    return uit;
  }
  function paarView(z, pid) {
    var p = z.paarIdx[pid];
    var rij = paarSpellen(z, pid);
    var rondes = [];
    rij.forEach(function (x) {
      var laatst = rondes[rondes.length - 1];
      if (laatst && laatst.tegen === x.tegen && laatst.kant === x.kant) laatst.items.push(x);
      else rondes.push({ tegen: x.tegen, kant: x.kant, items: [x] });
    });
    var top = rij.filter(function (x) { return x.pct >= 99.9; }).length;
    var blokken = rondes.map(function (r, i) {
      var t = z.paarIdx[r.tegen];
      var gem = r.items.reduce(function (a, x) { return a + x.pct; }, 0) / r.items.length;
      var mijnKant = r.kant === 'NZ' ? ['N', 'Z'] : ['O', 'W'];
      var regels = r.items.map(function (x) {
        var eigen = mijnKant.indexOf(x.t.leider) >= 0;
        return '<a class="spelrij" href="#/' + z.id + '/spel/' + x.spel.nr + '/' + pid + '" aria-label="Spel ' + x.spel.nr + ' bekijken">' +
          '<span class="nr">' + x.spel.nr + '</span>' + contractHtml(x.t) +
          '<span class="leider' + (eigen ? ' eigen' : '') + '" title="' + esc(WIND[x.t.leider] || '') + '">' + esc(x.t.leider || '') + '</span>' +
          '<span>' + kleur(x.t.uitkomst || '') + '</span>' +
          '<span>' + esc(resTxt(x.t.res)) + '</span>' +
          '<span class="r">' + signed(x.score) + '</span>' +
          '<span class="pct ' + pctClass(x.pct) + '">' + Math.round(x.pct) + '%</span>' +
          '<span class="pijl" aria-hidden="true">›</span></a>';
      }).join('');
      return '<section class="ronde"><div class="ronde-kop"><h2>Ronde ' + (i + 1) + ' · ' + r.kant + '</h2>' +
        '<span class="tegen">tegen ' + (t ? '<a href="#/' + z.id + '/paar/' + t.id + '">' + esc(volNaam(t)) + '</a>' : '?') + '</span>' +
        '<span class="muted">gemiddeld <strong class="pct ' + pctClass(gem) + '">' + nl(gem, 1) + '%</strong></span></div>' + regels + '</section>';
    }).join('');
    return '<p class="kruim"><a href="#/' + z.id + '">‹ Stand ' + esc(naamZ(z)) + '</a></p>' +
      '<div class="titelrij"><div><p class="label" style="color:var(--blauw)">Persoonlijke uitslag · paar ' + esc(p.id) + '</p>' +
      '<h1>' + esc(volNaam(p)) + '</h1></div></div>' +
      '<div class="samenvatting">' +
      '<div class="stat"><b>' + p.rang + '<small style="font-size:18px">/' + z.paren.length + '</small></b><span>rangschikking</span></div>' +
      '<div class="stat"><b>' + nl(p.pct, 2) + '%</b><span>score</span></div>' +
      '<div class="stat"><b>' + nl(p.mp, 1) + '</b><span>matchpunten</span></div>' +
      '<div class="stat"><b>' + top + '</b><span>tops</span></div></div>' +
      '<p class="muted" style="font-size:16px;margin:0 0 14px">Score en % vanuit jullie kant gezien. Tik op een spel voor de verdeling en alle resultaten.</p>' +
      blokken;
  }

  /* ---------- per spel */
  function handHtml(h) {
    return '<div class="hand">' + ['♠', '♥', '♦', '♣'].map(function (s) {
      var k = (h[s] || '-').match(/10|./g).join(' ');
      return '<div>' + kleur(s) + ' ' + esc(k) + '</div>';
    }).join('') + '</div>';
  }
  function spelView(z, nr, van) {
    var s = z.spellen.filter(function (x) { return x.nr === nr; })[0];
    if (!s) return '<p class="leeg">Spel niet gevonden.</p>';
    var paar = van && z.paarIdx[van];
    var kw = s.kw;
    function g(w) { return w === s.gever ? '<span class="g" title="gever">' + w + '</span>' : w; }
    var kompas = '<div class="kompas" aria-label="Gever ' + esc(WIND[s.gever]) + '">' +
      '<span></span><span>' + g('N') + '</span><span></span><span>' + g('W') + '</span><span></span><span>' + g('O') + '</span><span></span><span>' + g('Z') + '</span><span></span></div>';
    var diagram = '<div class="diagram" aria-label="Verdeling spel ' + nr + '">' +
      '<span></span>' + handHtml(s.hand.N) + '<span></span>' +
      handHtml(s.hand.W) + kompas + handHtml(s.hand.O) +
      '<span></span>' + handHtml(s.hand.Z) + '<span></span></div>';

    // vorige/volgende: binnen het paar als je van een paar komt, anders alle spellen
    var reeks = paar ? paarSpellen(z, van).map(function (x) { return x.spel.nr; }) : z.spellen.map(function (x) { return x.nr; });
    var i = reeks.indexOf(nr);
    var suffix = paar ? '/' + van : '';
    var vorige = i > 0 ? '<a class="pil" href="#/' + z.id + '/spel/' + reeks[i - 1] + suffix + '">‹ Spel ' + reeks[i - 1] + '</a>' : '';
    var volgende = i >= 0 && i < reeks.length - 1 ? '<a class="pil" href="#/' + z.id + '/spel/' + reeks[i + 1] + suffix + '">Spel ' + reeks[i + 1] + ' ›</a>' : '';

    function naam(id) {
      var p = z.paarIdx[id];
      return p ? '<a href="#/' + z.id + '/paar/' + id + '">' + esc(volNaam(p)) + '</a>' : '–';
    }
    var rijen = s.tafels.map(function (t) {
      var uit = van && (t.nsId === van || t.owId === van);
      return '<div class="freq-rij' + (uit ? ' uitgelicht' : '') + '">' +
        '<span class="c">' + (t.contract ? contractHtml(t) : esc(t.raw || '')) + '</span>' +
        '<span class="re">' + esc(resTxt(t.res)) + ' <span class="muted">' + esc(t.leider || '') + '</span></span>' +
        '<span class="le">' + kleur(t.uitkomst || '') + '</span>' +
        '<span class="naam nsn"><span class="lbl">NZ</span>' + naam(t.nsId) + '</span>' +
        '<span class="sc r">' + signed(t.score) + '</span>' +
        '<span class="mpn r"><span class="lbl">NZ</span>' + Math.round(t.mpNS / s.top * 100) + '%</span>' +
        '<span class="naam owe"><span class="lbl">OW</span>' + naam(t.owId) + '</span>' +
        '<span class="mpo r"><span class="lbl">OW</span>' + Math.round(t.mpOW / s.top * 100) + '%</span>' +
        '</div>';
    }).join('');

    var terug = paar
      ? '<a href="#/' + z.id + '/paar/' + van + '">‹ ' + esc(volNaam(paar)) + '</a> <span class="muted">·</span> <a href="#/' + z.id + '">Stand</a>'
      : '<a href="#/' + z.id + '">‹ Stand ' + esc(naamZ(z)) + '</a>';
    return '<p class="kruim">' + terug + '</p>' +
      '<div class="titelrij"><div><p class="label" style="color:var(--blauw)">' + esc(naamZ(z)) + ' · ' + esc(datumLang(z.datum)) + '</p>' +
      '<h1>Spel ' + nr + '</h1></div><div class="nav-spel">' + vorige + volgende + '</div></div>' +
      '<div class="spel-boven">' + diagram +
      '<div class="speldetails"><div class="stat"><b>' + esc(WIND[s.gever]) + '</b><span>gever</span></div>' +
      '<div class="stat"><b>' + esc(KW[kw] || kw) + '</b><span>kwetsbaar</span></div>' +
      '<div class="stat"><b>' + s.tafels.length + '</b><span>keer gespeeld</span></div></div></div>' +
      '<div class="freq"><div class="freq-kop"><span>Contract</span><span>Res.</span><span>Uitk.</span><span>Noord-Zuid</span><span class="r">Score</span><span class="r">NZ %</span><span>Oost-West</span><span class="r">OW %</span></div>' +
      rijen + '</div>' +
      (s.opmerkingen ? '<div class="opm"><strong>Bijzonderheden</strong>' + s.opmerkingen.map(function (o) { return '<div>' + kleur(o) + '</div>'; }).join('') + '</div>' : '');
  }

  window.addEventListener('hashchange', function () { toon(); window.scrollTo(0, 0); });
  toon();
})();
