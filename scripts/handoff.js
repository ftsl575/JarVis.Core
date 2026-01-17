import fs from 'node:fs';
import path from 'node:path';

const handoffPath = path.resolve(process.cwd(), 'docs', 'HANDOFF.md');

try {
  const content = fs.readFileSync(handoffPath, 'utf8');
  process.stdout.write(content);
} catch (error) {
  const message = error?.code === 'ENOENT'
    ? `Handoff document not found at ${handoffPath}.`
    : `Failed to read handoff document: ${error?.message || error}`;
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
