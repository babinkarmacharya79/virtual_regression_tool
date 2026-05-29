# visual-regress

A command-line visual regression testing tool built on Playwright and pixelmatch. It captures full-page screenshots of your web app at multiple viewports, compares them against saved baselines pixel-by-pixel, and generates a self-contained HTML report highlighting every change. Supports masking dynamic regions so ads, timestamps, and animated content don't trigger false failures.

---

## How it works

### Full pipeline — what happens when you run `vrt run`

```
  You type: vrt run
  cli.js receives the command
           │
           ▼
  ┌─────────────────────────────────────┐
  │  config.js loads vrt.config.json    │
  │  Reads URLs, viewports, threshold   │
  └─────────────────────────────────────┘
           │
           ▼
  ┌─────────────────────────────────────┐
  │  capture.js opens Chromium          │
  │  Visits each URL, saves .png shots  │
  └─────────────────────────────────────┘
           │
           ▼
  ┌─────────────────────────────────────┐
  │  compare.js checks baselines/       │
  │  First run = save as baseline,      │
  │  subsequent runs = diff against it  │
  └─────────────────────────────────────┘
           │
           ▼
  ┌─────────────────────────────────────┐
  │  Pixelmatch compares pixel by pixel │
  │  Saves red diff image, calculates   │
  │  diff %                             │
  └─────────────────────────────────────┘
           │
           ▼
  ┌─────────────────────────────────────┐
  │  report.js generates report.html   │
  └─────────────────────────────────────┘
```

### What Pixelmatch actually does

This is the heart of the tool. For every screenshot with an existing baseline, it compares the two images pixel by pixel:

```
  Baseline              Current               Diff image
  (saved last run)      (just captured)       (saved to diffs/)
  ┌────────────┐        ┌────────────┐        ┌────────────┐
  │            │        │            │        │            │
  │ ██████████ │   vs   │ ██████████ │  diff  │            │
  │ ██████████ │        │ ████  ████ │ ──────▶│ ████  ████ │
  │            │        │            │        │  (red)     │
  └────────────┘        └────────────┘        └────────────┘
  Button: blue          Button: red            Red = changed pixels
                        (changed!)
```

```
  Threshold = 0.1 in your config
  ├── If less than 0.1% of pixels changed  →  PASSED (tiny font rendering differences)
  └── If more than 0.1% of pixels changed  →  FAILED (real visual change detected)
```

### The three commands and when to use each

```
  ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐
  │      vrt run        │  │     vrt update       │  │    vrt capture      │
  │    Full pipeline    │  │   Approve changes    │  │  Screenshots only   │
  │                     │  │                      │  │                     │
  │ Capture + Compare   │  │ Captures fresh shots │  │ Takes screenshots,  │
  │ + Report            │  │ and saves all as new │  │ no comparison,      │
  │                     │  │ baselines            │  │ no report           │
  │ Use this daily.     │  │                      │  │                     │
  │ Run it after every  │  │ Use when you         │  │ Use to preview      │
  │ code change.        │  │ intentionally        │  │ what pages look     │
  │                     │  │ changed the UI.      │  │ like right now.     │
  └─────────────────────┘  └─────────────────────┘  └─────────────────────┘
```

---

## The mental model

Think of this tool as a **security camera for your UI**:

| Concept | Security camera analogy |
|---|---|
| **Baseline** | The reference photo of how things should look |
| **Screenshot** | Today's photo |
| **Diff** | The CCTV alarm that highlights what moved or changed |
| **Threshold** | How sensitive the alarm is |
| **`vrt run`** | Check if anything changed |
| **`vrt update`** | Say "this change is intentional, reset the camera" |

---

## Installation

```bash
# 1. Clone or copy the project
git clone https://github.com/your-org/visual-regress.git
cd visual-regress

# 2. Install dependencies
npm install

# 3. Install the Playwright Chromium browser
npx playwright install chromium

# 4. Link the CLI globally so you can run `vrt` from any directory
sudo npm link
```

---

## Configuration

Create a `vrt.config.json` file in your project root:

