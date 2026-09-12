import { readdir, readFile } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const FORBIDDEN_BROWSER_MARKERS = [
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_SESSION_TOKEN',
  'AWS_COGNITO_SESSION_SECRET',
  'admintonibover-cognito-refresh',
];

const SENSITIVE_VALUE_ENV_NAMES = [
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_SESSION_TOKEN',
  'AWS_COGNITO_SESSION_SECRET',
  'BROWSER_AUDIT_REFRESH_TOKEN',
];

async function filesBelow(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async entry => {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) return filesBelow(path);
      return entry.isFile() ? [path] : [];
    })
  );
  return nested.flat();
}

function normalizedRelativePath(buildRoot, path) {
  return relative(buildRoot, path).split(sep).join('/');
}

function isBrowserOrRuntimeArtifact(path) {
  return (
    path.startsWith('static/') ||
    /^server\/app\/.*\.(?:body|html|rsc)$/.test(path) ||
    /^(?:app-build-manifest|build-manifest|required-server-files|routes-manifest)\.json$/.test(
      path
    )
  );
}

function isText(buffer) {
  return !buffer.includes(0);
}

/**
 * @param {string} buildRoot
 * @param {{ sensitiveValues?: string[] }} [options]
 */
export async function inspectBrowserArtifacts(
  buildRoot,
  { sensitiveValues = [] } = {}
) {
  const files = await filesBelow(buildRoot);
  const issues = [];

  for (const file of files) {
    const artifactPath = normalizedRelativePath(buildRoot, file);
    if (artifactPath.startsWith('static/') && artifactPath.endsWith('.map')) {
      issues.push(`${artifactPath}: production browser source map`);
    }

    const content = await readFile(file);
    if (!isText(content)) continue;
    const text = content.toString('utf8');

    for (const value of sensitiveValues.filter(value => value.length >= 12)) {
      if (text.includes(value)) {
        issues.push(`${artifactPath}: sensitive build canary`);
      }
    }
    if (!isBrowserOrRuntimeArtifact(artifactPath)) continue;
    for (const marker of FORBIDDEN_BROWSER_MARKERS) {
      if (text.includes(marker)) {
        issues.push(`${artifactPath}: forbidden browser marker ${marker}`);
      }
    }
  }

  return { filesChecked: files.length, issues };
}

async function run() {
  const buildRoot = resolve(process.argv[2] ?? '.next');
  let result;
  try {
    result = await inspectBrowserArtifacts(buildRoot, {
      sensitiveValues: SENSITIVE_VALUE_ENV_NAMES.flatMap(name => {
        const value = process.env[name];
        return value ? [value] : [];
      }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    console.error(`Browser artifact check failed: ${message}`);
    process.exitCode = 1;
    return;
  }

  if (result.issues.length > 0) {
    console.error('Browser artifact check failed:');
    for (const issue of result.issues) console.error(`- ${issue}`);
    process.exitCode = 1;
    return;
  }
  console.log(
    `Browser artifact check passed (${result.filesChecked} build files checked).`
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  void run();
}
