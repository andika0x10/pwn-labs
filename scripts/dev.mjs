import { spawnSync } from 'node:child_process';

const result = spawnSync('npm', ['run', 'dev', '-w', 'apps/web'], { stdio: 'inherit', env: process.env });
process.exit(result.status ?? 1);
