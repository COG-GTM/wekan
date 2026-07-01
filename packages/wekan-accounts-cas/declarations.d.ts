import type * as http from 'http';

// `Error` inside the `Meteor`/`Accounts` namespaces below resolves to
// `Meteor.Error`; this alias keeps a reference to the global `Error` type.
type GlobalError = Error;

declare global {
  namespace Meteor {
    var initCas: (callback?: (err?: GlobalError) => void) => void;
    // any: `loginWithCas` has distinct signatures for the browser (cas_client)
    // and Cordova (cas_client_cordova) build targets, so its parameters are
    // widened here to accommodate both implementations.
    var loginWithCas: (...args: any[]) => void;
  }

  namespace WebApp {
    var handlers: {
      use(
        handler: (
          req: http.IncomingMessage,
          res: http.ServerResponse,
          next: (err?: GlobalError) => void,
        ) => void,
      ): void;
    };
  }

  namespace Accounts {
    // Meteor 3 allows async login handlers, which @types/meteor does not model.
    function registerLoginHandler(
      // any: mirrors @types/meteor's own handler signature for `options`.
      handler: (options: any) => Promise<undefined | LoginMethodResult> | undefined | LoginMethodResult,
    ): void;
    function insertUserDoc(options: object, user: object): Promise<string>;
    const LoginCancelledError: { numericError: number };
  }
}

export {};
