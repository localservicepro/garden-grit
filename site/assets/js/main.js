/* Garden Grit — shared behaviour (vanilla JS, no dependencies) */
(function () {
  'use strict';
  document.documentElement.classList.remove('no-js');
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var hoverCapable = window.matchMedia && window.matchMedia('(hover: hover)').matches;

  /* Sticky header shadow */
  var header = document.querySelector('.header');
  if (header) {
    var onScroll = function () { header.classList.toggle('is-scrolled', window.scrollY > 24); };
    window.addEventListener('scroll', onScroll, { passive: true }); onScroll();
  }

  /* Services mega-dropdown: hover on pointer devices, click/tap everywhere */
  document.querySelectorAll('.nav li.has-dd').forEach(function (li) {
    var trigger = li.querySelector('button');
    var open = function () { li.classList.add('open'); trigger.setAttribute('aria-expanded', 'true'); };
    var close = function () { li.classList.remove('open'); trigger.setAttribute('aria-expanded', 'false'); };
    if (hoverCapable) { li.addEventListener('mouseenter', open); li.addEventListener('mouseleave', close); }
    trigger.addEventListener('click', function (e) { e.preventDefault(); li.classList.contains('open') ? close() : open(); });
    document.addEventListener('click', function (e) { if (!li.contains(e.target)) close(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { close(); } });
    li.addEventListener('focusout', function (e) { if (!li.contains(e.relatedTarget)) close(); });
  });

  /* Mobile nav + accordion */
  var burger = document.querySelector('.burger');
  var mnav = document.getElementById('mobile-nav');
  if (burger && mnav) {
    burger.addEventListener('click', function () {
      var open = burger.getAttribute('aria-expanded') === 'true';
      burger.setAttribute('aria-expanded', String(!open));
      mnav.setAttribute('data-open', String(!open));
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && burger.getAttribute('aria-expanded') === 'true') { burger.click(); burger.focus(); }
    });
    mnav.querySelectorAll('.acc').forEach(function (b) {
      b.addEventListener('click', function () { b.setAttribute('aria-expanded', String(b.getAttribute('aria-expanded') !== 'true')); });
    });
  }

  /* Reveal on scroll */
  var reveals = document.querySelectorAll('.reveal');
  if (reveals.length) {
    if (reduce || !('IntersectionObserver' in window)) {
      reveals.forEach(function (el) { el.classList.add('in'); });
    } else {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
      }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
      reveals.forEach(function (el, i) { el.style.setProperty('--d', ((i % 4) * 0.08) + 's'); io.observe(el); });
      setTimeout(function () { reveals.forEach(function (el) { el.classList.add('in'); }); }, 2500);
    }
  }
  var hm = document.querySelector('.hero__media');
  if (hm) { setTimeout(function () { hm.classList.add('in'); }, 300); }

  /* Lazy map embed: only load the Google Maps iframe when it scrolls near */
  document.querySelectorAll('.map-embed[data-src]').forEach(function (box) {
    var load = function () {
      if (box.querySelector('iframe')) return;
      var f = document.createElement('iframe');
      f.src = box.getAttribute('data-src'); f.loading = 'lazy'; f.allowFullscreen = true;
      f.referrerPolicy = 'strict-origin-when-cross-origin'; f.title = box.getAttribute('data-title') || 'Map';
      box.appendChild(f);
    };
    if ('IntersectionObserver' in window) {
      var mo = new IntersectionObserver(function (en) { if (en[0].isIntersecting) { load(); mo.disconnect(); } }, { rootMargin: '400px' });
      mo.observe(box);
    } else { load(); }
  });

  /* Quote form: prefill service from ?service=, basic validation, then hand off.
     The CRM tracking script captures the submission; the form posts to Netlify Forms
     as a backup copy and the browser lands on /thank-you/. */
  var form = document.querySelector('form[name="quote"]');
  if (form) {
    try {
      var q = new URLSearchParams(location.search);
      var s = q.get('service');
      if (s) { var sel = form.querySelector('[name="service_needed"]'); if (sel) { Array.prototype.forEach.call(sel.options, function (o) { if (o.value.toLowerCase() === s.toLowerCase()) sel.value = o.value; }); } }
    } catch (e) {}
    form.addEventListener('submit', function (e) {
      if (!form.checkValidity()) { e.preventDefault(); form.reportValidity(); return; }
      var btn = form.querySelector('button[type="submit"]');
      if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
    });
  }

  /* Mark current nav item */
  var path = location.pathname.replace(/index\.html$/, '');
  document.querySelectorAll('.nav a, .mobile-nav a').forEach(function (a) {
    var href = a.getAttribute('href');
    if (href && href !== '/' && path.indexOf(href) === 0) a.setAttribute('aria-current', 'page');
  });
  if (path === '/') { var home = document.querySelector('.nav a[href="/"]'); if (home) home.setAttribute('aria-current', 'page'); }
})();
