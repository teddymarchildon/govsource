import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="border-t border-border bg-background">
      <div className="container mx-auto flex flex-wrap items-center justify-between gap-4 px-4 py-6 text-sm">
        <p className="font-serif font-semibold text-foreground">GovSource</p>
        <nav aria-label="Footer navigation" className="flex flex-wrap gap-x-5 gap-y-2">
          <Link href="/about" className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">About GovSource</Link>
          <Link href="/editorial-policy" className="text-muted-foreground hover:underline">Editorial policy</Link>
          <Link href="/contact" className="text-muted-foreground hover:underline">Contact</Link>
          <Link href="/privacy" className="text-muted-foreground hover:underline">Privacy</Link>
        </nav>
      </div>
    </footer>
  );
}
