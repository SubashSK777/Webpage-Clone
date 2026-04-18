'use strict';

/**
 * build.js — Static pre-renderer for Cloudflare Pages deployment.
 *
 * Cloudflare Pages is static-only (no Node.js at runtime). This script:
 *   1. Parses every MHTML file and applies all transforms (same logic as server.js)
 *   2. Writes pre-rendered HTML to dist/<route>/index.html
 *   3. Copies the two PDFs into dist/download/<key>  (no extension)
 *   4. Writes dist/_headers so Cloudflare sends correct Content-Disposition
 *
 * Build command  : npm run build
 * Output dir     : dist/
 * Cloudflare cfg : wrangler.toml  (or dashboard: build=npm run build, out=dist)
 */

const fs      = require('fs');
const path    = require('path');
const cheerio = require('cheerio');
const { parseMhtml } = require('./lib/mhtml-parser');
const { buildPage  } = require('./lib/page-builder');

const MHTML_DIR = path.join(__dirname, 'public');
const DIST      = path.join(__dirname, 'dist');

// ── Route table ──────────────────────────────────────────────────────────────
const ROUTES = [
  { urlPath: '/',                  file: 'Home.mhtml',                          outFile: 'index.html'                   },
  { urlPath: '/author',            file: 'Author.mhtml',                        outFile: 'author/index.html'            },
  { urlPath: '/review',            file: 'Review.mhtml',                        outFile: 'review/index.html'            },
  { urlPath: '/author/submission', file: 'Start New Submission (Author).mhtml', outFile: 'author/submission/index.html' },
  { urlPath: '/author/email',      file: 'Recent Email (Author).mhtml',         outFile: 'author/email/index.html'      },
  { urlPath: '/author/editing',    file: 'English Editing (Author).mhtml',      outFile: 'author/editing/index.html'    },
];

// ── PDF assets ────────────────────────────────────────────────────────────────
const PDFS = [
  {
    key:      'accepted-draft',
    src:      path.join(__dirname, 'IJIEOM-04-2026-0114_Accepted_Draft.pdf'),
    filename: 'IJIEOM-04-2026-0114_Accepted_Draft.pdf',
  },
  {
    key:      'original-files',
    src:      path.join(__dirname, 'Selective State Space Models for Real-Time Log Intelligence.pdf'),
    filename: 'Selective State Space Models for Real-Time Log Intelligence.pdf',
  },
];

// ═══════════════════════════════════════════════════════════════════════════
//  Transform functions  (identical to server.js — kept in sync manually)
// ═══════════════════════════════════════════════════════════════════════════

function transformEditingPage($) {
  $('#closeBtn')
    .attr('href', 'javascript:history.back()')
    .removeAttr('data-dismiss')
    .removeAttr('onclick');

  $('button.close[data-dismiss="modal"], button.close[aria-hidden]').each((_, el) => {
    $(el).attr('onclick', 'history.back(); return false;').removeAttr('data-dismiss');
  });
}

function transformAuthorPage($) {
  $('body').append(`<script id="__author_patches__">
(function () {
  'use strict';
  var obs = null;
  var LINKS = [
    { text: 'Manuscripts with Decisions',       href: '/author'            },
    { text: 'Start New Submission',             href: '/author/submission' },
    { text: '5 Most Recent E-mails',            href: '/author/email'      },
    { text: 'English Language Editing Service', href: '/author/editing'    }
  ];
  function patch() {
    if (obs) obs.disconnect();
    document.querySelectorAll('a').forEach(function (a) {
      var txt = (a.textContent || '').replace(/\s+/g, ' ').trim();
      var cur = a.getAttribute('href') || '';
      for (var i = 0; i < LINKS.length; i++) {
        if (txt.indexOf(LINKS[i].text) !== -1 && cur !== LINKS[i].href) {
          a.setAttribute('href', LINKS[i].href);
          a.removeAttribute('onclick');
        }
      }
      if (txt.toLowerCase().indexOf('view decision letter') !== -1) {
        a.remove(); return;
      }
      if (txt === 'Contact Journal' && cur.indexOf('mail.google.com') === -1) {
        a.setAttribute('href', 'https://mail.google.com/mail/?view=cm&to=editorial.ijieom@gmail.com');
        a.setAttribute('target', '_blank');
        a.setAttribute('rel', 'noopener noreferrer');
        a.removeAttribute('data-dismiss');
        a.removeAttribute('onclick');
      }
    });
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
    var node;
    while ((node = walker.nextNode())) {
      if (node.nodeValue.indexOf('03-Apr-2026') !== -1)
        node.nodeValue = node.nodeValue.split('03-Apr-2026').join('02-Jan-2026');
      if (node.nodeValue.indexOf('Immediate Reject (04-Apr-2026)') !== -1)
        node.nodeValue = node.nodeValue.split('Immediate Reject (04-Apr-2026)')
          .join('Accepted on (04-Apr-2026) will be published on next issue');
    }
    if (obs) obs.observe(document.body, { childList: true, subtree: true });
  }
  function setup() {
    patch();
    obs = new MutationObserver(function () { patch(); });
    obs.observe(document.body, { childList: true, subtree: true });
    setTimeout(patch, 800);
    setTimeout(patch, 2500);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setup);
  } else { setup(); }
})();
<\/script>`);
}

