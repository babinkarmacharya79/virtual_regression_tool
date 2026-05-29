import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import fs from 'fs-extra';
import chalk from 'chalk';

const DEFAULTS = {
  threshold: 0.1,
  viewports: [
    { name: 'desktop', width: 1280, height: 800 },
  ],
  pages: [],
  outputDirs: {
    baselines: 'baselines',
    screenshots: 'screenshots',
    diffs: 'diffs',
    reports: 'reports',
  },
  ignoreRegions: [],
};

function validateIgnoreRegions(regions) {
  for (const region of regions) {
    const { name, x, y, width, height } = region;
    if (typeof name !== 'string' || !name) throw new Error(`ignoreRegions: each entry must have a non-empty "name"`);
    for (const field of ['x', 'y', 'width', 'height']) {
      if (typeof region[field] !== 'number' || region[field] < 0) {
        throw new Error(`ignoreRegions["${name}"]: "${field}" must be a non-negative number`);
      }
    }
  }
}

function loadConfig(configPath = 'vrt.config.json') {
  const absPath = resolve(process.cwd(), configPath);

  if (!existsSync(absPath)) {
    throw new Error('Config file not found. Create a vrt.config.json in your project root to get started.');
  }

  let userConfig;
  try {
    userConfig = JSON.parse(readFileSync(absPath, 'utf8'));
  } catch (err) {
    throw new Error(`[vrt] Failed to parse ${configPath}: ${err.message}`);
  }

  const config = {
    ...DEFAULTS,
    ...userConfig,
    outputDirs: {
      ...DEFAULTS.outputDirs,
      ...(userConfig.outputDirs ?? {}),
    },
    ignoreRegions: userConfig.ignoreRegions ?? DEFAULTS.ignoreRegions,
  };

  validateIgnoreRegions(config.ignoreRegions);

  // Resolve output dirs relative to cwd
  for (const key of Object.keys(config.outputDirs)) {
    config.outputDirs[key] = resolve(process.cwd(), config.outputDirs[key]);
  }

  return config;
}

async function ensureOutputDirs(config) {
  await Promise.all(Object.values(config.outputDirs).map(dir => fs.ensureDir(dir)));
}

export { loadConfig, ensureOutputDirs, DEFAULTS };
