import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    cwd: root,
    ...options,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function ensureDirFor(filePath) {
  mkdirSync(dirname(filePath), { recursive: true });
}

function ensureFileFromExample(targetRelativePath, exampleRelativePath, transform) {
  const targetPath = resolve(root, targetRelativePath);
  if (existsSync(targetPath)) {
    return false;
  }

  const examplePath = resolve(root, exampleRelativePath);
  if (!existsSync(examplePath)) {
    throw new Error(`Missing example file: ${exampleRelativePath}`);
  }

  ensureDirFor(targetPath);

  if (!transform) {
    copyFileSync(examplePath, targetPath);
    return true;
  }

  const next = transform(readFileSync(examplePath, "utf8"));
  writeFileSync(targetPath, next, "utf8");
  return true;
}

function buildApiEnv(content) {
  return content
    .replace("replace-with-strong-access-secret", "taskflow-local-access-secret")
    .replace("replace-with-strong-refresh-secret", "taskflow-local-refresh-secret");
}

function logStep(message) {
  process.stdout.write(`\n[setup:dev] ${message}\n`);
}

async function main() {
  logStep("Ensuring local environment files");
  const apiEnvCreated = ensureFileFromExample(
    "apps/api/.env",
    "apps/api/.env.example",
    buildApiEnv,
  );
  const webEnvCreated = ensureFileFromExample(
    "apps/web/.env",
    "apps/web/.env.example",
  );

  if (apiEnvCreated) {
    logStep("Created apps/api/.env from example");
  }
  if (webEnvCreated) {
    logStep("Created apps/web/.env from example");
  }

  logStep("Installing workspace dependencies");
  run("pnpm", ["install"]);

  logStep("Starting local infrastructure (Postgres + Redis)");
  run("docker", ["compose", "up", "-d"]);

  logStep("Applying Prisma migrations");
  run("pnpm", ["--filter", "api", "exec", "prisma", "migrate", "deploy"]);

  logStep("Seeding the database");
  run("pnpm", ["--filter", "api", "exec", "prisma", "db", "seed"]);

  logStep("Starting the development workspace");
  run("pnpm", ["dev"]);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`\n[setup:dev] ${message}\n`);
  process.exit(1);
});
