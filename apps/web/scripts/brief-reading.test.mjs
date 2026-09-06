import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';

const require = createRequire(import.meta.url);
function loadTypescript(path) {
  const { outputText } = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const exports = {};
  new Function('require', 'exports', outputText)(require, exports);
  return exports;
}
const { BriefPointSchema, normalizeBriefPoints } = loadTypescript('../lib/briefPoints.ts');
const { getBriefReadingMinutes } = loadTypescript('../utils/briefReading.ts');

test('adding a label preserves the point identity, explanation and citations', () => {
  const point = BriefPointSchema.parse({ id: 'point-original', label: '  30-day deadline  ', text: 'Original explanation.', source_refs: ['primary', 'source-original'] });
  assert.deepEqual(normalizeBriefPoints([point])[0], { id: 'point-original', label: '30-day deadline', text: 'Original explanation.', source_refs: ['primary', 'source-original'] });
});

test('legacy unlabeled points and cleared labels remain valid', () => {
  for (const label of [undefined, null, '', '  ']) {
    const point = BriefPointSchema.parse({ text: 'Explanation', label, source_refs: ['primary'] });
    assert.equal(normalizeBriefPoints([point])[0].label, null);
  }
  assert.equal(BriefPointSchema.safeParse({ text: 'Explanation', label: 'x'.repeat(61) }).success, false);
  assert.equal(BriefPointSchema.safeParse({ text: 'Explanation', label: 'x'.repeat(60) }).success, true);
});

test('removing an empty draft point does not renumber existing source references', () => {
  const result = normalizeBriefPoints([
    { id: 'empty', text: ' ', source_refs: [] },
    { id: 'retained', text: 'Text', source_refs: ['source-custom', 'source-custom'] },
  ]);
  assert.deepEqual(result, [{ id: 'retained', text: 'Text', label: null, source_refs: ['source-custom'] }]);
});

test('reading time includes the takeaway, labels, points and optional context', () => {
  assert.equal(getBriefReadingMinutes({ dek: null, points: [], context_markdown: null }), 1);
  assert.equal(getBriefReadingMinutes({ dek: 'Takeaway', points: [{ label: 'Deadline', text: 'word '.repeat(219) }], context_markdown: null }), 2);
  assert.equal(getBriefReadingMinutes({ dek: null, points: [], context_markdown: 'word '.repeat(441) }), 3);
});
