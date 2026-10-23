#!/usr/bin/env node
/* Garden Grit — static site generator.
   Reads /data/*.json, writes /site/**. No dependencies. Run: npm run build */
'use strict';
const fs = require('fs');
const path = require('path');
const I = require('./icons');
const root = path.join(__dirname, '..');
const SITE = path.join(root, 'site');
const D = (f) => JSON.parse(fs.readFileSync(path.join(root, 'data', f), 'utf8'));
const biz = D('business.json');
const services = D('services.json');
const suburbs = D('suburbs.json');
const reviews = D('reviews.json');
const posts = D('posts.json').sort((a, b) => b.date.localeCompare(a.date));
const redirects = D('redirects-source.json').map;
const dims = fs.existsSync(path.join(root, 'data/_image-dims.json')) ? D('_image-dims.json') : {};
const generated = ['gen-irrigation']; // images produced with Higgsfield, not client photos
const BASE = biz.website.replace(/\/$/, '');
const TODAY = new Date().toISOString().slice(0, 10);
const warnings = [];

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const words = (html) => String(html || '').replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
const svcBySlug = Object.fromEntries(services.map(s => [s.slug, s]));
const svcPath = (s) => `/services/${s.slug}/`;
const postPath = (p) => `/blog/${p.slug}/`;
const suburbNames = suburbs.map(s => s.name);

/* ---------------- images ---------------- */
function img(base, alt, opts = {}) {
  const d = dims[base];
  if (!d) { warnings.push(`missing image: ${base}`); return `<div class="img-missing" aria-hidden="true"></div>`; }
  const sizes = Object.keys(d).map(Number).sort((a, b) => a - b);
  const largest = sizes[sizes.length - 1];
  const pick = sizes.includes(800) ? 800 : largest;
  const srcset = sizes.map(w => `/assets/img/${base}-${w}.webp ${w}w`).join(', ');
  const [w, h] = d[pick];
  const load = opts.eager ? 'fetchpriority="high" decoding="async"' : 'loading="lazy" decoding="async"';
  return `<img src="/assets/img/${base}-${pick}.webp" srcset="${srcset}" sizes="${opts.sizes || '(min-width: 960px) 33vw, (min-width: 640px) 50vw, 100vw'}" alt="${esc(alt)}" width="${w}" height="${h}" ${load}${opts.class ? ` class="${opts.class}"` : ''}>`;
}
const rule = (cls = '') => `<span class="ink-rule ${cls}" aria-hidden="true">${I.rule}</span>`;

/* ---------------- schema ---------------- */
const businessSchema = () => ({
  '@context': 'https://schema.org', '@type': ['LocalBusiness', 'Landscaper'], '@id': `${BASE}/#business`,
  name: biz.name, url: `${BASE}/`, telephone: biz.phoneTel, email: biz.email,
  image: `${BASE}${biz.ogImage}`, logo: `${BASE}${biz.logo}`,
  description: 'Garden Grit is an owner-operated landscaping and garden services business based in Norwood, South Australia, run by Emma Pelle, a qualified horticulturist (Certificate III in Horticulture) currently studying garden design. Services include landscape design and softscaping, garden maintenance and clean ups, hedge trimming, tree pruning, turf installation and irrigation across Adelaide\'s eastern and north-eastern suburbs.',
  address: { '@type': 'PostalAddress', addressLocality: biz.address.suburb, addressRegion: biz.address.state, postalCode: biz.address.postcode, addressCountry: biz.address.country },
  areaServed: suburbNames.map(n => ({ '@type': 'City', name: n, containedInPlace: { '@type': 'AdministrativeArea', name: 'South Australia' } })),
  serviceArea: { '@type': 'GeoCircle', geoMidpoint: { '@type': 'GeoCoordinates', latitude: -34.92, longitude: 138.63 }, geoRadius: biz.serviceRadiusKm * 1000 },
  founder: { '@type': 'Person', name: biz.owner, jobTitle: 'Owner / Senior Horticulturalist', hasCredential: { '@type': 'EducationalOccupationalCredential', credentialCategory: 'Certificate III in Horticulture' } },
  foundingDate: String(biz.tradingSince), priceRange: '$$',
  knowsAbout: ['Horticulture', 'Landscape design', 'Garden maintenance', 'Hedge trimming', 'Tree pruning', 'Turf installation', 'Irrigation'],
  hasOfferCatalog: { '@type': 'OfferCatalog', name: 'Garden services', itemListElement: services.map(s => ({ '@type': 'Offer', itemOffered: { '@type': 'Service', name: s.name, url: `${BASE}${svcPath(s)}` } })) },
  sameAs: [biz.gbpUrl, biz.social.facebook, biz.social.instagram]
});
const serviceSchema = (s) => ({
  '@context': 'https://schema.org', '@type': 'Service', '@id': `${BASE}${svcPath(s)}#service`,
  name: s.name, serviceType: s.name, url: `${BASE}${svcPath(s)}`, description: s.metaDescription,
  provider: { '@id': `${BASE}/#business` }, areaServed: suburbNames.map(n => ({ '@type': 'City', name: n })),
  image: `${BASE}/assets/img/${s.image}-800.webp`
});
const faqSchema = (faqs) => ({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faqs.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) });
const breadcrumbSchema = (items) => ({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it[0], item: `${BASE}${it[1]}` })) });
const postSchema = (p) => ({
  '@context': 'https://schema.org', '@type': 'BlogPosting', headline: p.title, description: p.excerpt, datePublished: p.date, dateModified: p.date,
  author: { '@type': 'Person', name: biz.owner, jobTitle: 'Horticulturalist' }, publisher: { '@id': `${BASE}/#business` },
  image: `${BASE}/assets/img/${p.image}-800.webp`, mainEntityOfPage: `${BASE}${postPath(p)}`, url: `${BASE}${postPath(p)}`
});

/* ---------------- layout ---------------- */
function head({ title, desc, url, noindex, schema = [], ogImage, preload = '' }) {
  if (title.length > 60) warnings.push(`title >60 (${title.length}): ${title}`);
  if (desc.length > 155) warnings.push(`description >155 (${desc.length}): ${url}`);
  const og = `${BASE}${ogImage || biz.ogImage}`;
  return `<!DOCTYPE html>
<html lang="en-AU" class="no-js">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="robots" content="${noindex ? 'noindex, nofollow' : 'index, follow, max-image-preview:large'}">
<link rel="canonical" href="${BASE}${url}">
<meta property="og:locale" content="en_AU">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(biz.name)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${BASE}${url}">
<meta property="og:image" content="${og}">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#141414">
<link rel="icon" href="/assets/img/logo/favicon.png" type="image/png">
<link rel="apple-touch-icon" href="/assets/img/logo/apple-touch-icon.png">
<link rel="preload" href="/assets/fonts/permanent-marker.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/assets/fonts/inter.woff2" as="font" type="font/woff2" crossorigin>
${preload}
<link rel="stylesheet" href="/assets/css/tokens.css">
<link rel="stylesheet" href="/assets/css/main.css">
<script>document.documentElement.classList.remove('no-js')</script>
<script src="${biz.trackingScript}" data-tracking-id="${biz.trackingId}" async></script>
${[businessSchema(), ...schema].map(s => `<script type="application/ld+json">${JSON.stringify(s)}</script>`).join('\n')}
</head>`;
}

