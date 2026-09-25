// Fails when a component uses a Tailwind class that the design tokens do not
// generate (e.g. `bg-gray-900`, `ring-overlay-50`). Such classes compile to
// nothing, so they are either dead styling or off-palette values.
import { readdir, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, relative, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, '..');
const SOURCE_DIRECTORIES = ['app', 'components'];
const ENTRY_STYLESHEET = resolve(root, 'app/globals.css');

// Only tokens that start with one of these utility roots are checked, so plain
// words inside string literals ("string", "during") are ignored.
const UTILITY_ROOTS = [
  'bg',
  'text',
  'border',
  'divide',
  'ring',
  'outline',
  'placeholder',
  'fill',
  'stroke',
  'accent',
  'caret',
  'decoration',
  'from',
  'via',
  'to',
  'font',
  'tracking',
  'leading',
  'rounded',
  'shadow',
  'animate',
  'transition',
  'duration',
  'ease',
  'scale',
  'blur',
  'backdrop',
];
const HEX_COLOR = /#[0-9a-fA-F]{3,8}\b/g;

async function filesBelow(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async entry => {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) return filesBelow(path);
      return entry.isFile() && /\.tsx?$/.test(path) ? [path] : [];
    })
  );
  return nested.flat();
}

function utilityRoot(candidate) {
  const utility = candidate.split(':').at(-1).replace(/^[!-]/, '');
  return utility.split(/[-/[]/)[0];
}

function candidatesIn(source) {
  const candidates = new Set();
  for (const literal of source.matchAll(/(['"`])((?:(?!\1)[^\\]|\\.)*)\1/g)) {
    for (const token of literal[2].split(/[\s'"`{}]+/)) {
      if (!/^[!-]?[a-z][\w:/.[\]()%#,-]*$/.test(token)) continue;
      if (!token.includes('-') && !token.includes(':')) continue;
      if (UTILITY_ROOTS.includes(utilityRoot(token))) candidates.add(token);
    }
  }
  return candidates;
}

async function loadStylesheet(id, base) {
  const path = id.startsWith('.')
    ? resolve(base, id)
    : require.resolve(id === 'tailwindcss' ? 'tailwindcss/index.css' : id, {
        paths: [base],
      });
  return { path, base: dirname(path), content: await readFile(path, 'utf8') };
}

const { __unstable__loadDesignSystem } = await import('tailwindcss');
const designSystem = await __unstable__loadDesignSystem(
  await readFile(ENTRY_STYLESHEET, 'utf8'),
  { base: dirname(ENTRY_STYLESHEET), loadStylesheet }
);

const problems = [];
for (const directory of SOURCE_DIRECTORIES) {
  for (const file of await filesBelow(resolve(root, directory))) {
    const source = await readFile(file, 'utf8');
    const path = relative(root, file);
    const candidates = [...candidatesIn(source)];
    const css = designSystem.candidatesToCss(candidates);
    candidates.forEach((candidate, index) => {
      if (!css[index]) problems.push(`${path}: unknown class "${candidate}"`);
    });
    for (const [hex] of source.matchAll(HEX_COLOR)) {
      problems.push(`${path}: hardcoded color ${hex}, use a token`);
    }
  }
}

if (problems.length > 0) {
  console.error(problems.join('\n'));
  console.error(`\n${problems.length} design token violation(s).`);
  process.exit(1);
}
console.log('Design tokens check passed.');
