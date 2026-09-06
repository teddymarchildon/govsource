import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

// Compile the pure selector in memory; no test runtime or generated files needed.
const source = readFileSync(new URL('../utils/briefSelection.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const { selectFrontPageBriefs } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const now = Date.parse('2026-09-06T12:00:00Z');
const brief = (id, type = 'cluster', overrides = {}) => ({ id: String(id), slug: `brief-${id}`, primary_item_type: type, published_at: '2026-09-06T10:00:00Z', is_featured: false, ...overrides });

test('a court publication batch still leaves room for Congress and White House', () => {
  const input = [...Array.from({ length: 24 }, (_, id) => brief(100 + id)), brief(2, 'bill'), brief(1, 'executive_order')];
  const result = selectFrontPageBriefs(input, now);
  assert.equal(result.lead.primary_item_type, 'cluster');
  assert.deepEqual(result.supporting.map(b => b.primary_item_type), ['bill', 'executive_order']);
  assert.equal(result.latest.length, 4);
  assert.deepEqual(input.slice(-2).map(b => b.id), ['2', '1']);
});

test('active feature wins over recency, expired feature does not', () => {
  const active = brief(1, 'law', { is_featured: true, published_at: '2026-08-01', featured_until: '2026-09-07' });
  assert.equal(selectFrontPageBriefs([brief(9), active], now).lead.id, '1');
  assert.equal(selectFrontPageBriefs([brief(9), { ...active, featured_until: '2026-09-05' }], now).lead.id, '9');
  assert.equal(selectFrontPageBriefs([brief(9), { ...active, featured_until: null }], now).lead.id, '1');
});

test('every story occupies only one slot, including in the remaining feed', () => {
  const input = Array.from({ length: 20 }, (_, id) => brief(id));
  const { lead, supporting, latest, remaining } = selectFrontPageBriefs([...input, input[3]], now);
  const ids = [lead, ...supporting, ...latest, ...remaining].map(b => b.id);
  assert.equal(ids.length, 20);
  assert.equal(new Set(ids).size, 20);
});

test('handles empty, single and small pools without manufacturing stories', () => {
  assert.equal(selectFrontPageBriefs([], now).lead, undefined);
  assert.equal(selectFrontPageBriefs([brief(1, 'bill', { slug: null })], now).lead, undefined);
  const one = selectFrontPageBriefs([brief(1)], now);
  assert.equal(one.lead.id, '1');
  assert.deepEqual(one.supporting, []);
  assert.deepEqual(one.latest, []);
  assert.equal(selectFrontPageBriefs([brief(1), brief(2)], now).supporting.length, 1);
});