function header() {
  const dd = [`<a class="dd__item" role="menuitem" href="/services/"><span class="dd__icon">${I.grid}</span><span><strong>All Services</strong><em>Everything a qualified horticulturist can do for your garden</em></span></a>`]
    .concat(services.map(s => `<a class="dd__item" role="menuitem" href="${svcPath(s)}"><span class="dd__icon">${I[s.icon]}</span><span><strong>${esc(s.name)}</strong><em>${esc(s.descriptor)}</em></span></a>`)).join('');
  const mob = services.map(s => `<li><a href="${svcPath(s)}">${esc(s.name)} <span>${esc(s.descriptor)}</span></a></li>`).join('');
  return `<a class="skip" href="#main">Skip to content</a>
<header class="header">
  <div class="wrap header__in">
    <a class="logo" href="/" aria-label="${esc(biz.name)} home"><img src="${biz.logo}" alt="${esc(biz.name)}" width="449" height="331"></a>
    <nav class="nav" aria-label="Main">
      <ul>
        <li><a href="/">Home</a></li>
        <li class="has-dd"><button type="button" aria-expanded="false" aria-controls="services-menu">Services ${I.caret}</button>
          <div class="dd" id="services-menu" role="menu">${dd}</div></li>
        <li><a href="/about/">About</a></li>
        <li><a href="/areas/">Areas</a></li>
        <li><a href="/blog/">Advice</a></li>
        <li><a href="/contact/">Contact</a></li>
      </ul>
    </nav>
    <div class="header__right">
      <a class="header__phone" href="tel:${biz.phoneTel}">${I.phone}<span>${biz.phoneDisplay}</span></a>
      <a class="btn btn--primary btn--sm header__cta" href="/contact/">Get a Free Quote</a>
      <a class="header__call" href="tel:${biz.phoneTel}" aria-label="Call ${biz.phoneDisplay}">${I.phone}</a>
      <button class="burger" aria-expanded="false" aria-controls="mobile-nav" aria-label="Menu"><span></span><span></span><span></span></button>
    </div>
  </div>
  <nav class="mobile-nav" id="mobile-nav" data-open="false" aria-label="Mobile">
    <ul>
      <li><a href="/">Home</a></li>
      <li><button class="acc" type="button" aria-expanded="false">Services ${I.caret}</button>
        <ul class="acc-panel"><li><a href="/services/">All Services</a></li>${mob}</ul></li>
      <li><a href="/about/">About</a></li>
      <li><a href="/areas/">Service Areas</a></li>
      <li><a href="/blog/">Advice</a></li>
      <li><a href="/contact/">Contact</a></li>
    </ul>
    <div class="mobile-nav__cta"><a class="btn btn--primary btn--block" href="/contact/">Get a Free Quote</a><a class="btn btn--ghost btn--block" href="tel:${biz.phoneTel}">Call ${biz.phoneDisplay}</a></div>
  </nav>
</header>`;
}

function footer() {
  return `<footer class="footer">
  <div class="wrap footer__in">
    <div class="footer__brand">
      <div class="footer__tile"><img src="/assets/img/logo/garden-grit-logo.png" alt="${esc(biz.name)}" width="449" height="331" loading="lazy"></div>
      <strong>${esc(biz.name)}</strong>
      <p>${esc(biz.address.formatted)}<br>Travelling up to ${biz.serviceRadiusKm} km across Adelaide's eastern &amp; north-eastern suburbs</p>
      <p><a href="tel:${biz.phoneTel}">${biz.phoneDisplay}</a><br><a href="mailto:${biz.email}">${biz.email}</a></p>
      <p class="small">ABN ${biz.abn}</p>
      <div class="footer__social">
        <a href="${biz.social.facebook}" rel="noopener" target="_blank" aria-label="Garden Grit on Facebook">${I.fb}</a>
        <a href="${biz.social.instagram}" rel="noopener" target="_blank" aria-label="Garden Grit on Instagram">${I.ig}</a>
        <a href="${biz.gbpUrl}" rel="noopener" target="_blank" aria-label="Garden Grit on Google">${I.google}</a>
      </div>
    </div>
    <div><h3>Services</h3><ul>${services.map(s => `<li><a href="${svcPath(s)}">${esc(s.name)}</a></li>`).join('')}<li><a href="/services/">All services</a></li></ul></div>
    <div><h3>Service areas</h3><ul>${suburbs.slice(0, 12).map(s => `<li><a href="/areas/">${esc(s.name)}</a></li>`).join('')}<li><a href="/areas/">All suburbs</a></li></ul></div>
    <div><h3>Garden Grit</h3><ul><li><a href="/about/">About Emma</a></li><li><a href="/blog/">Gardening advice</a></li><li><a href="/contact/">Contact &amp; quotes</a></li><li><a href="/contact/#map">Find us on Google</a></li></ul></div>
  </div>
  <div class="wrap footer__bottom"><span>&copy; ${new Date().getFullYear()} ${esc(biz.name)}. Qualified horticulturist, Norwood SA.</span><span>Owner-operated by ${esc(biz.owner)}</span></div>
</footer>
<div class="bottombar" aria-label="Quick actions"><a href="tel:${biz.phoneTel}">${I.phone}Call ${biz.phoneDisplay}</a><a href="/contact/">${I.quote}Get a quote</a></div>
<script src="/assets/js/main.js" defer></script>`;
}

function page(opts) {
  const mapJs = opts.body.includes('class="areamap') ? '<script src="/assets/js/map.js" defer></script>' : '';
  return `${head(opts)}
<body>
${header()}
<main id="main">
${opts.body}
</main>
${footer()}
${mapJs}
</body>
</html>`;
}

/* ---------------- shared blocks ---------------- */
const ctaBand = (h = 'Ready for a garden you can be proud of?', p = 'Call Emma for a chat about your garden, or send the quote form and she will be in touch to arrange a visit.') => `
<section class="cta-band">
  <div class="wrap cta-band__in">
    <div><h2>${esc(h)}</h2><p>${esc(p)}</p></div>
    <div class="actions"><a class="btn btn--ink" href="tel:${biz.phoneTel}">${I.phone}Call ${biz.phoneDisplay}</a><a class="btn btn--ghost" href="/contact/">Request a quote</a></div>
  </div>
</section>`;

const faqBlock = (faqs, h2 = 'Frequently asked questions') => `
<section class="section section--paper" id="faq">
  <div class="wrap wrap--narrow">
    <div class="section-head reveal"><p class="eyebrow">Straight answers</p><h2>${esc(h2)}</h2>${rule()}</div>
    <div class="faq reveal">${faqs.map((f, i) => `<details${i === 0 ? ' open' : ''}><summary>${esc(f.q)}</summary><div class="faq__a"><p>${esc(f.a)}</p></div></details>`).join('')}</div>
  </div>
</section>`;

const reviewsBlock = () => `
<section class="section" id="reviews">
  <div class="wrap">
    <div class="section-head section-head--center reveal"><p class="eyebrow">From clients in the east</p><h2>What clients say about Garden Grit's landscaping and gardening</h2>${rule('ink-rule--center')}</div>
    <div class="reviews">${reviews.map(r => `<article class="review reveal"><div class="review__stars" aria-label="${r.rating} out of 5 stars">${'★'.repeat(r.rating)}</div><blockquote>${esc(r.text)}</blockquote><cite>${esc(r.author)}<span>${esc(r.suburb)}</span></cite></article>`).join('')}</div>
  </div>
</section>`;

