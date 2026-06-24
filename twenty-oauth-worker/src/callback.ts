// Static browser-fallback page for the shared OAuth redirect URI.
//
// Normally ASWebAuthenticationSession intercepts /twenty/callback and the app
// reads the result. If the URL is opened in a plain browser we serve a static
// page. The page NEVER reflects any query parameter (code, state, iss, error,
// error_description, scope, session_state, ...) into the HTML, and no query
// parameter is ever logged. JavaScript, cookies and tracking are not used.

import { CALLBACK_CSP } from './security-headers';

const SUCCESS_HTML = page(
  'Anmeldung abgeschlossen',
  'Die Anmeldung wurde abgeschlossen. Du kannst dieses Fenster schließen und zur Viginti-App zurückkehren.',
);

const ERROR_HTML = page(
  'Anmeldung nicht abgeschlossen',
  'Die Anmeldung konnte nicht abgeschlossen werden. Kehre zur Viginti-App zurück und versuche es erneut.',
);

/**
 * Build the callback fallback response. The only thing we read from the URL is
 * whether an `error` parameter is *present* — never its value.
 */
export function buildCallbackResponse(url: URL, requestId: string): Response {
  const hasError = url.searchParams.has('error');
  const html = hasError ? ERROR_HTML : SUCCESS_HTML;

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
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

function page(title: string, message: string): string {
  // Static, fully self-contained markup. No JS, no external resources, and no
  // dynamic interpolation of request data.
  return `<!DOCTYPE html>
<html lang="de">
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
