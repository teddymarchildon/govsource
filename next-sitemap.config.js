module.exports = {
  siteUrl: 'https://govsrc.com',
  generateRobotsTxt: true,
  sitemapSize: 7000,
  changefreq: 'weekly',
  trailingSlash: false,
  priority: 0.7,
  exclude: ['/onboarding'],
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
