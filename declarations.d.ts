// Load the Mocha BDD globals (describe/it/before*/after*) from @types/mocha for
// the server/lib test suites. These globals are provided by the meteortesting:mocha
// driver at runtime; @types/mocha is global-only (never imported) so it is not
// auto-included and must be referenced explicitly here.
/// <reference types="mocha" />

// Augment @types/meteor with the internal DDP server surface the server-side
// test suites rely on. `Meteor.server.method_handlers` maps a registered method
// name to its handler function; tests look a handler up by name and invoke it
// directly (e.g. `handler.call({ userId }, ...args)`). Handler signatures are
// heterogeneous, so the args/return are `any` (documented external boundary).
declare module 'meteor/meteor' {
  namespace Meteor {
    const server: {
      method_handlers: {
        [name: string]: (this: { userId?: string | null }, ...args: any[]) => any;
      };
    };
    // wekan stores a site-admin flag on the user document; @types/meteor's
    // `User` omits it. Declared optional so server code can gate admin-only
    // permissions/methods off `user.isAdmin`.
    interface User {
      isAdmin?: boolean;
    }
  }
}

// Expose the Meteor-internal `Collection._transform` used by the model tests: it
// applies the collection's `transform` to a raw document, returning the document
// with its model helper methods attached. Return type is `any` because the
// attached helpers differ per collection (Cards gains move(), etc.).
declare module 'meteor/mongo' {
  namespace Mongo {
    interface Collection<T, U = T> {
      _transform(doc: any): any;
    }
  }
}

// Ambient module and global declarations for the wekan root application.
//
// These cover Meteor packages and app-wide globals that are NOT typed by
// `@types/meteor` (or by the package's own bundled types). They provide real
// signatures where practical so app code can be strictly type-checked without
// `unknown`. A handful of external-library boundaries take genuinely arbitrary
// values (Mongo selectors, i18next options, plugin config bags); those use a
// commented `any` because their shape is dynamic and defined by the library.
// Added incrementally as more of the app is migrated to TypeScript.

// A MongoDB-style query/selector or option bag: field -> arbitrary value.
// `any` here because the value shape is inherently dynamic (defined by Mongo).
type MongoQuery = { [key: string]: any };

// ---------------------------------------------------------------------------
// Untyped Meteor / npm packages imported by app code
// ---------------------------------------------------------------------------

// meteor/ostrio:files — file upload/storage package exposing FilesCollection.
// It ships no TypeScript types and its API is large and dynamic, so the class
// is modelled with an index signature (mirroring WekanFilesCollection) and its
// constructor config is `any`.
declare module 'meteor/ostrio:files' {
  // Instances are modelled by the global WekanFilesCollection shape (index
  // signature + the enumerated methods), so `new FilesCollection(config)`
  // produces a value the rest of the model/lib code can consume.
  export const FilesCollection: {
    new (config?: any): WekanFilesCollection;
  };
}

// meteor/ostrio:flow-router-extra — client-side router used across config/.
declare module 'meteor/ostrio:flow-router-extra' {
  // The `this` context available inside a route `action`.
  export interface FlowRouterRouteContext {
    render(layout: string, regions?: { [region: string]: string }): void;
    params: { [key: string]: string };
    queryParams: { [key: string]: string };
    path: string;
  }

  interface FlowRouterRoute {
    name?: string;
    triggersEnter?: Array<
      (context: FlowRouterRouteContext, redirect: (path: string) => void) => void
    >;
    action?: (
      this: FlowRouterRouteContext,
      params: { [key: string]: string },
      queryParams: { [key: string]: string },
    ) => void;
  }

  interface FlowRouterTriggers {
    enter(triggers: Array<(context: FlowRouterRouteContext) => void>): void;
    exit(triggers: Array<(context: FlowRouterRouteContext) => void>): void;
  }

