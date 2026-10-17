import type { Metadata } from 'next';
import Link from 'next/link';

const title = 'About GovSource | U.S. Government Records & Policy Explained';
const description = 'GovSource helps you explore federal bills, laws, executive orders, agency actions, and Supreme Court decisions with clear context and source links.';

export const metadata: Metadata = {
  title: { absolute: title },
  description,
  alternates: { canonical: '/about' },
  openGraph: { title, description, url: '/about', type: 'website' },
};

export default function AboutPage() {
  return (
    <article className="mx-auto max-w-3xl py-8 md:py-14">
      <header className="border-b border-border pb-8">
        <h1 className="font-serif text-4xl font-semibold tracking-tight md:text-5xl">About GovSource</h1>
        <p className="mt-5 font-serif text-xl leading-relaxed md:text-2xl">Understand what the federal government is doing—and explore the records behind it.</p>
      </header>
      <div className="space-y-6 pt-8 text-base leading-8 text-muted-foreground">
        <p>GovSource makes U.S. federal government activity easier to find, follow, and understand. We bring together bills, laws, executive orders, agency documents, and Supreme Court decisions, alongside explanations that help readers understand what happened and why it matters.</p>
        <p>Government information is public, but it is spread across many websites and often written in technical language. GovSource helps connect that information so you can explore an issue, understand the institutions involved, and go deeper into the underlying records.</p>
        <section aria-labelledby="what-you-can-do" className="space-y-6 pt-4">
          <h2 id="what-you-can-do" className="font-serif text-2xl font-semibold text-foreground">What you can do on GovSource</h2>
          <p>Explore <Link href="/bills" className="text-primary underline underline-offset-4">legislation in Congress</Link>, <Link href="/executive-orders" className="text-primary underline underline-offset-4">executive orders from the White House</Link>, <Link href="/agency-rules" className="text-primary underline underline-offset-4">federal agency actions</Link>, and <Link href="/supreme-court-cases" className="text-primary underline underline-offset-4">Supreme Court cases</Link>. Learn about members of Congress, federal agencies, and Supreme Court justices.</p>
          <p>Read <Link href="/briefs" className="text-primary underline underline-offset-4">briefs</Link> that explain developments in context, or browse by policy topic to follow an issue across different parts of government. Save records and people you want to return to as you build your understanding.</p>
        </section>
        <section aria-labelledby="go-to-the-source" className="space-y-6 pt-4">
          <h2 id="go-to-the-source" className="font-serif text-2xl font-semibold text-foreground">Start with context. Go to the source.</h2>
          <p>Clear explanations are a starting point for further exploration. GovSource connects coverage with public records and source links so you can examine the details for yourself.</p>
          <p>Whether you’re researching a specific policy, following legislation, or simply trying to understand how government decisions affect your world, our goal is to make public information more useful and easier to navigate.</p>
        </section>
        <p className="border-t border-border pt-6 font-semibold text-foreground"><Link href="/" className="text-primary underline underline-offset-4">Explore today’s coverage</Link> or <Link href="/topics" className="text-primary underline underline-offset-4">browse a policy topic</Link> to get started.</p>
      </div>
    </article>
  );
}
