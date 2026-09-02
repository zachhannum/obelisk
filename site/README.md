# The Obelisk docs site

Astro and Starlight, with the default theme replaced. `src/pages/index.astro`
is the landing page and takes precedence over Starlight's catch-all route; the
docs themselves are markdown under `src/content/docs/`.

```bash
npm install
npm run dev      # localhost:4321
npm run build    # → dist/
```

The product shot on the landing page comes from `test/`, which drives a real
Obsidian and writes the six PNGs under `src/assets/shots/`. Rerun `npm run
shots` from the repo root after anything that changes what the sidebar looks
like, the palette included.

`src/styles/tokens.css` holds the palette, the fonts and the texture;
`src/styles/landing.css` and `src/styles/starlight.css` are the two consumers.
Both themes are defined in tokens (dark on `:root`, light under
`:root[data-theme="light"]`), so nothing else needs a media query.

A hue is spent only where it means something: `--ob-accent` is the mark and
anything you can act on, `--ob-support` is the agent's half, `--ob-green` and
`--ob-red` are attached and detached. The ground is flat under one noise tile,
which `.ob-ground` puts on a section together. The noise needs an opaque
background beneath it to blend with.

The site is served from `obelisk.typeworks.dev`, so it has no base path.
`public/CNAME` carries the domain, because GitHub Pages drops it on every
deploy otherwise.
