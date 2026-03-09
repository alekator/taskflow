import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const target = process.env.BENCH_TARGET_URL ?? 'http://localhost:3001/api/health';
const connections = process.env.BENCH_CONNECTIONS ?? '50';
const durationSeconds = process.env.BENCH_DURATION_SECONDS ?? '30';
const workers = process.env.BENCH_WORKERS ?? '2';
const timeoutSeconds = process.env.BENCH_TIMEOUT_SECONDS ?? '20';

const resultsDir = join(process.cwd(), 'scripts', 'load', 'results');
mkdirSync(resultsDir, { recursive: true });

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const outPath = join(resultsDir, `autocannon-${timestamp}.json`);

const args = [
  'dlx',
  'autocannon',
  '--json',
  '--connections',
  connections,
  '--workers',
  workers,
  '--duration',
  durationSeconds,
  '--timeout',
  timeoutSeconds,
  target,
];

const run = spawnSync('pnpm', args, {
  cwd: process.cwd(),
  encoding: 'utf8',
  stdio: 'pipe',
});

if (run.stdout) {
  process.stdout.write(run.stdout);
}
if (run.stderr) {
  process.stderr.write(run.stderr);
}

if (run.status !== 0) {
  process.exit(run.status ?? 1);
}

const trimmed = run.stdout.trim();
writeFileSync(outPath, `${trimmed}\n`, 'utf8');
process.stdout.write(`\nSaved benchmark artifact: ${outPath}\n`);
