/**
 * Chart palette, resolved in JS rather than CSS.
 *
 * Two reasons it lives here and not in a stylesheet. The charts are inline SVG
 * that gets serialized for the PNG export, and a detached SVG carries no
 * stylesheet — colours have to be presentation attributes for the exported
 * image to look like the screen. And the palette has to be validated against a
 * known surface, which means the surface has to be a fixed value somebody can
 * point at.
 *
 * ## Why there is no dark variant
 *
 * The dashboard commits to a light surface in every theme, on purpose. Measured
 * in the browser across all three retro themes and both `prefers-color-scheme`
 * settings, the backdrop behind a panel is light in all six combinations:
 *
 *   theme      backdrop behind the panel     both schemes
 *   98.css     #c0c0c0  (window chrome)
 *   xp.css     #ece9d8  (window chrome)
 *   7.css      #ffffff  (window body)
 *
 * `index.css` does set `html` to #242424 under dark scheme, but every theme
 * stylesheet paints `body` white on top of it, so the dark ground never
 * reaches the page. Styling the dashboard dark-first — which is the convention
 * elsewhere in App.css — therefore renders pale grey text on a light window,
 * which is unreadable. (That is worth fixing app-wide; it is not this file's
 * job.) Rather than inherit an unknown composite, `.viz-panel` paints an opaque
 * surface and the charts paint the same one, so the validated numbers below
 * hold in every theme.
 *
 * Values are from the dataviz reference palette, validated with its
 * `validate_palette.js` against that surface:
 *
 *   accent + selection, --pairs all ..................... ALL CHECKS PASS
 *     CVD ΔE 24.7 (protan), normal-vision ΔE 33.6, both ≥ 3:1 vs surface
 *   heat ramp, --ordinal ................................ ALL CHECKS PASS
 *     monotone lightness, ΔL gaps ≥ 0.06, light end #86b6ef at 2.06:1
 */

/** The opaque panel surface every chart paints and every check was run against. */
export const SURFACE = "#fcfcfc";

export const PALETTE = {
  surface: SURFACE,
  accent: "#2a78d6",
  selection: "#eb6834",
  textPrimary: "#1b1f24",
  textSecondary: "#495057",
  textMuted: "#6c757d",
  grid: "#e3e6ea",
  axis: "#c8ccd2",
  empty: "#eceff3",
  brushFill: "rgba(42, 120, 214, 0.10)",
  outOfRange: "rgba(252, 252, 252, 0.66)",
  // Ordinal ramp, light → dark: more contributions reads darker.
  heat: ["#86b6ef", "#5598e7", "#256abf", "#104281"],
};
