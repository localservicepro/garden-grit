/* Garden Grit — animated service-area map.
   A ride-on mower follows the SVG route path from Norwood out through the north-east,
   back via Burnside and Bowden, lighting up each suburb as it passes. Pure SVG + rAF,
   loops forever, pauses when off-screen, and respects prefers-reduced-motion
   (reduced motion = static map with every suburb lit). */
(function () {
  'use strict';
  var maps = document.querySelectorAll('.areamap');
  if (!maps.length) return;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  maps.forEach(function (box) {
    var svg = box.querySelector('svg');
    var route = svg.querySelector('.route');
    var trail = svg.querySelector('.route--trail');
    var mower = svg.querySelector('.mower');
    var subs = Array.prototype.slice.call(svg.querySelectorAll('.sub[data-at]'));
    if (!route || !mower) return;
    var total = route.getTotalLength();
    var SPEED = 55; // svg units per second
    var duration = total / SPEED * 1000;
    var stops = subs.map(function (el) { return { el: el, at: parseFloat(el.getAttribute('data-at')) * total, lit: false }; });

    var lightAll = function () { subs.forEach(function (s) { s.classList.add('lit'); }); };
    if (reduce) {
      lightAll();
      var p0 = route.getPointAtLength(0);
      mower.setAttribute('transform', 'translate(' + p0.x + ' ' + p0.y + ')');
      if (trail) trail.style.strokeDasharray = 'none';
      return;
    }
    if (trail) { trail.style.strokeDasharray = total; trail.style.strokeDashoffset = total; }

    var start = null, raf = null, running = false, lastAngle = 0;
    var frame = function (ts) {
      if (!start) start = ts;
      var elapsed = (ts - start) % (duration + 1400); // pause 1.4s at home between loops
      var d = Math.min(elapsed, duration) / duration * total;
      var p = route.getPointAtLength(d);
      var p2 = route.getPointAtLength(Math.min(d + 4, total));
      var ang = Math.atan2(p2.y - p.y, p2.x - p.x) * 180 / Math.PI;
      if (Math.abs(p2.x - p.x) + Math.abs(p2.y - p.y) < 0.05) ang = lastAngle; else lastAngle = ang;
      var flip = (ang > 90 || ang < -90) ? ' scale(1 -1)' : '';
      var rot = (ang > 90 || ang < -90) ? ang + 180 : ang;
      mower.setAttribute('transform', 'translate(' + p.x.toFixed(1) + ' ' + p.y.toFixed(1) + ') rotate(' + rot.toFixed(1) + ')' + flip);
      if (trail) trail.style.strokeDashoffset = total - d;
      if (elapsed >= duration + 1300) { // reset for the next loop
        stops.forEach(function (s) { s.lit = false; s.el.classList.remove('lit', 'pulse'); });
      }
      stops.forEach(function (s) {
        if (!s.lit && d >= s.at - 2) { s.lit = true; s.el.classList.add('lit', 'pulse'); setTimeout(function () { s.el.classList.remove('pulse'); }, 900); }
      });
      if (running) raf = requestAnimationFrame(frame);
    };
    var play = function () { if (running) return; running = true; start = null; raf = requestAnimationFrame(frame); };
    var stop = function () { running = false; if (raf) cancelAnimationFrame(raf); };
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (en) { en[0].isIntersecting ? play() : stop(); }, { threshold: 0.15 }).observe(box);
    } else { play(); }
    document.addEventListener('visibilitychange', function () { document.hidden ? stop() : play(); });
  });
})();
