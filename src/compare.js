import { basename, join } from 'path';
import { readFileSync, writeFileSync } from 'fs';
import fs from 'fs-extra';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import chalk from 'chalk';
import sharp from 'sharp';
import { captureEnv } from './capture.js';

async function applyIgnoreRegions(imageBuffer, ignoreRegions) {
  const composites = await Promise.all(
    ignoreRegions.map(async ({ x, y, width, height }) => {
      const blackRect = await sharp({
        create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } },
      }).png().toBuffer();
      return { input: blackRect, left: x, top: y };
    })
  );
  return sharp(imageBuffer).composite(composites).png().toBuffer();
}

async function updateBaselines(screenshotResults, config) {
  await fs.ensureDir(config.outputDirs.baselines);

  const results = [];

  for (const item of screenshotResults) {
    const filename = basename(item.screenshotPath);
    const baselinePath = join(config.outputDirs.baselines, filename);

    await fs.copy(item.screenshotPath, baselinePath, { overwrite: true });
    console.log(chalk.green(`Baseline updated: ${filename}`));

    results.push({ name: item.name, baselinePath });
  }

  return results;
}

async function checkBaselines(screenshotResults, config) {
  const hasBaseline = [];
  const noBaseline = [];

  for (const item of screenshotResults) {
    const filename = basename(item.screenshotPath);
    const baselinePath = join(config.outputDirs.baselines, filename);
    const exists = await fs.pathExists(baselinePath);

    if (exists) {
      hasBaseline.push({ ...item, baselinePath });
    } else {
      noBaseline.push({ ...item });
    }
  }

  console.log(chalk.cyan(
    `${hasBaseline.length} baseline${hasBaseline.length !== 1 ? 's' : ''} found, ` +
    `${noBaseline.length} new page${noBaseline.length !== 1 ? 's' : ''} detected`
  ));

  return { hasBaseline, noBaseline };
}

async function compareScreenshots(screenshotResults, config) {
  await fs.ensureDir(config.outputDirs.diffs);
  await fs.ensureDir(config.outputDirs.baselines);

  const { hasBaseline, noBaseline } = await checkBaselines(screenshotResults, config);
  const results = [];

  for (const item of noBaseline) {
    const filename = basename(item.screenshotPath);
    const baselinePath = join(config.outputDirs.baselines, filename);
    await fs.copy(item.screenshotPath, baselinePath, { overwrite: true });

    console.log(chalk.yellow(`◆ ${filename} — new baseline saved`));
    results.push({ name: item.name, url: item.url, viewport: item.viewport, status: 'new', screenshotPath: item.screenshotPath, baselinePath });
  }

  for (const item of hasBaseline) {
    const filename = basename(item.screenshotPath);
    const diffFilename = `${item.name}-${item.viewport.name}-diff.png`;
    const diffPath = join(config.outputDirs.diffs, diffFilename);

    let img1, img2;
    try {
      let baselineBuffer = readFileSync(item.baselinePath);
      let screenshotBuffer = readFileSync(item.screenshotPath);

      if (config.ignoreRegions.length > 0) {
        console.log(chalk.cyan(`  Applying ${config.ignoreRegions.length} ignore region(s) before compare`));
        [baselineBuffer, screenshotBuffer] = await Promise.all([
          applyIgnoreRegions(baselineBuffer, config.ignoreRegions),
          applyIgnoreRegions(screenshotBuffer, config.ignoreRegions),
        ]);
      }

      img1 = PNG.sync.read(baselineBuffer);
      img2 = PNG.sync.read(screenshotBuffer);
    } catch (err) {
      console.error(chalk.red(`  [error] Could not read images for ${filename}: ${err.message}`));
      results.push({ name: item.name, url: item.url, viewport: item.viewport, status: 'failed', reason: 'read error', screenshotPath: item.screenshotPath, baselinePath: item.baselinePath });
      continue;
    }

    if (img1.width !== img2.width || img1.height !== img2.height) {
      console.log(chalk.red(`✗ ${filename} — dimension mismatch (baseline: ${img1.width}x${img1.height}, screenshot: ${img2.width}x${img2.height})`));
      results.push({ name: item.name, url: item.url, viewport: item.viewport, status: 'failed', reason: 'dimension mismatch', screenshotPath: item.screenshotPath, baselinePath: item.baselinePath });
      continue;
    }

    const { width, height } = img1;
    const diffImg = new PNG({ width, height });
    const differentPixels = pixelmatch(img1.data, img2.data, diffImg.data, width, height, { threshold: config.threshold });
    const totalPixels = width * height;
    const diffPercent = (differentPixels / totalPixels) * 100;

    writeFileSync(diffPath, PNG.sync.write(diffImg));

    const status = diffPercent < config.threshold ? 'passed' : 'failed';

    if (status === 'passed') {
      console.log(chalk.green(`✓ ${filename} — ${diffPercent.toFixed(2)}% diff (passed)`));
    } else {
      console.log(chalk.red(`✗ ${filename} — ${diffPercent.toFixed(2)}% diff (failed)`));
    }

    results.push({ name: item.name, url: item.url, viewport: item.viewport, status, diffPercent, baselinePath: item.baselinePath, screenshotPath: item.screenshotPath, diffPath });
  }

  return results;
}

