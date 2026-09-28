// Worker-side: profiles are imported as JSON at build time (no fs in Workers).
import marineLayer from '../../context/brand/marine-layer/profile.json';
import mayaWears from '../../context/creator/maya-wears/profile.json';
import marineLayerMd from '../../context/brand/marine-layer/profile.md';
import temescalHair from '../../context/brand/temescal-hair/profile.json';
import temescalHairMd from '../../context/brand/temescal-hair/profile.md';
import mayaWearsMd from '../../context/creator/maya-wears/profile.md';
import type { BrandProfile, CreatorProfile } from './types';

export const BRANDS: Record<string, BrandProfile> = {
  'marine-layer': marineLayer as unknown as BrandProfile,
  'temescal-hair': temescalHair as unknown as BrandProfile,
};
export const CREATORS: Record<string, CreatorProfile> = { 'maya-wears': mayaWears as unknown as CreatorProfile };
export const BRAND_NARRATIVES: Record<string, string> = { 'marine-layer': marineLayerMd, 'temescal-hair': temescalHairMd };
export const CREATOR_NARRATIVES: Record<string, string> = { 'maya-wears': mayaWearsMd };
