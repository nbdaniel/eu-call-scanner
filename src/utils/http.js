import { request } from "undici";

const DEFAULT_TIMEOUT = 30_000;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

/**
 * Fetch a URL with retries and timeout.
 * @param {string} url
 * @param {object} [opts]
 * @returns {Promise<{status: number, body: string, headers: object}>}
 */
export async function fetchWithRetry(url, opts = {}) {
  const { timeout = DEFAULT_TIMEOUT, retries = MAX_RETRIES, headers = {} } = opts;
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const resp = await request(url, {
        method: "GET",
        headers: {
          "User-Agent":
            "AMPE-EU-Scanner/1.0 (https://ampe.ro; contact@ampe.ro)",
          Accept: "text/html,application/json,application/xml",
          ...headers,
        },
        headersTimeout: timeout,
        bodyTimeout: timeout,
      });

      const body = await resp.body.text();
      return { status: resp.statusCode, body, headers: resp.headers };
    } catch (err) {
      lastError = err;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * (attempt + 1)));
      }
    }
  }
  throw new Error(`Failed to fetch ${url} after ${retries + 1} attempts: ${lastError?.message}`);
}
