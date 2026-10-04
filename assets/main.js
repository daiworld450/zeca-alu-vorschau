// ZeCa-Alu: geteiltes Script für alle Seiten. Kein Framework, keine Abhängigkeiten.
(function(){
  "use strict";

  // Mobile-Navigation: öffnen/schließen, Label und aria-expanded stets synchron, Escape schließt
  var burger = document.querySelector('.burger');
  var mobileNav = document.querySelector('.mobile-nav');
  if (burger && mobileNav) {
    var setNav = function(open, returnFocus){
      burger.classList.toggle('open', open);
      mobileNav.classList.toggle('open', open);
      document.body.classList.toggle('nav-open', open);
      burger.setAttribute('aria-expanded', open ? 'true' : 'false');
      burger.setAttribute('aria-label', open ? 'Menü schließen' : 'Menü öffnen');
      if (!open && returnFocus) burger.focus();
    };
    burger.addEventListener('click', function(){
      setNav(!burger.classList.contains('open'), false);
    });
    mobileNav.querySelectorAll('a').forEach(function(a){
      a.addEventListener('click', function(){ setNav(false, false); });
    });
    document.addEventListener('keydown', function(ev){
      if (ev.key === 'Escape' && burger.classList.contains('open')) setNav(false, true);
    });
    // Beim Aufziehen des Fensters über den Umbruch hinaus: Menü zurücksetzen
    window.matchMedia('(min-width:1101px)').addEventListener('change', function(m){
      if (m.matches) setNav(false, false);
    });
  }

  // Kopfleiste bekommt erst beim Scrollen eine Linie (Beobachter statt Scroll-Listener)
  var header = document.querySelector('header.site');
  var sentinel = document.querySelector('.sentinel');
  if (header && sentinel && 'IntersectionObserver' in window) {
    new IntersectionObserver(function(entries){
      header.classList.toggle('is-stuck', !entries[0].isIntersecting);
    }).observe(sentinel);
  }

  // Einmalige Eintrittsbewegungen: Zeichnung zeichnet sich, Positionsnummern setzen ein, Ortstafeln folgen
  var reveal = function(selector, cls, threshold){
    var nodes = document.querySelectorAll(selector);
    if (!nodes.length) return;
    if (!('IntersectionObserver' in window)) { nodes.forEach(function(n){ n.classList.add(cls); }); return; }
    var io = new IntersectionObserver(function(entries){
      entries.forEach(function(e){
        if (e.isIntersecting) { e.target.classList.add(cls); io.unobserve(e.target); }
      });
    }, { threshold: threshold });
    nodes.forEach(function(n){ io.observe(n); });
  };
  reveal('.drw[data-draw]', 'is-drawn', 0.25);
  reveal('.bauteile', 'is-in', 0.25);
  reveal('.towns', 'is-in', 0.2);

  // Bauteile am Foto: Legende und Positionsnummer sind verbunden
  document.querySelectorAll('.bauteile').forEach(function(root){
    var pins = root.querySelectorAll('.pin');
    var legs = root.querySelectorAll('.leg');
    var show = function(n){ pins.forEach(function(p){ p.classList.toggle('on', p.getAttribute('data-n') === n); }); };
    legs.forEach(function(btn){
      var n = btn.getAttribute('data-n');
      btn.addEventListener('click', function(){
        var already = btn.getAttribute('aria-pressed') === 'true';
        legs.forEach(function(b){ b.setAttribute('aria-pressed', 'false'); });
        if (already) { show(''); } else { btn.setAttribute('aria-pressed', 'true'); show(n); }
      });
      if (window.matchMedia('(hover:hover) and (pointer:fine)').matches) {
        btn.addEventListener('mouseenter', function(){ show(n); });
        btn.addEventListener('mouseleave', function(){
          var pressed = root.querySelector('.leg[aria-pressed="true"]');
          show(pressed ? pressed.getAttribute('data-n') : '');
        });
      }
    });
  });

  // RAL-Farbwahl: die Konstruktion nimmt die gewählte Pulverbeschichtung an
  var picker = document.querySelector('[data-ral]');
  if (picker) {
    var stage = picker.closest('[data-farbe]');
    var swatches = Array.prototype.slice.call(picker.querySelectorAll('[role="radio"]'));
    var out = stage.querySelector('[data-ral-out]');
    var choose = function(btn, focus){
      swatches.forEach(function(b){
        var on = b === btn;
        b.setAttribute('aria-checked', on ? 'true' : 'false');
        b.tabIndex = on ? 0 : -1;
      });
      stage.style.setProperty('--ral', btn.getAttribute('data-hex'));
      if (out) out.textContent = btn.getAttribute('data-name');
      if (focus) btn.focus();
    };
    swatches.forEach(function(btn, i){
      btn.addEventListener('click', function(){ choose(btn, false); });
      btn.addEventListener('keydown', function(ev){
        var next = null;
        if (ev.key === 'ArrowRight' || ev.key === 'ArrowDown') next = swatches[(i + 1) % swatches.length];
        else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowUp') next = swatches[(i - 1 + swatches.length) % swatches.length];
        else if (ev.key === 'Home') next = swatches[0];
        else if (ev.key === 'End') next = swatches[swatches.length - 1];
        if (next) { ev.preventDefault(); choose(next, true); }
      });
    });
  }

  // Karte erst auf Klick laden (keine Verbindung zu Google, bevor der Besucher zustimmt)
  document.querySelectorAll('.map-embed').forEach(function(box){
    var btn = box.querySelector('.map-load-btn');
    if (!btn) return;
    btn.addEventListener('click', function(){
      var iframe = document.createElement('iframe');
      iframe.src = box.getAttribute('data-map-src');
      iframe.title = 'ZeCa-Alu auf der Karte';
      iframe.loading = 'lazy';
      iframe.referrerPolicy = 'no-referrer-when-downgrade';
      box.innerHTML = '';
      box.appendChild(iframe);
    });
  });

  // Kontaktformular per FormSubmit (kein eigenes Backend nötig)
  var form = document.querySelector('#kontaktformular');
  if (form) {
    var status = form.querySelector('.form-status');
    var showStatus = function(kind, html){
      if (!status) return;
      status.className = 'form-status show ' + kind;
      status.innerHTML = html;
    };
    form.addEventListener('submit', function(ev){
      ev.preventDefault();
      var btn = form.querySelector('button[type="submit"]');
      var originalLabel = btn ? btn.textContent : '';
      if (btn) { btn.disabled = true; btn.textContent = 'Wird gesendet…'; }
      if (status) { status.className = 'form-status'; status.textContent = ''; }

      fetch(form.action, {
        method: 'POST',
        headers: { 'Accept': 'application/json' },
        body: new FormData(form)
      }).then(function(res){
        if (!res.ok) throw new Error('Senden fehlgeschlagen');
        form.reset();
        showStatus('ok', 'Danke! Ihre Nachricht ist angekommen. Wir melden uns zeitnah.');
        if (btn) { btn.textContent = 'Gesendet'; }
        setTimeout(function(){
          if (btn) { btn.disabled = false; btn.textContent = originalLabel; }
        }, 4000);
      }).catch(function(){
        showStatus('err', 'Das Senden hat leider nicht geklappt. Bitte rufen Sie uns direkt an: <a href="tel:+4917624860016">0176 24860016</a> oder schreiben Sie an <a href="mailto:info@zeca-alu.de">info@zeca-alu.de</a>.');
        if (btn) { btn.disabled = false; btn.textContent = originalLabel; }
      });
    });
  }
})();
