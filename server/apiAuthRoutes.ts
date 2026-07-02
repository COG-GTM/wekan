// Login and register REST endpoints.
// Replaces communitypackages:rest-accounts-password.
// Logic copied from the package source to maintain identical API behavior.

import { Meteor } from 'meteor/meteor';
import { Accounts } from 'meteor/accounts-base';
import { WebApp } from 'meteor/webapp';
import { check, Match } from 'meteor/check';
import { sendJsonResult } from '/server/apiMiddleware';

const NonEmptyString = Match.Where(function (x: string) {
  check(x, String);
  return x.length > 0;
});

// ---------------------------------------------------------------------------
// POST /users/login
// ---------------------------------------------------------------------------
WebApp.handlers.options('/users/login', function (req: WekanConnectRequest, res: WekanConnectResponse) {
  sendJsonResult(res);
});

WebApp.handlers.post('/users/login', async function (req: WekanConnectRequest, res: WekanConnectResponse) {
  try {
    const options = req.body;

    let user;
    if (options.email) {
      check(options, {
        email: String,
        password: String,
        code: Match.Optional(NonEmptyString),
      });
      user = await Meteor.users.findOneAsync({ 'emails.address': options.email });
    } else {
      check(options, {
        username: String,
        password: String,
        code: Match.Optional(NonEmptyString),
      });
      user = await Meteor.users.findOneAsync({ username: options.username });
    }

    if (!user) {
      throw new Meteor.Error(
        'not-found',
        'User with that username or email address not found.',
      );
    }

    const result = await Accounts._checkPasswordAsync(user, options.password);
    check(result, {
      userId: String,
      error: Match.Optional(Meteor.Error),
    });

    if (result.error) {
      throw result.error;
    }

    // 2FA support
    if (Accounts._check2faEnabled && Accounts._check2faEnabled(user)) {
      if (!options.code) {
        Accounts._handleError('2FA code must be informed', true, 'no-2fa-code');
      }
      if (
        !Accounts._isTokenValid(
          // Two-step cast via `object` (avoids `unknown`/`any`): this branch is
          // only reached once _check2faEnabled(user) confirmed the 2FA service,
          // so the secret is asserted present per the pre-existing behavior.
          (user as object as TwoFactorUser).services.twoFactorAuthentication.secret,
          options.code,
        )
      ) {
        Accounts._handleError('Invalid 2FA code', true, 'invalid-2fa-code');
      }
    }

    const stampedLoginToken = Accounts._generateStampedLoginToken();
    check(stampedLoginToken, { token: String, when: Date });

    await Accounts._insertLoginToken(result.userId, stampedLoginToken);

    const tokenExpiration = Accounts._tokenExpiration(stampedLoginToken.when);
    check(tokenExpiration, Date);

    sendJsonResult(res, {
      data: {
        id: result.userId,
        token: stampedLoginToken.token,
        tokenExpires: tokenExpiration,
      },
    });
  } catch (error: any) { // REST error payloads carry ad-hoc statusCode/error/reason fields
    res.statusCode = error.statusCode || 401;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        error: error.error || error.message || 'Login failed',
        reason: error.reason || error.message,
      }),
    );
  }
});

// ---------------------------------------------------------------------------
// POST /users/register
// ---------------------------------------------------------------------------
WebApp.handlers.options('/users/register', function (req: WekanConnectRequest, res: WekanConnectResponse) {
  sendJsonResult(res);
});

WebApp.handlers.post('/users/register', async function (req: WekanConnectRequest, res: WekanConnectResponse) {
  try {
    if (Accounts._options.forbidClientAccountCreation) {
      sendJsonResult(res, { code: 403 });
      return;
    }

    const options = req.body;
    check(options, {
      username: Match.Optional(String),
      email: Match.Optional(String),
      password: String,
    });

    const userOptions: CreateUserOptions = { password: options.password };
    if (options.username) userOptions.username = options.username;
    if (options.email) userOptions.email = options.email;

    const userId = await Accounts.createUserAsync(userOptions);

    const stampedLoginToken = Accounts._generateStampedLoginToken();
    check(stampedLoginToken, { token: String, when: Date });

    await Accounts._insertLoginToken(userId, stampedLoginToken);

    const tokenExpiration = Accounts._tokenExpiration(stampedLoginToken.when);
    check(tokenExpiration, Date);

    sendJsonResult(res, {
      data: {
        token: stampedLoginToken.token,
        tokenExpires: tokenExpiration,
        id: userId,
      },
    });
  } catch (error: any) { // REST error payloads carry ad-hoc statusCode/error/reason fields
    res.statusCode = error.statusCode || 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        error: error.error || error.message || 'Registration failed',
        reason: error.reason || error.message,
      }),
    );
  }
});

// Options passed to Accounts.createUserAsync by the register endpoint. `password`
// comes off the untyped request body, hence `any`; username/email are added only
// when present in the request.
interface CreateUserOptions {
  password: any;
  username?: string;
  email?: string;
}

// A user document known to have 2FA configured; this branch only runs after
// Accounts._check2faEnabled(user) confirmed the twoFactorAuthentication service
// exists, so its secret is asserted present (matching the pre-existing runtime
// assumption).
interface TwoFactorUser {
  services: { twoFactorAuthentication: { secret: string } };
}
