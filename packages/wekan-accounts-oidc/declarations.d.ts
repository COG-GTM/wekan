// Ambient type declarations for the wekan-accounts-oidc Meteor package.
//
// These describe Meteor globals that exist at runtime — provided by the
// `accounts-oauth` / `accounts-base` core packages and by the `wekan-oidc`
// package — but that are not covered by @types/meteor. They are declared with
// real signatures (derived from how they are used in this package and in
// wekan-oidc) rather than as opaque `any` values.

declare namespace Meteor {
  var loginWithOidc: (options: OidcLoginOptions, callback?: OidcLoginCallback) => void;
}

declare namespace Accounts {
  var oauth: {
    registerService(name: string): void;
    credentialRequestCompleteHandler(callback?: OidcLoginCallback): OidcCredentialRequestCompleteCallback;
  };

  function addAutopublishFields(opts: {
    forLoggedInUser: string[];
    forOtherUsers: string[];
  }): void;
}

declare const Oidc: {
  requestCredential(
    options?: OidcLoginOptions,
    credentialRequestCompleteCallback?: OidcCredentialRequestCompleteCallback,
  ): void;
};

interface OidcRequestCredentialOptions {
  loginStyle?: string;
  redirectUrl?: string;
  response_type?: string;
  popupOptions?: {
    width?: number;
    height?: number;
  };
}

type OidcLoginCallback = (error?: Error | Meteor.Error | Meteor.TypedError) => void;

type OidcCredentialRequestCompleteCallback = (credentialTokenOrError?: string | Error) => void;

type OidcLoginOptions = OidcRequestCredentialOptions | OidcLoginCallback | null;
