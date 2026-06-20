// Runs before the suite: (re)seeds the local SQLite DB with throwaway E2E
// accounts and a fresh PENDING dictionary submission. Idempotent and guarded
// (the management command refuses to run against a non-SQLite / non-DEBUG DB).
import { execSync } from 'node:child_process'

const PYTHON_BIN = process.env.E2E_PYTHON || process.env.PYTHON || 'python3'

export default function globalSetup() {
  execSync(`${PYTHON_BIN} manage.py seed_e2e_testdata`, {
    cwd: '../backend',
    stdio: 'inherit',
    env: { ...process.env, DJANGO_DEBUG: 'True' },
  })
}
