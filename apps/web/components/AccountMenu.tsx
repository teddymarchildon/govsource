'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Bookmark, ChevronDown, CreditCard, LogOut, Settings2, UserRound } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from './ui/button';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';

export default function AccountMenu() {
  const { user, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState('');

  const handleSignOut = async () => {
    setSigningOut(true);
    setError('');
    try {
      await signOut();
      setOpen(false);
    } catch {
      setError('Unable to sign out. Please try again.');
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" className="gap-2 px-2 text-sm font-medium" aria-label="Account">
          <span className="flex h-7 w-7 items-center justify-center rounded-full border border-border bg-secondary text-muted-foreground">
            <UserRound className="h-4 w-4" aria-hidden="true" />
          </span>
          <span className="hidden md:inline">Account</span>
          <ChevronDown className="hidden h-3.5 w-3.5 text-muted-foreground md:block" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-2" aria-label="Your account">
        <div className="border-b border-border px-3 pb-3 pt-2">
          <p className="font-serif text-lg font-semibold">Your account</p>
          <p className="mt-1 break-all text-xs text-muted-foreground">{user?.email}</p>
        </div>
        <nav className="py-2" aria-label="Account navigation">
          {[
            { label: 'Watching', href: '/profile', icon: Bookmark },
            { label: 'Preferences', href: '/profile?section=preferences', icon: Settings2 },
            { label: 'Account & billing', href: '/profile?section=account', icon: CreditCard },
          ].map(({ label, href, icon: Icon }) => (
            <Link key={href} href={href} onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-md px-3 py-2 text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />{label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-border pt-2">
          <Button variant="ghost" disabled={signingOut} onClick={handleSignOut} className="w-full justify-start gap-3 px-3 font-normal">
            <LogOut className="h-4 w-4 text-muted-foreground" aria-hidden="true" />{signingOut ? 'Signing out…' : 'Sign out'}
          </Button>
          {error && <p role="alert" className="px-3 py-2 text-xs text-destructive">{error}</p>}
        </div>
      </PopoverContent>
    </Popover>
  );
}
