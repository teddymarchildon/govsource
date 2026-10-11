import { appendFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { generateContributionBriefBatch } from '../lib/contributionBriefBatch';

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const result = await generateContributionBriefBatch(db);
  console.log(JSON.stringify(result));
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Contribution draft pilot\n\n${result.reason}\n\nCycle: ${result.cycle}\n\nCreated: ${result.created.length}; existing: ${result.existing}; insufficient fresh coverage: ${result.ineligible}.\n\nDraft IDs: ${result.created.join(', ') || 'none'}.\n\n[Review drafts](https://www.govsrc.com/admin/briefs)\n`);
  }
}
main().catch(error => { console.error('Contribution draft job failed:', error.message); process.exitCode = 1; });