const serviceCards = (list = services) => `<div class="grid grid--3">${list.map(s => `
<a class="card reveal" href="${svcPath(s)}">
  <div class="card__media">${img(s.image, s.imageAlt)}<span class="card__icon">${I[s.icon]}</span></div>
  <div class="card__body"><span class="where">${esc(s.descriptor)}</span><h3>${esc(s.name)}</h3><p>${esc(s.card)}</p><span class="link-arrow">Learn more ${I.arrow}</span></div>
</a>`).join('')}</div>`;

const quoteForm = (title = 'Request a free quote') => `
<form class="form" name="quote" id="quote" method="post" action="/api/quote" novalidate>
  <h3>${esc(title)}</h3>
  <p class="muted small" style="margin:0">Tell Emma about the job and she will call or email to arrange a time to look at the garden.</p>
  <div class="row row--2">
    <div class="field"><label for="f-name">Name <span class="req" aria-hidden="true">*</span></label><input id="f-name" name="full_name" type="text" autocomplete="name" required></div>
    <div class="field"><label for="f-phone">Phone <span class="req" aria-hidden="true">*</span></label><input id="f-phone" name="phone" type="tel" autocomplete="tel" inputmode="tel" required></div>
  </div>
  <div class="field"><label for="f-email">Email <span class="req" aria-hidden="true">*</span></label><input id="f-email" name="email" type="email" autocomplete="email" required></div>
  <div class="row row--2">
    <div class="field"><label for="f-address">Property address</label><input id="f-address" name="property_address" type="text" autocomplete="street-address" placeholder="Street and suburb"></div>
    <div class="field"><label for="f-size">Property size</label><select id="f-size" name="property_size"><option value="">Select…</option><option>Small (courtyard / unit)</option><option>Medium (standard block)</option><option>Large (big block / acreage)</option><option>Commercial / strata</option></select></div>
  </div>
  <div class="field"><label for="f-service">Service needed <span class="req" aria-hidden="true">*</span></label><select id="f-service" name="service_needed" required><option value="">Select a service…</option><option>Turf Installation</option><option>Hedge Pruning &amp; Trimming</option><option>Garden Clean Up</option><option>Landscaping &amp; Landscape Design</option><option>Tree Pruning</option><option>Other</option></select></div>
  <div class="field"><label for="f-notes">Job notes</label><textarea id="f-notes" name="job_notes" placeholder="What needs doing, roughly how big the area is, and any access notes"></textarea></div>
  <div class="hp" aria-hidden="true"><label>Leave this field empty <input type="text" name="company" tabindex="-1" autocomplete="off"></label></div>
  <button class="btn btn--primary btn--block" type="submit">Send my quote request ${I.arrow}</button>
  <p class="consent">By sending this form you agree to Garden Grit contacting you about your enquiry. No spam, no newsletters.</p>
</form>`;

const napBlock = () => `
<div class="nap">
  <div class="nap__item">${I.phone}<div><strong>Call or text</strong><a href="tel:${biz.phoneTel}">${biz.phoneDisplay}</a></div></div>
  <div class="nap__item">${I.mail}<div><strong>Email</strong><a href="mailto:${biz.email}">${biz.email}</a></div></div>
  <div class="nap__item">${I.pin}<div><strong>Based in</strong><a href="/areas/">${esc(biz.address.formatted)}</a><p class="small muted" style="margin:.2rem 0 0">Mobile service across Adelaide's eastern and north-eastern suburbs, up to ${biz.serviceRadiusKm} km from Norwood. No shopfront.</p></div></div>
  <div class="nap__item">${I.cert}<div><strong>Credentials</strong><p style="margin:0">Certificate III in Horticulture (Carrick Hill, SA). Studying garden design. ABN ${biz.abn}.</p></div></div>
</div>
<div class="map-embed" id="map" data-src="${biz.mapEmbed}" data-title="Garden Grit on Google Maps"><div class="map-embed__ph">${I.pin}<span>Garden Grit on Google Maps</span></div></div>`;

