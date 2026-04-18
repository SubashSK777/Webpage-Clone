'use strict';

/**
 * lib/mhtml-parser.js
 * Parses a .mhtml file into:
 *   - html:      the main HTML string (decoded)
 *   - resources: Map<contentLocation, { contentType, data: Buffer }>
 *   - baseUrl:   the content-location of the main HTML part
 */

const fs = require('fs');

// ── Quoted-Printable decoder ───────────────────────────────────────────────
function decodeQuotedPrintable(str) {
  return str
    .replace(/=\r?\n/g, '')                               // remove soft line breaks
    .replace(/=([0-9A-Fa-f]{2})/g, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16))
    );
}

// ── Header block parser ────────────────────────────────────────────────────
function parseHeaders(block) {
  const headers = {};
  // unfold continuation lines
  const lines = block.replace(/\r?\n[ \t]+/g, ' ').split(/\r?\n/);
  for (const line of lines) {
    const idx = line.indexOf(':');
    if (idx > 0) {
      const key   = line.slice(0, idx).trim().toLowerCase();
      const value = line.slice(idx + 1).trim();
      headers[key] = value;
    }
  }
  return headers;
}

// ── Main parser ────────────────────────────────────────────────────────────
function parseMhtml(filePath) {
  // Read as latin1 — preserves every byte value intact
  const raw = fs.readFileSync(filePath, 'latin1');

  // Find MIME boundary
  const boundaryMatch = raw.match(/boundary="([^"]+)"/i)
    || raw.match(/boundary=([^\s;]+)/i);
  if (!boundaryMatch) {
    throw new Error(`No MIME boundary found in: ${filePath}`);
  }
  const boundary = boundaryMatch[1].replace(/^"|"$/g, '');

  const parts     = raw.split('--' + boundary);
  const resources = new Map();
  let mainHtml    = null;
  let baseUrl     = null;

  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];
    if (!part || part.trimStart().startsWith('--')) continue;

    // Split headers / body — handle both \r\n\r\n and \n\n
    let headerEnd, bodyStart;
    const crlfIdx = part.indexOf('\r\n\r\n');
    const lfIdx   = part.indexOf('\n\n');

    if (crlfIdx !== -1 && (lfIdx === -1 || crlfIdx < lfIdx)) {
      headerEnd = crlfIdx;
      bodyStart = crlfIdx + 4;
    } else if (lfIdx !== -1) {
      headerEnd = lfIdx;
      bodyStart = lfIdx + 2;
    } else {
      continue;
    }

    const headerBlock = part.slice(0, headerEnd);
    let   body        = part.slice(bodyStart);

    // Strip trailing CRLF before next boundary
    if (body.endsWith('\r\n')) body = body.slice(0, -2);

    const headers     = parseHeaders(headerBlock);
    const contentType = (headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    const encoding    = (headers['content-transfer-encoding'] || '').toLowerCase().trim();
    const location    = headers['content-location'] || '';

    // Decode body to a Buffer
    let data;
    if (encoding === 'base64') {
      data = Buffer.from(body.replace(/\s+/g, ''), 'base64');
    } else if (encoding === 'quoted-printable') {
      data = Buffer.from(decodeQuotedPrintable(body), 'latin1');
    } else {
      data = Buffer.from(body, 'latin1');
    }

    // Stash resource
    if (location) {
      resources.set(location, {
        contentType: contentType || 'application/octet-stream',
        data,
      });
    }

    // First text/html part = main page
    if (contentType === 'text/html' && !mainHtml) {
      mainHtml = data.toString('utf8');
      baseUrl  = location;
    }
  }

  if (!mainHtml) throw new Error(`No HTML part found in: ${filePath}`);
  return { html: mainHtml, resources, baseUrl };
}

module.exports = { parseMhtml };
