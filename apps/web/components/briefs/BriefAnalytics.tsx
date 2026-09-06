'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { track } from '@vercel/analytics';

// One observer per page, including previews that arrive in a streamed response.
export default function BriefAnalytics() {
  const pathname = usePathname();
  useEffect(() => {
    const observed = new Set<Element>();
    const seen = new Set<string>();
    const clicked = new Set<string>();
    const pending = new Map<Element, ReturnType<typeof setTimeout>>();
    const properties = (element: HTMLElement) => ({
      brief_id: element.dataset.briefPreview || '',
      placement: element.dataset.briefPlacement || 'feed',
      page: pathname,
    });
    const keyOf = (element: HTMLElement) => `${element.dataset.briefPreview}:${element.dataset.briefPlacement}`;
    const recordImpression = (element: HTMLElement) => {
      const key = keyOf(element);
      if (!seen.has(key)) {
        seen.add(key);
        track('brief_preview_view', properties(element));
      }
    };
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const element = entry.target as HTMLElement;
        if (entry.isIntersecting && entry.intersectionRatio >= 0.5 && !pending.has(element)) {
          pending.set(element, setTimeout(() => {
            if (document.visibilityState === 'visible') recordImpression(element);
            pending.delete(element);
          }, 1000));
        } else if (entry.intersectionRatio < 0.5) {
          clearTimeout(pending.get(element));
          pending.delete(element);
        }
      }
    }, { threshold: [0, 0.5], rootMargin: window.matchMedia('(min-width: 768px)').matches ? '-96px 0px 0px' : '-56px 0px 0px' });
    const discover = () => document.querySelectorAll('[data-brief-preview]').forEach((element) => {
      if (!observed.has(element)) { observed.add(element); observer.observe(element); }
    });
    const onVisibilityChange = () => {
      pending.forEach(clearTimeout);
      pending.clear();
      if (document.visibilityState === 'visible') {
        observed.forEach((element) => {
          if (element.isConnected && !seen.has(keyOf(element as HTMLElement))) {
            observer.unobserve(element);
            observer.observe(element);
          }
        });
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    const mutations = new MutationObserver(discover);
    discover();
    mutations.observe(document.body, { childList: true, subtree: true });
    const onClick = (event: MouseEvent) => {
      if (event.type === 'auxclick' && event.button !== 1) return;
      const target = event.target instanceof Element ? event.target : null;
      const preview = target?.closest('a')?.closest<HTMLElement>('[data-brief-preview]');
      if (!preview) return;
      // A quick click is also evidence of a viewed preview, keeping CTR comparable.
      recordImpression(preview);
      const key = keyOf(preview);
      if (clicked.has(key)) return;
      clicked.add(key);
      track('brief_preview_click', { ...properties(preview), from_brief: /^\/briefs\/.+/.test(pathname) });
    };
    document.addEventListener('click', onClick);
    document.addEventListener('auxclick', onClick);
    return () => {
      observer.disconnect();
      mutations.disconnect();
      pending.forEach(clearTimeout);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      document.removeEventListener('click', onClick);
      document.removeEventListener('auxclick', onClick);
    };
  }, [pathname]);
  return null;
}

export function BriefReadingAnalytics({ briefId }: { briefId: string }) {
  useEffect(() => {
    let activeSeconds = 0;
    let readHalf = false;
    let sent = false;
    const interval = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      activeSeconds += 1;
      const body = document.querySelector('[data-brief-body]');
      if (body) {
        const bounds = body.getBoundingClientRect();
        readHalf ||= window.innerHeight >= bounds.top + bounds.height / 2;
      }
      if (!sent && readHalf && activeSeconds >= 30) {
        sent = true;
        track('brief_engaged_read', { brief_id: briefId });
        clearInterval(interval);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [briefId]);
  return null;
}