async function compareEnvs(envA, envB, config) {
  await fs.ensureDir(config.outputDirs.diffs);
  await fs.ensureDir(config.outputDirs.screenshots);

  const baseUrlA = config.environments[envA];
  const baseUrlB = config.environments[envB];

  console.log(chalk.cyan(`\nCapturing ${envA} (${baseUrlA})...`));
  const resultsA = await captureEnv(envA, baseUrlA, config);

  console.log(chalk.cyan(`\nCapturing ${envB} (${baseUrlB})...`));
  const resultsB = await captureEnv(envB, baseUrlB, config);

  const results = [];

  for (const itemA of resultsA) {
    const itemB = resultsB.find(b => b.name === itemA.name && b.viewport.name === itemA.viewport.name);

    if (!itemB) {
      console.log(chalk.yellow(`  ⚠ No matching ${envB} screenshot for ${itemA.name} @ ${itemA.viewport.name}, skipping`));
      continue;
    }

    const diffFilename = `${itemA.name}-${itemA.viewport.name}-${envA}-vs-${envB}-diff.png`;
    const diffPath = join(config.outputDirs.diffs, diffFilename);
    const label = `${itemA.name} @ ${itemA.viewport.name} [${envA} vs ${envB}]`;

    let imgA, imgB, bufA, bufB;
    try {
      bufA = readFileSync(itemA.screenshotPath);
      bufB = readFileSync(itemB.screenshotPath);

      if (config.ignoreRegions.length > 0) {
        console.log(chalk.cyan(`  Applying ${config.ignoreRegions.length} ignore region(s) before compare`));
        [bufA, bufB] = await Promise.all([
          applyIgnoreRegions(bufA, config.ignoreRegions),
          applyIgnoreRegions(bufB, config.ignoreRegions),
        ]);
      }

      imgA = PNG.sync.read(bufA);
      imgB = PNG.sync.read(bufB);
    } catch (err) {
      console.error(chalk.red(`  [error] Could not read images for ${label}: ${err.message}`));
      results.push({ name: itemA.name, viewport: itemA.viewport, urlA: itemA.url, urlB: itemB.url, status: 'failed', reason: 'read error', screenshotPathA: itemA.screenshotPath, screenshotPathB: itemB.screenshotPath });
      continue;
    }

    if (imgA.width !== imgB.width) {
      console.log(chalk.red(`✗ ${label} — width mismatch (${envA}: ${imgA.width}px, ${envB}: ${imgB.width}px)`));
      results.push({ name: itemA.name, viewport: itemA.viewport, urlA: itemA.url, urlB: itemB.url, status: 'failed', reason: 'width mismatch', screenshotPathA: itemA.screenshotPath, screenshotPathB: itemB.screenshotPath });
      continue;
    }

    const width = imgA.width;
    let height = imgA.height;
    let dataA = imgA.data;
    let dataB = imgB.data;

    if (imgA.height !== imgB.height) {
      const minHeight = Math.min(imgA.height, imgB.height);
      console.log(chalk.yellow(`  ⚠ ${label} — height differs (${envA}: ${imgA.height}px, ${envB}: ${imgB.height}px) — cropping both to ${minHeight}px`));
      try {
        const [croppedBufA, croppedBufB] = await Promise.all([
          sharp(bufA).extract({ left: 0, top: 0, width, height: minHeight }).png().toBuffer(),
          sharp(bufB).extract({ left: 0, top: 0, width, height: minHeight }).png().toBuffer(),
        ]);
        dataA = PNG.sync.read(croppedBufA).data;
        dataB = PNG.sync.read(croppedBufB).data;
        height = minHeight;
      } catch (err) {
        console.error(chalk.red(`  [error] Could not crop images for ${label}: ${err.message}`));
        results.push({ name: itemA.name, viewport: itemA.viewport, urlA: itemA.url, urlB: itemB.url, status: 'failed', reason: 'crop error', screenshotPathA: itemA.screenshotPath, screenshotPathB: itemB.screenshotPath });
        continue;
      }
    }

    const diffImg = new PNG({ width, height });
    const differentPixels = pixelmatch(dataA, dataB, diffImg.data, width, height, { threshold: config.threshold });
    const diffPercent = (differentPixels / (width * height)) * 100;

    writeFileSync(diffPath, PNG.sync.write(diffImg));

    const status = diffPercent < config.threshold ? 'passed' : 'failed';

    if (status === 'passed') {
      console.log(chalk.green(`✓ ${label} — ${diffPercent.toFixed(2)}% diff (passed)`));
    } else {
      console.log(chalk.red(`✗ ${label} — ${diffPercent.toFixed(2)}% diff (failed)`));
    }

    results.push({ name: itemA.name, viewport: itemA.viewport, urlA: itemA.url, urlB: itemB.url, status, diffPercent, screenshotPathA: itemA.screenshotPath, screenshotPathB: itemB.screenshotPath, diffPath });
  }

  return results;
}

export { updateBaselines, checkBaselines, compareScreenshots, compareEnvs };
