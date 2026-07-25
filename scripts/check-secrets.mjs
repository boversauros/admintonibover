import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

const secretDetectors = [
  {
    name: 'private key material',
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  },
  {
    name: 'AWS access key ID',
    pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/,
  },
  {
    name: 'GitHub access token',
    pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{80,})\b/,
  },
  {
    name: 'GitLab access token',
    pattern: /\bglpat-[A-Za-z0-9_-]{20,}\b/,
  },
  {
    name: 'Slack access token',
    pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/,
  },
  {
    name: 'Stripe live secret key',
    pattern: /\bsk_live_[A-Za-z0-9]{16,}\b/,
  },
  {
    name: 'JWT',
    pattern:
      /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/,
  },
];

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
  const fileName = basename(file);

  if (fileName === '.env' || fileName.startsWith('.env.')) {
    violations.push({ file, reason: 'tracked .env file' });
  }

  const content = readFileSync(file);
  if (content.includes(0)) {
    continue;
  }

  const text = content.toString('utf8');
  for (const detector of secretDetectors) {
    if (detector.pattern.test(text)) {
      violations.push({ file, reason: detector.name });
    }
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
