import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function meaningModelRoot() {
  const root = process.env.MEANING_MODEL_DIR ? resolve(process.env.MEANING_MODEL_DIR)
    : dirname(createRequire(import.meta.url).resolve('@emergent-wisdom/meaning-model-mcp/package.json'));
  if (!existsSync(join(root, 'mcp-server/viewer/public/start.js')))
    throw new Error('Meaning Model MCP 0.5.0 or later is required. Install dependencies, or set MEANING_MODEL_DIR to its source checkout.');
  return root;
}

export const viewerDirectory = () => join(meaningModelRoot(), 'mcp-server/viewer/public');
export const loadMeaningModel = (file) => import(pathToFileURL(join(meaningModelRoot(), 'mcp-server', file)).href);
