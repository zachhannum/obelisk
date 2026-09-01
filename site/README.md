# The Obelisk docs site

Astro and Starlight, with the default theme replaced. `src/pages/index.astro`
is the landing page and takes precedence over Starlight's catch-all route; the
docs themselves are markdown under `src/content/docs/`.

```bash
npm install
npm run dev      # localhost:4321
npm run build    # → dist/
```

The product shot on the landing page is markup rather than a capture
(`src/components/Screenshot.astro`), so it stays sharp, follows the theme, and
can be read aloud. It is a recreation of the plugin's own DOM and CSS, which
means it drifts if the sidebar changes and nobody updates it.

`src/styles/tokens.css` holds the palette, the fonts and the two textures;
`src/styles/landing.css` and `src/styles/starlight.css` are the two consumers.
Both themes are defined in tokens (dark on `:root`, parchment under
`:root[data-theme="light"]`), so nothing else needs a media query.

The site is served from `obelisk.typeworks.dev`, so it has no base path.
`public/CNAME` carries the domain, because GitHub Pages drops it on every
deploy otherwise.
