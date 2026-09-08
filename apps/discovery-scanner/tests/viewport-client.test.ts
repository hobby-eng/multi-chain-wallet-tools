import { afterEach, expect, it, vi } from 'vitest';
import { installVaultViewportBridge } from '../src/viewport-client.js';

class Box {
  children: Box[] = [];
  visible = true;
  position = 'static';
  constructor(public bottom: number) {}
  getClientRects(): object[] { return this.visible ? [{}] : []; }
  getBoundingClientRect(): { bottom: number } { return { bottom: this.bottom }; }
}

afterEach(() => vi.unstubAllGlobals());

it('reports shrinking content even when the iframe keeps body height unchanged', () => {
  const body = new Box(1800), main = new Box(1500), footer = new Box(1800);
  const decoration = new Box(5000); decoration.position = 'absolute';
  const hidden = new Box(9000); hidden.visible = false;
  body.children = [decoration, main, footer, hidden];
  const observed = new Set<Box>();
  let resized: () => void = () => {};
  vi.stubGlobal('HTMLElement', Box);
  vi.stubGlobal('getComputedStyle', (box: Box) => ({ position: box.position }));
  vi.stubGlobal('document', { body });
  const postMessage = vi.fn();
  const window = Object.assign(new EventTarget(), { scrollY: 0, parent: { postMessage } });
  vi.stubGlobal('window', window);
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: () => void) { resized = callback; }
    observe(box: Box): void { observed.add(box); }
  });
  installVaultViewportBridge();
  expect(postMessage.mock.lastCall?.[0].height).toBe(1800);
  main.bottom = 700; footer.bottom = 1000;
  // Model a ResizeObserver delivery for a real content-box resize only.
  // The body's box stays 1800px because of min-height:100vh in the old frame.
  if (observed.has(main)) resized();
  expect(body.bottom).toBe(1800);
  expect(postMessage.mock.lastCall?.[0].height).toBe(1000);
  main.bottom = 2000; footer.bottom = 2300;
  if (observed.has(main)) resized();
  expect(postMessage.mock.lastCall?.[0].height).toBe(2300);
  window.scrollY = 50;
  window.dispatchEvent(new Event('resize'));
  expect(postMessage.mock.lastCall?.[0].height).toBe(2350);
});
