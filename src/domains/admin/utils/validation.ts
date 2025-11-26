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

/**
 * Sanitizes a WhatsApp number by removing all non-digit characters
 * @param number - The phone number string to sanitize
 * @returns A string containing only digits
 */
export const sanitizeWhatsAppNumber = (number: string): string => {
  if (!number || typeof number !== 'string') {
    return '';
  }
  
  // Remove all non-digit characters
  return number.replace(/\D/g, '');
};

/**
 * Validates if a string is a valid WhatsApp number
 * A valid WhatsApp number must:
 * - Contain only digits after sanitization
 * - Have between 10 and 15 digits (international format)
 * 
 * @param number - The phone number string to validate
 * @returns true if the number is valid, false otherwise
 */
export const isValidWhatsAppNumber = (number: string): boolean => {
  if (!number || typeof number !== 'string') {
    return false;
  }

  const sanitized = sanitizeWhatsAppNumber(number);
  
  // Check if sanitized number has only digits and is within valid length range
  if (sanitized.length === 0) {
    return false;
  }
  
  // WhatsApp numbers should be between 10 and 15 digits (international format)
  return sanitized.length >= 10 && sanitized.length <= 15;
};
