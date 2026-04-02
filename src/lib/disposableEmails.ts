/**
 * Blocklist of known disposable email domains.
 * Checked on signup to prevent trial abuse.
 */
const DISPOSABLE_EMAIL_DOMAINS: string[] = [
  "tempmail.com",
  "throwaway.email",
  "guerrillamail.com",
  "mailinator.com",
  "trashmail.com",
  "yopmail.com",
  "10minutemail.com",
  "maildrop.cc",
  "dispostable.com",
  "sharklasers.com",
  "guerrillamailblock.com",
  "grr.la",
  "guerrillamail.info",
  "guerrillamail.net",
  "guerrillamail.de",
  "tempail.com",
  "temp-mail.org",
  "fakeinbox.com",
  "mailnesia.com",
  "binkmail.com",
  "disposableemailaddress.com",
  "mohmal.com",
  "getnada.com",
  "emailondeck.com",
  "tempinbox.com",
  "mailcatch.com",
  "discard.email",
  "mintemail.com",
  "tmpmail.org",
  "tmpmail.net",
  "harakirimail.com",
  "jetable.org",
  "trashmail.me",
  "trashmail.net",
  "trashmail.org",
  "mt2015.com",
  "thankyou2010.com",
  "spam4.me",
  "boun.cr",
  "mytemp.email",
  "correotemporal.org",
  "tmail.ws",
  "crazymailing.com",
  "mailforspam.com",
  "tempmail.plus",
  "tempmailaddress.com",
];

/**
 * Substrings that indicate a disposable domain even if not in the exact list.
 */
const DISPOSABLE_PATTERNS = ["temp", "disposable", "throwaway", "fakeinbox", "mailnesia"];

/**
 * Check if an email uses a disposable domain.
 */
export function isDisposableEmail(email: string): boolean {
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain) return false;

  if (DISPOSABLE_EMAIL_DOMAINS.includes(domain)) return true;
  return DISPOSABLE_PATTERNS.some((p) => domain.includes(p));
}
