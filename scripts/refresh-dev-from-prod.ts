import {
  DevRefreshError,
  buildPlan,
  checkUpToDate,
  executeRefresh,
  planIsEmpty,
  readSourceSnapshot,
  readTargetState,
  type RefreshPlan,
} from '../lib/refresh/dev-refresh';
import { createAwsRefresh } from '../lib/refresh/aws-refresh';

const REGION = 'eu-west-1';
const SOURCE_STACK = 'admintonibover-prod';
const TARGET_STACK = 'admintonibover-dev';

const USAGE = `Usage:
  pnpm dev:refresh                                   Dry run: show what would change
  pnpm dev:refresh -- --execute --confirm <code>     Apply the plan the dry run showed
  pnpm dev:refresh -- --full                         Compare everything even if dev looks current

Copies production content and images into dev, one way. Production is only read.
Dev items and images that prod does not have are deleted; dev users are untouched.
When neither side changed since the last refresh, it stops after reading three values.`;

type CliOptions = { execute: boolean; full: boolean; confirm?: string };

function parseArguments(args: string[]): CliOptions | null {
  const options: CliOptions = { execute: false, full: false };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--') continue;
    if (argument === '--help' || argument === '-h') return null;
    if (argument === '--execute') {
      options.execute = true;
      continue;
    }
    if (argument === '--full') {
      options.full = true;
      continue;
    }
    if (argument === '--confirm') {
      const value = args[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error('--confirm requires the code from the dry run');
      }
      options.confirm = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown flag: ${argument}`);
  }
  if (options.execute && !options.confirm) {
    throw new Error('--execute requires --confirm <code> from the dry run');
  }
  if (!options.execute && options.confirm) {
    throw new Error('--confirm requires --execute');
  }
  return options;
}

function megabytes(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function countLines(counts: Record<string, number>): string[] {
  return Object.entries(counts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([type, count]) => `      ${type}: ${count}`);
}

function describePlan(plan: RefreshPlan): string {
  const copyBytes = plan.imageCopies.reduce(
    (total, object) => total + object.size,
    0
  );
  const lines = [
    `Content items: ${plan.itemPuts.length} to write, ${plan.itemDeletes.length} to delete, ${plan.unchangedItems} unchanged`,
  ];
  if (plan.itemPuts.length > 0) {
    lines.push('    write:', ...countLines(plan.putCounts));
  }
  if (plan.itemDeletes.length > 0) {
    lines.push('    delete:', ...countLines(plan.deleteCounts));
  }
  lines.push(
    `Images: ${plan.imageCopies.length} to copy (${megabytes(copyBytes)}), ${plan.imageDeletes.length} to delete, ${plan.unchangedImages} unchanged`
  );
  if (plan.missingReferencedImages.length > 0) {
    lines.push(
      `Warning: prod content references ${plan.missingReferencedImages.length} images that are missing in the prod bucket (copied as-is):`,
      ...plan.missingReferencedImages.slice(0, 5).map(key => `    ${key}`)
    );
  }
  return lines.join('\n');
}

async function run(options: CliOptions): Promise<void> {
  const aws = await createAwsRefresh({
    region: REGION,
    sourceStack: SOURCE_STACK,
    targetStack: TARGET_STACK,
  });
  try {
    console.log('Refresh dev from prod');
    console.log(
      `  from ${aws.source.stackName}: ${aws.source.tableName}, ${aws.source.bucketName}`
    );
    console.log(
      `  to   ${aws.target.stackName}: ${aws.target.tableName}, ${aws.target.bucketName}`
    );

    if (!options.full) {
      const check = await checkUpToDate(aws.sourceSide, aws.targetSide);
      if (check.upToDate && check.marker) {
        console.log(
          `\nDev is up to date with prod revision ${check.sourceRevision} (last refresh ${check.marker.completedAt}).`
        );
        console.log(
          'Neither side changed since then. Use --full to compare everything anyway.'
        );
        return;
      }
      console.log(
        check.marker
          ? `\nChanged since the last refresh (prod revision ${check.marker.sourceRevision} -> ${check.sourceRevision ?? 'none'}, dev revision ${check.marker.targetRevision ?? 'none'} -> ${check.targetRevision ?? 'none'}).`
          : '\nNo record of a previous refresh.'
      );
    }

    console.log('Reading prod (read-only) and dev...');

    const snapshot = await readSourceSnapshot(aws.sourceSide);
    const state = await readTargetState(aws.targetSide);
    const plan = buildPlan({
      sourceRevision: snapshot.revision,
      sourceItems: snapshot.items,
      targetItems: state.items,
      sourceImages: snapshot.images,
      targetImages: state.images,
      targetNames: {
        table: aws.target.tableName,
        bucket: aws.target.bucketName,
      },
    });

    console.log(
      `\nProd revision ${snapshot.revision ?? 'none'}: ${snapshot.items.length} items, ${snapshot.images.length} images\n`
    );
    console.log(describePlan(plan));

    if (planIsEmpty(plan)) {
      console.log('\nDev already matches prod. Nothing to do.');
      return;
    }

    if (!options.execute) {
      console.log('\nDry run only: nothing was changed.');
      console.log('To apply exactly this plan, run:');
      console.log(`  pnpm dev:refresh -- --execute --confirm ${plan.code}`);
      return;
    }

    if (options.confirm !== plan.code) {
      throw new DevRefreshError(
        'PLAN_CHANGED',
        'Prod or dev changed since the dry run. Run `pnpm dev:refresh` again and use the new code'
      );
    }

    console.log('\nApplying to dev...');
    await executeRefresh(plan, aws.source.bucketName, aws.targetSide, {
      log: message => console.log(message),
    });
    console.log(
      `\nDone. Dev now matches prod revision ${snapshot.revision ?? 'none'}.`
    );
  } finally {
    aws.destroy();
  }
}

async function main(): Promise<void> {
  let options: CliOptions | null;
  try {
    options = parseArguments(process.argv.slice(2));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid flags';
    console.error(`dev-refresh: ${message}\n\n${USAGE}`);
    process.exitCode = 2;
    return;
  }
  if (options === null) {
    console.log(USAGE);
    return;
  }
  try {
    await run(options);
  } catch (error) {
    if (error instanceof DevRefreshError) {
      console.error(`\ndev-refresh: ${error.code}: ${error.message}`);
    } else {
      const name = error instanceof Error ? error.name : 'Error';
      const message = error instanceof Error ? error.message : String(error);
      console.error(`\ndev-refresh: ${name}: ${message}`);
    }
    process.exitCode = 1;
  }
}

void main();
