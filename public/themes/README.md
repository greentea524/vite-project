# Self-hosted retro Windows theme stylesheets

Vendored copies of the theme CSS (plus the font files they reference) that
used to be loaded from unpkg at runtime. Serving them from `public/` removes
the flash of unstyled content on page load and the dependency on a
third-party CDN.

| Folder | Package | Version | Source |
| ------ | ------- | ------- | ------ |
| `98/`  | [98.css](https://github.com/jdan/98.css) | 0.1.21 | `98.css/dist/` |
| `xp/`  | [xp.css](https://github.com/botoxparty/XP.css) | 0.2.6 | `xp.css/dist/` |
| `7/`   | [7.css](https://github.com/khang-nd/7.css) | 0.21.1 | `7.css/dist/` |

`7.css` embeds its assets as data URIs; `98.css` and `XP.css` reference the
sibling `.woff`/`.woff2` files, which must stay next to their CSS file.

To update a theme: `npm install <package>`, copy the files above from its
`dist/` folder into the matching directory here, update the version in this
table, then `npm uninstall` the package again.

The default theme is linked from `index.html` (`<link id="theme-css">`);
switching themes in the UI just swaps that link's `href` (see `src/App.jsx`).
