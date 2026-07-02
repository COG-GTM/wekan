import { Meteor } from 'meteor/meteor';
import { WebApp } from 'meteor/webapp';

Meteor.startup(() => {
  // Optional: Set Permissions-Policy only if explicitly provided to avoid browser warnings about unrecognized features
  if (process.env.PERMISSIONS_POLICY && process.env.PERMISSIONS_POLICY.trim() !== '') {
    WebApp.rawHandlers.use(function(req: WekanConnectRequest, res: WekanConnectResponse, next: (err?: any) => void) {
      // Guarded by the enclosing `if`; narrow the `string | undefined` env var.
      res.setHeader('Permissions-Policy', process.env.PERMISSIONS_POLICY as string);
      return next();
    });
  }

  if (process.env.CORS) {
    // Listen to incoming HTTP requests, can only be used on the server
    WebApp.rawHandlers.use(function(req: WekanConnectRequest, res: WekanConnectResponse, next: (err?: any) => void) {
      // Guarded by the enclosing `if`; narrow the `string | undefined` env var.
      res.setHeader('Access-Control-Allow-Origin', process.env.CORS as string);
      return next();
    });
  }
  if (process.env.CORS_ALLOW_HEADERS) {
    WebApp.rawHandlers.use(function(req: WekanConnectRequest, res: WekanConnectResponse, next: (err?: any) => void) {
      res.setHeader(
        'Access-Control-Allow-Headers',
        // Guarded by the enclosing `if`; narrow the `string | undefined` env var.
        process.env.CORS_ALLOW_HEADERS as string,
      );
      return next();
    });
  }
  if (process.env.CORS_EXPOSE_HEADERS) {
    WebApp.rawHandlers.use(function(req: WekanConnectRequest, res: WekanConnectResponse, next: (err?: any) => void) {
      res.setHeader(
        'Access-Control-Expose-Headers',
        // Guarded by the enclosing `if`; narrow the `string | undefined` env var.
        process.env.CORS_EXPOSE_HEADERS as string,
      );
      return next();
    });
  }
});