  const FlowRouter: {
    route(path: string, options?: FlowRouterRoute): void;
    go(pathOrName: string, params?: { [key: string]: string }): void;
    path(pathDef: string, params?: { [key: string]: string }): string;
    url(pathDef: string, params?: { [key: string]: string }, queryParams?: { [key: string]: string }): string;
    reload(): void;
    getRouteName(): string;
    getQueryParam(key: string): string | undefined;
    triggers: FlowRouterTriggers;
  };
  export { FlowRouter };
}

// meteor/communitypackages:core — useraccounts translation registry (T9n).
declare module 'meteor/communitypackages:core' {
  const T9n: {
    setTracker(deps: { Tracker: object }): void;
    map(language: string, translations: { [key: string]: string }): void;
    setLanguage(language: string): void;
    getLanguage(): string;
  };
  export { T9n };
}

// meteor/aldeed:simple-schema — schema builder (also available as a global).
declare module 'meteor/aldeed:simple-schema' {
  export const SimpleSchema: SimpleSchemaStatic;
  const _default: SimpleSchemaStatic;
  export default _default;
}

// wekan's collections use three Meteor packages that extend Mongo.Collection but
// ship no TypeScript types: aldeed:collection2 (attachSchema/simpleSchema),
// dburles:collection-helpers (helpers) and matb33:collection-hooks
// (before/after/hookOptions). Their APIs are dynamic (schema defs, helper maps
// keyed on the document, hook callbacks), so the added members use `any` with
// the collection-helper `this` widened to `any` so helper bodies type-check.
declare module 'meteor/mongo' {
  namespace Mongo {
    interface Collection<T extends import('mongodb').Document, U = T> {
      attachSchema(schema: any, options?: any): void;
      simpleSchema(): any;
      helpers(helpers: { [name: string]: (this: any, ...args: any[]) => any }): void;
      before: CollectionHooks;
      after: CollectionHooks;
      hookOptions: any;
      // collection-hooks `.direct` exposes the underlying mutation methods that
      // bypass the registered hooks; its shape mirrors the collection, so `any`.
      direct: any;
      // wekan runs on Meteor 3, whose allow/deny security callbacks may be async
      // and return any truthy/falsy value (Meteor coerces the result). The
      // @types/meteor signature only accepts the synchronous boolean form, so
      // the real Meteor 3 signature is declared here as an extra overload.
      allow(options: CollectionAllowDenyModifier): boolean;
      deny(options: CollectionAllowDenyModifier): boolean;
    }
  }
}

// A Meteor allow/deny callback result: Meteor only checks its truthiness, so the
// security rules may return a boolean, a string id comparison, or null/undefined
// (and, when async, a Promise of any of those).
type AllowDenyResult = boolean | string | null | undefined;

// Real Meteor 3 allow/deny option bag (see the Mongo.Collection augmentation
// above). The mutated document is a dynamic per-collection Mongo shape, hence
// `any`.
interface CollectionAllowDenyModifier {
  insert?: (userId: string, doc: any) => AllowDenyResult | Promise<AllowDenyResult>;
  update?: (userId: string, doc: any, fieldNames: string[], modifier: any) => AllowDenyResult | Promise<AllowDenyResult>;
  remove?: (userId: string, doc: any) => AllowDenyResult | Promise<AllowDenyResult>;
  fetch?: string[];
  transform?: (doc: any) => any;
}

// matb33:collection-hooks: registers callbacks around collection mutations. The
// document, selector, options and modifier passed to these callbacks are
// dynamic Mongo shapes (defined per-collection), hence `any`.
interface CollectionHooks {
  insert(cb: (userId: string, doc: any) => void): void;
  update(cb: (userId: string, doc: any, fieldNames: string[], modifier: any) => void): void;
  remove(cb: (userId: string, doc: any) => void): void;
  find(cb: (userId: string, selector: any, options: any) => void): void;
  findOne(cb: (userId: string, selector: any, options: any) => void): void;
}

