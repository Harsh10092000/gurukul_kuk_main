const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Load environment configuration
function loadEnv() {
  const envFiles = ['.env.local', '.env'];
  const env = {};
  for (const file of envFiles) {
    const fullPath = path.join(process.cwd(), file);
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, 'utf8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx !== -1) {
          const key = trimmed.slice(0, eqIdx).trim();
          const val = trimmed.slice(eqIdx + 1).trim();
          if (env[key] === undefined) {
            env[key] = val;
          }
        }
      }
    }
  }
  return env;
}

const env = loadEnv();
const host = env.DB_HOST || process.env.DB_HOST || 'localhost';
const port = env.DB_PORT || process.env.DB_PORT || '3306';
const user = env.DB_USER || process.env.DB_USER || 'root';
const password = env.DB_PASSWORD || process.env.DB_PASSWORD || 'Anshu123';
const database = env.DB_NAME || process.env.DB_NAME || 'gurukul_kurukshetra';

const backupsDir = path.join(process.cwd(), 'backups');
if (!fs.existsSync(backupsDir)) {
  fs.mkdirSync(backupsDir, { recursive: true });
}

const now = new Date();
const pad = (n) => String(n).padStart(2, '0');
const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
const backupFile = path.join(backupsDir, `${database}_${timestamp}.sql`);
const latestFile = path.join(backupsDir, `${database}_latest.sql`);

// Find mysqldump executable
let mysqldumpPath = 'mysqldump';
const candidates = [
  'C:\\Program Files\\MySQL\\MySQL Server 9.0\\bin\\mysqldump.exe',
  'C:\\Program Files\\MySQL\\MySQL Server 8.0\\bin\\mysqldump.exe',
  'C:\\xampp\\mysql\\bin\\mysqldump.exe',
];
for (const cand of candidates) {
  if (fs.existsSync(cand)) {
    mysqldumpPath = `"${cand}"`;
    break;
  }
}

console.log(`[Backup] Initiating SQL backup for database "${database}" at ${host}:${port}...`);
try {
  const cmd = `${mysqldumpPath} -h ${host} -P ${port} -u ${user} -p${password} --routines --triggers --events --databases ${database} --result-file="${backupFile}"`;
  execSync(cmd, { stdio: 'inherit' });

  // Update latest symlink/copy
  fs.copyFileSync(backupFile, latestFile);

  const stats = fs.statSync(backupFile);
  console.log(`[Backup] SUCCESS!`);
  console.log(`  File:   ${backupFile}`);
  console.log(`  Latest: ${latestFile}`);
  console.log(`  Size:   ${(stats.size / 1024).toFixed(2)} KB`);
} catch (err) {
  console.error('[Backup Error]:', err.message);
  process.exit(1);
}
