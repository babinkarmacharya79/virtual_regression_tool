import { join, relative } from 'path';
import fs from 'fs-extra';
import chalk from 'chalk';

function relPath(from, to) {
  return to ? relative(from, to).replaceAll('\\', '/') : null;
}

function statusBadge(status) {
  const styles = {
    passed: 'background:#1a7f37;color:#fff',
    failed: 'background:#cf222e;color:#fff',
    new:    'background:#9a6700;color:#fff',
  };
  return `<span style="padding:3px 10px;border-radius:4px;font-size:12px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;${styles[status]}">${status}</span>`;
}

function progressBar(passed, total) {
  const pct = total === 0 ? 0 : Math.round((passed / total) * 100);
  return `
    <div style="margin:16px 0 4px;font-size:13px;color:#8b949e">${pct}% passing</div>
    <div style="background:#21262d;border-radius:6px;height:10px;overflow:hidden;width:100%">
      <div style="background:#1a7f37;height:100%;width:${pct}%;transition:width .3s"></div>
    </div>`;
}

function imageTriple(reportsDir, item) {
  const base = relPath(reportsDir, item.baselinePath);
  const curr = relPath(reportsDir, item.screenshotPath);
  const diff = relPath(reportsDir, item.diffPath);
  const imgStyle = 'max-width:100%;border-radius:4px;border:1px solid #30363d';
  const labelStyle = 'text-align:center;font-size:12px;color:#8b949e;margin-top:6px';
  return `
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-top:16px">
      <div><img src="${base}" style="${imgStyle}" loading="lazy"><div style="${labelStyle}">Baseline</div></div>
      <div><img src="${curr}" style="${imgStyle}" loading="lazy"><div style="${labelStyle}">Current</div></div>
      <div><img src="${diff}" style="${imgStyle}" loading="lazy"><div style="${labelStyle}">Diff</div></div>
    </div>`;
}

function imageSingle(reportsDir, item) {
  const src = relPath(reportsDir, item.screenshotPath);
  return `
    <div style="margin-top:16px">
      <img src="${src}" style="max-width:480px;border-radius:4px;border:1px solid #30363d" loading="lazy">
      <div style="font-size:12px;color:#8b949e;margin-top:6px">New screenshot</div>
    </div>`;
}

function resultCard(item, reportsDir) {
  const accent = item.status === 'failed' ? 'border-left:4px solid #cf222e' : 'border-left:4px solid #21262d';
  const diffLine = item.diffPercent != null
    ? `<span style="font-size:13px;color:#8b949e;margin-left:12px">${item.diffPercent.toFixed(2)}% diff</span>`
    : '';
  const viewport = item.viewport
    ? `<span style="font-size:13px;color:#8b949e">${item.viewport.name} &mdash; ${item.viewport.width}&times;${item.viewport.height} viewport</span>`
    : '';
  const reasonLine = item.reason
    ? `<div style="font-size:12px;color:#cf222e;margin-top:4px">Reason: ${item.reason}</div>`
    : '';
  let images = '';
  if (item.status === 'failed' && item.diffPath) images = imageTriple(reportsDir, item);
  if (item.status === 'new') images = imageSingle(reportsDir, item);

  return `
  <div style="background:#161b22;border:1px solid #30363d;border-radius:8px;padding:20px 24px;${accent}">
    <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
      <span style="font-size:16px;font-weight:600;color:#e6edf3">${item.name}</span>
      ${statusBadge(item.status)}
      ${diffLine}
    </div>
    <div style="margin-top:6px">${viewport}</div>
    <div style="font-size:12px;color:#6e7681;margin-top:2px;word-break:break-all">${item.url ?? ''}</div>
    ${reasonLine}
    ${images}
  </div>`;
}

function buildHtml(results, config, timestamp) {
  const reportsDir = config.outputDirs.reports;
  const total  = results.length;
  const passed = results.filter(r => r.status === 'passed').length;
  const failed = results.filter(r => r.status === 'failed').length;
  const newCount = results.filter(r => r.status === 'new').length;

  const cards = results.map(r => resultCard(r, reportsDir)).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Visual Regress — Report</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #0d1117; color: #e6edf3; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 40px 24px; }
    .wrap { max-width: 960px; margin: 0 auto; }
    h1 { font-size: 24px; font-weight: 700; letter-spacing: -0.5px; }
    .cards { display: flex; flex-direction: column; gap: 16px; margin-top: 32px; }
  </style>
</head>
<body>
<div class="wrap">

  <div style="display:flex;align-items:baseline;gap:16px;border-bottom:1px solid #21262d;padding-bottom:20px;margin-bottom:24px">
    <h1>Visual Regress</h1>
    <span style="font-size:13px;color:#6e7681">${timestamp}</span>
  </div>

  <div style="display:flex;gap:24px;flex-wrap:wrap">
    <div style="font-size:14px;color:#8b949e">Total <strong style="color:#e6edf3;font-size:20px;margin-left:6px">${total}</strong></div>
    <div style="font-size:14px;color:#8b949e">Passed <strong style="color:#3fb950;font-size:20px;margin-left:6px">${passed}</strong></div>
    <div style="font-size:14px;color:#8b949e">Failed <strong style="color:#f85149;font-size:20px;margin-left:6px">${failed}</strong></div>
    <div style="font-size:14px;color:#8b949e">New <strong style="color:#e3b341;font-size:20px;margin-left:6px">${newCount}</strong></div>
  </div>

  ${progressBar(passed, total)}

  <div class="cards">
    ${cards}
  </div>

</div>
</body>
</html>`;
}

async function generateReport(results, config) {
  await fs.ensureDir(config.outputDirs.reports);

  const timestamp = new Date().toLocaleString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });

  const html = buildHtml(results, config, timestamp);
  const outputPath = join(config.outputDirs.reports, 'report.html');
  await fs.writeFile(outputPath, html, 'utf8');

  console.log(chalk.green(`Report saved to: ${outputPath}`));
  return outputPath;
}

export { generateReport };
