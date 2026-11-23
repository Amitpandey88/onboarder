# amit.codes

Personal portfolio for Amit Pandey: AI, data and software. This is a static,
dependency-free site with no analytics, forms or build step.

## Preview

```sh
python3 -m http.server 4326 --bind 127.0.0.1 --directory portfolio-site
```

Open http://127.0.0.1:4326/.

## Content

- `index.html`: portfolio, selected work and contact links.
- `privacy.html` and `404.html`: supporting pages.
- `styles.css`, `theme-init.js`, `app.js`: theme, responsive navigation and reveals.
- `assets/`: portrait, real Onboarder captures, favicon and social image.

## Deploy

Publish the complete `portfolio-site/` directory to a new immutable release, then
atomically switch the `amit.codes` document root. Keep the previous release for
rollback. Nginx supplies CSP, HSTS, clickjacking and MIME protections.

The canonical domains are `https://amit.codes/` and `https://onboarder.amit.codes/`.
Legacy `*.intellimatrix.in` hostnames redirect to the new domains.
