// API middleware: body parsing, auth token handling, API gate, and JSON response helper.
// Replaces communitypackages:json-routes middleware chain.
// Must be imported before model files that register API routes.

import { Meteor } from 'meteor/meteor';
import { Accounts } from 'meteor/accounts-base';
import { WebApp } from 'meteor/webapp';
import bodyParser from 'body-parser';
import { safeJsonStringify } from '/server/lib/apiResponseHelpers';

// ---------------------------------------------------------------------------
// 1. Body parsing (previously registered by json-routes)
// ---------------------------------------------------------------------------
WebApp.handlers.use(bodyParser.urlencoded({ limit: '50mb', extended: false }));
WebApp.handlers.use(bodyParser.json({ limit: '50mb' }));

// ---------------------------------------------------------------------------
// 2. API gate — check WITH_API env var (previously in models/users.js)
// ---------------------------------------------------------------------------
WebApp.handlers.use(function apiGate(req: WekanConnectRequest, res: WekanConnectResponse, next: (err?: any) => void) {
  const api = req.url.startsWith('/api');
  if ((api && process.env.WITH_API === 'true') || !api) {
    return next();
  }
  res.writeHead(301, { Location: '/' });
  return res.end();
});

// ---------------------------------------------------------------------------
// 3. Bearer token parser (replaces communitypackages:rest-bearer-token-parser)
// ---------------------------------------------------------------------------
WebApp.handlers.use(function parseBearerToken(req: WekanConnectRequest, res: WekanConnectResponse, next: (err?: any) => void) {
  // Check Authorization header first
  const authHeader = req.headers.authorization;
  if (authHeader) {
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (match) {
      req.authToken = match[1];
    }
  }

  // Fallback to access_token query param
  if (!req.authToken && req.query && req.query.access_token) {
    // The access_token query param is single-valued in practice; narrow the
    // `string | string[] | undefined` query value to the string authToken holds.
    req.authToken = req.query.access_token as string;
  }

  next();
});

// ---------------------------------------------------------------------------
// 4. User authentication (replaces communitypackages:authenticate-user-by-token)
// ---------------------------------------------------------------------------
WebApp.handlers.use(async function authenticateByToken(req: WekanConnectRequest, res: WekanConnectResponse, next: (err?: any) => void) {
  if (req.authToken) {
    try {
      const hashedToken = Accounts._hashLoginToken(req.authToken);
      const user = await Meteor.users.findOneAsync(
        { 'services.resume.loginTokens.hashedToken': hashedToken },
        { fields: { _id: 1 } },
      );
      if (user) {
        req.userId = user._id;
      }
    } catch (e) {
      // Ignore auth errors — routes handle missing userId themselves
    }
  }
  next();
});

// ---------------------------------------------------------------------------
// 5. sendJsonResult — drop-in replacement for JsonRoutes.sendResult
// ---------------------------------------------------------------------------
export function sendJsonResult(res: WekanConnectResponse, options?: JsonResultOptions) {
  options = options || {};

  // Default response headers (matching json-routes behavior)
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');

  // Custom headers
  if (options.headers) {
    Object.entries(options.headers).forEach(function ([key, value]) {
      res.setHeader(key, value);
    });
  }

  // Status code
  res.statusCode = options.code || 200;

  // JSON body
  if (options.data !== undefined) {
    const shouldPrettyPrint = process.env.NODE_ENV === 'development';
    const spacer = shouldPrettyPrint ? 2 : null;
    res.setHeader('Content-Type', 'application/json');
    // Use a crash-proof serializer: some error payloads (e.g. a circular
    // SimpleSchema validation error) would otherwise throw inside
    // JSON.stringify and surface as a generic HTTP 500. See #5804.
    res.write(safeJsonStringify(options.data, spacer));
  }

  res.end();
}

// Options accepted by sendJsonResult: HTTP status code, extra response headers,
// and the JSON-serialisable body. `data` is `any` because every REST route
// passes its own payload shape through this generic responder.
interface JsonResultOptions {
  code?: number;
  headers?: { [key: string]: string | number | string[] };
  data?: any;
}
