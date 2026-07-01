/**
 * Ambient declaration for the vendored jade fork under `lib/vendor/jade`.
 *
 * The vendored source is excluded from the TypeScript program (it is
 * third-party legacy JavaScript), so this describes the small surface the
 * compiler imports via `require('./vendor/jade')`.
 */
declare module '*/vendor/jade' {
  const jade: import('./types').JadeModule;
  export = jade;
}
