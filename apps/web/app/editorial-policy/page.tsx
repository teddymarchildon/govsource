import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sources, AI & corrections',
  alternates: { canonical: '/editorial-policy' },
};

export default function Page() {
  return (
    <article className="prose mx-auto max-w-3xl py-8 prose-headings:font-serif prose-a:text-primary md:py-14">
      <h1>Sources, AI & corrections</h1>
      <p>GovSource helps readers understand federal government developments and inspect the records behind them. Teddy Marchildon is responsible for the publication. GovSource is an independent project, not a government website.</p>
<h2>What we cover</h2><p>We prioritize consequential changes to rights, obligations, benefits, funding, public safety, and legal precedent. Regional and sector-specific developments can merit coverage when their practical impact is clear. Routine announcements and document volume alone do not justify a Brief.</p>
<h2>Records and explanations</h2><p>Record pages bring together material from Congress.gov, the Federal Register, CourtListener, and the Federal Election Commission. Official text and source summaries are reference material. Briefs add explanations of the change, affected audience, timing, and material qualifications. Source links let readers check the underlying evidence.</p>
<h2 id="how-we-use-ai">How we produce GovSource Briefs</h2>
<p>GovSource Briefs is our publication byline for coverage produced with AI-assisted research and drafting. We use automation to scan official documents, extract evidence, and prepare explanations. Automated checks compare claims with source quotations, and a separate verification pass checks support and legal status.</p>
<p>Our aim is accurate, nonpartisan coverage: explain what the record establishes, distinguish facts from uncertainty, and apply the same standards regardless of the people or parties involved. Automation helps us apply consistent checks, but it does not guarantee accuracy or eliminate bias. These checks can miss errors and are not a substitute for editorial judgment. Earlier coverage may have been published through the automated pipeline.</p>
<p>Our editorial standard for new Briefs requires an editor to review the underlying sources, practical significance, accuracy, and completeness before publication. We distinguish proposed actions from final actions and effective dates from announcement dates. When the record does not establish an outcome, we do not present it as certain.</p>
<h2>Corrections and updates</h2><p>Send a page link and supporting evidence to <a href="mailto:teddy@govsrc.com">teddy@govsrc.com</a>. Substantive corrections should explain what changed and display an updated date. A source document can change after a Brief is written; consult its official source for the latest authoritative text.</p>
<h2>Funding and independence</h2><p>GovSource is seeking support through advertising. Advertising eligibility does not determine whether a development is true or important. Editorial coverage should remain grounded in evidence.</p>
    </article>
  );
}