/* ---------------- service-area map ---------------- */
function areaMap() {
  const K = 4200, PAD = { l: 70, r: 150, t: 40, b: 80 };
  const X = (lon) => Math.round((lon - 138.555) * K), Y = (lat) => Math.round((-34.765 - lat) * K);
  const pts = suburbs.map(s => ({ ...s, x: X(s.lon), y: Y(s.lat) }));
  const minX = Math.min(...pts.map(p => p.x)) - PAD.l, maxX = Math.max(...pts.map(p => p.x)) + PAD.r;
  const minY = Math.min(...pts.map(p => p.y)) - PAD.t, maxY = Math.max(...pts.map(p => p.y)) + PAD.b;
  const route = pts.filter(p => p.route != null).sort((a, b) => a.route - b.route);
  const loop = route.concat([route[0]]);
  const seg = []; let d = `M${loop[0].x} ${loop[0].y}`;
  for (let i = 0; i < loop.length - 1; i++) {
    const p0 = loop[i - 1] || loop[loop.length - 2], p1 = loop[i], p2 = loop[i + 1], p3 = loop[i + 2] || loop[1];
    const c1 = [p1.x + (p2.x - p0.x) / 6, p1.y + (p2.y - p0.y) / 6], c2 = [p2.x - (p3.x - p1.x) / 6, p2.y - (p3.y - p1.y) / 6];
    d += ` C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2.x} ${p2.y}`;
    seg.push([[p1.x, p1.y], c1, c2, [p2.x, p2.y]]);
  }
  const bez = (P, t) => [0, 1].map(k => (1 - t) ** 3 * P[0][k] + 3 * (1 - t) ** 2 * t * P[1][k] + 3 * (1 - t) * t * t * P[2][k] + t ** 3 * P[3][k]);
  const cum = [0]; let total = 0;
  for (const P of seg) { let prev = bez(P, 0); for (let i = 1; i <= 60; i++) { const q = bez(P, i / 60); total += Math.hypot(q[0] - prev[0], q[1] - prev[1]); prev = q; } cum.push(total); }
  const atOf = (p) => { if (p.route != null) return cum[route.findIndex(r => r.name === p.name)] / total; let best = 0, bd = 1e9; route.forEach((r, i) => { if (r.home) return; const dd = Math.hypot(r.x - p.x, r.y - p.y); if (dd < bd) { bd = dd; best = i; } }); return cum[best] / total; };
  const mowerIcon = '<g transform="translate(-24 -24) scale(1.05)" fill="#fff" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' + I.mower.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '') + '</g>';
  const markers = pts.map(p => {
    const mode = p.label || 'right'; const home = p.home ? ' sub--home' : ''; const anchor = p.anchor ? ' sub--anchor' : '';
    const pos = { right: [13, 5, 'start'], left: [-13, 5, 'end'], above: [0, -12, 'middle'], below: [0, 21, 'middle'] }[mode];
    const at = p.home ? 0 : atOf(p);
    return `<g class="sub${home}${anchor}" data-at="${at.toFixed(3)}" transform="translate(${p.x} ${p.y})"><circle r="${p.home ? 9 : 6.5}"/><text x="${pos[0]}" y="${pos[1]}" text-anchor="${pos[2]}">${esc(p.name)}</text></g>`;
  }).join('');
  const river = `M${X(138.705)} ${Y(-34.866)} C${X(138.69)} ${Y(-34.87)} ${X(138.675)} ${Y(-34.878)} ${X(138.66)} ${Y(-34.886)} S${X(138.63)} ${Y(-34.9)} ${X(138.612)} ${Y(-34.903)} S${X(138.59)} ${Y(-34.915)} ${X(138.575)} ${Y(-34.922)}`;
  const hill = (lon, seed, step) => { let s = `M${X(lon)} ${minY}`; for (let lat = -34.775; lat > -34.975; lat -= step) { const w = (Math.sin(lat * seed) + 1) * 9; s += ` L${X(lon) + w} ${Y(lat)}`; } return s; };
  const home = pts.find(p => p.home);
  const ring = Math.round(20 / 91 * K);
  return `<div class="areamap reveal" role="img" aria-label="Hand-drawn map of Garden Grit's service area: Norwood home base with a ride-on mower travelling out to ${route.map(r => r.name).join(', ')} and back">
<svg viewBox="${minX} ${minY} ${maxX - minX} ${maxY - minY}" xmlns="http://www.w3.org/2000/svg">
  <path class="hills" d="${hill(138.745, 97, 0.012)}"/><path class="hills" d="${hill(138.76, 131, 0.014)}"/>
  <text class="legend" x="${X(138.752)}" y="${Y(-34.955)}" transform="rotate(-90 ${X(138.752)} ${Y(-34.955)})">Adelaide Hills face</text>
  <path class="river" d="${river}"/><text class="legend" x="${X(138.627)}" y="${Y(-34.892)}" font-style="italic">River Torrens</text>
  <path class="road road--main" d="M${X(138.608)} ${Y(-34.905)} L${X(138.69)} ${Y(-34.838)} L${X(138.72)} ${Y(-34.815)}"/>
  <text class="legend" x="${X(138.648)}" y="${Y(-34.862)}" transform="rotate(-39 ${X(138.648)} ${Y(-34.862)})">North East Rd</text>
  <path class="road" d="M${X(138.655)} ${Y(-34.9)} L${X(138.655)} ${Y(-34.96)}"/><text class="legend" x="${X(138.66)}" y="${Y(-34.93)}" transform="rotate(90 ${X(138.66)} ${Y(-34.93)})">Portrush Rd</text>
  <path class="road" d="M${X(138.608)} ${Y(-34.92)} L${X(138.69)} ${Y(-34.915)}"/>
  <path class="road" d="M${X(138.6)} ${Y(-34.93)} L${X(138.6)} ${Y(-34.962)}"/>
  <circle class="ring" cx="${home.x}" cy="${home.y}" r="${ring}"/>
  <path class="route" d="${d}"/><path class="route route--trail" d="${d}"/>
  ${markers}
  <g class="mower" transform="translate(${home.x} ${home.y})">${mowerIcon}</g>
  <g class="compass" transform="translate(${minX + 60} ${minY + 60})"><circle r="18"/><path d="M0 -14 L6 6 L0 2 L-6 6 Z" fill="currentColor"/><text class="legend" y="-24" text-anchor="middle" style="fill:#141414;font-weight:700">N</text></g>
  <g transform="translate(${minX + 30} ${maxY - 28})"><circle r="8" fill="#c4622d" stroke="#141414" stroke-width="2"/><text class="legend" x="16" y="5">Home base: Norwood</text><circle cx="200" r="6.5" fill="#3f5a2a" stroke="#141414" stroke-width="2"/><text class="legend" x="214" y="5">Suburbs served (lit as the mower arrives)</text><path d="M520 0 h34" stroke="#c4622d" stroke-width="1.8" stroke-dasharray="4 6"/><text class="legend" x="562" y="5">~20 km from Norwood</text></g>
</svg></div>`;
}

const areasList = () => `<ul class="areas__list">${suburbs.map(s => `<li>${esc(s.name)} ${s.postcode}</li>`).join('')}</ul>`;

