import { getStoragePublicUrl } from '@/services/api';

/**
 * Fetches HTML content from a Supabase storage bucket
 * @param bucket The storage bucket name (e.g., 'bill-pdfs')
 * @param filePath The path to the file in the bucket
 * @returns The HTML content as a string or null if not found
 */
export async function fetchHtmlContent(bucket: string, filePath?: string): Promise<string | null> {
  if (!filePath) return null;

  try {
    const publicUrl = getStoragePublicUrl(bucket, filePath);
    if (!publicUrl) return null;

    const response = await fetch(publicUrl);
    if (!response.ok) {
      console.error(`Failed to fetch HTML content: ${response.status} ${response.statusText}`);
      return null;
    }

    return await response.text();
  } catch (error) {
    console.error('Error fetching HTML content:', error);
    return null;
  }
}



/**
 * Processes document content to make it more suitable for AI context
 * @param content The raw HTML or text content
 * @returns Processed content with unnecessary elements removed
 */
export function processDocumentContent(content: string | null): string | null {
  if (!content) return null;

  // Simple HTML cleaning - remove scripts, styles, and excessive whitespace
  return content
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Truncates content to a maximum length to fit within token limits
 * @param content The document content
 * @param maxLength Maximum length in characters
 * @returns Truncated content
 */
export function truncateContent(content: string | null, maxLength = 100000): string | null {
  if (!content) return null;

  if (content.length <= maxLength) return content;

  // Truncate and add a note
  return content.substring(0, maxLength) +
    '\n\n[Note: The document content has been truncated due to length constraints.]';
}
