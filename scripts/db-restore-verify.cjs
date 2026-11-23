const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { createReadStream, existsSync } = require('node:fs');
const path = require('node:path');

function run(args, options = {}) {
  const result = spawnSync('docker', args, { encoding: 'utf8', timeout: options.timeout || 120000 });
  if (result.error) throw result.error;
  if (result.status !== 0 && !options.allowFailure) {
    throw new Error((result.stderr || result.stdout || `docker exited with ${result.status}`).trim());
  }
  return (result.stdout || '').trim();
}

const backup = path.resolve(process.argv[2] || '');
if (!process.argv[2] || !existsSync(backup)) {
  console.error('Usage: npm run db:restore:verify -- <path-to-backup.dump>');
  process.exit(2);
}

const name = `pos-restore-check-${process.pid}`;
let started = false;

async function checksum(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

async function main() {
  try {
    run(['run', '--detach', '--rm', '--name', name, '-e', 'POSTGRES_PASSWORD=restore-check-only', '-e', 'POSTGRES_DB=restore_verify', 'postgres:16-alpine']);
    started = true;
    let ready = false;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const result = spawnSync('docker', ['exec', name, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres', '-d', 'restore_verify'], { encoding: 'utf8', timeout: 10000 });
      if (result.status === 0) { ready = true; break; }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    if (!ready) throw new Error(`Temporary PostgreSQL did not become ready within 30 seconds. ${run(['logs', name], { allowFailure: true })}`);

    run(['cp', backup, `${name}:/tmp/backup.dump`]);
    run(['exec', name, 'pg_restore', '--exit-on-error', '--no-owner', '--no-acl', '-h', '127.0.0.1', '-U', 'postgres', '-d', 'restore_verify', '/tmp/backup.dump'], { timeout: 300000 });
    const tableCount = Number(run(['exec', name, 'psql', '-h', '127.0.0.1', '-U', 'postgres', '-d', 'restore_verify', '-Atc', "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'"]));
    if (!Number.isInteger(tableCount) || tableCount < 1) throw new Error('Restore completed, but no public tables were found.');
    console.log(`Restore verification passed in an isolated PostgreSQL container (${tableCount} public tables).`);
    console.log(`Backup SHA-256: ${await checksum(backup)}`);
    console.log('The development database was not modified. The temporary verification container will be removed.');
  } finally {
    if (started) run(['rm', '--force', name], { allowFailure: true });
  }
}

main().catch((error) => {
  console.error(`Restore verification failed: ${error.message}`);
  process.exitCode = 1;
});
