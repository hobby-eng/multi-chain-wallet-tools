// Layout check of the built standalone tools in a real browser. Synthetic data only.
//
//   node tooling/check-layout.mjs [--profile multi-chain|dash-community|all] [--tool <id>]
//                                 [--widths 1280,768,390] [--json <file>] [page.html ...]
//   node tooling/check-layout.mjs --self-test
//
// Without page arguments it checks every built tool of the chosen profiles in dist/ (build them
// first with `pnpm build:html`). It opens each page at every width, walks through its tabs and
// modes two levels deep and, in the Key Derivation Tool, also generates a phrase, switches coins
// and opens a BIP85 child wallet for every coin. In every state it reports:
//
//   empty-grid-cell    a shown grid cell with nothing visible in it, which shifts the cells after it
//   page-sideways      the whole page is wider than the window, so it scrolls sideways
//   past-right-edge    an element ends past the window and no scrolling box around it holds it
//   content-overflow   text or children wider than their own box, so they spill or are cut
//   button-font-size   a text button whose font size is not the one size buttons use
//   buttons-touching   two neighbouring buttons in one row with no gap between them
//   controls-overlap   two controls drawn on top of each other
//   uneven-row         buttons of one kind side by side in one row with different heights
//   style-variant      buttons of one kind (the same classes) that differ in font size, weight,
//                      corner radius, padding or, on one line, height, across all checked pages
//                      at the same width; the less common look is reported
//
// tooling/layout-allowlist.json lists deliberate exceptions, each with its reason; a finding is
// skipped when its element is inside an element that an entry's selector matches. The exit status
// is 1 when anything else is found. --self-test checks the checks themselves on a small page with
// known defects and known correct parts.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { BUILD_PROFILES, getToolBuild, profileToolIds } from './build-profiles.mjs';
import { loadPlaywright } from './playwright-loader.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PHONE_WIDTH = 390;
/** Between the 880px and 720px breakpoints of the shared style, where the layout changes again. */
const TABLET_WIDTH = 768;
const DESKTOP_WIDTH = 1280;
/** How deep tabs inside tabs are followed; two levels reach every operation panel. */
const TAB_DEPTH = 2;
/** Time for a page to settle after a click; the tools render synchronously or within a frame. */
const SETTLE_MS = 150;
const TAB_SELECTOR = [
  '[role=tab]',
  '[data-recovery-tab]',
  '[data-operation-tab]',
  '.protocol-tab',
  '.primary-mode-tab',
  '[data-mode]',
  '.result-branch-tabs button',
].join(', ');

function option(name) {
  const index = process.argv.indexOf(name);
  if (index >= 0) return process.argv[index + 1];
  return process.argv.find((argument) => argument.startsWith(`${name}=`))?.slice(name.length + 1);
}

/**
 * Runs in the page. Returns the findings of one state; `allowlist` entries whose selector contains
 * the offending element are left out.
 */
