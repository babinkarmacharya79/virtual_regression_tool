import { chromium } from 'playwright';
import { join } from 'path';
import fs from 'fs-extra';
import chalk from 'chalk';

async function _runCaptures(browser, baseUrl, envName, config) {
  const results = [];
  const tasks = config.pages.flatMap(page =>
    config.viewports.map(viewport => ({ page, viewport }))
  );

  for (let i = 0; i < tasks.length; i++) {
    const { page, viewport } = tasks[i];
    const url = `${baseUrl}${page.path}`;
    const filename = envName
      ? `${page.name}-${viewport.name}-${envName}.png`
      : `${page.name}-${viewport.name}.png`;
    const screenshotPath = join(config.outputDirs.screenshots, filename);
    const label = envName
      ? `${page.name} @ ${viewport.name} [${envName}]`
      : `${page.name} @ ${viewport.name}`;

    console.log(chalk.cyan(`[${i + 1}/${tasks.length}] Capturing: ${label}`));

    try {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
      });
      const browserPage = await context.newPage();
      await browserPage.goto(url, { waitUntil: 'load', timeout: 90000 });
      await browserPage.waitForTimeout(5000);
      await browserPage.screenshot({ path: screenshotPath, fullPage: true });
      await context.close();
      results.push({ name: page.name, url, viewport, screenshotPath, ...(envName ? { envName } : {}) });
    } catch (err) {
      console.error(chalk.red(`  [error] ${page.name} @ ${viewport.name} — URL unreachable or capture failed: ${err.message}`));
    }
  }

  return results;
}

async function captureScreenshots(config) {
  await fs.ensureDir(config.outputDirs.screenshots);
  const browser = await chromium.launch({ headless: true });
  const results = await _runCaptures(browser, config.baseUrl, null, config);
  await browser.close();
  return results;
}

async function captureEnv(envName, baseUrl, config) {
  await fs.ensureDir(config.outputDirs.screenshots);
  const browser = await chromium.launch({ headless: true });
  const results = await _runCaptures(browser, baseUrl, envName, config);
  await browser.close();
  return results;
}

export { captureScreenshots, captureEnv };