/* ---------------- pages ---------------- */
function homePage() {
  const faqs = [
    { q: 'How much does landscaping cost in Adelaide\'s eastern suburbs?', a: 'It depends on the size of the garden and whether the work is planting and softscaping or includes hard landscaping. Garden Grit quotes every job after a site visit, so you get a fixed price for the scope agreed, with no hourly surprises.' },
    { q: 'Do you do garden maintenance and clean ups in Norwood and Kensington Park?', a: 'Yes. Norwood is home base, and Kensington Park, St Peters, Stepney and Kent Town are my closest regular runs. One-off clean ups and ongoing maintenance are both available, for homes and small commercial sites.' },
    { q: 'When is the best time to prune fruit trees in Adelaide?', a: 'Apples and pears in winter while dormant; apricots, plums and peaches in late summer after fruiting to avoid disease; citrus lightly in spring after the last frost. If you are not sure, ask and I will time the visit for your trees.' },
    { q: 'How often should hedges be trimmed in Adelaide\'s climate?', a: 'Two to three times a year for most formal hedges: late winter, early summer and an autumn tidy. Fast growers such as Photinia and Lilly Pilly may need a fourth trim.' },
    { q: 'Can you install new turf in Tea Tree Gully, Modbury and Golden Grove?', a: 'Yes. The north-eastern suburbs are within the 20 km service area from Norwood and are some of the most common areas for new lawns on new builds and renovations.' },
    { q: 'Is Garden Grit a qualified horticulturist?', a: 'Yes. Garden Grit is owner-operated by Emma Pelle, who holds a Certificate III in Horticulture (ARO College at Carrick Hill, SA) and is currently studying garden design. Every job is done or supervised by Emma.' }
  ];
  const body = `
<section class="hero">
  <div class="wrap hero__in">
    <div>
      <p class="eyebrow h-anim">Qualified horticulturist · Norwood SA</p>
      <h1 class="h-anim">Landscaping &amp; Garden Services in <span class="underline-draw">Adelaide's Eastern Suburbs</span></h1>
      <p class="lede h-anim">Garden Grit is landscaping in Adelaide done by a qualified horticulturist: garden design, softscaping, hedge and tree pruning, garden clean ups, turf and irrigation for homes from Norwood and Burnside to Tea Tree Gully and Bowden. Owner-operated by Emma Pelle since 2017.</p>
      <div class="hero__cta h-anim"><a class="btn btn--primary" href="/contact/">Get a Free Quote ${I.arrow}</a><a class="btn btn--ghost" href="tel:${biz.phoneTel}">${I.phone}${biz.phoneDisplay}</a></div>
      <ul class="hero__trust h-anim"><li>${I.check}Cert III Horticulture</li><li>${I.check}Owner-operated, female-led</li><li>${I.check}Fixed quotes after a site visit</li><li>${I.check}Up to 20 km from Norwood</li></ul>
    </div>
    <div class="hero__media h-anim">
      <div class="frame">${img('turf-install', 'New turf and garden beds installed by Garden Grit at a Norwood, Adelaide property', { eager: true, sizes: '(min-width: 900px) 40vw, 100vw' })}</div>
      <span class="sticker" aria-hidden="true">${I.carrot}</span>
    </div>
  </div>
</section>
<section class="cred" aria-label="Credentials">
  <div class="wrap cred__in">
    <div class="cred__item reveal">${I.cert}<div><strong>Certificate III in Horticulture</strong><span>ARO College, Carrick Hill SA</span></div></div>
    <div class="cred__item reveal">${I.design}<div><strong>Studying garden design</strong><span>Plans drawn around your soil and aspect</span></div></div>
    <div class="cred__item reveal">${I.person}<div><strong>Owner-operated since 2017</strong><span>Emma does the work, not a crew you have never met</span></div></div>
    <div class="cred__item reveal">${I.home}<div><strong>Based in Norwood</strong><span>Eastern and north-eastern suburbs, up to 20 km</span></div></div>
  </div>
</section>
<section class="section" id="services">
  <div class="wrap">
    <div class="section-head reveal"><p class="eyebrow">What I do</p><h2>Gardening services across Adelaide's east</h2>${rule()}<p class="lede">Six landscaping and garden services, each with its own page. Every one is quoted after a visit and done by a qualified horticulturist rather than a mow-and-go crew.</p></div>
    ${serviceCards()}
  </div>
</section>
<section class="section section--paper" id="about">
  <div class="wrap split">
    <div class="reveal"><div class="frame">${img('hedge-pruning', 'Hedge trimmed level and square by Garden Grit horticulturist Emma Pelle in Walkerville, Adelaide', { sizes: '(min-width: 900px) 45vw, 100vw' })}</div></div>
    <div class="reveal">
      <p class="eyebrow">Why Garden Grit</p>
      <h2>A gardener Adelaide homeowners can ask the hard questions</h2>${rule()}
      <p>Plenty of people will mow your lawn. Fewer can tell you why the camellia is dropping buds, when the apricot should be cut, or which hedge will actually cope with the shade along your southern fence. Garden Grit is run by Emma Pelle, a qualified horticulturist who started out selling indoor plants in 2017 and has been maintaining, pruning and planting gardens in the eastern suburbs ever since.</p>
      <ul class="feat">
        <li><span class="feat__icon">${I.cert}</span><div><strong>Expert advice, not just labour</strong><p>Pruning timed to the species, soil improved before planting, irrigation designed for the plants that are actually there.</p></div></li>
        <li><span class="feat__icon">${I.person}</span><div><strong>A female tradie, owner-operated</strong><p>Some clients simply feel more comfortable having a woman in their garden and their home. Emma quotes, does the work and follows up herself.</p></div></li>
        <li><span class="feat__icon">${I.leaf}</span><div><strong>Honest about what will work</strong><p>If a tree is too big for its spot or a lawn will never thrive in that shade, you will hear it before you spend money.</p></div></li>
      </ul>
      <div class="quote-card"><p>"Her advice on plants and maintenance has clearly improved the health and appearance of my garden."</p><cite>Robyn, Norwood SA</cite></div>
      <p style="margin-top:1.4rem"><a class="link-arrow" href="/about/">More about Emma and Garden Grit ${I.arrow}</a></p>
    </div>
  </div>
</section>
<section class="section" id="process">
  <div class="wrap">
    <div class="section-head section-head--center reveal"><p class="eyebrow">How it works</p><h2>How landscaping with Garden Grit works</h2>${rule('ink-rule--center')}</div>
    <ol class="steps">
      <li class="reveal"><h3>Call or send the form</h3><p>Tell Emma what needs doing and roughly where. Most enquiries get a reply the same day.</p></li>
      <li class="reveal"><h3>Site visit and fixed quote</h3><p>Emma looks at the garden, talks through options and sends a written quote for the agreed scope.</p></li>
      <li class="reveal"><h3>The work, and a tidy finish</h3><p>Job done on the day agreed, green waste removed, and advice on looking after what has been done.</p></li>
    </ol>
  </div>
</section>
<section class="section section--paper" id="areas">
  <div class="wrap">
    <div class="split" style="align-items:start">
    <div class="reveal">
      <p class="eyebrow">Service area</p>
      <h2>Norwood to Tea Tree Gully, Burnside to Bowden</h2>${rule()}
      <p>Garden Grit is based in Norwood and travels up to 20 km, which takes in the eastern and north-eastern suburbs and the inner west. A Norwood-based horticulturist means shorter travel, quicker call-outs and a landscaping gardener who knows the clay soils, the old hedges and the big street trees of these suburbs.</p>
      <p>Watch the mower on the map do the run: out through Payneham and Campbelltown to Tea Tree Gully, back down through Magill and Burnside, across the city to Bowden and home to Norwood.</p>
      <p style="margin-top:1.2rem"><a class="link-arrow" href="/areas/">See the full service area ${I.arrow}</a></p>
    </div>
    <div class="reveal"><h3>Suburbs served</h3>${areasList()}</div>
    </div>
    <div style="margin-top:2.2rem">${areaMap()}</div>
  </div>
</section>
${reviewsBlock()}
${faqBlock(faqs, 'Questions people ask before booking')}
<section class="section" id="contact">
  <div class="wrap">
    <div class="section-head reveal"><p class="eyebrow">Get in touch</p><h2>Get a quote for landscaping in Adelaide's east</h2>${rule()}<p class="lede">Call Emma or send the form for landscaping, garden maintenance, pruning, turf or irrigation anywhere in Adelaide's east. Quotes are free and follow a quick look at the garden.</p></div>
    <div class="contact"><div class="reveal">${quoteForm()}</div><div class="reveal">${napBlock()}</div></div>
  </div>
</section>`;
  const schema = [
    { '@context': 'https://schema.org', '@type': 'WebSite', url: `${BASE}/`, name: biz.name, publisher: { '@id': `${BASE}/#business` } },
    faqSchema(faqs)
  ];
  return page({
    title: 'Landscaping Adelaide Eastern Suburbs | Garden Grit',
    desc: 'Landscaping Adelaide by a qualified horticulturist. Garden design, hedge & tree pruning, clean ups and turf across Norwood, Burnside & the east. Quote now!',
    url: '/', body, schema,
    preload: `<link rel="preload" as="image" href="/assets/img/turf-install-800.webp" imagesrcset="/assets/img/turf-install-400.webp 400w, /assets/img/turf-install-800.webp 800w" imagesizes="(min-width: 900px) 40vw, 100vw">`
  });
}

function pageHero({ eyebrow, h1, lede, crumbs, image, imageAlt, cta = true }) {
  return `
<section class="phero">
  <div class="wrap phero__in">
    <div>
      <nav class="breadcrumb" aria-label="Breadcrumb"><ol>${crumbs.map((c, i) => i === crumbs.length - 1 ? `<li aria-current="page">${esc(c[0])}</li>` : `<li><a href="${c[1]}">${esc(c[0])}</a></li>`).join('')}</ol></nav>
      ${eyebrow ? `<p class="eyebrow">${esc(eyebrow)}</p>` : ''}
      <h1>${h1}</h1>${rule()}
      <p class="lede">${lede}</p>
      ${cta ? `<div class="phero__cta"><a class="btn btn--primary" href="/contact/">Get a Free Quote ${I.arrow}</a><a class="btn btn--ghost" href="tel:${biz.phoneTel}">${I.phone}${biz.phoneDisplay}</a></div>` : ''}
    </div>
    ${image ? `<div class="phero__media"><div class="frame">${img(image, imageAlt, { eager: true, sizes: '(min-width: 900px) 42vw, 100vw' })}</div></div>` : ''}
  </div>
</section>`;
}