function inspectPage({ allowlist, buttonFontSizes }) {
  const findings = [];
  const width = document.documentElement.clientWidth;
  const visible = (el) => {
    // The content of a closed <details> still has a box in Chromium, but it is not shown.
    if (el.closest('details:not([open])') && !el.matches('details, summary') && !el.closest('summary')) return false;
    if (el.closest('dialog:not([open])')) return false;
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
    const box = el.getBoundingClientRect();
    return box.width > 0 && box.height > 0;
  };
  const STATE_CLASSES = new Set(['active', 'selected', 'is-active', 'open']);
  const kindOf = (button) => {
    const classes = [...button.classList].filter((name) => !STATE_CLASSES.has(name)).sort();
    if (classes.length > 0) return `button.${classes.join('.')}`;
    const row = button.parentElement;
    return `${row.id ? `#${row.id}` : `.${[...row.classList].sort().join('.')}`} > button`;
  };
  const describe = (el) => {
    const parts = [];
    for (let node = el; node && node !== document.body && parts.length < 4; node = node.parentElement) {
      const classes = [...node.classList].slice(0, 2).join('.');
      parts.unshift(node.id ? `#${node.id}` : `${node.tagName.toLowerCase()}${classes ? `.${classes}` : ''}`);
    }
    return parts.join(' > ');
  };
  const allowed = (check, el) =>
    allowlist.some((entry) => entry.check === check && entry.within.some((selector) => el.closest(selector)));
  const report = (check, el, detail = '') => {
    if (!allowed(check, el)) findings.push({ check, element: describe(el), detail });
  };
  const ownText = (el) =>
    [...el.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
  const isContent = (el) =>
    el.matches(
      'input:not([type=hidden]), select, textarea, button, img, canvas, svg, video, hr, code, pre, progress, meter',
    ) || ownText(el);
  const hasVisibleContent = (el) =>
    isContent(el) || [...el.querySelectorAll('*')].some((child) => visible(child) && isContent(child));
  const decorative = (el) => el.closest('[aria-hidden="true"]') !== null;
  const scrollsOrClips = (el) => ['auto', 'scroll', 'hidden', 'clip'].includes(getComputedStyle(el).overflowX);
  /** True when a box around the element scrolls or clips sideways and itself fits the window. */
  const heldBySideScroller = (el) => {
    for (let node = el.parentElement; node && node !== document.body; node = node.parentElement) {
      if (scrollsOrClips(node)) return node.getBoundingClientRect().right <= width + 1;
    }
    return false;
  };

  if (document.documentElement.scrollWidth > width + 1) {
    report('page-sideways', document.body, `${document.documentElement.scrollWidth}px in a ${width}px window`);
  }
  for (const grid of document.querySelectorAll('body *')) {
    if (!visible(grid) || !getComputedStyle(grid).display.includes('grid')) continue;
    for (const cell of grid.children) {
      if (!visible(cell) || getComputedStyle(cell).display === 'contents') continue;
      if (!hasVisibleContent(cell)) report('empty-grid-cell', cell);
    }
  }
  for (const el of document.querySelectorAll('body *')) {
    if (!visible(el) || decorative(el)) continue;
    const box = el.getBoundingClientRect();
    // Report only the outermost element past the edge, not each of its children again.
    const parent = el.parentElement;
    const parentPast = parent && parent !== document.body && parent.getBoundingClientRect().right > width + 1;
    if (box.right > width + 1 && !parentPast && !heldBySideScroller(el)) {
      report('past-right-edge', el, `ends at ${Math.round(box.right)}px`);
    }
  }
  // Content that spills out of a box that neither scrolls nor ends it with an ellipsis: text that
  // runs past the box, or a child control or text block that ends past it. Decoration is ignored.
  for (const el of document.querySelectorAll('body *')) {
    if (!visible(el) || decorative(el) || el.matches('input, select, textarea, table, svg, svg *')) continue;
    const style = getComputedStyle(el);
    if (['auto', 'scroll'].includes(style.overflowX) || style.textOverflow === 'ellipsis') continue;
    const box = el.getBoundingClientRect();
    const textSpills = ownText(el) && el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0;
    const childSpills = [...el.children].some((child) => {
      if (!visible(child) || decorative(child) || getComputedStyle(child).position === 'absolute') return false;
      return child.getBoundingClientRect().right > box.right + 2 && hasVisibleContent(child);
    });
    if (textSpills || childSpills)
      report('content-overflow', el, `${el.scrollWidth}px of content in ${el.clientWidth}px`);
  }
  const buttons = [...document.querySelectorAll('button')].filter(visible);
  for (const button of buttons) {
    // Icon buttons carry no text to size; their size is the icon's.
    if (!button.textContent.trim() || button.querySelector('svg')) continue;
    const size = getComputedStyle(button).fontSize;
    if (!buttonFontSizes.includes(size)) report('button-font-size', button, size);
  }
  for (const button of buttons) {
    const next = button.nextElementSibling;
    if (!next || !visible(next) || !next.matches('button, label.secondary, .payment-qr-action')) continue;
    const a = button.getBoundingClientRect();
    const b = next.getBoundingClientRect();
    const sameRow = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 4;
    // Touching means a gap of at most 4px; buttons drawn over each other are controls-overlap.
    const gap = b.left - a.right;
    if (sameRow && gap > -2 && gap < 4) report('buttons-touching', button, `next: ${describe(next)}`);
  }
  const controls = [...document.querySelectorAll('button, input:not([type=hidden]), select, textarea, a[href]')].filter(
    visible,
  );
  for (let i = 0; i < controls.length; i += 1) {
    const a = controls[i].getBoundingClientRect();
    for (let j = i + 1; j < controls.length; j += 1) {
      if (controls[i].contains(controls[j]) || controls[j].contains(controls[i])) continue;
      const b = controls[j].getBoundingClientRect();
      const across = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const down = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (across > 1 && down > 1) report('controls-overlap', controls[i], `over ${describe(controls[j])}`);
    }
  }
  // Buttons of one kind side by side in one row must be equally tall.
  for (const button of buttons) {
    const next = button.nextElementSibling;
    if (!next || !visible(next) || next.tagName !== 'BUTTON' || kindOf(next) !== kindOf(button)) continue;
    const a = button.getBoundingClientRect();
    const b = next.getBoundingClientRect();
    if (Math.abs(a.top - b.top) < 4 && Math.abs(a.height - b.height) > 1) {
      report('uneven-row', button, `${Math.round(a.height)}px next to ${Math.round(b.height)}px`);
    }
  }
  const samples = [];
  for (const button of buttons) {
    if (!button.textContent.trim() || button.querySelector('svg')) continue;
    const style = getComputedStyle(button);
    const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.3;
    const padding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
    const oneLine = button.getBoundingClientRect().height - padding < lineHeight * 1.6;
    samples.push({
      kind: kindOf(button),
      element: describe(button),
      look: [
        `font ${style.fontSize}`,
        `weight ${style.fontWeight}`,
        `radius ${style.borderTopLeftRadius}`,
        `padding ${style.paddingTop} ${style.paddingRight}`,
        oneLine ? `height ${Math.round(button.getBoundingClientRect().height)}px` : 'height (wraps)',
      ],
      allowed: allowlist.some(
        (entry) => entry.check === 'style-variant' && entry.within.some((s) => button.closest(s)),
      ),
    });
  }
  return { findings, samples };
}

class Recorder {
  constructor(options) {
    this.options = options;
    this.findings = new Map();
    /** kind @ width → look → examples; compared across all pages at the end. */
    this.looks = new Map();
  }

  async record(scope, state) {
    let found = [];
    let samples = [];
    try {
      ({ findings: found, samples } = await scope.evaluate(inspectPage, this.options));
    } catch {
      return; // A frame that navigated away or closed has nothing to inspect.
    }
    for (const sample of samples) {
      if (sample.allowed) continue;
      const kind = `${sample.kind} @${this.width}`;
      if (!this.looks.has(kind)) this.looks.set(kind, new Map());
      for (const part of sample.look) {
        const [property] = part.split(' ');
        const key = `${property}\u0000${part}`;
        const variants = this.looks.get(kind);
        if (!variants.has(key)) variants.set(key, new Set());
        if (variants.get(key).size < 3) variants.get(key).add(`${sample.element} (${state})`);
      }
    }
    for (const finding of found) {
      const key = `${finding.check}  ${finding.element}`;
      if (!this.findings.has(key)) this.findings.set(key, { ...finding, states: [] });
      const entry = this.findings.get(key);
      if (entry.states.length < 5) entry.states.push(`${state}${finding.detail ? ` (${finding.detail})` : ''}`);
    }
  }
}

/** Turns the collected looks into style-variant findings: the less common values of a property. */
function styleVariants(recorder) {
  const findings = [];
  for (const [kind, variants] of recorder.looks) {
    const byProperty = new Map();
    for (const [key, examples] of variants) {
      const [property, value] = key.split('\u0000');
      if (value === 'height (wraps)') continue;
      if (!byProperty.has(property)) byProperty.set(property, []);
      byProperty.get(property).push({ value, examples: [...examples] });
    }
    for (const [property, values] of byProperty) {
      if (values.length < 2) continue;
      values.sort((a, b) => b.examples.length - a.examples.length);
      for (const rare of values.slice(1)) {
        findings.push({
          check: 'style-variant',
          element: `${kind}: ${rare.value} where most have ${values[0].value}`,
          states: rare.examples,
        });
      }
    }
  }
  return findings;
}

async function settle(page) {
  await page.waitForTimeout(SETTLE_MS);
}

/** Clicks every visible tab of `scope` and records each state; follows tabs inside tabs. */
async function walkTabs(page, scope, recorder, state, depth, seen = new Set()) {
  const count = await scope.locator(TAB_SELECTOR).count();
  for (let index = 0; index < count; index += 1) {
    const tab = scope.locator(TAB_SELECTOR).nth(index);
    if (!(await tab.isVisible().catch(() => false))) continue;
    const label = ((await tab.textContent().catch(() => '')) ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);
    // Tabs are told apart by their place in the page: "Encode" exists in every backup panel.
    const key = await tab
      .evaluate((el) => {
        const steps = [];
        for (let node = el; node && node !== document.body; node = node.parentElement) {
          steps.unshift(node.id ? `#${node.id}` : `${node.tagName}:${[...node.parentElement.children].indexOf(node)}`);
          if (node.id) break;
        }
        return steps.join('>');
      })
      .catch(() => label);
    if (seen.has(key)) continue;
    seen.add(key);
    await tab.click({ timeout: 2000 }).catch(() => {});
    await settle(page);
    await recorder.record(scope, `${state} › ${label}`);
    if (depth > 1) await walkTabs(page, scope, recorder, `${state} › ${label}`, depth - 1, seen);
  }
}

/** Selects every option of a coin select in turn and records each state. */
async function eachCoin(page, selector, recorder, state) {
  const values = await page
    .locator(`${selector} option`)
    .evaluateAll((options) => options.map((option) => option.value))
    .catch(() => []);
  for (const value of values) {
    await page
      .locator(selector)
      .selectOption(value)
      .catch(() => {});
    await settle(page);
    await recorder.record(page, `${state} coin ${value}`);
  }
}

/** The Key Derivation Tool's states beyond its tabs: a phrase, every coin and a BIP85 child wallet. */
async function deriverStates(page, recorder, state) {
  if ((await page.locator('#generate-12').count()) === 0) return;
  await page.locator('#generate-12').click();
  await page.waitForTimeout(1500);
  await recorder.record(page, `${state} generated`);
  await eachCoin(page, '#coin', recorder, state);
  if ((await page.locator('#include-bip85').count()) === 0) return;
  await page.locator('#include-bip85').check();
  await page.locator('#bip85-tab').click();
  await page.locator('#derive-bip85').click();
  await page.waitForTimeout(1500);
  await recorder.record(page, `${state} BIP85`);
  await page.locator('#open-bip85-wallet').click();
  await settle(page);
  await recorder.record(page, `${state} child wallet`);
  await eachCoin(page, '#bip85-wallet-coin', recorder, `${state} child`);
}

async function checkPage(browser, path, width, recorder) {
  recorder.width = width;
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  page.setDefaultTimeout(10000);
  await page.goto(pathToFileURL(path).href);
  // Wait for the start-up self-tests of the tools, which change the page when they finish.
  await page.locator('#crypto-self-test-status.passed, #viewer-crypto-self-test-status.passed, body').first().waitFor();
  await page.waitForTimeout(2500);
  const state = `${path.split('/').pop()} @${width}`;
  await recorder.record(page, state);
  await deriverStates(page, recorder, state);
  await walkTabs(page, page, recorder, state, TAB_DEPTH);
  for (const frame of page.frames().slice(1)) {
    await recorder.record(frame, `${state} frame`);
    await walkTabs(page, frame, recorder, `${state} frame`, TAB_DEPTH);
  }
  await page.close();
}

function builtPages() {
  const requested = option('--profile') ?? 'all';
  const profiles = requested === 'all' ? Object.values(BUILD_PROFILES) : [BUILD_PROFILES[requested]];
  if (profiles.includes(undefined)) throw new Error(`Unknown profile "${requested}".`);
  const tool = option('--tool');
  return profiles.flatMap((profile) =>
    profileToolIds(profile)
      .filter((id) => tool === undefined || id === tool)
      .map((id) => resolve(root, 'dist', getToolBuild(profile, id).artifactRelativePath)),
  );
}

function pageArguments() {
  const valued = new Set(['--profile', '--tool', '--widths', '--json']);
  return process.argv
    .slice(2)
    .filter((argument, index, all) => !argument.startsWith('--') && !valued.has(all[index - 1]));
}

async function run(paths, widths, allowlist) {
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch();
  const recorder = new Recorder({ allowlist, buttonFontSizes: allowlist.buttonFontSizes });
  try {
    for (const path of paths) for (const width of widths) await checkPage(browser, path, width, recorder);
  } finally {
    await browser.close();
  }
  return [...recorder.findings.values(), ...styleVariants(recorder)].sort((a, b) =>
    `${a.check}${a.element}`.localeCompare(`${b.check}${b.element}`),
  );
}

function readAllowlist() {
  const file = JSON.parse(readFileSync(resolve(root, 'tooling/layout-allowlist.json'), 'utf8'));
  const entries = file.entries;
  entries.buttonFontSizes = file.buttonFontSizes;
  return entries;
}

/** A page with one instance of every defect and correct parts that must stay silent. */
const SELF_TEST_PAGE = `<!doctype html><html><head><style>
  body { margin: 0; font: 12px sans-serif; }
  button { font-size: 12px; }
  .grid { display: grid; grid-template-columns: repeat(3, 100px); }
  .row { display: flex; gap: 8px; }
  .tight { display: flex; gap: 0; }
  .scroller { overflow-x: auto; width: 300px; }
  .box { width: 80px; white-space: nowrap; }
  .stack { position: relative; height: 40px; }
  .stack button { position: absolute; left: 0; top: 0; }
</style></head><body>
  <div class="grid" id="grid"><div id="empty-cell"></div><div>text</div><input id="input-cell"></div>
  <div id="too-wide" style="width: 1400px">wide</div>
  <div class="row"><button>Fine</button><button>Fine</button></div>
  <div class="tight"><button id="touching">One</button><button>Two</button></div>
  <button id="big-text" style="font-size: 14px">Big</button>
  <div class="box" id="spill">a long line that does not fit</div>
  <div class="stack"><button id="under">Under</button><button>Over</button></div>
  <div class="scroller"><table style="width: 2000px"><tr><td>held</td></tr></table></div>
  <details><summary>closed</summary><div style="width: 3000px">hidden</div></details>
  <div class="row"><button class="chip">A</button><button class="chip">B</button><button class="chip" id="odd-chip" style="border-radius: 2px">C</button></div>
  <div class="row" style="align-items: flex-start"><button class="pair" id="short">Short</button><button class="pair" style="height: 60px">Tall</button></div>
  <div aria-hidden="true" style="position: absolute; left: 1300px; top: 0; width: 300px">decoration</div>
</body></html>`;

const SELF_TEST_EXPECTED = [
  ['empty-grid-cell', '#empty-cell'],
  ['page-sideways', ''],
  ['past-right-edge', '#too-wide'],
  ['buttons-touching', '#touching'],
  ['button-font-size', '#big-text'],
  ['content-overflow', '#spill'],
  ['controls-overlap', '#under'],
  ['style-variant', 'radius 2px'],
  ['uneven-row', '#short'],
];

async function selfTest() {
  const directory = mkdtempSync(join(tmpdir(), 'check-layout-'));
  try {
    const page = join(directory, 'self-test.html');
    writeFileSync(page, SELF_TEST_PAGE);
    const allowlist = [];
    allowlist.buttonFontSizes = ['12px'];
    const findings = await run([page], [DESKTOP_WIDTH], allowlist);
    const missing = SELF_TEST_EXPECTED.filter(
      ([check, element]) => !findings.some((f) => f.check === check && f.element.includes(element)),
    );
    const unexpected = findings.filter(
      (f) => !SELF_TEST_EXPECTED.some(([check, element]) => f.check === check && f.element.includes(element)),
    );
    for (const [check, element] of missing) console.error(`missed: ${check} ${element}`);
    for (const f of unexpected) console.error(`false alarm: ${f.check} ${f.element}`);
    if (missing.length || unexpected.length) process.exit(1);
    console.log(`Self-test passed: all ${SELF_TEST_EXPECTED.length} known defects found, no false alarms.`);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

if (process.argv.includes('--self-test')) {
  await selfTest();
} else {
  const paths = pageArguments().length > 0 ? pageArguments().map((path) => resolve(path)) : builtPages();
  const widths = (option('--widths') ?? `${DESKTOP_WIDTH},${TABLET_WIDTH},${PHONE_WIDTH}`).split(',').map(Number);
  const findings = await run(paths, widths, readAllowlist());
  for (const finding of findings) {
    console.log(`${finding.check}: ${finding.element}\n    ${finding.states.join('\n    ')}`);
  }
  const json = option('--json');
  if (json !== undefined) writeFileSync(resolve(json), `${JSON.stringify(findings, null, 2)}\n`);
  console.log(
    findings.length === 0
      ? `No layout findings in ${paths.length} page(s) at ${widths.join(' and ')}px.`
      : `${findings.length} layout finding(s) in ${paths.length} page(s).`,
  );
  process.exitCode = findings.length === 0 ? 0 : 1;
}
