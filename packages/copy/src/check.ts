import en from './en.json' with { type: 'json' };
import { checkCopy } from './banned-words.js';

// CI gate (§5.4). Fails the build if any banned jargon reaches user-facing copy.
const violations = checkCopy(en);

if (violations.length > 0) {
  console.error(`\n✗ ${violations.length} banned-word violation(s) in copy:\n`);
  for (const v of violations) {
    console.error(`  ${v.key}\n    banned: "${v.term}"  →  use: ${v.use}\n    in: "${v.value}"\n`);
  }
  process.exit(1);
}

console.log('✓ Copy is clean — no banned jargon.');
