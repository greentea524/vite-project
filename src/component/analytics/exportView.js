/**
 * CSV and PNG export.
 *
 * The PNG path serializes the chart's own SVG rather than screenshotting the
 * page: the charts carry inline presentation attributes (see palette.js), so a
 * detached copy renders identically without a stylesheet.
 */

export const PNG_SCALE = 2;

export function slugifyRange(range) {
  if (!range) return "all";
  return `${range.start}_${range.end}`;
}

export function exportFileName(kind, range, extra) {
  const parts = ["github-activity", slugifyRange(range)];
  if (extra) parts.push(extra);
  return `${parts.join("_")}.${kind}`;
}

/**
 * Serializes an <svg> element into a standalone document string.
 *
 * The namespace and explicit pixel width/height matter: without them the
 * browser refuses to load the result as an image, which is the usual reason an
 * "export PNG" button produces a blank canvas.
 */
export function serializeSvg(svg, { width, height }) {
  const clone = svg.cloneNode(true);
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));
  return new XMLSerializer().serializeToString(clone);
}

export function svgDataUrl(source) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not rasterize the chart"));
    image.src = src;
  });
}

/**
 * Rasterizes an <svg> onto an opaque canvas. The background fill is not
 * optional — a transparent PNG dropped into a light document turns the dark
 * theme's pale text invisible.
 */
export async function svgToPngBlob(svg, { width, height, background }) {
  const source = serializeSvg(svg, { width, height });
  const image = await loadImage(svgDataUrl(source));

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * PNG_SCALE);
  canvas.height = Math.round(height * PNG_SCALE);

  const context = canvas.getContext("2d");
  context.scale(PNG_SCALE, PNG_SCALE);
  context.fillStyle = background;
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Could not encode the PNG"));
    }, "image/png");
  });
}

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * Stacks the dashboard's chart SVGs into one detached document for export.
 *
 * Cloning works because the charts carry inline presentation attributes rather
 * than CSS classes — the clone needs no stylesheet to look like the original.
 * The caption goes in so the exported image says which slice it is; a PNG of a
 * filtered dashboard is misleading without it.
 */
export function composeSvg(nodes, { background, caption, captionColor, gap = 14, padding = 16 }) {
  const parts = nodes.filter(Boolean);
  const captionHeight = caption ? 26 : 0;

  let width = 0;
  let height = padding + captionHeight;

  const placed = parts.map((node) => {
    const nodeWidth = Number(node.getAttribute("width")) || node.clientWidth || 0;
    const nodeHeight = Number(node.getAttribute("height")) || node.clientHeight || 0;
    const top = height;
    width = Math.max(width, nodeWidth);
    height += nodeHeight + gap;
    return { node, top };
  });

  height = height - (parts.length ? gap : 0) + padding;
  width += padding * 2;

  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("xmlns", SVG_NS);
  svg.setAttribute("width", String(width));
  svg.setAttribute("height", String(height));
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);

  const backdrop = document.createElementNS(SVG_NS, "rect");
  backdrop.setAttribute("width", String(width));
  backdrop.setAttribute("height", String(height));
  backdrop.setAttribute("fill", background);
  svg.appendChild(backdrop);

  if (caption) {
    const text = document.createElementNS(SVG_NS, "text");
    text.setAttribute("x", String(padding));
    text.setAttribute("y", String(padding + 12));
    text.setAttribute("font-size", "13");
    text.setAttribute("font-family", "system-ui, sans-serif");
    text.setAttribute("fill", captionColor);
    // Untrusted-ish text; never build this with innerHTML.
    text.appendChild(document.createTextNode(caption));
    svg.appendChild(text);
  }

  placed.forEach(({ node, top }) => {
    const group = document.createElementNS(SVG_NS, "g");
    group.setAttribute("transform", `translate(${padding}, ${top})`);
    group.appendChild(node.cloneNode(true));
    svg.appendChild(group);
  });

  return { svg, width, height };
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Safari needs the URL to outlive the click, so release it on the next turn.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function downloadText(text, filename, type = "text/csv;charset=utf-8;") {
  downloadBlob(new Blob([text], { type }), filename);
}
