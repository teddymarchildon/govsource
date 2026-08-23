/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const test = require('node:test');
const {
  buildSitemapRecords,
  fetchAllRows,
  normalizeLastModified,
} = require('./sitemap-records');

test('fetchAllRows retrieves every page using inclusive ranges', async () => {
  const source = Array.from({ length: 2001 }, (_, index) => ({ id: index + 1 }));
  const ranges = [];
  const rows = await fetchAllRows('test records', () => ({
    range: async (from, to) => {
      ranges.push([from, to]);
      return { data: source.slice(from, to + 1), error: null };
    },
  }));

  assert.equal(rows.length, source.length);
  assert.deepEqual(ranges, [[0, 999], [1000, 1999], [2000, 2999]]);
});

test('buildSitemapRecords routes each public record to its canonical detail page', () => {
  const records = buildSitemapRecords({
    bills: [
      { id: 1, introduced_date: '2026-01-02' },
      { id: 2, law_enacted_date: '2026-02-03' },
    ],
    agencyDocuments: [
      { id: 3, subtype: 'Rule', publication_date: '2026-03-04' },
      { id: 4, subtype: 'Executive Order', publication_date: '2026-04-05' },
    ],
    briefs: [{ slug: 'a source-linked brief', published_at: '2026-05-06' }],
    agencies: [{ id: 6 }],
    members: [{ id: 7 }],
    judges: [{ id: 8 }],
    clusters: [{ id: 9, date_filed: '2026-06-07' }],
    topics: [{ slug: 'health', updated_at: '2026-06-08' }],
  });

  assert.deepEqual(records.map(({ path }) => path), [
    '/bills/1',
    '/laws/2',
    '/agency-rules/3',
    '/executive-orders/4',
    '/briefs/a%20source-linked%20brief',
    '/agencies/6',
    '/congress-members/7',
    '/judges/8',
    '/supreme-court-cases/9',
    '/topics/health',
  ]);
});

test('normalizeLastModified uses the first valid date', () => {
  assert.equal(
    normalizeLastModified(null, 'invalid', '2026-08-23'),
    '2026-08-23T00:00:00.000Z',
  );
  assert.equal(normalizeLastModified(null, undefined), undefined);
});