```json
{
  "environments": {
    "local":      "http://localhost:3000",
    "staging":    "https://staging.your-app.com",
    "production": "https://your-app.com"
  },
  "threshold": 0.1,
  "viewports": [
    { "name": "desktop", "width": 1280, "height": 800 },
    { "name": "mobile",  "width": 375,  "height": 812 }
  ],
  "pages": [
    { "name": "home",    "path": "/" },
    { "name": "about",   "path": "/about" },
    { "name": "pricing", "path": "/pricing" }
  ],
  "outputDirs": {
    "baselines":    "baselines",
    "screenshots":  "screenshots",
    "diffs":        "diffs",
    "reports":      "reports"
  },
  "ignoreRegions": [
    { "name": "cookie-banner", "x": 0, "y": 680, "width": 1280, "height": 120 }
  ]
}
```

You can also use a single `baseUrl` instead of `environments` if you only have one target:

```json
{
  "baseUrl": "https://your-app.com"
}
```

### Configuration options

| Field | Type | Default | Description |
|---|---|---|---|
| `environments` | object | — | Named environments: `{ "staging": "https://..." }`. Use with `--env` flag |
| `baseUrl` | string | — | Fallback URL when `--env` is not passed. Required if `environments` is not set |
| `threshold` | number | `0.1` | Pixel diff sensitivity (0–1). Also the pass/fail cutoff: fail if more than this % of pixels differ |
| `viewports` | array | desktop 1280×800 | List of `{ name, width, height }` objects |
| `pages` | array | `[]` | List of `{ name, path }` objects to capture |
| `outputDirs` | object | see above | Override any output folder path (absolute or relative to cwd) |
| `ignoreRegions` | array | `[]` | Areas masked with a black rectangle before comparison — `{ name, x, y, width, height }` |

---

## CLI commands

All three main commands accept an `--env` flag to target a named environment from `config.environments`:

```bash
vrt run    --env staging
vrt update --env staging
vrt capture --env staging
```

If `--env` is not passed, the command falls back to `baseUrl` in the config. If neither exists, the tool exits with an error.

---

### `vrt run` — full pipeline

Captures screenshots, compares against baselines, and generates an HTML report.

```bash
vrt run --env staging
```

```bash
# Use a custom config file
vrt run --env staging --config ./custom.config.json
```

On first run, any page with no existing baseline is auto-promoted (marked `new`). On subsequent runs, pages are compared and marked `passed` or `failed`.

**Example output:**
```
→ baseUrl: https://go-stage.ifrc.org
[1/2] Capturing: home @ desktop
[2/2] Capturing: afghanistan @ desktop
2 baselines found, 0 new pages detected
✓ home-desktop.png — 0.00% diff (passed)
✓ afghanistan-desktop.png — 0.00% diff (passed)
Report saved to: /path/to/reports/report.html

✓ 2 passed  ✗ 0 failed  ◆ 0 new  —  report saved to /path/to/reports/report.html
```

---

### `vrt update` — update baselines

Captures fresh screenshots and overwrites all baselines. Run this after intentional UI changes to accept the new look as the new ground truth.

```bash
vrt update --env staging
```

---

### `vrt capture` — screenshots only

Takes screenshots without running any comparison or generating a report. Useful for inspecting pages before committing to a baseline update.

```bash
vrt capture --env staging
```

---

### `vrt compare-envs` — compare two environments side by side

Captures both environments fresh and diffs them directly against each other — no baselines involved. Use this to detect visual differences between staging and production, or any two named environments.

```bash
vrt compare-envs --envA staging --envB alpha
```

**Example output:**
```
Capturing staging (https://go-stage.ifrc.org)...
[1/2] Capturing: home @ desktop [staging]
[2/2] Capturing: afghanistan @ desktop [staging]

Capturing alpha (https://alpha-3.ifrc-go.dev.togglecorp.com)...
[1/2] Capturing: home @ desktop [alpha]
[2/2] Capturing: afghanistan @ desktop [alpha]

  ⚠ home @ desktop [staging vs alpha] — height differs (staging: 3525px, alpha: 2206px) — cropping both to 2206px
✗ home @ desktop [staging vs alpha] — 23.98% diff (failed)
  ⚠ afghanistan @ desktop [staging vs alpha] — height differs (staging: 2776px, alpha: 832px) — cropping both to 832px
✗ afghanistan @ desktop [staging vs alpha] — 36.97% diff (failed)

✓ 0 passed  ✗ 2 failed  —  staging vs alpha
```

