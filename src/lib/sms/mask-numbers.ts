/**
 * Masks card and account numbers longer than 4 digits before sending to LLM.
 * Only the final 4 digits are preserved (e.g. 1234567890123456 -> ************3456).
 */
export function maskCardNumbers(text: string): string {
  if (!text) return "";

  // Matches sequences of digits (with optional spaces or dashes) of length 5 or greater
  return text.replace(/\b((?:\d[ -]?){1,16})(\d{4})\b/g, (match, prefix, last4) => {
    // If total digits is >= 5, mask the prefix
    const digitsOnly = match.replace(/\D/g, "");
    if (digitsOnly.length < 5) {
      return match;
    }
    const maskedPrefix = prefix.replace(/\d/g, "*");
    return `${maskedPrefix}${last4}`;
  });
}
