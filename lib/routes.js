'use strict';

/**
 * lib/routes.js — Single source of truth for all route → hash path mappings.
 *
 * Every page (including home) gets a unique 96-char hex hash as its public URL.
 * The root path "/" redirects to the home hash via _redirects.
 *
 * DO NOT change these hashes after deployment — it will break shared links.
 */

const ROUTE_MAP = {
  '/'                  : '/d4f8a2c6e9b3f1a7c4e8d2b5f9a1c3e6d8b4f7a2c5e9d1b6f3a8c2e4d7b1f9a5c3b6e2d9f4a8c1e7b5d3f9a8c2e1d6b4',
  '/author'            : '/e9a4f2c8b3d7e1f6a5c2e8d4b9f3a7c1e6d2b8f5a3c9e4d1b7f2a6c3e8d5b1f9a4c7e3b8d6f1a4c9e2b5d8f3a7c1e6d4',
  '/review'            : '/f1b7e3a9c4d8f2b5e9a3c7d1f8b4e2a6c9d5f3b1e7a4c2d8f6b9e1a5c3d7f4b2e8a1c7d4f9b3e6c2d8f5b1e4c9d3f7a2',
  '/author/submission' : '/a3d9f5b1e7c2d8f4a6c1e9b3d5f7a2c8e4b6d1f9a5c3e7b2d4f8a1c6e3b9d2f5a7c8e4b6d2f9a3c7e1b5d8f4a9c2e6b3',
  '/author/email'      : '/b8f4a2c6e1d9b5f3a7c4e8d2b6f1a9c3e5d7b4f2a8c1e6d3b7f5a2c9e4d1b6f8a3d2c7e9b1f5a4c8e2d6b9f3a5c1e7d4',
  '/author/editing'    : '/c6e2b9f4a1d7c3e8b5f2a4c9e1d6b3f8a7c2e5d9b1f4a8c3e2d5b7f9a1c6e4d2b8f7a9c3e6b2d4f1a8c5e9b4d7f2a6c1',
};

// Reverse map: hash → clean path (used by express server)
const HASH_TO_PATH = {};
for (const [clean, hash] of Object.entries(ROUTE_MAP)) {
  HASH_TO_PATH[hash] = clean;
}

module.exports = { ROUTE_MAP, HASH_TO_PATH };
