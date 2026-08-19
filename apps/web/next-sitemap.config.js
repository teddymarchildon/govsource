module.exports = {
  siteUrl: 'https://govsrc.com',
  generateRobotsTxt: true,
  sitemapSize: 7000,
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
      '/agencies',
      '/agency-rules',
      '/articles',
      '/bills',
      '/congress-members',
      '/executive-orders',
      '/judges',
      '/laws',
      '/supreme-court-cases',
    ];

    return Promise.all(publicIndexes.map((path) => config.transform(config, path)));
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
