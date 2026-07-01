// Type declarations for Meteor globals and packages that are not covered by
// @types/meteor, plus package-specific augmentations of existing Meteor types.

export {};

declare global {
  // From the Meteor `sha` package.
  function SHA256(message: string): string;

  // From the roles package used by Wekan.
  const Roles: {
    setUserRoles(userId: string, roles: string[]): void;
  };

  // Monkey-patched onto Object.prototype in server/sync.ts to do a
  // case-insensitive attribute lookup on an LDAP entry.
  interface Object {
    // Returns the value of the matching attribute; the value type depends on
    // the LDAP attribute resolved at runtime, so it is typed as `any`.
    getLDAPValue(prop: string): any;
  }

  namespace Meteor {
    // Wekan-specific fields stored on user documents in addition to the
    // standard Meteor account fields.
    interface User {
      isAdmin?: boolean;
      authenticationMethod?: string;
      loginDisabled?: boolean;
      email?: string;
      ldap?: boolean;
    }

    interface UserProfile {
      fullname?: string;
    }

    interface UserServices {
      ldap?: {
        id?: string;
        idAttribute?: string;
      };
      resume?: {
        loginTokens?: object[];
      };
    }

    // Registered on the client by client/loginHelper.ts. The callback may be
    // reset to null internally, so null is part of its type.
    let loginWithLDAP: (
      username: string,
      password: string,
      customLdapOptions?: { dn?: string },
      callback?: ((error?: Error) => void) | null,
    ) => void;

    // Some Wekan Meteor.Error call sites pass an object as the details argument,
    // which the upstream @types/meteor signature restricts to `string`.
    interface ErrorStatic {
      new (error: string | number, reason?: string, details?: string | object): Error;
    }
  }

  namespace Accounts {
    // Runs the remaining login handlers, used to fall back to the default
    // password-based login when LDAP does not apply.
    function _runLoginHandlers(
      methodInvocation: object,
      loginRequest: object,
    ): Promise<Accounts.LoginMethodResult>;

    // Wekan registers an async login handler; the upstream @types/meteor
    // signature only allows synchronous handlers and returns a narrower shape
    // than the LDAP handler actually produces (e.g. it also returns a login
    // token), so the result is typed structurally as an object.
    function registerLoginHandler(
      name: string,
      handler: (
        // `this` is Meteor's internal login-handler context, passed straight
        // through to Accounts._runLoginHandlers, so it is typed structurally.
        this: object,
        // The DDP login request is a dynamic payload handled generically here.
        options: any,
      ) =>
        | Promise<object | undefined>
        | object
        | undefined,
    ): void;
  }
}