When two environments render the same page at different heights (because they have different amounts of data), the tool automatically crops both images to the shorter height and compares the overlapping area. This means you still get a meaningful diff even when content lengths differ — only a **width mismatch** is treated as a hard failure, since that indicates a real viewport or layout problem.

---

## Output structure

Each environment gets its own isolated subfolder so baselines and screenshots never mix:

```
baselines/
  staging/
    home-desktop.png           # Staging baselines
    afghanistan-desktop.png
  alpha/
    home-desktop.png           # Alpha baselines
    afghanistan-desktop.png

screenshots/
  staging/
    home-desktop.png           # Latest staging captures (overwritten each run)
    afghanistan-desktop.png
  alpha/
    home-desktop.png
    afghanistan-desktop.png

diffs/
  staging/
    home-desktop-diff.png      # Diff vs staging baseline
  home-desktop-staging-vs-alpha-diff.png   # compare-envs diff (no subfolder)

reports/
  report.html                  # Self-contained HTML report — open in any browser
```

The report links to images using relative paths, so the entire project folder can be archived or shared and the report will still display correctly.

---

## Comparing screenshots

### Option 1 — Detect changes over time on one environment

Run this daily or after every deploy to catch regressions:

```bash
# First time — capture baselines
vrt update --env staging

# After any deploy — check for changes
vrt run --env staging
```

If anything has changed visually, `vrt run` will report it as `failed` and the report will show the before/after/diff images side by side.

### Option 2 — Compare two environments against each other

Use this to verify staging matches production before a release:

```bash
vrt compare-envs --envA staging --envB alpha
```

No baselines needed — both environments are captured fresh and compared directly.

### Viewing results

Open the report in your browser:

```bash
xdg-open /path/to/visual-regress/reports/report.html
```

Failed results show a **three-image panel** — baseline on the left, current screenshot in the middle, diff on the right with changed pixels highlighted in red.

---

## Testing pages that require login

Many real-world apps require authentication before you can see the pages you want to test. Playwright supports this through **browser session state** — you log in once, save the cookies and localStorage to a file, and every subsequent capture loads that saved session instead of logging in again.

### How it works

```
  vrt login --env staging
           │
           ▼
  Playwright opens the login page
  Fills in username + password
  Submits the form, waits for redirect
           │
           ▼
  Saves .auth/staging.json
  (contains all cookies + localStorage)
           │
           ▼
  vrt run --env staging
  Loads .auth/staging.json into every browser context
  All pages open already authenticated
```

### Step 1 — add auth config to vrt.config.json

```json
{
  "environments": {
    "staging": "https://go-stage.ifrc.org"
  },
  "auth": {
    "loginUrl": "/login",
    "usernameField": "#username",
    "passwordField": "#password",
    "submitButton": "button[type=submit]",
    "successUrl":  "/dashboard"
  },
  "pages": [
    { "name": "dashboard", "path": "/dashboard" },
    { "name": "reports",   "path": "/reports" }
  ]
}
```

