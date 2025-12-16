import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SEEDERS_DIR = path.join(__dirname, '../supabase/seeders');
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ Missing DATABASE_URL in .env (Postgres connection string)');
  process.exit(1);
}

const defaultVars = {
  admin_email: process.env.ADMIN_EMAIL || 'admin@example.com',
  admin_password: process.env.ADMIN_PASSWORD || 'Admin123!@#',
};

function formatVar(value) {
  // psql will add quoting when using :'var', so we pass raw, with quotes escaped.
  return String(value).replace(/'/g, "''");
}

function buildPsqlArgs(extraVars = {}) {
  const args = [DATABASE_URL, '-v', 'ON_ERROR_STOP=1'];
  const merged = { ...defaultVars, ...extraVars };

  for (const [key, value] of Object.entries(merged)) {
    if (value === undefined || value === null) continue;
    args.push('-v', `${key}=${formatVar(value)}`);
  }

  return args;
}

function getSeederFiles() {
  if (!fs.existsSync(SEEDERS_DIR)) {
    console.error(`❌ Seeders directory not found: ${SEEDERS_DIR}`);
    process.exit(1);
  }

  return fs
    .readdirSync(SEEDERS_DIR)
    .filter((file) => file.endsWith('.sql') || file.endsWith('.js') || file.endsWith('.mjs'))
    .sort();
}

async function runSeeder(filePath) {
  const fileName = path.basename(filePath);
  console.log(`\n▶ Running seeder: ${fileName}`);

  if (fileName.endsWith('.sql')) {
    const args = [...buildPsqlArgs(), '-f', filePath];
    const result = spawnSync('psql', args, { stdio: 'inherit', env: process.env });

    if (result.error) {
      console.error(`❌ Seeder failed (${fileName}):`, result.error.message);
      process.exit(1);
    }

    if (result.status !== 0) {
      console.error(`❌ Seeder failed (${fileName}) with exit code ${result.status}`);
      process.exit(result.status);
    }

    console.log(`✅ Seeder completed: ${fileName}`);
    return;
  }

  if (fileName.endsWith('.js') || fileName.endsWith('.mjs')) {
    try {
      // Convert file path to file:// URL for import
      const fileUrl = path.isAbsolute(filePath) 
        ? `file://${filePath}` 
        : `file://${path.resolve(filePath)}`;
      const seeder = await import(fileUrl);
      const seederFunc = seeder.default || seeder;
      if (typeof seederFunc !== 'function') {
        throw new Error('Seeder file must export a function.');
      }
      await seederFunc();
      console.log(`✅ JS seeder completed: ${fileName}`);
    } catch (err) {
      console.error(`❌ JS seeder failed: ${fileName}`);
      console.error(err);
      process.exit(1);
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  const firstArg = args[0];
  const allSeeders = getSeederFiles();

  if (firstArg && !firstArg.startsWith('-')) {
    const prefix = firstArg;
    const selected = allSeeders.filter((file) => file.startsWith(prefix));

    if (selected.length === 0) {
      console.error(
        `❌ No seeder files found in ${SEEDERS_DIR} matching prefix "${prefix}".`
      );
      process.exit(1);
    }

    console.log(
      `▶ Selected seeders for prefix "${prefix}". Files to run:\n  - ${selected.join('\n  - ')}`
    );

    for (const file of selected) {
      await runSeeder(path.join(SEEDERS_DIR, file));
    }
    console.log('\n✅ Selected seeders completed successfully.');
    return;
  }

  console.log('▶ Running ALL seeders in order:');
  for (const file of allSeeders) {
    await runSeeder(path.join(SEEDERS_DIR, file));
  }
  console.log('\n✅ All seeders completed successfully.');
}

main().catch((err) => {
  console.error('❌ Seed process failed:', err);
  process.exit(1);
});