// i18next-sprintf-postprocessor — sprintf() post-processor plugin for i18next.
// Shaped as an i18next PostProcessorModule so it type-checks when passed to
// `i18next.use()`.
declare module 'i18next-sprintf-postprocessor' {
  const sprintf: {
    type: 'postProcessor';
    name: string;
    // `translator` is i18next's internal Translator, passed through untyped.
    process(
      value: string,
      key: string | string[],
      options: object,
      translator: any,
    ): string;
  };
  export default sprintf;
}

// meteor/webapp — Meteor 3's connect-based HTTP router. wekan registers its REST
// endpoints via `WebApp.handlers.<verb>(path, handler)`; @types/meteor exposes
// `connectHandlers` but not this newer `handlers` router, so declare it with the
// verbs the app uses. The request is a Node IncomingMessage augmented by Meteor
// + wekan api middleware (userId/body/params), and the response is a plain
// ServerResponse.
declare module 'meteor/webapp' {
  namespace WebApp {
    const handlers: WekanConnectRouter;
  }
}

interface WekanConnectRequest extends import('http').IncomingMessage {
  // Populated by wekan's Authentication middleware before the REST handlers run;
  // modelled as a plain string since every handler operates on an authenticated
  // request (they call Authentication.checkLoggedIn / return 401 otherwise).
  userId: string;
  // Request body parsed by wekan's api middleware; the shape varies per route,
  // hence `any`.
  body?: any;
  // Request URL (always set on an incoming connect request); handlers parse
  // query params from it via `new URL(req.url, ...)`.
  url: string;
  // Route params extracted from `:name` path segments by the connect router.
  params: { [key: string]: string };
  query?: { [key: string]: string | string[] | undefined };
}

type WekanConnectResponse = import('http').ServerResponse;

// A wekan REST route handler. `next` is optional-by-arity: handlers commonly
// take just (req, res). The dynamic connect `next` error is `any`.
type WekanConnectHandler = (
  req: WekanConnectRequest,
  res: WekanConnectResponse,
  next: (err?: any) => void,
) => void | Promise<void>;

interface WekanConnectRouter {
  // connect `.use` accepts a path and/or a chain of middleware of varied
  // arities, so its args are dynamic.
  use(...args: any[]): WekanConnectRouter;
  get(path: string, ...handlers: WekanConnectHandler[]): WekanConnectRouter;
  post(path: string, ...handlers: WekanConnectHandler[]): WekanConnectRouter;
  put(path: string, ...handlers: WekanConnectHandler[]): WekanConnectRouter;
  delete(path: string, ...handlers: WekanConnectHandler[]): WekanConnectRouter;
  options(path: string, ...handlers: WekanConnectHandler[]): WekanConnectRouter;
}

// meteor/wekan-accounts-lockout — brute-force account lockout package (no bundled
// types). Configured with numeric policy bags for known/unknown users, then
// started via `.startup()`.
declare module 'meteor/wekan-accounts-lockout' {
  interface AccountsLockoutUserConfig {
    failuresBeforeLockout: number;
    lockoutPeriod: number;
    failureWindow: number;
  }
  export class AccountsLockout {
    constructor(config: {
      knownUsers: AccountsLockoutUserConfig;
      unknownUsers: AccountsLockoutUserConfig;
    });
    startup(): void;
  }
}

// ---------------------------------------------------------------------------
// App-wide globals (registered by Meteor packages / startup code)
// ---------------------------------------------------------------------------

interface SimpleSchemaStatic {
  // Schema definitions are dynamic maps of field -> rule spec (aldeed API).
  new (schema: MongoQuery, options?: MongoQuery): object;
  extendOptions(options: string[]): void;
  _wekanExtendedOptions?: boolean;
  // Built-in validation regexps (SimpleSchema.RegEx.Email, .Id, .Url, ...).
  RegEx: { [name: string]: RegExp };
}

// useraccounts:core form manager, configured in config/accounts.ts.
interface AccountsTemplatesField {
  _id: string;
  type?: string;
  displayName?: string;
  required?: boolean;
  minLength?: number;
  autocomplete?: string;
  template?: string;
}

