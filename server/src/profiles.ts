// Node-only loader (scripts, tests). The Worker gets profiles bundled via profiles.bundle.ts.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BrandProfile, CreatorProfile } from './types';

const CONTEXT_DIR = join(import.meta.dirname, '..', '..', 'context');

export function loadBrand(slug: string): BrandProfile {
  return JSON.parse(readFileSync(join(CONTEXT_DIR, 'brand', slug, 'profile.json'), 'utf8'));
}
export function loadCreator(slug: string): CreatorProfile {
  return JSON.parse(readFileSync(join(CONTEXT_DIR, 'creator', slug, 'profile.json'), 'utf8'));
}
export function loadBrandNarrative(slug: string): string {
  return readFileSync(join(CONTEXT_DIR, 'brand', slug, 'profile.md'), 'utf8');
}
export function loadCreatorNarrative(slug: string): string {
  return readFileSync(join(CONTEXT_DIR, 'creator', slug, 'profile.md'), 'utf8');
}