function servicePage(s) {
  const body = `
${pageHero({ eyebrow: `Qualified horticulturist · Norwood SA`, h1: esc(s.h1), lede: esc(s.lede), crumbs: [['Home', '/'], ['Services', '/services/'], [s.name, svcPath(s)]], image: s.image, imageAlt: s.imageAlt })}
<section class="section">
  <div class="wrap split" style="align-items:start">
    <div class="prose reveal">${s.sections.map(sec => `<h2>${esc(sec.h2)}</h2>${sec.html}`).join('')}</div>
    <aside class="reveal">
      <div class="related"><h3>Related services</h3><ul>${s.related.map(r => svcBySlug[r]).map(r => `<li><a href="${svcPath(r)}">${esc(r.name)}</a> <span class="muted small">${esc(r.descriptor)}</span></li>`).join('')}</ul></div>
      <div class="related" style="margin-top:1rem"><h3>Service area</h3><p class="small" style="margin:0">${suburbNames.join(' · ')}</p><p style="margin:.8rem 0 0"><a class="link-arrow" href="/areas/">All service areas ${I.arrow}</a></p></div>
      <div class="related" style="margin-top:1rem;background:#fff"><h3>Get a quote</h3><p class="small">Call ${biz.phoneDisplay} or use the form on the contact page. Quotes are free and follow a quick site visit.</p><a class="btn btn--primary btn--block" href="/contact/?service=${encodeURIComponent(s.formLabel)}">Request a quote ${I.arrow}</a></div>
    </aside>
  </div>
</section>
${faqBlock(s.faqs, `${s.name}: common questions`)}
${ctaBand(`Book ${s.name.toLowerCase()} with a qualified horticulturist`, 'Fixed quotes, honest advice, and the work done by Emma herself across Norwood and Adelaide\'s eastern suburbs.')}`;
  const w = words(s.sections.map(x => x.html).join(' ')) + words(s.lede) + words(s.faqs.map(f => f.q + ' ' + f.a).join(' '));
  if (w < 500) warnings.push(`thin service copy: ${s.slug} (${w} words)`);
  return page({ title: s.title, desc: s.metaDescription, url: svcPath(s), body, ogImage: `/assets/img/${s.image}-800.webp`,
    schema: [serviceSchema(s), faqSchema(s.faqs), breadcrumbSchema([['Home', '/'], ['Services', '/services/'], [s.name, svcPath(s)]])] });
}

function servicesIndex() {
  const body = `
${pageHero({ eyebrow: 'Services', h1: 'Garden &amp; Landscaping Services in Adelaide\'s East', lede: 'Six services, one qualified horticulturist. Every job is quoted after a site visit and done by Emma, from a single hedge to a complete garden design.', crumbs: [['Home', '/'], ['Services', '/services/']], image: 'garden-clean-up', imageAlt: 'Commercial courtyard garden cleaned up and tidied by Garden Grit in Norwood, Adelaide' })}
<section class="section"><div class="wrap">${serviceCards()}</div></section>
<section class="section section--paper">
  <div class="wrap wrap--narrow prose reveal">
    <h2>Also available for regular clients</h2>${rule()}
    <p>Alongside the six core services, regular maintenance clients can have lawn mowing and seasonal lawn care, garden consultations and plant selection, indoor plant care for homes and offices, mulching and soil improvement, pest and plant health treatments, gutter cleaning, pressure washing, trellis installs and the odd jobs that keep a property tidy. Ask when you book.</p>
  </div>
</section>
${ctaBand()}`;
  return page({ title: 'Garden & Landscaping Services Adelaide East | Garden Grit', desc: 'Landscape design, garden clean ups, hedge trimming, tree pruning, turf and irrigation across Norwood and Adelaide\'s east by a qualified horticulturist.', url: '/services/', body,
    schema: [breadcrumbSchema([['Home', '/'], ['Services', '/services/']])] });
}

function aboutPage() {
  const body = `
${pageHero({ eyebrow: 'About', h1: 'Emma Pelle: Horticulturist Behind Garden Grit', lede: 'Owner-operated, qualified, and based in Norwood. Garden Grit is one horticulturist who quotes the job, does the job and answers the phone afterwards.', crumbs: [['Home', '/'], ['About', '/about/']], image: 'landscaping', imageAlt: 'Garden designed and planted by Emma Pelle of Garden Grit in Burnside, Adelaide, with new lawn and mulched beds' })}
<section class="section">
  <div class="wrap split" style="align-items:start">
    <div class="prose reveal">
      <h2>From indoor plants to whole gardens</h2>
      <p>Garden Grit started in 2017 as Green Leaved Garden, selling indoor plants while I finished my horticulture studies and raised a family. The plant customers started asking about their outdoor gardens, the gardens turned into regular maintenance, the maintenance turned into pruning, design and planting work, and the business was rebranded as Garden Grit to match what it had become: a hands-on gardening and landscaping service for Adelaide's eastern suburbs.</p>
      <h2>Qualified, and still studying</h2>
      <p>I hold a Certificate III in Horticulture from ARO College at Carrick Hill in South Australia, and I am currently studying garden design. That matters in practice. It is the difference between cutting a hedge and knowing which hedge can take the cut; between laying turf and preparing the soil so the turf survives February; between planting what is on special and planting what will still be alive and in proportion in five years.</p>
      <h2>A female tradie in the garden</h2>
      <p>I am a woman working in a trade where that is still unusual. Plenty of clients tell me they chose Garden Grit for exactly that reason: they feel more comfortable with a woman in the garden and in the house, whether that is an older client living alone, a family with young kids, or someone who simply prefers it. It is not a gimmick. It is just who turns up, and it is the same person who quoted the job.</p>
      <h2>How I work</h2>
      <ul>
        <li>Every job starts with a site visit and ends with a fixed written quote.</li>
        <li>I do the work myself. Where a job needs a second pair of hands or a specialist trade (an arborist for a large tree, a plumber for a new tap), I say so and arrange it.</li>
        <li>Advice is part of the service. If a plant is in the wrong spot, I will tell you before I plant another one next to it.</li>
        <li>Sustainability is practical, not a slogan: drip irrigation over sprays, mulch over bare soil, plants chosen for Adelaide's climate, green waste composted where it can be.</li>
      </ul>
      <h2 id="workshops">Workshops and community</h2>
      <p>Alongside the garden work I run hands-on plant workshops for libraries, community gardens, schools, childcare centres and other organisations: beginners' indoor plants, grow-your-own produce, preparing the patch for the season and keeping backyard chickens. If your group would like one, <a href="/contact/">get in touch</a>.</p>
    </div>
    <aside class="reveal">
      <div class="related"><h3>Credentials</h3><ul>${biz.credentials.map(c => `<li>${esc(c)}</li>`).join('')}<li>ABN ${biz.abn}</li></ul></div>
      <div class="related" style="margin-top:1rem"><h3>Based in Norwood</h3><p class="small" style="margin:0">Mobile service up to ${biz.serviceRadiusKm} km across the eastern and north-eastern suburbs: Norwood, Kensington Park, Burnside, Magill, Campbelltown, Tea Tree Gully, Walkerville, Prospect, Bowden and more.</p><p style="margin:.8rem 0 0"><a class="link-arrow" href="/areas/">Service areas ${I.arrow}</a></p></div>
      <div class="quote-card"><p>"Emma is knowledgable, creative, helpful and reliable. Excellent rates, a great result and a stress free experience."</p><cite>Jane, Collinswood SA</cite></div>
    </aside>
  </div>
</section>
${reviewsBlock()}
${ctaBand('Want a horticulturist to look at your garden?', 'Call Emma or send the quote form. Advice is free, quotes are fixed, and the work is done by the person you spoke to.')}`;
  return page({ title: 'About Emma Pelle, Horticulturist | Garden Grit Norwood', desc: 'Garden Grit is owner-operated by Emma Pelle, a qualified horticulturist (Cert III) in Norwood SA, serving Adelaide\'s eastern suburbs since 2017.', url: '/about/', body,
    schema: [breadcrumbSchema([['Home', '/'], ['About', '/about/']]), { '@context': 'https://schema.org', '@type': 'Person', name: biz.owner, jobTitle: 'Owner / Senior Horticulturalist', worksFor: { '@id': `${BASE}/#business` }, hasCredential: { '@type': 'EducationalOccupationalCredential', credentialCategory: 'Certificate III in Horticulture' }, url: `${BASE}/about/` }] });
}

