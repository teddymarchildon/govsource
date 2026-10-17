import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="border-t border-border bg-background">
      <div className="container mx-auto flex flex-wrap items-center justify-between gap-4 px-4 py-6 text-sm">
        <p className="font-serif font-semibold text-foreground">GovSource</p>
        <nav aria-label="Footer navigation">
          <Link href="/about" className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">About GovSource</Link>
        </nav>
      </div>
    </footer>
  );
}
