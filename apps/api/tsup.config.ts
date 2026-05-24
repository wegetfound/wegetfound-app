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
});