interface AccountsTemplatesStatic {
  removeField(fieldId: string): AccountsTemplatesField;
  addFields(fields: AccountsTemplatesField[]): void;
  // useraccounts config bag: many optional keys of varied types (library API).
  configure(options: MongoQuery): void;
  configureRoute(routeName: string, options?: MongoQuery): void;
  ensureSignedIn: (context: object, redirect: (path: string) => void) => void;
}

// Modal manager (client), used by config/router.ts.
interface ModalStatic {
  open(template: string, options?: MongoQuery): void;
}

declare const AccountsTemplates: AccountsTemplatesStatic;
declare const Modal: ModalStatic;

// Meteor's global `Accounts` (accounts-base) as used by config/accounts.ts.
// `emailTemplates` groups (resetPassword/verifyEmail/…) hold builder callbacks
// of varied signatures, and `sendResetPasswordEmail` is a Meteor-internal fn
// that gets wrapped, so both are dynamic.
interface AccountsEmailTemplates {
  siteName?: string;
  [templateGroup: string]: any;
}

interface AccountsStatic {
  emailTemplates: AccountsEmailTemplates;
  sendResetPasswordEmail: any;
  // Internal Meteor helper used by the export routes to match a login token
  // against its stored hash.
  _hashLoginToken(loginToken: string): string;
}

declare const Accounts: AccountsStatic;

// Server-internal `Accounts.insertUserDoc` (accounts-base) is not part of
// @types/meteor's public surface, but server/lib/headerLoginAuth.ts uses it to
// mint a user document from a header-provided identity. Augment the module with
// its real signature: it takes an options bag and a partial user document and
// returns the new user id.
declare module 'meteor/accounts-base' {
  namespace Accounts {
    function insertUserDoc(options: object, user: object): string;
  }
}

// Meteor's server-side global `Email` (meteor/email), used by
// server/lib/emailLocalization.ts to send localized mail.
interface EmailSendOptions {
  to?: string | string[];
  from?: string;
  cc?: string | string[];
  bcc?: string | string[];
  replyTo?: string | string[];
  subject?: string;
  text?: string;
  html?: string;
}

declare const Email: {
  send(options: EmailSendOptions): void;
  sendAsync(options: EmailSendOptions): Promise<void>;
};

// Raw MongoDB handle exposed to migration scripts (migrations/).
interface MigrationCollection {
  findOne(filter?: MongoQuery, options?: MongoQuery): Promise<MongoQuery | null>;
  find(filter?: MongoQuery): { toArray(): Promise<MongoQuery[]> };
  updateOne(filter: MongoQuery, update: MongoQuery): Promise<MongoQuery>;
  countDocuments(filter?: MongoQuery): Promise<number>;
}

declare const db: { [collection: string]: MigrationCollection };

// @types/meteor declares `MongoInternals` only as a GLOBAL namespace, but app
// code imports it from 'meteor/mongo'. Expose it as a module export with the
// members the app uses — including `NpmModule` (singular), the raw `mongodb`
// module the bundled driver provides for `ObjectId` / `GridFSBucket`, which
// @types/meteor omits (it only has the plural `NpmModules`).
declare module 'meteor/mongo' {
  namespace MongoInternals {
    function defaultRemoteCollectionDriver(): {
      mongo: { db: import('mongodb').Db };
    };
    var NpmModule: typeof import('mongodb');
    var NpmModules: {
      mongodb: { version: string; module: typeof import('mongodb') };
    };
  }
}

// Meteor's global package registry (Package.<name> -> that package's exports).
// Values are whole package export bags, so they are inherently dynamic (`any`).
declare const Package: { [name: string]: any };

// ReactiveVar exposes its internal Tracker dependency as `.dep`; the i18n layer
// uses it to force reactivity. Not covered by @types/meteor, so merge it into
// the 'meteor/reactive-var' module interface used by app imports.
declare module 'meteor/reactive-var' {
  interface ReactiveVar<T> {
    dep: Tracker.Dependency;
  }
}

