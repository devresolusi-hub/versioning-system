// scripts/migration.mjs
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const MIGRATIONS_DIR = path.join(__dirname, '../supabase/migrations');
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ Missing DATABASE_URL in .env (Postgres connection string)');
  process.exit(1);
}

const baseArgs = [DATABASE_URL, '-v', 'ON_ERROR_STOP=1'];

function runPsql(additionalArgs, errorMessage) {
  const result = spawnSync('psql', [...baseArgs, ...additionalArgs], {
    stdio: 'inherit',
    env: process.env,
  });

  if (result.error) {
    console.error(`❌ ${errorMessage}:`, result.error.message);
    process.exit(1);
  }

  if (result.status !== 0) {
    console.error(`❌ ${errorMessage} (exit code ${result.status})`);
    process.exit(result.status);
  }
}

/**
 * Run a single SQL migration file
 */
function runSqlFile(filePath) {
  const fileName = path.basename(filePath);
  console.log(`\n▶ Running migration: ${fileName}`);

  runPsql(['-f', filePath], `Migration failed for ${fileName}`);
  console.log(`✅ Migration completed: ${fileName}`);
}

/**
 * Fresh migrate: drop and recreate schema
 */
function freshMigrate(migrationFiles) {
  console.log('⚠️  Performing FRESH migrate: deleting all tables and recreating schema...\n');

  const wipeSql = `
    DO $$ 
    DECLARE 
      obj RECORD;
    BEGIN
      -- Drop all tables
      FOR obj IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') 
      LOOP
        EXECUTE 'DROP TABLE IF EXISTS public.' || quote_ident(obj.tablename) || ' CASCADE';
      END LOOP;
      
      -- Drop all views
      FOR obj IN (SELECT viewname FROM pg_views WHERE schemaname = 'public') 
      LOOP
        EXECUTE 'DROP VIEW IF EXISTS public.' || quote_ident(obj.viewname) || ' CASCADE';
      END LOOP;
      
      -- Drop all sequences
      FOR obj IN (SELECT sequence_name FROM information_schema.sequences WHERE sequence_schema = 'public') 
      LOOP
        EXECUTE 'DROP SEQUENCE IF EXISTS public.' || quote_ident(obj.sequence_name) || ' CASCADE';
      END LOOP;
    END $$;

    DROP SCHEMA IF EXISTS public CASCADE;
    CREATE SCHEMA public;
    GRANT ALL ON SCHEMA public TO postgres;
    GRANT ALL ON SCHEMA public TO public;
  `;

  runPsql(['-c', wipeSql], 'Database wipe failed');
  console.log('✅ Database wiped. Running all migrations...\n');

  for (const file of migrationFiles) {
    runSqlFile(path.join(MIGRATIONS_DIR, file));
  }

  console.log('\n✅ Fresh migrate completed successfully.');
}

/**
 * Get all .sql migration files sorted by filename
 */
function getMigrationFiles() {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    console.error(`❌ Migrations directory not found: ${MIGRATIONS_DIR}`);
    console.log('Creating migrations directory...');
    fs.mkdirSync(MIGRATIONS_DIR, { recursive: true });
    return [];
  }

  const files = fs.readdirSync(MIGRATIONS_DIR);
  return files
    .filter((file) => file.endsWith('.sql'))
    .sort();
}

/**
 * Main function
 */
function main() {
  const args = process.argv.slice(2);
  const firstArg = args[0];
  const allMigrations = getMigrationFiles();

  if (allMigrations.length === 0) {
    console.log('⚠️  No migration files found.');
    return;
  }

  console.log(`Found ${allMigrations.length} migration file(s):\n`);
  allMigrations.forEach((file, i) => {
    console.log(`  ${i + 1}. ${file}`);
  });

  // Fresh migrate
  if (firstArg === '--fresh') {
    freshMigrate(allMigrations);
    return;
  }

  // Selected migrate by prefix
  if (firstArg && !firstArg.startsWith('-')) {
    const prefix = firstArg;
    const selected = allMigrations.filter((file) => file.startsWith(prefix));

    if (selected.length === 0) {
      console.error(`\n❌ No migrations found matching prefix "${prefix}"`);
      process.exit(1);
    }

    console.log(`▶ Running migrations matching "${prefix}":`);
    for (const file of selected) {
      runSqlFile(path.join(MIGRATIONS_DIR, file));
    }

    console.log('\n✅ Selected migrations completed.');
    return;
  }

  // Default: run all migrations
  console.log('▶ Running ALL migrations in order:');
  for (const file of allMigrations) {
    runSqlFile(path.join(MIGRATIONS_DIR, file));
  }

  console.log('\n✅ All migrations completed successfully.');
}

main();