| Field | Description |
|---|---|
| `loginUrl` | Path to the login page (appended to the environment's base URL) |
| `usernameField` | CSS selector for the username/email input |
| `passwordField` | CSS selector for the password input |
| `submitButton` | CSS selector for the login submit button |
| `successUrl` | Path the app redirects to after a successful login — used to confirm login worked |

### Step 2 — store credentials in environment variables

Never put passwords in `vrt.config.json`. Use environment variables instead:

```bash
export VRT_USERNAME=your@email.com
export VRT_PASSWORD=yourpassword
```

Add these to your `~/.bashrc` or `~/.zshrc` so they're available in every terminal session.

### Step 3 — run the login command

```bash
vrt login --env staging
```

This opens Chromium, navigates to the login page, fills in the credentials from `VRT_USERNAME` / `VRT_PASSWORD`, submits the form, and saves the session to `.auth/staging.json`. You only need to do this once — until the session expires.

### Step 4 — run as normal

```bash
vrt run --env staging
```

The tool automatically detects `.auth/staging.json` and loads it into every browser context before navigating to your pages. No login screen will appear.

### Important notes

- **`.auth/` should be in `.gitignore`** — these files contain live session cookies and should never be committed.
- **Sessions expire** — if you start getting login redirects in your screenshots, just run `vrt login --env staging` again to refresh the session.
- **Each environment needs its own session** — `vrt login --env staging` and `vrt login --env production` create separate `.auth/staging.json` and `.auth/production.json` files.
- **This feature is not yet implemented** in the current version — the sections above describe the planned design. See the implementation plan below if you want to add it.

### Implementation plan (for contributors)

To add login support, three files need updating:

**1. `src/capture.js`** — before launching pages, check if `.auth/{envName}.json` exists and pass it to `browser.newContext({ storageState })`:
```js
const authFile = `.auth/${envName}.json`;
const storageState = fs.existsSync(authFile) ? authFile : undefined;
const context = await browser.newContext({ viewport, storageState });
```

**2. `src/config.js`** — pass through the `auth` block from `vrt.config.json` without validation (selectors are app-specific).

**3. `cli.js`** — add a `vrt login` command that:
- Reads `config.auth` and the env base URL
- Reads `VRT_USERNAME` / `VRT_PASSWORD` from `process.env`
- Opens a browser, navigates to `baseUrl + auth.loginUrl`
- Fills `auth.usernameField` and `auth.passwordField`
- Clicks `auth.submitButton`
- Waits for navigation to `auth.successUrl`
- Calls `context.storageState({ path: '.auth/${envName}.json' })`

---

## Troubleshooting

### Dimension mismatch error

```
✗ home-desktop.png — dimension mismatch (baseline: 1280x800, screenshot: 1280x3525)
```

This means the saved baseline and the new screenshot are different heights. Pixelmatch cannot compare images of different sizes.

**Cause:** The baselines were captured before the current screenshot strategy was in place (e.g. before `fullPage: true` or the wait strategy was updated), or the page content has grown/shrunk significantly since the last baseline.

**Fix:** Re-capture the baselines with the current strategy:

```bash
vrt update --env staging
vrt run --env staging     # now compares like-for-like
```

**Rule of thumb:** Any time you change how screenshots are taken (wait strategy, viewport size, fullPage setting), always run `vrt update` before running `vrt run` again.

---

### "Unknown environment: staging. Available: alpha, production"

The `--env` value doesn't match any key in `config.environments`. Check your `vrt.config.json`:

```json
{
  "environments": {
    "alpha":      "https://alpha.your-app.com",
    "production": "https://your-app.com"
  }
}
```

---

### "No baseUrl set. Use --env \<name\> or add baseUrl to config."

Your config has no `baseUrl` and you didn't pass `--env`. Either add a `baseUrl` to the config or always pass `--env`:

```bash
vrt run --env staging
```

---

### "Config file not found. Create a vrt.config.json in your project root to get started."

`vrt` looks for `vrt.config.json` in the directory where the command is run, not where `vrt` is installed. Make sure you are running the command from your project root and that the file exists:

```bash
ls vrt.config.json        # should print the filename
vrt run                   # run from the same directory
```

To use a config file in a different location, pass the path explicitly:

```bash
vrt run --config ./config/vrt.config.json
```

---

### Playwright / Chromium not installed

If you see an error like `browserType.launch: Executable doesn't exist`, the Chromium browser binary hasn't been downloaded yet:

```bash
npx playwright install chromium
```

On Linux, you may also need system dependencies. Playwright can install them for you:

```bash
npx playwright install-deps chromium
```

---

### `sudo npm link` fails

If `sudo npm link` produces a permissions error or `vrt: command not found` after linking, try one of the following:

**Option A — fix npm's global prefix to avoid needing sudo:**
```bash
mkdir -p ~/.npm-global
npm config set prefix ~/.npm-global
export PATH="$HOME/.npm-global/bin:$PATH"   # add this line to your ~/.bashrc or ~/.zshrc
npm link                                     # no sudo needed
```

**Option B — run directly with node without linking:**
```bash
node /path/to/visual-regress/cli.js run
```

**Option C — add a local alias:**
```bash
alias vrt="node /path/to/visual-regress/cli.js"
```