// Blaze exposes a global helper registrar (Blaze._globalHelpers) as
// `Blaze.registerHelper`; @types/meteor only declares it on `Template`.
declare module 'meteor/blaze' {
  namespace Blaze {
    // A Blaze helper receives arbitrary Spacebars args and returns any value.
    function registerHelper(name: string, func: (...args: any[]) => any): void;
  }
}

// Meteor injects its runtime configuration (ROOT_URL, etc.) onto the browser
// window as `__meteor_runtime_config__`; only the fields app code reads here.
interface Window {
  __meteor_runtime_config__?: { ROOT_URL?: string };
}

// Some legacy model files reference these values from Meteor's package scope
// without an explicit import. Declare them as ambient globals with real types
// where available so those files type-check without changing their runtime.
declare const Random: typeof import('meteor/random').Random;
// Meteor server global for CommonJS requires from within package/app scope.
declare const Npm: { require(id: string): any };
declare const ReactiveCache: typeof import('/imports/reactiveCache').ReactiveCache;
// Minimal shape of the ostrio:files FilesCollection wrappers (Attachments,
// Avatars) that model code interacts with. `collection` is the underlying
// Mongo.Collection (dynamic legacy docs); the rest of the ostrio API is dynamic
// too, covered by the index signature, while the enumerated methods give the
// callbacks passed to them proper contextual types.
interface WekanFilesCollection {
  collection: any;
  updateAsync(selector: any, modifier: any, options?: any): Promise<any>;
  addFile(
    path: string,
    config?: any,
    callback?: (error: any, fileRef: any) => void,
    proceedAfterUpload?: boolean,
  ): any;
  [key: string]: any;
}

// The global Attachments FilesCollection (ostrio:files) comes from the untyped
// models/attachments module.
declare const Attachments: WekanFilesCollection;

// The client-side card Filter (client/lib/filter.js) is referenced as a global
// by isomorphic model files (lists/swimlanes) behind a `typeof Filter` guard.
// Its fields are dynamic SetFilter/DateFilter/… instances, covered by the index
// signature; `mongoSelector` is the one method the models call.
interface WekanFilter {
  mongoSelector(selector: any): any;
  [key: string]: any;
}
declare const Filter: WekanFilter;

// The Users model collection (models/users) is referenced as a global by some
// model files that do not import it. Its custom statics/helpers are dynamic
// (legacy collection API), so it is modelled with an index signature.
interface WekanUsersCollection {
  [key: string]: any;
}
declare const Users: WekanUsersCollection;

// localStorage validation helpers (client/lib/localStorageValidator.js) that
// models/users.js references as globals (guarded by `typeof … === 'function'`).
// Their validator callbacks receive/return dynamic persisted JSON, hence `any`.
declare function getValidatedLocalStorageData(
  key: string,
  validator: (data: any) => any,
): any;
declare function setValidatedLocalStorageData(
  key: string,
  data: any,
  validator: (data: any) => any,
): boolean;
declare const validators: {
  swimlaneHeights: (data: any) => any;
  listWidths: (data: any) => any;
  collapsedStates: (data: any) => any;
  isValidNumber: (value: any, min?: number, max?: number) => boolean;
  isValidBoolean: (value: any) => boolean;
};

// The client-side Utils helper (client/lib/utils) is referenced as a global by
// models/cards (only on the client, inside DOM sort-index math). Only the
// method the model calls is typed; the rest of the object stays dynamic.
interface WekanUtils {
  calculateIndex(
    prevCardDomElement: any,
    nextCardDomElement: any,
    nCards?: number,
  ): { base: number; increment: number };
  [key: string]: any;
}
declare const Utils: WekanUtils;

// The UserPositionHistory model collection is referenced as an optional global
// by models/cards (guarded by `typeof … !== 'undefined'`). Its API is dynamic
// (legacy collection statics), so it is modelled with an index signature.
interface WekanUserPositionHistory {
  trackChange(change: any): any;
  [key: string]: any;
}
declare const UserPositionHistory: WekanUserPositionHistory;
