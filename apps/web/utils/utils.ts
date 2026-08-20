/**
 * Format a date string to a more readable format
 * @param dateString Date string in ISO format
 * @returns Formatted date string (e.g., "Jan 1, 2023")
 */
export function formatDate(dateString: string): string {
  if (!dateString) return 'Unknown date';
  
  try {
    const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(dateString) ? `${dateString}T00:00:00Z` : dateString);
    if (Number.isNaN(date.getTime())) return dateString;
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    });
  } catch (error) {
    console.error('Error formatting date:', error);
    return dateString;
  }
}

export function plainText(value?: string | null): string {
  if (!value) return '';
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Returns the login URL with a redirect param if appropriate.
 * @param path The current path
 * @returns The login URL
 */
export function getLoginUrl(path: string): string {
  if (!path || path === '/login' || path.startsWith('/onboarding')) {
    return '/login';
  }
  return `/login?redirect=${encodeURIComponent(path)}`;
}
