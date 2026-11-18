/**
 * SVG pictures written by people or language models, made safe to show.
 *
 * Pictures are drawn where scripts cannot run (an <img> on the web, a web view with JavaScript and
 * network turned off on phones), so cleaning here is a second line of defence: it removes scripts,
 * event handlers, embedded documents and links to anything outside the picture itself.
 */

/** Pictures larger than this are refused. A diagram worth showing in a lesson is far smaller. */
export const SVG_MAX_LENGTH = 60_000;

export type SvgResult = { ok: true; svg: string; changed: boolean } | { ok: false; reason: 'empty' | 'notSvg' | 'tooLarge' };

/** Removes what could run code or load something from outside. Keeps drawing, styles and animation. */
export function cleanSvg(input: string): SvgResult {
  let svg = input.trim();
  if (!svg) return { ok: false, reason: 'empty' };

  // A chatbot often wraps the picture in a code fence.
  const fenced = /^```[a-z]*\s*\n([\s\S]*?)\n?```$/i.exec(svg);
  if (fenced) svg = fenced[1].trim();

  svg = svg
    .replace(/<\?xml[\s\S]*?\?>/gi, '')
    .replace(/<!DOCTYPE[\s\S]*?>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .trim();

  const start = svg.search(/<svg[\s>]/i);
  const end = svg.toLowerCase().lastIndexOf('</svg>');
  if (start < 0 || end < start) return { ok: false, reason: 'notSvg' };
  svg = svg.slice(start, end + '</svg>'.length);
  if (svg.length > SVG_MAX_LENGTH) return { ok: false, reason: 'tooLarge' };

  const before = svg;
  svg = svg
    // Elements that run code or embed other documents, with their content.
    .replace(/<(script|foreignObject|iframe|object|embed|audio|video|handler|listener)\b[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<(script|foreignObject|iframe|object|embed|audio|video|handler|listener)\b[^>]*\/?>/gi, '')
    // Event handlers such as onload="…".
    .replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    // Links may only point inside the picture (#id) or at an embedded raster image.
    .replace(/\s+(xlink:)?href\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, (attribute, _prefix, value: string) => {
      const target = value.replace(/^["']|["']$/g, '').trim();
      return target.startsWith('#') || /^data:image\/(png|jpe?g|gif|webp);/i.test(target) ? attribute : '';
    })
    // Styles must not fetch anything: url(...) may only point inside the picture.
    .replace(/url\(\s*(['"]?)(?!#)[^)]*\1\s*\)/gi, 'none')
    .replace(/@import[^;]*;?/gi, '')
    .replace(/javascript:/gi, '');

  // Shown as a data address on the web, which needs the namespace.
  if (!/<svg[^>]*\sxmlns\s*=/i.test(svg)) svg = svg.replace(/<svg/i, '<svg xmlns="http://www.w3.org/2000/svg"');

  return { ok: true, svg, changed: svg !== before };
}

/** Width divided by height, from the viewBox or the width and height. 4:3 when neither says. */
export function svgAspectRatio(svg: string): number {
  const open = /<svg\b[^>]*>/i.exec(svg)?.[0] ?? '';
  const viewBox = /viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(open);
  let ratio = viewBox ? Number(viewBox[1]) / Number(viewBox[2]) : NaN;
  if (!Number.isFinite(ratio) || ratio <= 0) {
    const width = /\swidth\s*=\s*["']?([\d.]+)(px)?["'\s>]/i.exec(open);
    const height = /\sheight\s*=\s*["']?([\d.]+)(px)?["'\s>]/i.exec(open);
    ratio = width && height ? Number(width[1]) / Number(height[1]) : NaN;
  }
  if (!Number.isFinite(ratio) || ratio <= 0) return 4 / 3;
  return Math.min(5, Math.max(0.2, ratio));
}

/** The picture as a data address, for an <img>. */
export function svgDataUri(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/**
 * A page holding only the picture, scaled to the width it is given. The content security policy
 * blocks every script and every request, in case anything slipped through the cleaning.
 */
export function svgPage(svg: string, background: string): string {
  return [
    '<!doctype html><html><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">',
    `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:">`,
    `<style>html,body{margin:0;padding:0;background:${background};overflow:hidden}svg{display:block;width:100%;height:100vh}`,
    // People who turn on "reduce motion" see the picture still. SMIL animation cannot be paused from CSS.
    '@media (prefers-reduced-motion: reduce){*{animation:none!important;transition:none!important}}</style>',
    `</head><body>${svg}</body></html>`,
  ].join('');
}