function areasPage() {
  const groups = [
    ['Inner east (home turf)', ['Norwood', 'Kent Town', 'Stepney', 'St Peters', 'Rose Park', 'Kensington Park', 'Toorak Gardens', 'Payneham', 'Glynde']],
    ['East and foothills', ['Burnside', 'Magill', 'Campbelltown', 'Paradise', 'Athelstone']],
    ['North-east', ['Dernancourt', 'Modbury', 'Tea Tree Gully', 'Golden Grove']],
    ['North and inner west', ['Walkerville', 'Prospect', 'Bowden', 'Adelaide CBD', 'Unley']]
  ];
  const body = `
${pageHero({ eyebrow: 'Service area', h1: 'Gardening &amp; Landscaping Service Areas: Adelaide\'s East &amp; North-East', lede: 'Garden Grit is based in Norwood SA 5067 and travels up to 20 km. The map shows the run: out through the north-east to Tea Tree Gully, back through Burnside, across to Bowden and home.', crumbs: [['Home', '/'], ['Service Areas', '/areas/']], cta: false })}
<section class="section">
  <div class="wrap">
    ${areaMap()}
    <p class="small muted" style="margin-top:1rem">Stylised map, not to scale. The mower follows the loop Norwood → Payneham → Campbelltown → Dernancourt → Modbury → Tea Tree Gully → Athelstone → Magill → Burnside → Toorak Gardens → Adelaide → Bowden → St Peters → Norwood. Suburbs light up as it reaches them.</p>
  </div>
</section>
<section class="section section--paper">
  <div class="wrap">
    <div class="section-head reveal"><p class="eyebrow">Suburbs served</p><h2>Where Garden Grit works</h2>${rule()}<p class="lede">If your suburb is within about 20 km of Norwood and not listed, ask. Regular maintenance runs are grouped by area so travel stays short and quotes stay sharp.</p></div>
    <div class="grid grid--2">${groups.map(([h, list]) => `<div class="reveal"><h3>${esc(h)}</h3><ul class="areas__list" style="columns:1">${list.map(n => { const s = suburbs.find(x => x.name === n); return `<li>${esc(n)}${s ? ' ' + s.postcode : ''}</li>`; }).join('')}</ul></div>`).join('')}</div>
    <div class="prose reveal" style="margin-top:2rem">
      <h2>Why a Norwood-based horticulturist is the local choice</h2>
      <p>The eastern suburbs share a few things: heavy clay under a thin layer of topsoil, big established trees, long formal hedges and gardens that were planted decades ago and need an experienced hand rather than a reset. Being based in Norwood means I am ten minutes from Burnside, Walkerville, Magill or St Peters, which keeps call-out time short and makes regular maintenance affordable. The north-eastern suburbs of Campbelltown, Modbury and Tea Tree Gully bring more new builds, new lawns and new gardens, and the inner west around Bowden and Prospect a mix of cottages and courtyards. All of it is within the 20 km radius.</p>
      <p>Services across every suburb: <a href="/services/landscape-design/">landscape design and softscaping</a>, <a href="/services/garden-maintenance/">garden maintenance and clean ups</a>, <a href="/services/hedge-trimming/">hedge trimming</a>, <a href="/services/tree-pruning/">tree pruning</a>, <a href="/services/turf-installation/">turf installation</a> and <a href="/services/irrigation-installation/">irrigation</a>.</p>
    </div>
  </div>
</section>
${ctaBand('In the area? Get a quote.', 'Tell Emma your suburb and what the garden needs. If it is inside the 20 km run, she will arrange a visit.')}`;
  return page({ title: 'Service Areas: Norwood & Adelaide\'s East | Garden Grit', desc: 'Garden Grit serves Norwood, Burnside, Kensington Park, Magill, Campbelltown, Tea Tree Gully, Walkerville, Prospect and Bowden, up to 20 km from Norwood SA.', url: '/areas/', body,
    schema: [breadcrumbSchema([['Home', '/'], ['Service Areas', '/areas/']])] });
}

function contactPage() {
  const body = `
${pageHero({ eyebrow: 'Contact', h1: 'Contact Garden Grit for a Free Quote', lede: 'Call, text or send the form. Emma replies to most enquiries the same day and arranges a time to look at the garden before quoting.', crumbs: [['Home', '/'], ['Contact', '/contact/']], cta: false })}
<section class="section">
  <div class="wrap contact"><div class="reveal">${quoteForm()}</div><div class="reveal">${napBlock()}</div></div>
</section>`;
  return page({ title: 'Contact Garden Grit | Landscaping Quotes Norwood SA', desc: 'Call 0422 172 452 or send the form for a free landscaping or gardening quote from Garden Grit, a qualified horticulturist based in Norwood, Adelaide.', url: '/contact/', body,
    schema: [breadcrumbSchema([['Home', '/'], ['Contact', '/contact/']])] });
}

function thankYouPage() {
  const body = `
<section class="section simple">
  <div class="wrap wrap--narrow">
    <p class="eyebrow" style="justify-content:center">Thanks</p>
    <h1>Got it. Emma will be in touch soon.</h1>${rule('ink-rule--center')}
    <p class="lede" style="margin-inline:auto">Your quote request has been received. Expect a call or email, usually the same day, to arrange a time to look at the garden. If it is urgent, call <a href="tel:${biz.phoneTel}">${biz.phoneDisplay}</a>.</p>
    <p style="margin-top:1.6rem"><a class="btn btn--primary" href="/blog/">Read some gardening advice while you wait ${I.arrow}</a></p>
  </div>
</section>`;
  return page({ title: 'Thanks, we will be in touch | Garden Grit', desc: 'Your quote request has been received by Garden Grit. Emma will call or email, usually the same day.', url: '/thank-you/', body, noindex: true });
}

