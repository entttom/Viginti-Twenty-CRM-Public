// Request routing.
//
// Only the routes below exist. There is intentionally NO provider-registration,
// admin, proxy, fetch or discovery route — registration happens exclusively via
// the local admin scripts writing to D1.

import { buildAasaResponse } from './aasa';
import { buildCallbackResponse } from './callback';
import {
  APPLE_APPLICATION_IDENTIFIER,
  CALLBACK_URL,
  DEFAULT_TWENTY_ISSUER,
  DISCOVERY_PATH,
  OAUTH_SCOPE,
  PKCE_METHOD,
} from './config';
import {
  handleProviderConfig,
  handleProviderRefresh,
  handleProviderStart,
  handleProviderToken,
} from './managed-oauth';
import { methodNotAllowed, notFound, publicJson, tooManyRequests } from './responses';
import { noStoreJsonHeaders } from './security-headers';
import { isValidProviderId } from './validation';
import type { Env, RateLimit } from './types';

const PROVIDER_PREFIX = '/twenty/oauth/providers/';

export async function route(
  request: Request,
  env: Env,
  url: URL,
  requestId: string,
): Promise<{ response: Response; providerId?: string }> {
  const method = request.method.toUpperCase();
  const path = url.pathname;

  // --- Health -------------------------------------------------------------
  if (path === '/health') {
    return mustGet(method, requestId, () => healthResponse(requestId));
  }

  // --- Apple App Site Association -----------------------------------------
  if (
    path === '/.well-known/apple-app-site-association' ||
    path === '/apple-app-site-association'
  ) {
    return mustGet(method, requestId, () => buildAasaResponse(requestId));
  }

  // --- Global public config -----------------------------------------------
  if (path === '/twenty/oauth/config') {
    return mustGet(method, requestId, () => globalConfigResponse(requestId));
  }

  // --- Shared OAuth callback ----------------------------------------------
  if (path === '/twenty/callback') {
    return mustGet(method, requestId, () => buildCallbackResponse(url, requestId));
  }

  // --- Managed provider routes --------------------------------------------
  if (path.startsWith(PROVIDER_PREFIX)) {
    return routeProvider(request, env, url, requestId, method, path);
  }

  return { response: notFound(requestId) };
}

async function routeProvider(
  request: Request,
  env: Env,
  url: URL,
  requestId: string,
  method: string,
  path: string,
): Promise<{ response: Response; providerId?: string }> {
  const rest = path.slice(PROVIDER_PREFIX.length);
  const slash = rest.indexOf('/');
  if (slash <= 0) {
    return { response: notFound(requestId) };
  }
  const providerId = rest.slice(0, slash);
  const action = rest.slice(slash + 1);

  // Reject malformed ids without revealing whether a provider exists.
  if (!isValidProviderId(providerId) || action.includes('/')) {
    return { response: notFound(requestId) };
  }

  const clientIp = request.headers.get('cf-connecting-ip') ?? 'unknown';

  switch (action) {
    case 'config':
      if (method !== 'GET') {
        return { response: methodNotAllowed(requestId, 'GET'), providerId };
      }
      return { response: await handleProviderConfig(env, providerId, requestId), providerId };

    case 'start': {
      if (method !== 'GET') {
        return { response: methodNotAllowed(requestId, 'GET'), providerId };
      }
      if (await isRateLimited(env.RL_START, clientIp)) {
        return { response: tooManyRequests(requestId), providerId };
      }
      return {
        response: await handleProviderStart(url, env, providerId, requestId),
        providerId,
      };
    }

    case 'token': {
      if (method !== 'POST') {
        return { response: methodNotAllowed(requestId, 'POST'), providerId };
      }
      if (await isRateLimited(env.RL_TOKEN, clientIp)) {
        return { response: tooManyRequests(requestId), providerId };
      }
      return {
        response: await handleProviderToken(request, env, providerId, requestId),
        providerId,
      };
    }

    case 'refresh': {
      if (method !== 'POST') {
        return { response: methodNotAllowed(requestId, 'POST'), providerId };
      }
      if (await isRateLimited(env.RL_TOKEN, clientIp)) {
        return { response: tooManyRequests(requestId), providerId };
      }
      return {
        response: await handleProviderRefresh(request, env, providerId, requestId),
        providerId,
      };
    }

    default:
      return { response: notFound(requestId) };
  }
}

/** Returns true when the limiter rejects this client IP. */
async function isRateLimited(limiter: RateLimit, clientIp: string): Promise<boolean> {
  const { success } = await limiter.limit({ key: clientIp });
  return !success;
}

function mustGet(
  method: string,
  requestId: string,
  build: () => Response,
): { response: Response } {
  if (method !== 'GET') {
    return { response: methodNotAllowed(requestId, 'GET') };
  }
  return { response: build() };
}

function healthResponse(requestId: string): Response {
  return new Response(JSON.stringify({ status: 'ok', service: 'viginti-twenty-oauth' }), {
    status: 200,
    headers: noStoreJsonHeaders(requestId),
  });
}

function globalConfigResponse(requestId: string): Response {
  const body = {
    callbackURL: CALLBACK_URL,
    defaultIssuer: DEFAULT_TWENTY_ISSUER,
    discoveryPath: DISCOVERY_PATH,
    clientRegistrationRequired: true,
    directPublicClientSupported: true,
    managedBrokerSupported: true,
    scope: OAUTH_SCOPE,
    pkceMethod: PKCE_METHOD,
    appleApplicationIdentifier: APPLE_APPLICATION_IDENTIFIER,
  };
  return publicJson(body, requestId, 300);
}
