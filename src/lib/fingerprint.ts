/**
 * Browser fingerprinting for trial abuse prevention.
 * Generates a stable SHA-256 hash from device signals.
 */

const STORAGE_KEY = "idearupt_device_id";

/**
 * Generate a canvas rendering fingerprint hash.
 */
async function getCanvasHash(): Promise<string> {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 200;
    canvas.height = 50;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "no-canvas";

    ctx.textBaseline = "alphabetic";
    ctx.font = "14px 'Arial'";
    ctx.fillStyle = "#f60";
    ctx.fillRect(125, 1, 62, 20);
    ctx.fillStyle = "#069";
    ctx.fillText("Idearupt fp", 2, 15);
    ctx.fillStyle = "rgba(102, 204, 0, 0.7)";
    ctx.fillText("Idearupt fp", 4, 17);

    const dataUrl = canvas.toDataURL();
    let hash = 0;
    for (let i = 0; i < dataUrl.length; i++) {
      const char = dataUrl.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0;
    }
    return Math.abs(hash).toString(36);
  } catch {
    return "canvas-error";
  }
}

/**
 * Generate a browser fingerprint from stable signals.
 * Returns a hex SHA-256 hash string.
 */
async function generateFingerprint(): Promise<string> {
  const signals = [
    screen.width,
    screen.height,
    screen.colorDepth,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    navigator.language,
    navigator.platform,
    navigator.userAgent,
    await getCanvasHash(),
  ].join("|");

  const encoder = new TextEncoder();
  const data = encoder.encode(signals);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Get stored fingerprint from localStorage, or generate and store a new one.
 */
export async function getOrCreateFingerprint(): Promise<string> {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) return stored;

  const fp = await generateFingerprint();
  localStorage.setItem(STORAGE_KEY, fp);
  return fp;
}

/**
 * Get stored fingerprint (without generating).
 */
export function getStoredFingerprint(): string | null {
  return localStorage.getItem(STORAGE_KEY);
}
