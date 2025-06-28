/**
 * Format a date string to a more readable format
 * @param dateString Date string in ISO format
 * @returns Formatted date string (e.g., "Jan 1, 2023")
 */
export function formatDate(dateString: string): string {
  if (!dateString) return 'Unknown date';
  
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  } catch (error) {
    console.error('Error formatting date:', error);
    return dateString;
  }
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
