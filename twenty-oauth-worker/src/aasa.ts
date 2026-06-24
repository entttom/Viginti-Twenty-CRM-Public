// Apple App Site Association document.
//
// Served identically under both /.well-known/apple-app-site-association and
// /apple-app-site-association.
//
// - `applinks`: associates only /twenty/callback as a universal link.
// - `webcredentials`: REQUIRED for the ASWebAuthenticationSession HTTPS callback
//   (iOS 17.4+). Without it iOS refuses / immediately cancels the auth session.

import { APPLE_APPLICATION_IDENTIFIER, CALLBACK_PATH } from './config';

export function buildAasaResponse(requestId: string): Response {
  const body = {
    applinks: {
      details: [
        {
          appIDs: [APPLE_APPLICATION_IDENTIFIER],
          components: [
            {
              '/': CALLBACK_PATH,
              comment: 'Twenty OAuth callback for Viginti',
            },
          ],
        },
      ],
    },
    webcredentials: {
      apps: [APPLE_APPLICATION_IDENTIFIER],
    },
  };

  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
      'X-Request-ID': requestId,
    },
  });
}
