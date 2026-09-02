/**
 * Build script for Perchance generator.
 *
 * Usage:
 *   node scripts/build-perchance.js          -> generates hosted-loader perchance/index.html & perchance/lists.perchance
 *   node scripts/build-perchance.js --bundle -> generates standalone inlined perchance/bundle.html
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const PERCHANCE_DIR = path.join(ROOT_DIR, 'perchance');
const HOSTED_BASE = 'https://rp.iyruk.com';

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function buildListsPerchance() {
  const content = [
    "title = Purple's RP - Roleplay with AI Characters",
    '',
    '// Perchance Plugins',
    'ai = {import:ai-text-plugin}',
    't2i = {import:text-to-image-plugin}',
    'icon = {import:fa-icon-plugin}',
    '',
    '$output = [root.htmlOutput || ""]',
    ''
  ].join('\r\n');
  fs.writeFileSync(path.join(PERCHANCE_DIR, 'lists.perchance'), content, 'utf8');
  console.log('  [OK] perchance/lists.perchance written');
}

function buildHostedIndex() {
  let html = fs.readFileSync(path.join(ROOT_DIR, 'index.html'), 'utf8');

  // Replace relative URLs with hosted URLs
  html = html.replace(/href="logo\.png"/g, `href="${HOSTED_BASE}/logo.png"`);
  html = html.replace(/src="logo\.png"/g, `src="${HOSTED_BASE}/logo.png"`);
  html = html.replace(/href="style\.css"/g, `href="${HOSTED_BASE}/style.css"`);
  html = html.replace(/src="js\//g, `src="${HOSTED_BASE}/js/`);

  // Inject Perchance bridge before </head>
  const bridge = [
    '  <script>',
    '  // Perchance iframe root bridge',
    '  if (typeof root === "undefined" && typeof window.parent !== "undefined" && window.parent.root) {',
    '    window.root = window.parent.root;',
    '  }',
    '  </script>',
    '</head>'
  ].join('\n');
  html = html.replace('</head>', bridge);

  fs.writeFileSync(path.join(PERCHANCE_DIR, 'index.html'), html, 'utf8');
  console.log('  [OK] perchance/index.html (hosted loader) written');
}

function buildBundle() {
  let html = fs.readFileSync(path.join(ROOT_DIR, 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(ROOT_DIR, 'style.css'), 'utf8');

  // Replace style.css link with inline <style>
  html = html.replace(/<link rel="stylesheet" href="style\.css">/, `<style>\n${css}\n</style>`);

  // Replace logo with hosted
  html = html.replace(/href="logo\.png"/g, `href="${HOSTED_BASE}/logo.png"`);
  html = html.replace(/src="logo\.png"/g, `src="${HOSTED_BASE}/logo.png"`);

  // Read all JS scripts in order and inline them
  const jsOrder = [
    'js/settings.js',
    'js/db.js',
    'js/provider.js',
    'js/ui.js',
    'js/import.js',
    'js/export.js',
    'js/backup.js',
    'js/nova-images.js',
    'js/seed.js',
    'js/app.js'
  ];

  let combinedJs = '  // Perchance iframe root bridge\n  if (typeof root === "undefined" && typeof window.parent !== "undefined" && window.parent.root) {\n    window.root = window.parent.root;\n  }\n\n';
  for (const jsFile of jsOrder) {
    const jsContent = fs.readFileSync(path.join(ROOT_DIR, jsFile), 'utf8');
    combinedJs += `\n/* --- ${jsFile} --- */\n` + jsContent + '\n';
  }

  // Remove individual <script src="js/..."></script> tags and replace with bundled <script>
  for (const jsFile of jsOrder) {
    const rx = new RegExp(`<script src="${jsFile}"><\\/script>\\r?\\n?`);
    html = html.replace(rx, '');
  }

  const bundledScript = `<script>\n${combinedJs}\n</script>\n</body>`;
  html = html.replace('</body>', bundledScript);

  fs.writeFileSync(path.join(PERCHANCE_DIR, 'bundle.html'), html, 'utf8');
  console.log('  [OK] perchance/bundle.html (standalone bundle) written');
}

ensureDir(PERCHANCE_DIR);
buildListsPerchance();
buildHostedIndex();

if (process.argv.includes('--bundle')) {
  buildBundle();
}
