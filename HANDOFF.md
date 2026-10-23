# HANDOFF — Garden Grit static site (gardengrit.com.au rebuild)

Plain HTML generated from JSON. No framework. `site/` is the deployable output and is committed, so Vercel can serve it with or without running the build.

```
data/            ← edit these: business.json (NAP, socials, tracking id), services.json, posts.json, suburbs.json, reviews.json, redirects-source.json
assets/          ← css (tokens.css = brand palette/type, main.css), js (main.js nav/reveal/form, map.js animated service-area map), fonts, img (src/ holds originals)
scripts/         ← build.js (pages, schema, sitemap, vercel.json), images.js (WebP sizes), icons.js (hand-drawn SVG icon set)
api/quote.js     ← Vercel function: 303 → /thank-you/ after the form posts (the GHL tracking script captures the submission in the browser)
site/            ← GENERATED output
vercel.json      ← outputDirectory, clean URLs, 301s from the old Wix URLs, security + cache headers
```

## Commands

| Command | What it does |
|---|---|
| `npm run build` | regenerates `site/` and `vercel.json` from `data/`. Warns on titles > 60, descriptions > 155, thin copy, missing images, duplicate H1s. |
| `npm run images` | converts `assets/img/src/*.jpg` into 400/800/1200/1600 WebP + `og-default.jpg`, writes `data/_image-dims.json`. Run after adding photos, then build. |
| `npm run serve` | local server on :8080 |

## Brand system (from the supplied logo)

- Ink `#141414`, paper `#f7f4ed`, white; leaf green `#3f5a2a` (sampled from the hedge/turf job photos, darkened for contrast) as the only action colour; carrot terracotta `#c4622d` as a small accent (eyebrow dashes, hover shadows, step numbers). All in `assets/css/tokens.css`.
- Headings: Permanent Marker (closest Google face to the logo lettering), H1/H2 only. Body: Inter. Fonts are self-hosted in `assets/fonts/`.
- Motifs: hand-drawn ground-line divider (`I.rule` in icons.js), uneven "hand-cut" radii on buttons and cards, ink line icons of the watering can / carrot / trowel / ride-on mower. Logo is used as supplied (transparent PNG cut from the JPEG), always on white or off-white, and in a white tile on the dark footer.

## Content rules already applied

- Home title / H1 / meta description are the Step 1 research report strings. Each service page targets one keyword (landscape design, garden maintenance, hedge trimming, tree pruning, turf installation, irrigation installation adelaide) and names a different suburb cluster.
- No street address anywhere. Schema is a service-area LocalBusiness: `addressLocality` Norwood, `addressRegion` SA, `postalCode` 5067, `areaServed` = every suburb in `data/suburbs.json`, `serviceArea` = 20 km GeoCircle.
- Opening hours are not published (none supplied). Add `openingHoursSpecification` to `businessSchema()` in build.js when the client confirms them.
- Reviews are the three real testimonials from the old site, verbatim (the Wix placeholder review was dropped).

## Form → GHL

`<form name="quote" method="post" action="/api/quote">` with field names `full_name, email, phone, property_address, property_size, service_needed, job_notes`. Service dropdown: Turf Installation, Hedge Pruning & Trimming, Garden Clean Up, Landscaping & Landscape Design, Tree Pruning, Other. The tracking script (`data-tracking-id` in `data/business.json`) is in the `<head>` of every page. After submit the visitor lands on `/thank-you/` (noindex).

## Service-area map

`areaMap()` in build.js projects `data/suburbs.json` (lat/lon) into a hand-drawn SVG; suburbs with a `route` index form the mower's loop, `label` sets where the name sits. `assets/js/map.js` drives the mower along the path, lights suburbs as it passes, loops, pauses off-screen and renders a static all-lit map under `prefers-reduced-motion`.

## Adding things

- **Service**: add an object to `data/services.json` (slug, name, descriptor, icon key from icons.js, image base name, h1, title ≤ 60, metaDescription ≤ 155, keyword, card, lede, sections[], faqs[], related[]). It appears in the nav dropdown, home cards, services index, footer and sitemap automatically.
- **Blog post**: add to `data/posts.json` (slug, title, metaTitle, date, excerpt ≤ 155, image, imageAlt, relatedService, bodyHtml). BlogPosting schema is generated.
- **Suburb**: add to `data/suburbs.json` (name, postcode, lat, lon, optional route/label). Feeds the map, the areas page, footer and `areaServed`.
- **Photos**: drop JPEGs in `assets/img/src/`, run `npm run images`, reference by base name.

## Deploy (Vercel)

Project `garden-grit` exists in the Vercel team. Connect it to this GitHub repo (production branch `main`), build command `npm run build`, output directory `site`. Add `gardengrit.com.au` + `www` (redirect www → apex). After DNS cut-over, submit `https://www.gardengrit.com.au/sitemap.xml` in Search Console and update the GBP website link.

Old Wix URLs are 301'd in `vercel.json`: `/about`, `/services`, `/services-1` (Workshops → About#workshops), `/terms-conditions` (→ Contact; no T&C copy was supplied), `/home`, `/book-an-appointment`, `/contact-info`.
