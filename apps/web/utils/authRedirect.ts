/** Only allow local destinations, excluding routes that would restart auth. */
export function safeAuthRedirect(value?: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u0020]/.test(value)) return '/';
  try {
    const url = new URL(value, 'https://govsource.invalid');
    const path = decodeURIComponent(url.pathname);
    if (url.origin !== 'https://govsource.invalid' || path.startsWith('//') || /[\\\u0000-\u0020]/.test(path) || /^\/(login|onboarding|auth)(\/|$)/i.test(path)) return '/';
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return '/';
  }
}

export function authCallbackUrl(origin: string, destination?: string): string {
  const url = new URL('/auth/callback', origin);
  url.searchParams.set('redirect', safeAuthRedirect(destination));
  return url.toString();
}
