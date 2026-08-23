/* eslint-disable @typescript-eslint/no-require-imports */
const { getSitemapRecords } = require('./scripts/sitemap-records');

const SITE_URL = 'https://www.govsrc.com';

module.exports = {
  siteUrl: SITE_URL,
  generateRobotsTxt: true,
  sitemapSize: 7000,
  autoLastmod: false,
  changefreq: 'weekly',
  trailingSlash: false,
  priority: 0.7,
  exclude: [
    '/admin',
    '/admin/*',
    '/api/*',
    '/congressmen',
    '/congressmen/*',
    '/login',
    '/onboarding',
    '/profile',
  ],
  additionalPaths: async (config) => {
    const publicIndexes = [
      '/',
      '/agencies',
      '/agency-rules',
      '/briefs',
      '/bills',
      '/congress-members',
      '/executive-orders',
      '/judges',
      '/laws',
      '/supreme-court-cases',
    ];

    const [indexEntries, records] = await Promise.all([
      Promise.all(publicIndexes.map((path) => config.transform(config, path))),
      getSitemapRecords(),
    ]);
    const recordEntries = await Promise.all(records.map(async (record) => {
      const entry = await config.transform(config, record.path);
      return record.lastModified ? { ...entry, lastmod: record.lastModified } : entry;
    }));

    return [...indexEntries, ...recordEntries];
  },
  robotsTxtOptions: {
    policies: [
      {
        userAgent: '*',
        allow: '/',
      },
    ],
    additionalSitemaps: [],
  },
};