function transformReviewPage($) {
  $('body').append(`<script id="__review_patches__">
(function () {
  'use strict';
  var obs = null;
  function patch() {
    if (obs) obs.disconnect();
    document.querySelectorAll('a').forEach(function (a) {
      var txt = (a.textContent || '').replace(/\s+/g, ' ').trim();
      var cur = a.getAttribute('href') || '';
      if ((txt.indexOf('Submitted Reviews') !== -1 || txt.indexOf('Invitations') !== -1) && (!cur || cur === '#'))
        a.setAttribute('href', '/review');
    });
    if (obs) obs.observe(document.body, { childList: true, subtree: true });
  }
  function setup() {
    patch();
    obs = new MutationObserver(function () { patch(); });
    obs.observe(document.body, { childList: true, subtree: true });
    setTimeout(patch, 800);
    setTimeout(patch, 2500);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setup);
  } else { setup(); }
})();
<\/script>`);
}

const PAGE_TRANSFORMS = {
  '/author/editing': transformEditingPage,
  '/author':         transformAuthorPage,
  '/review':         transformReviewPage,
};

// ═══════════════════════════════════════════════════════════════════════════
//  Build
// ═══════════════════════════════════════════════════════════════════════════

// Clean + create dist/
if (fs.existsSync(DIST)) fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });

console.log('\n🔨  Building static site for Cloudflare Pages...\n');

// 1. Render each page
let ok = true;
for (const route of ROUTES) {
  const filePath = path.join(MHTML_DIR, route.file);
  try {
    const { html, resources, baseUrl } = parseMhtml(filePath);
    let fullHtml = buildPage(html, resources, baseUrl);

    const transform = PAGE_TRANSFORMS[route.urlPath];
    if (transform) {
      const $ = cheerio.load(fullHtml, { decodeEntities: false });
      transform($);
      fullHtml = $.html();
    }

    const outPath = path.join(DIST, route.outFile);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, fullHtml, 'utf8');

    const kb = Math.round(fs.statSync(outPath).size / 1024);
    console.log(`  ✅  ${route.urlPath.padEnd(24)} →  dist/${route.outFile}  (${kb} KB)`);
  } catch (err) {
    console.error(`  ❌  ${route.urlPath.padEnd(24)} ←  ${route.file}`);
    console.error(`        ${err.message}`);
    ok = false;
  }
}

// 2. Copy PDFs into dist/download/<key>  (no extension — matches hrefs in MHTML)
console.log('');
const dlDir = path.join(DIST, 'download');
fs.mkdirSync(dlDir, { recursive: true });

for (const pdf of PDFS) {
  if (!fs.existsSync(pdf.src)) {
    console.warn(`  ⚠️   PDF not found, skipping: ${pdf.src}`);
    continue;
  }
  const dest = path.join(dlDir, pdf.key);   // no extension
  fs.copyFileSync(pdf.src, dest);
  const kb = Math.round(fs.statSync(dest).size / 1024);
  console.log(`  📄  /download/${pdf.key.padEnd(20)} →  dist/download/${pdf.key}  (${kb} KB)`);
}

// 3. Write _headers so Cloudflare Pages sends correct Content-Disposition
//    (forces browser Save-As dialog instead of opening PDF inline)
const headersContent = PDFS.map(pdf => [
  `/download/${pdf.key}`,
  `  Content-Type: application/pdf`,
  `  Content-Disposition: attachment; filename="${pdf.filename}"`,
].join('\n')).join('\n\n');

fs.writeFileSync(path.join(DIST, '_headers'), headersContent + '\n');
console.log('\n  📋  dist/_headers written');

// 4. Final status
if (!ok) { console.error('\n❌  Build completed with errors.\n'); process.exit(1); }
console.log('\n✅  Build complete → dist/\n');
