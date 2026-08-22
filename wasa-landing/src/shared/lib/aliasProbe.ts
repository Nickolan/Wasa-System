// Fixture-only module: exists solely so tests/aliases.test.ts can prove the
// @shared alias resolves identically in Vite, tsc and Vitest (D-9). It is not
// domain functionality; CHANGE-13/15 will add the real utils.ts alongside it.
export const probeValue = 'shared-alias-probe'
