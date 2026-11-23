const { spawn } = require('node:child_process');
const { createHash } = require('node:crypto');
const { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, rmSync } = require('node:fs');
const path = require('node:path');
const { once } = require('node:events');
const { finished } = require('node:stream/promises');

const root = path.resolve(__dirname, '..');
const envPath = path.join(root, 'apps', 'api', '.env');
const envText = existsSync(envPath) ? readFileSync(envPath, 'utf8') : '';
const databaseUrl = envText.match(/^\s*DATABASE_URL\s*=\s*["']?([^\r\n"']+)/m)?.[1]?.trim();
if (!databaseUrl) throw new Error(`DATABASE_URL is missing from ${envPath}`);

const db = new URL(databaseUrl);
const dbUser = decodeURIComponent(db.username);
const dbName = decodeURIComponent(db.pathname.replace(/^\//, ''));
if (!dbUser || !dbName) throw new Error('DATABASE_URL must include a database user and database name.');

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const destination = path.resolve(process.argv[2] || path.join(root, '.backups', `retail-pos-${stamp}.dump`));
const container = process.env.PG_CONTAINER || 'pos-postgres';
mkdirSync(path.dirname(destination), { recursive: true });

async function main() {
  const output = createWriteStream(destination, { flags: 'wx' });
  const child = spawn('docker', ['exec', container, 'pg_dump', '--format=custom', '--no-owner', '--no-acl', '-U', dbUser, '-d', dbName], { stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '';
  child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
  child.stdout.pipe(output);
  try {
    const [code] = await once(child, 'close');
    await finished(output);
    if (code !== 0) throw new Error(stderr.trim() || `pg_dump exited with code ${code}`);
    const digest = createHash('sha256');
    for await (const chunk of createReadStream(destination)) digest.update(chunk);
    console.log(`Backup created: ${path.relative(root, destination)}`);
    console.log(`SHA-256: ${digest.digest('hex')}`);
    console.log('The backup is local-only and excluded from Git. Copy it to encrypted off-device storage for disaster recovery.');
  } catch (error) {
    output.destroy();
    rmSync(destination, { force: true });
    throw error;
  }
}

main().catch((error) => {
  console.error(`Database backup failed: ${error.message}`);
  process.exitCode = 1;
});
