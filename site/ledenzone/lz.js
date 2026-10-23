/* Ledenzone — "Ingelogd als …" + afmelden */
(function () {
  var el = document.getElementById('lz-wie');
  if (!el) return;
  fetch('/.netlify/functions/ledenzone?actie=wie').then(function (r) { return r.json(); }).then(function (w) {
    if (w.email) el.querySelector('span').textContent = 'Ingelogd als ' + w.email;
  }).catch(function () {});
  el.querySelector('button').onclick = function () {
    fetch('/.netlify/functions/ledenzone', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ actie: 'afmelden' }) })
      .then(function () { location.href = '/'; });
  };
})();
