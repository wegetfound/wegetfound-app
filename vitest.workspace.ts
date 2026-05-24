import { defineWorkspace } from 'vitest/config';

// Single root vitest run discovers tests across every package. Packages without
// tests simply contribute none — no per-package vitest install needed.
export default defineWorkspace(['packages/*', 'apps/*']);
