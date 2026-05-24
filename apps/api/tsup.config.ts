import { defineConfig } from 'tsup';

// Bundle the workspace packages (consumed as source) into the API build so the
// production artifact resolves at runtime. node_modules deps stay external.
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  clean: true,
  noExternal: [/^@wegetfound\//],
  // Some bundled deps (e.g. google-auth-library via the Gemini SDK) use CommonJS
  // dynamic require(). In an ESM bundle esbuild's shim throws unless a real
  // `require` is in scope — createRequire provides one.
  banner: {
    js: "import { createRequire as __cr } from 'module';\nconst require = __cr(import.meta.url);",
  },
});
