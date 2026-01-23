import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const bannedExtensions = new Set([
  '.xlsx',
  '.xls',
  '.png',
  '.jpg',
  '.jpeg',
  '.pdf',
  '.zip',
  '.7z',
  '.rar',
  '.bin',
  '.exe',
  '.dll'
]);

const bannedFiles = new Set();

const normalize = (value) => value.replace(/^"|"$/g, '').trim();

const listFromGit = (args) => {
  try {
    const output = execSync(`git ${args}`, { encoding: 'utf8' });
    return output
      .split(/\r?\n/)
      .map((line) => normalize(line))
      .filter(Boolean);
  } catch (error) {
    return [];
  }
};

const checkPaths = (paths) => {
  for (const filePath of paths) {
    const ext = path.extname(filePath).toLowerCase();
    if (bannedExtensions.has(ext)) {
      bannedFiles.add(filePath);
    }
  }
};

const stagedPaths = listFromGit('diff --cached --name-only --diff-filter=ACMRTUXB');
const workingPaths = listFromGit('status --porcelain');

const workingFiles = workingPaths.map((line) => {
  const cleaned = line.slice(3).trim();
  if (cleaned.includes(' -> ')) {
    return cleaned.split(' -> ').pop();
  }
  return cleaned;
});

checkPaths(stagedPaths);
checkPaths(workingFiles);

if (bannedFiles.size > 0) {
  console.error('Binary files detected (remove before commit/push):');
  for (const filePath of [...bannedFiles].sort()) {
    console.error(`- ${filePath}`);
  }
  process.exit(1);
}

if (!existsSync('.git')) {
  console.warn('Warning: .git directory not found.');
}

console.log('No banned binary files detected.');
