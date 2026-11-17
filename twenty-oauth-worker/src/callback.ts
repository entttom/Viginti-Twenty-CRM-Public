// Static browser-fallback page for the shared OAuth redirect URI.
//
// Normally ASWebAuthenticationSession intercepts /twenty/callback and the app
// reads the result. If the URL is opened in a plain browser we serve a static
// page. The page NEVER reflects any query parameter (code, state, iss, error,
// error_description, scope, session_state, ...) into the HTML, and no query
// parameter is ever logged. JavaScript, cookies and tracking are not used.
//
// The page is bilingual: German when the browser's Accept-Language prefers
// German over English, English otherwise. Only a fixed language tag is derived
// from the header; the header value itself is never reflected.

import { CALLBACK_CSP } from './security-headers';

export type CallbackLanguage = 'de' | 'en';

interface CallbackCopy {
  successTitle: string;
  successMessage: string;
  errorTitle: string;
  errorMessage: string;
}

const COPY: Record<CallbackLanguage, CallbackCopy> = {
  de: {
    successTitle: 'Anmeldung abgeschlossen',
    successMessage:
      'Die Anmeldung wurde abgeschlossen. Du kannst dieses Fenster schließen und zur Viginti-App zurückkehren.',
    errorTitle: 'Anmeldung nicht abgeschlossen',
    errorMessage:
      'Die Anmeldung konnte nicht abgeschlossen werden. Kehre zur Viginti-App zurück und versuche es erneut.',
  },
  en: {
    successTitle: 'Sign-in complete',
    successMessage:
      'Sign-in is complete. You can close this window and return to the Viginti app.',
    errorTitle: 'Sign-in not completed',
    errorMessage: 'Sign-in could not be completed. Return to the Viginti app and try again.',
  },
};

const PAGES: Record<CallbackLanguage, { success: string; error: string }> = {
  de: {
    success: page('de', COPY.de.successTitle, COPY.de.successMessage),
    error: page('de', COPY.de.errorTitle, COPY.de.errorMessage),
  },
  en: {
    success: page('en', COPY.en.successTitle, COPY.en.successMessage),
    error: page('en', COPY.en.errorTitle, COPY.en.errorMessage),
  },
};

/**
 * Picks the page language from an Accept-Language header. German wins only
 * when it carries the highest weight among the supported languages (de, en);
 * anything else (missing header, other languages only, malformed input)
 * yields English.
 */
export function negotiateCallbackLanguage(header: string | null): CallbackLanguage {
  if (!header) return 'en';
  let bestLang: CallbackLanguage = 'en';
  let bestWeight = 0;
  // Bound the work on hostile input.
  const parts = header.slice(0, 512).split(',').slice(0, 20);
  for (let index = 0; index < parts.length; index++) {
    const [rawTag, ...params] = (parts[index] ?? '').trim().split(';');
    const primary = (rawTag ?? '').trim().toLowerCase().split('-')[0];
    if (primary !== 'de' && primary !== 'en') continue;
    let q = 1;
    for (const param of params) {
      const match = param.trim().match(/^q=([01](?:\.\d{0,3})?)$/i);
      if (match) q = Number(match[1]);
    }
    if (!(q > 0)) continue;
    // Earlier entries win ties (browsers list languages in preference order).
    const weight = q - index * 1e-6;
    if (weight > bestWeight) {
      bestLang = primary;
      bestWeight = weight;
    }
  }
  return bestLang;
}

/**
 * Build the callback fallback response. The only thing we read from the URL is
 * whether an `error` parameter is *present* — never its value.
 */
export function buildCallbackResponse(
  url: URL,
  requestId: string,
  acceptLanguage: string | null = null,
): Response {
  const lang = negotiateCallbackLanguage(acceptLanguage);
  const hasError = url.searchParams.has('error');
  const html = hasError ? PAGES[lang].error : PAGES[lang].success;

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Language': lang,
      Vary: 'Accept-Language',
      'Cache-Control': 'no-store',
      Pragma: 'no-cache',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Content-Security-Policy': CALLBACK_CSP,
      'X-Request-ID': requestId,
    },
  });
}

function page(lang: CallbackLanguage, title: string, message: string): string {
  // Static, fully self-contained markup. No JS, no external resources, and no
  // dynamic interpolation of request data.
  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${title}</title>
<style>
  :root { color-scheme: light dark; }
  body {
    margin: 0;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: -apple-system, system-ui, sans-serif;
    background: #f5f5f7;
    color: #1d1d1f;
  }
  main {
    max-width: 28rem;
    padding: 2rem 1.5rem;
    text-align: center;
  }
  h1 { font-size: 1.4rem; margin: 0 0 0.75rem; }
  p { font-size: 1rem; line-height: 1.5; margin: 0; color: #424245; }
  @media (prefers-color-scheme: dark) {
    body { background: #1d1d1f; color: #f5f5f7; }
    p { color: #c7c7cc; }
  }
</style>
</head>
<body>
<main>
<h1>${title}</h1>
<p>${message}</p>
</main>
</body>
</html>`;
}
