// Ambient type declarations for the wekan-oidc Meteor package.
//
// Meteor's package build (see `api.export('Oidc')` in package.js and Meteor's
// package-variable linker) turns identifiers that are assigned without a
// declaration into package-scoped variables that are shared across this
// package's files. They are declared here so `tsc --noEmit` can resolve them
// under strict mode without changing any runtime behavior.
//
// @types/meteor supplies the standard Meteor globals. They are pulled in via
// the explicit reference paths below (instead of the tsconfig `types` field) so
// that this package can provide a real, complete declaration for
// `ServiceConfiguration`/`Configuration`: @types/meteor declares
// `ServiceConfiguration` as a non-extensible value that omits `ConfigError`,
// which this package uses, and a `ConfigError` member cannot be merged onto it.

/// <reference types="node" />
/// <reference path="../../node_modules/@types/meteor/globals/ejson.d.ts" />
/// <reference path="../../node_modules/@types/meteor/globals/tracker.d.ts" />
/// <reference path="../../node_modules/@types/meteor/globals/ddp.d.ts" />
/// <reference path="../../node_modules/@types/meteor/globals/blaze.d.ts" />
/// <reference path="../../node_modules/@types/meteor/globals/mongo.d.ts" />
/// <reference path="../../node_modules/@types/meteor/globals/meteor.d.ts" />
/// <reference path="../../node_modules/@types/meteor/globals/templating.d.ts" />
/// <reference path="../../node_modules/@types/meteor/globals/check.d.ts" />
/// <reference path="../../node_modules/@types/meteor/globals/random.d.ts" />
/// <reference path="../../node_modules/@types/meteor/fetch.d.ts" />

// ---------------------------------------------------------------------------
// Untyped Meteor packages used by wekan-oidc
// ---------------------------------------------------------------------------

// meteor/oauth is not covered by @types/meteor.
declare namespace OAuth {
  function _loginStyle(service: string, config: Configuration, options: OidcRequestOptions): string;
  function _redirectUri(service: string, config: Configuration): string;
  function _stateParam(loginStyle: string, credentialToken: string, redirectUrl?: string): string;
  function launchLogin(options: OAuthLaunchLoginOptions): void;
  function registerService(
    name: string,
    version: number,
    urls: null,
    handler: (query: OidcQuery) => Promise<OidcServiceResult>,
  ): void;
  function openSecret(secret: string): string;
  // OAuth's stored credential document; OAuth internals are untyped.
  function retrieveCredential(credentialToken: string, credentialSecret: string): any;
}

// meteor/url re-exports the WHATWG URLSearchParams implementation on the server.
declare module 'meteor/url' {
  export const URLSearchParams: typeof globalThis.URLSearchParams;
}

// ---------------------------------------------------------------------------
// service-configuration (real signatures; supersedes @types/meteor's partial,
// non-extensible declaration, which lacks ConfigError)
// ---------------------------------------------------------------------------
declare interface Configuration {
  _id?: string;
  service?: string;
  clientId: string;
  secret: string;
  serverUrl: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  userinfoEndpoint: string;
  idTokenWhitelistFields?: string[];
  requestPermissions?: string;
  loginStyle?: string;
}
declare var ServiceConfiguration: {
  configurations: Mongo.Collection<Configuration>;
  ConfigError: new (serviceName?: string) => Error;
};

// ---------------------------------------------------------------------------
// Wekan application globals (provided at runtime by other packages of the app)
// ---------------------------------------------------------------------------
declare namespace Meteor {
  interface User {
    isAdmin?: boolean;
    teams?: WekanUserTeam[];
    orgs?: WekanUserOrg[];
  }
}

declare var Boards: Mongo.Collection<WekanBoard>;
declare var Users: Mongo.Collection<Meteor.User>;
declare var Org: Mongo.Collection<WekanOrg>;
declare var Team: Mongo.Collection<WekanTeam>;

// The OAUTH2_*_MAP env vars name the OIDC userinfo claim to read for each field
// and are used directly as object index keys, so they are typed as strings.
declare namespace NodeJS {
  interface ProcessEnv {
    OAUTH2_ID_MAP: string;
    OAUTH2_USERNAME_MAP: string;
    OAUTH2_FULLNAME_MAP: string;
    OAUTH2_EMAIL_MAP: string;
  }
}

