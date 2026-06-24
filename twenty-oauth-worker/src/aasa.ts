// Apple App Site Association document.
//
// Served identically under both /.well-known/apple-app-site-association and
// /apple-app-site-association. Only the /twenty/callback path is associated.

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
