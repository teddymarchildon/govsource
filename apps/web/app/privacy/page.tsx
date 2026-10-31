import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy policy',
  alternates: { canonical: '/privacy' },
};

export default function Page() {
  return (
    <article className="prose mx-auto max-w-3xl py-8 prose-headings:font-serif prose-a:text-primary md:py-14">
      <h1>Privacy policy</h1>
      <p>Last updated: October 31, 2026.</p><p>GovSource is operated by Teddy Marchildon. Contact <a href="mailto:teddy@govsrc.com">teddy@govsrc.com</a> with questions or requests about your information.</p>
<h2>Information used to provide the service</h2><p>If you create an account, GovSource uses your email address and authentication information to provide sign-in and account features. Saved records and preferences are stored to support those features. If you email us, we receive the information you include in your message.</p>
<p>Our hosting and service providers process technical information needed to deliver and secure the site, which may include IP addresses, browser information, request details, and diagnostic logs. GovSource uses Supabase for account and application data and Vercel for hosting, analytics, and performance monitoring.</p>
<h2>Usage measurement and AI features</h2><p>We measure page visits, Brief impressions and clicks, and reading engagement to understand how the site is used. Optional AI features may send your submitted question and relevant record context to OpenAI to generate a response. Avoid submitting confidential or sensitive personal information. Cookies or browser storage may support sign-in and feature usage limits.</p>
<h2>Google advertising</h2><p>GovSource is applying to Google AdSense. Advertising is disabled while we prepare the site. If Google advertising is enabled, third-party vendors, including Google, use cookies to serve ads based on prior visits to this or other websites. Google advertising cookies allow Google and its partners to personalize ads based on visits across the internet.</p>
<p>You can manage personalized Google advertising through <a href="https://myadcenter.google.com/">My Ad Center</a> and learn about other vendors’ choices at <a href="https://www.aboutads.info/choices/">YourAdChoices</a>. Any required advertising consent controls must be in place before advertising is enabled.</p>
<h2>Sharing and retention</h2><p>Information is processed by providers as needed to operate authentication, storage, hosting, analytics, and requested AI features. We may also disclose information when required by law. We retain information as needed to operate the service, handle requests, and meet applicable obligations; retention can differ between account data, logs, and provider backups.</p>
<h2>Your choices</h2><p>You can browse public records without an account. You can manage browser cookies and storage in your browser settings; disabling them may affect sign-in and other features. Email us to request access to, correction of, or deletion of your account information. We may need to verify your identity before acting on a request.</p>
<p>External source links lead to services with their own privacy practices. This policy will be updated when our practices change.</p>
    </article>
  );
}
