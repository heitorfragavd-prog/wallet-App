/**
 * Validates if a string is a valid HTTP/HTTPS URL
 * @param url - The string to validate
 * @returns true if the string is a valid HTTP/HTTPS URL, false otherwise
 */
export const isValidWebhookUrl = (url: string): boolean => {
  if (!url || typeof url !== 'string') {
    return false;
  }

  const trimmedUrl = url.trim();
  if (trimmedUrl.length === 0) {
    return false;
  }

  try {
    const parsedUrl = new URL(trimmedUrl);
    // Only allow HTTP and HTTPS protocols
    return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:';
  } catch {
    return false;
  }
};
