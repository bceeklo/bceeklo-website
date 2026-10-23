/* Hamburgermenu voor gsm/tablet. Zonder JavaScript blijft het gewone menu zichtbaar. */
(function () {
  var kop = document.querySelector('.kop .wrap'), menu = kop && kop.querySelector('.menu');
  if (!menu) return;
  document.documentElement.classList.add('js-menu');
  menu.id = menu.id || 'hoofdmenu';
  var knop = document.createElement('button');
  knop.type = 'button'; knop.className = 'menuknop';
  knop.setAttribute('aria-controls', menu.id); knop.setAttribute('aria-expanded', 'false');
  knop.innerHTML = '<span class="streep" aria-hidden="true"></span><span>Menu</span>';
  kop.insertBefore(knop, menu);
  function zet(open) {
    menu.classList.toggle('open', open);
    knop.setAttribute('aria-expanded', open ? 'true' : 'false');
    knop.lastChild.textContent = open ? 'Sluiten' : 'Menu';
  }
  knop.addEventListener('click', function () { zet(!menu.classList.contains('open')); });
  menu.addEventListener('click', function (e) { if (e.target.closest('a')) zet(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && menu.classList.contains('open')) { zet(false); knop.focus(); } });
  document.addEventListener('click', function (e) { if (menu.classList.contains('open') && !kop.contains(e.target)) zet(false); });
  window.addEventListener('resize', function () { if (window.innerWidth > 960) zet(false); });
})();