// `Array.prototype.contains` is provided at runtime by the Wekan app.
interface Array<T> {
  contains(value: T): boolean;
}

// ---------------------------------------------------------------------------
// Package-scoped variables (Meteor package globals shared across this package's
// files — see the header note).
// ---------------------------------------------------------------------------
declare var Oidc: OidcStatic;
declare var httpCa: Buffer | false;
declare var user: Meteor.User | undefined;
declare var users: Mongo.Collection<Meteor.User>;

// loginHandler.ts package variables
declare var functionName: string;
declare var creationString: string;
declare var id: string;
declare var teamArray: WekanUserTeam[];
declare var orgArray: WekanUserOrg[];
declare var isAdmin: boolean[];
// `teams`/`orgs` hold both the user's team/org arrays and, later, the Mongo
// `$push` modifier objects, so no single static type applies.
declare var teams: any;
declare var orgs: any;
declare var group: OidcGroup;
declare var initAttributes: InitAttributes;
declare var isOrg: boolean;
declare var forceCreate: boolean;
declare var org: WekanOrg | undefined;
declare var orgHash: WekanUserOrg;
declare var team: WekanTeam | undefined;
declare var teamHash: WekanUserTeam;
// Holds a `{username}` / `{profile.fullname}` $set modifier object and is also
// compared against a plain string, so no single static type applies.
declare var username: any;
// Holds both the emails array and, later, the Mongo `$set` modifier object.
declare var user_email: any;
// Used both as a numeric splice index and as an Object.entries string key.
declare var position: any;

// ---------------------------------------------------------------------------
// Shared interfaces / types
// ---------------------------------------------------------------------------
interface OidcStatic {
  requestCredential?: (
    options: OidcRequestOptions | OidcCredentialCallback,
    credentialRequestCompleteCallback?: OidcCredentialCallback,
  ) => void;
  // OAuth's stored credential document; OAuth internals are untyped.
  retrieveCredential?: (credentialToken: string, credentialSecret: string) => any;
}

type OidcCredentialCallback = (credentialTokenOrError?: string | Error) => void;

// Positional argument list passed to the Org/Team creation methods: display
// name/desc/shortName/website strings, an isActive boolean, and (for updates) a
// Team/Org document unshifted onto the front.
type InitAttributes = Array<string | boolean | undefined | WekanTeam | WekanOrg>;

interface OidcRequestOptions {
  response_type?: string;
  client_id?: string;
  redirect_uri?: string;
  state?: string;
  scope?: string;
  display?: string;
  redirectUrl?: string;
  popupOptions?: { width?: number; height?: number };
}

interface OAuthLaunchLoginOptions {
  loginService: string;
  loginStyle: string;
  loginUrl: string;
  credentialRequestCompleteCallback?: OidcCredentialCallback;
  credentialToken: string;
  popupOptions: { width: number; height: number };
}

interface OidcQuery {
  code: string;
  state: string;
}

interface OidcGroup {
  displayName?: string;
  name?: string;
  desc?: string;
  shortName?: string;
  website?: string;
  isActive?: boolean;
  isAdmin?: boolean;
  isOrganisation?: boolean;
  forceCreate?: boolean;
}

interface OidcProfile {
  name?: string;
  email?: string;
}

interface ServiceData {
  id?: string;
  username?: string;
  fullname?: string;
  accessToken?: string;
  expiresAt?: number;
  email?: string;
  email_verified?: boolean;
  // The OIDC `groups` claim arrives as an array of strings or of objects and is
  // normalised in place during login, so no single static element type applies.
  groups?: any[];
  refreshToken?: string;
}

interface OidcServiceResult {
  serviceData: ServiceData;
  options: { profile: OidcProfile };
}

interface WekanBoard {
  _id: string;
  members?: Array<{ userId?: string }>;
  addMember(userId: string): Promise<void>;
  setMemberPermission(
    userId: string,
    isAdmin: boolean,
    isNoComments: boolean,
    isCommentsOnly: boolean,
    isWorker: boolean,
  ): Promise<void>;
}

interface WekanTeam {
  _id: string;
}

interface WekanOrg {
  _id: string;
}

interface WekanUserTeam {
  teamId: string;
  teamDisplayName?: string;
}

interface WekanUserOrg {
  orgId: string;
  orgDisplayName?: string;
}
