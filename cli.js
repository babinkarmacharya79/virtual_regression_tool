#!/usr/bin/env node
import { join } from 'path';
import { program } from 'commander';
import chalk from 'chalk';
import { loadConfig, ensureOutputDirs } from './src/config.js';
import { captureScreenshots } from './src/capture.js';
import { updateBaselines, compareScreenshots, compareEnvs } from './src/compare.js';
import { generateReport } from './src/report.js';

program
  .name('vrt')
  .description('Visual regression testing tool')
  .version('1.0.0');

const configOption = ['--config <path>', 'path to config file', './vrt.config.json'];
const envOption    = ['--env <name>', 'use a named environment from config.environments as baseUrl'];

function applyEnv(config, envName) {
  const available = Object.keys(config.environments ?? {});

  if (envName) {
    if (!config.environments?.[envName]) {
      throw new Error(`Unknown environment: ${envName}. Available: ${available.join(', ')}`);
    }
    return {
      ...config,
      baseUrl: config.environments[envName],
      outputDirs: {
        ...config.outputDirs,
        screenshots: join(config.outputDirs.screenshots, envName),
        baselines:   join(config.outputDirs.baselines,   envName),
        diffs:       join(config.outputDirs.diffs,        envName),
      },
    };
  }

  if (!config.baseUrl) {
    const hint = available.length
      ? `Use --env <name> or add baseUrl to config. Available: ${available.join(', ')}`
      : 'Use --env <name> or add baseUrl to config.';
    throw new Error(`No baseUrl set. ${hint}`);
  }

  return config;
}

program
  .command('run')
  .description('Capture screenshots, compare against baselines, and generate a report')
  .option(...configOption)
  .option(...envOption)
  .action(async ({ config: configPath, env }) => {
    try {
      const config = applyEnv(loadConfig(configPath), env);
      console.log(chalk.cyan(`→ baseUrl: ${config.baseUrl}`));
      await ensureOutputDirs(config);
      const screenshots = await captureScreenshots(config);
      const results = await compareScreenshots(screenshots, config);
      const reportPath = await generateReport(results, config);

      const passed   = results.filter(r => r.status === 'passed').length;
      const failed   = results.filter(r => r.status === 'failed').length;
      const newCount = results.filter(r => r.status === 'new').length;

      console.log(
        `\n${chalk.green(`✓ ${passed} passed`)}  ${chalk.red(`✗ ${failed} failed`)}  ${chalk.yellow(`◆ ${newCount} new`)}  —  ${chalk.cyan(`report saved to ${reportPath}`)}`
      );
    } catch (err) {
      console.error(chalk.red(`[vrt] run failed: ${err.message}`));
      process.exit(1);
    }
  });

program
  .command('update')
  .description('Capture fresh screenshots and overwrite all baselines')
  .option(...configOption)
  .option(...envOption)
  .action(async ({ config: configPath, env }) => {
    try {
      const config = applyEnv(loadConfig(configPath), env);
      console.log(chalk.cyan(`→ baseUrl: ${config.baseUrl}`));
      await ensureOutputDirs(config);
      const screenshots = await captureScreenshots(config);
      const baselines = await updateBaselines(screenshots, config);
      console.log(chalk.green(`\n${baselines.length} baseline${baselines.length !== 1 ? 's' : ''} updated.`));
    } catch (err) {
      console.error(chalk.red(`[vrt] update failed: ${err.message}`));
      process.exit(1);
    }
  });

program
  .command('capture')
  .description('Capture screenshots only — no comparison or report')
  .option(...configOption)
  .option(...envOption)
  .action(async ({ config: configPath, env }) => {
    try {
      const config = applyEnv(loadConfig(configPath), env);
      console.log(chalk.cyan(`→ baseUrl: ${config.baseUrl}`));
      await ensureOutputDirs(config);
      const screenshots = await captureScreenshots(config);
      console.log(chalk.cyan(`\n${screenshots.length} screenshot${screenshots.length !== 1 ? 's' : ''} saved to ${config.outputDirs.screenshots}`));
    } catch (err) {
      console.error(chalk.red(`[vrt] capture failed: ${err.message}`));
      process.exit(1);
    }
  });

program
  .command('compare-envs')
  .description('Capture and compare two named environments side by side')
  .option(...configOption)
  .requiredOption('--envA <name>', 'first environment (from config.environments)')
  .requiredOption('--envB <name>', 'second environment (from config.environments)')
  .action(async ({ config: configPath, envA, envB }) => {
    try {
      const config = loadConfig(configPath);

      if (!config.environments) {
        throw new Error('No "environments" object found in config. Add named environments with base URLs to vrt.config.json.');
      }
      if (!config.environments[envA]) {
        throw new Error(`Environment "${envA}" not found in config.environments. Available: ${Object.keys(config.environments).join(', ')}`);
      }
      if (!config.environments[envB]) {
        throw new Error(`Environment "${envB}" not found in config.environments. Available: ${Object.keys(config.environments).join(', ')}`);
      }

      await ensureOutputDirs(config);
      const results = await compareEnvs(envA, envB, config);

      const passed = results.filter(r => r.status === 'passed').length;
      const failed = results.filter(r => r.status === 'failed').length;

      console.log(
        `\n${chalk.green(`✓ ${passed} passed`)}  ${chalk.red(`✗ ${failed} failed`)}  —  ${chalk.cyan(`${envA} vs ${envB}`)}`
      );
    } catch (err) {
      console.error(chalk.red(`[vrt] compare-envs failed: ${err.message}`));
      process.exit(1);
    }
  });

program.parse();
