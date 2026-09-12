import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const secretDetectors = [
  {
    name: 'private key material',
    test: text =>
      /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text),
  },
  {
    name: 'AWS access key ID',
    test: text => /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/.test(text),
  },
  {
    name: 'GitHub access token',
    test: text =>
      /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{80,})\b/.test(
        text
      ),
  },
];

export function findSecretReasons(text) {
  return secretDetectors
    .filter(detector => detector.test(text))
    .map(detector => detector.name);
}

export function isEnvironmentFile(file) {
  const fileName = basename(file);
  return fileName === '.env' || fileName.startsWith('.env.');
}

function run() {
  const repositoryFiles = execFileSync(
    'git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
    {
      encoding: 'utf8',
    }
  )
    .split('\0')
    .filter(Boolean);

  const violations = [];

  for (const file of repositoryFiles) {
    if (!existsSync(file)) continue;
    if (isEnvironmentFile(file)) {
      violations.push({ file, reason: 'repository .env file' });
    }

    const content = readFileSync(file);
    if (content.includes(0)) {
      continue;
    }

    for (const reason of findSecretReasons(content.toString('utf8'))) {
      violations.push({ file, reason });
    }
  }

  if (violations.length > 0) {
    console.error('Secret safety check failed:');
    for (const violation of violations) {
      console.error(`- ${violation.file}: ${violation.reason}`);
    }
    console.error(
      'Remove the value from Git history and rotate it if it was real.'
    );
    process.exitCode = 1;
  } else {
    console.log(
      `Secret safety check passed (${repositoryFiles.length} repository files checked).`
    );
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  run();
}
