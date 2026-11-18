import { cleanSvg, svgAspectRatio, svgDataUri, svgPage } from './svg';

const picture = '<svg viewBox="0 0 200 100"><circle cx="50" cy="50" r="40" fill="teal"/></svg>';

describe('cleanSvg', () => {
  it('keeps a plain picture and adds the namespace', () => {
    const result = cleanSvg(picture);
    expect(result).toMatchObject({ ok: true });
    if (result.ok) expect(result.svg).toBe('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"><circle cx="50" cy="50" r="40" fill="teal"/></svg>');
  });

  it('takes the picture out of a code fence and surrounding XML', () => {
    const result = cleanSvg('```svg\n<?xml version="1.0"?>\n<!-- drawn -->\n' + picture + '\n```');
    expect(result.ok && result.svg.startsWith('<svg')).toBe(true);
  });

  it('keeps styles and animation', () => {
    const animated = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><style>.a{fill:red}</style><rect class="a" width="5" height="5"><animate attributeName="x" from="0" to="5" dur="1s" repeatCount="indefinite"/></rect></svg>';
    expect(cleanSvg(animated)).toEqual({ ok: true, svg: animated, changed: false });
  });

  it('removes scripts, handlers, embedded documents and outside links', () => {
    const hostile = [
      '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)">',
      '<script>alert(2)</script><script href="x.js"/>',
      '<foreignObject><iframe src="https://evil.test"></iframe></foreignObject>',
      '<a href="javascript:alert(3)"><text>x</text></a>',
      '<image href="https://evil.test/track.png"/>',
      '<use xlink:href="#shape"/>',
      '<rect style="fill:url(https://evil.test/a)"/><rect fill="url(#grad)"/>',
      '<style>@import url(https://evil.test/a.css); .b{}</style>',
      '</svg>',
    ].join('');
    const result = cleanSvg(hostile);
    if (!result.ok) throw new Error('should clean, not refuse');
    expect(result.changed).toBe(true);
    for (const banned of ['onload', '<script', 'alert', 'foreignObject', 'iframe', 'javascript:', 'evil.test', '@import']) {
      expect(result.svg).not.toContain(banned);
    }
    expect(result.svg).toContain('xlink:href="#shape"');
    expect(result.svg).toContain('fill="url(#grad)"');
  });

  it('refuses text that is not an SVG picture, or is too large', () => {
    expect(cleanSvg('  ')).toEqual({ ok: false, reason: 'empty' });
    expect(cleanSvg('<div>hi</div>')).toEqual({ ok: false, reason: 'notSvg' });
    expect(cleanSvg(`<svg>${'<g/>'.repeat(20_000)}</svg>`)).toEqual({ ok: false, reason: 'tooLarge' });
  });
});

describe('svg helpers', () => {
  it('works out the shape from the viewBox, the size, or a default', () => {
    expect(svgAspectRatio(picture)).toBe(2);
    expect(svgAspectRatio('<svg width="300px" height="150"></svg>')).toBe(2);
    expect(svgAspectRatio('<svg></svg>')).toBeCloseTo(4 / 3);
    expect(svgAspectRatio('<svg viewBox="0 0 1000 10"></svg>')).toBe(5);
  });

  it('builds a data address and a page that allows no scripts or requests', () => {
    expect(svgDataUri('<svg/>')).toBe('data:image/svg+xml;charset=utf-8,%3Csvg%2F%3E');
    const page = svgPage('<svg/>', '#fff');
    expect(page).toContain("default-src 'none'");
    expect(page).not.toContain('script-src');
  });
});
