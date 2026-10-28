/** Solid controls throughout; only the user's motion preference is configurable. */
export function resolveAppearance(preferences = {}, system = {}) {
  return {
    reducedMotion: Boolean(system.reducedMotion) || preferences.motion === 'reduced',
    motion: preferences.motion === 'reduced' ? 'reduced' : 'system',
  };
}
export function appearancePatch(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !['motion', 'cloneStorage'].includes(key))) throw new Error('Invalid UI settings.');
  if ('motion' in value && !['system', 'reduced'].includes(value.motion) || 'cloneStorage' in value && !['permanent', 'temporary'].includes(value.cloneStorage)) throw new Error('Invalid UI setting value.');
  return value;
}
