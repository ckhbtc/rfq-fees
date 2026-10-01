import { gunzipSync, gzipSync } from 'node:zlib';

export const RUNTIME_ID = '6e9628f8-7c69-4d95-ba49-2bc02f586457';
export const VENDOR_IDS = [
  '593fc449-6932-4ec2-9d25-2238880e4db2', // react 18.3.1
  '96e0c1a8-5cab-49d7-a485-b16ded7416ca', // react-dom 18.3.1
];
const RUNTIME_TAG = '<script src="./support.js"></script>';
const DC_OPEN_RE = /<x-dc(?:\s[^>]*)?>/;

// Mirrors encodeCamelAttrs in support.js: the bundle's template is parsed with
// DOMParser, which lowercases attribute names, so camelCase props such as
// onMouseEnter or viewBox travel as sc-camel-on-mouse-enter / sc-camel-view-box.
const CAMEL_ATTR_RE = /(\s)([a-z]+[A-Z][A-Za-z0-9]*)(\s*=)/g;

export function encodeCamelAttrs(html) {
  return html.replace(
    CAMEL_ATTR_RE,
    (_, space, name, equals) =>
      `${space}sc-camel-${name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}${equals}`,
  );
}

// Replaces the code between `// <lib:name>` and `// </lib:name>` markers with
// the given source, so the page carries the same tested helpers as lib/.
export function syncLibBlocks(source, blocks) {
  let result = source;
  for (const [name, code] of Object.entries(blocks)) {
    const open = `// <lib:${name}>\n`;
    const close = `// </lib:${name}>`;
    const start = result.indexOf(open);
    const end = result.indexOf(close, start);
    if (start === -1 || end === -1) {
      throw new Error(`missing lib:${name} markers in dashboard source`);
    }
    result =
      result.slice(0, start + open.length) + `${code}\n` + result.slice(end);
  }
  return result;
}

export function embedJson(value) {
  return JSON.stringify(value).replaceAll('</', '<\\u002F');
}

export function replaceScriptBody(bundle, type, body) {
  const open = `<script type="__bundler/${type}">`;
  const start = bundle.indexOf(open);
  const end = bundle.indexOf('</script>', start);
  if (start === -1 || end === -1) {
    throw new Error(`missing __bundler/${type} script in dist/index.html`);
  }
  return `${bundle.slice(0, start + open.length)}\n${body}\n  ${bundle.slice(end)}`;
}

export function readScriptBody(bundle, type) {
  const open = `<script type="__bundler/${type}">`;
  const start = bundle.indexOf(open);
  const end = bundle.indexOf('</script>', start);
  if (start === -1 || end === -1) {
    throw new Error(`missing __bundler/${type} script in dist/index.html`);
  }
  return bundle.slice(start + open.length, end).trim();
}

// Turns the editable .dc.html source into the template the bundle unpacks:
// the runtime script points at its manifest entry and only the <x-dc> markup
// gets camelCase attributes encoded (the logic script is left untouched).
export function buildTemplate(source) {
  if (!source.includes(RUNTIME_TAG)) {
    throw new Error('dashboard source must load ./support.js');
  }
  const html = source.replace(RUNTIME_TAG, `<script src="${RUNTIME_ID}"></script>`);
  const open = DC_OPEN_RE.exec(html);
  const close = html.lastIndexOf('</x-dc>');
  if (!open || close < open.index) {
    throw new Error('dashboard source has no <x-dc> block');
  }
  return (
    html.slice(0, open.index) +
    encodeCamelAttrs(html.slice(open.index, close)) +
    html.slice(close)
  );
}

export function readRuntime(bundle) {
  const entry = JSON.parse(readScriptBody(bundle, 'manifest'))[RUNTIME_ID];
  return entry ? gunzipSync(Buffer.from(entry.data, 'base64')).toString('utf8') : null;
}

export function buildBundle(bundle, template, runtime) {
  const previous = JSON.parse(readScriptBody(bundle, 'manifest'));
  const manifest = {
    [RUNTIME_ID]:
      readRuntime(bundle) === runtime
        ? previous[RUNTIME_ID]
        : {
            mime: 'text/javascript',
            compressed: true,
            data: gzipSync(Buffer.from(runtime, 'utf8')).toString('base64'),
          },
  };
  for (const id of VENDOR_IDS) {
    if (!previous[id]) {
      throw new Error(`missing vendored script ${id} in dist/index.html`);
    }
    manifest[id] = previous[id];
  }

  return replaceScriptBody(
    replaceScriptBody(bundle, 'manifest', JSON.stringify(manifest)),
    'template',
    embedJson(template),
  );
}
