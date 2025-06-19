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
