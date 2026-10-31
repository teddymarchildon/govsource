import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Contact GovSource',
  alternates: { canonical: '/contact' },
};

export default function Page() {
  return (
    <article className="prose mx-auto max-w-3xl py-8 prose-headings:font-serif prose-a:text-primary md:py-14">
      <h1>Contact GovSource</h1>
      <p>GovSource is published by Teddy Marchildon. For questions, feedback, privacy requests, or corrections, email <a href="mailto:teddy@govsrc.com">teddy@govsrc.com</a>.</p>
<p>For a correction, include the page URL, the statement you believe is incorrect, and a link to supporting source material if available. Please do not send passwords or sensitive personal information.</p>
    </article>
  );
}