function blogIndex() {
  const body = `
${pageHero({ eyebrow: 'Advice', h1: 'Gardening Advice from an Adelaide Horticulturist', lede: 'Practical answers to the questions clients ask most: when to prune, what a job costs, which turf to lay and how often to cut the hedge.', crumbs: [['Home', '/'], ['Advice', '/blog/']], cta: false })}
<section class="section"><div class="wrap"><div class="post-list">${posts.map(p => `<a class="post-card reveal" href="${postPath(p)}"><time datetime="${p.date}">${new Date(p.date).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}</time><h3>${esc(p.title)}</h3><p>${esc(p.excerpt)}</p><span class="link-arrow">Read ${I.arrow}</span></a>`).join('')}</div></div></section>
${ctaBand()}`;
  return page({ title: 'Gardening Advice for Adelaide | Garden Grit Blog', desc: 'Pruning calendars, hedge timing, lawn and tree pruning costs: practical gardening advice for Adelaide\'s eastern suburbs from horticulturist Emma Pelle.', url: '/blog/', body,
    schema: [breadcrumbSchema([['Home', '/'], ['Advice', '/blog/']])] });
}

function postPage(p) {
  const s = svcBySlug[p.relatedService];
  const body = `
<section class="phero"><div class="wrap phero__in"><div>
  <nav class="breadcrumb" aria-label="Breadcrumb"><ol><li><a href="/">Home</a></li><li><a href="/blog/">Advice</a></li><li aria-current="page">${esc(p.title.split(':')[0])}</li></ol></nav>
  <p class="eyebrow">Advice</p><h1>${esc(p.title)}</h1>${rule()}
  <p class="post-meta">By ${esc(biz.owner)}, horticulturist · <time datetime="${p.date}">${new Date(p.date).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}</time></p>
</div><div class="phero__media"><div class="frame">${img(p.image, p.imageAlt, { eager: true, sizes: '(min-width: 900px) 42vw, 100vw' })}</div></div></div></section>
<section class="section"><div class="wrap split" style="align-items:start">
  <article class="prose reveal">${p.bodyHtml}</article>
  <aside class="reveal">
    <div class="related"><h3>Related service</h3><p class="small">${esc(s.card)}</p><a class="btn btn--primary btn--block" href="${svcPath(s)}">${esc(s.name)} ${I.arrow}</a></div>
    <div class="related" style="margin-top:1rem"><h3>More advice</h3><ul>${posts.filter(x => x.slug !== p.slug).map(x => `<li><a href="${postPath(x)}">${esc(x.title)}</a></li>`).join('')}</ul></div>
  </aside>
</div></section>
${ctaBand()}`;
  if (words(p.bodyHtml) < 550) warnings.push(`thin post: ${p.slug} (${words(p.bodyHtml)} words)`);
  return page({ title: p.metaTitle, desc: p.excerpt, url: postPath(p), body, ogImage: `/assets/img/${p.image}-800.webp`,
    schema: [postSchema(p), breadcrumbSchema([['Home', '/'], ['Advice', '/blog/'], [p.title, postPath(p)]])] });
}

function notFound() {
  const body = `<section class="section simple"><div class="wrap wrap--narrow"><p class="eyebrow" style="justify-content:center">404</p><h1>That page has gone to seed.</h1>${rule('ink-rule--center')}<p class="lede" style="margin-inline:auto">The page you were after is not here. Try the services, the service area or just call ${biz.phoneDisplay}.</p><p style="margin-top:1.6rem"><a class="btn btn--primary" href="/">Back to the home page</a> <a class="btn btn--ghost" href="/services/">All services</a></p></div></section>`;
  return page({ title: 'Page not found | Garden Grit', desc: 'That page is not here. Find Garden Grit services, areas and contact details.', url: '/404.html', body, noindex: true });
}

/* ---------------- write ---------------- */
function write(rel, html) { const f = path.join(SITE, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, html); }
function copyDir(src, dest) { fs.mkdirSync(dest, { recursive: true }); for (const e of fs.readdirSync(src, { withFileTypes: true })) { const s = path.join(src, e.name), d = path.join(dest, e.name); if (e.isDirectory()) { if (e.name === 'src') continue; copyDir(s, d); } else if (!/\.(jpg|jpeg)$/i.test(e.name) || /og-default/.test(e.name)) fs.copyFileSync(s, d); } }

fs.rmSync(SITE, { recursive: true, force: true });
copyDir(path.join(root, 'assets'), path.join(SITE, 'assets'));

const urls = [];
const emit = (rel, html, priority = 0.7) => { write(rel, html); urls.push([rel.replace(/index\.html$/, ''), priority]); };
emit('index.html', homePage(), 1.0);
emit('about/index.html', aboutPage(), 0.8);
emit('services/index.html', servicesIndex(), 0.9);
services.forEach(s => emit(`services/${s.slug}/index.html`, servicePage(s), 0.9));
emit('areas/index.html', areasPage(), 0.8);
emit('contact/index.html', contactPage(), 0.8);
emit('blog/index.html', blogIndex(), 0.6);
posts.forEach(p => emit(`blog/${p.slug}/index.html`, postPage(p), 0.6));
write('thank-you/index.html', thankYouPage());
write('404.html', notFound());

// H1 check
for (const [u] of urls) { const h = fs.readFileSync(path.join(SITE, u, 'index.html'), 'utf8'); const n = (h.match(/<h1[\s>]/g) || []).length; if (n !== 1) warnings.push(`${u}: ${n} h1 tags`); }

write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(([u, p]) => `  <url><loc>${BASE}/${u}</loc><lastmod>${TODAY}</lastmod><priority>${p.toFixed(1)}</priority></url>`).join('\n')}\n</urlset>\n`);
write('robots.txt', `User-agent: *\nAllow: /\nDisallow: /thank-you/\nDisallow: /api/\n\nSitemap: ${BASE}/sitemap.xml\n`);

// Vercel function (repo-root /api) so the quote form lands on /thank-you/ even with JS off. The CRM tracking script captures the submission client-side.
fs.mkdirSync(path.join(root, 'api'), { recursive: true });
fs.writeFileSync(path.join(root, 'api/quote.js'), `// Garden Grit quote form: the GHL tracking script captures the fields in the browser; this just lands the visitor on the thank-you page.\nmodule.exports = (req, res) => { res.statusCode = 303; res.setHeader('Location', '/thank-you/'); res.end(); };\n`);

// vercel.json: clean URLs, old Wix 301s, security + cache headers
const vercel = {
  $schema: 'https://openapi.vercel.sh/vercel.json',
  cleanUrls: true, trailingSlash: true,
  redirects: Object.entries(redirects).flatMap(([from, to]) => [{ source: from, destination: to, permanent: true }]),
  headers: [
    { source: '/(.*)', headers: [{ key: 'X-Frame-Options', value: 'SAMEORIGIN' }, { key: 'X-Content-Type-Options', value: 'nosniff' }, { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' }, { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' }] },
    { source: '/assets/(.*)', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] },
    { source: '/thank-you/', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }] }
  ]
};
fs.writeFileSync(path.join(root, 'vercel.json'), JSON.stringify(Object.assign({ outputDirectory: 'site', buildCommand: 'npm run build', framework: null }, vercel), null, 2) + '\n');
fs.writeFileSync(path.join(root, 'data/generated-images.json'), JSON.stringify(generated.map(f => ({ file: f, source: 'Higgsfield gpt_image_2_5', reason: 'no client photo for irrigation' })), null, 2) + '\n');

console.log(`built ${urls.length + 2} pages → site/`);
if (warnings.length) { console.log('warnings:'); warnings.forEach(w => console.log('  - ' + w)); }
