/**
 * Sanitize user input before inserting into LLM prompts.
 * Strips common injection patterns that attempt to override instructions.
 */
export function sanitizeForPrompt(input: string): string {
  if (!input || typeof input !== "string") return "";

  let sanitized = input;

  // Strip instruction override attempts
  const injectionPatterns = [
    // Direct instruction overrides
    /ignore\s+(all\s+)?(previous|above|prior|earlier)\s+(instructions?|prompts?|rules?|context)/gi,
    /disregard\s+(all\s+)?(previous|above|prior|earlier)\s+(instructions?|prompts?|rules?|context)/gi,
    /forget\s+(all\s+)?(previous|above|prior|earlier)\s+(instructions?|prompts?|rules?|context)/gi,
    /override\s+(all\s+)?(previous|above|prior|earlier)\s+(instructions?|prompts?|rules?|context)/gi,
    /do\s+not\s+follow\s+(the\s+)?(previous|above|prior|earlier)\s+(instructions?|prompts?|rules?)/gi,

    // Role hijacking
    /you\s+are\s+now\s+/gi,
    /act\s+as\s+(a\s+|an\s+)?/gi,
    /pretend\s+(you\s+are|to\s+be)\s+/gi,
    /switch\s+to\s+.{0,20}\s+mode/gi,
    /enter\s+.{0,20}\s+mode/gi,

    // System message spoofing
    /\[system\]/gi,
    /\[assistant\]/gi,
    /\[admin\]/gi,
    /<<\s*SYS\s*>>/gi,
    /<\|im_start\|>/gi,
    /<\|im_end\|>/gi,
    /\[INST\]/gi,
    /\[\/INST\]/gi,

    // New instructions
    /new\s+instructions?:\s*/gi,
    /updated\s+instructions?:\s*/gi,
    /system\s+prompt:\s*/gi,
    /hidden\s+instructions?:\s*/gi,
  ];

  for (const pattern of injectionPatterns) {
    sanitized = sanitized.replace(pattern, "[filtered]");
  }

  return sanitized;
}
