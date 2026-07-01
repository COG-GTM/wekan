// Ambient declarations for the Wekan Meteor app's TypeScript migration.
//
// This file provides types for:
//   1. Community `meteor/*` packages that `@types/meteor` does not cover.
//   2. Wekan app-level globals referenced by the migrated `config/` files.
//
// It is intentionally scoped to what the currently-migrated files need; later
// migration sessions are expected to extend it as more layers are converted.

/// <reference types="meteor" />

// ---------------------------------------------------------------------------
// Shared route-handling types (used by both FlowRouter routes and the
// AccountsTemplates `ensureSignedIn` trigger).
// ---------------------------------------------------------------------------

/** Data passed to a FlowRouter layout render call. */
interface WekanRouteRenderData {
  headerBar?: string;
  content?: string;
}

/** The `this` context / context argument of a FlowRouter route action. */
interface WekanRouteContext {
  path: string;
  params: Record<string, string>;
  render(template: string, data?: WekanRouteRenderData): void;
}

/** A FlowRouter enter/exit trigger. */
type WekanRouteTrigger = (
  context: WekanRouteContext,
  redirect: (path: string) => void,
) => void;

// ---------------------------------------------------------------------------
// Meteor core augmentations for gaps in @types/meteor used by models/lib.
// ---------------------------------------------------------------------------

/** Signature of the (non-standard) Meteor.connect hook patched by models/lib. */
type MeteorConnectFn = (url: string, options?: object) => any;

declare module 'meteor/meteor' {
  namespace Meteor {
    let connect: MeteorConnectFn;
    // Absolute filesystem path of the running bundle. Exposed by the Meteor
    // server runtime but not modelled by @types/meteor; the custom head-assets
    // route reads default public files relative to it.
    const absolutePath: string;
    // The user's `profile` subdocument holds a large, evolving set of wekan
    // preferences (per-board list widths, collapse state, sort modes, dialog
    // options, …) that @types/meteor leaves intentionally empty, so they are
    // exposed through this documented open shape.
    interface UserProfile {
      [field: string]: WekanDocumentField;
    }
    // The running DDP server instance (stream_server, method tables, …). Not
    // modelled by @types/meteor; the /metrics route reads open socket sessions
    // through this documented interop handle.
    const server: WekanDocumentField;
    // Wekan flags site administrators directly on the user document. The user
    // document also carries many wekan-specific fields (profile settings, org
    // and team memberships, per-board preferences, import bookkeeping, …) that
    // @types/meteor does not model, so they are exposed through this documented
    // open shape.
    interface User {
      isAdmin?: boolean;
      [field: string]: WekanDocumentField;
    }
    // @types/meteor leaves UserServices intentionally empty. The wekan
    // brute-force lockout package (wekan-accounts-lockout) records its state
    // under `services.accounts-lockout`, which the lockedUsers admin methods
    // read back.
    interface UserServices {
      'accounts-lockout'?: AccountsLockoutUserService;
      // The TOTP secret the login REST route validates when a user has 2FA
      // enabled. Its concrete shape is 2FA-package-internal, so it comes in
      // through the documented interop alias.
      twoFactorAuthentication?: WekanDocumentField;
    }
    // @types/meteor models Meteor.Error but not the ad-hoc `statusCode` the
    // Wekan Authentication helpers stamp on the error before throwing so REST
    // handlers can map it to an HTTP status.
    interface Error {
      statusCode?: number;
    }
  }
}

// State the wekan-accounts-lockout package stores on a locked-out user under
// `services.accounts-lockout`.
interface AccountsLockoutUserService {
  unlockTime: number;
  failedAttempts: number;
}

// Wekan flags site administrators directly on the user document. @types/meteor
// exposes the `Meteor` namespace both as the `meteor/meteor` module (augmented
// above) AND as an ambient global; the server/permissions rules read
// `Meteor.users.findOneAsync(...)` through the global, so mirror the admin flag
// onto the global User shape as well.
declare namespace Meteor {
  interface User {
    isAdmin?: boolean;
  }
  // The Authentication helpers stamp an HTTP `statusCode` on the error they
  // throw; the global Meteor.Error (used without importing) needs it too.
  interface Error {
    statusCode?: number;
  }
}

declare module 'meteor/accounts-base' {
  namespace Accounts {
    // Server-only low-level user provisioning helper used by the header-login
    // flow to create a brand-new account. Not modelled by @types/meteor; it
    // returns the new user's `_id`.
    function insertUserDoc(
      options: WekanDocumentField,
      user: WekanDocumentField,
    ): string;

    // Internal Accounts helpers used by the login/register REST routes and the
    // token-parsing middleware (server/apiMiddleware, server/apiAuthRoutes,
    // server/header-login). @types/meteor models the sync `_checkPassword` but
    // not these async / 2FA / token internals, so they are declared here.
    function _checkPasswordAsync(
      user: Meteor.User,
      password: WekanDocumentField,
    ): Promise<{ userId: string; error?: WekanDocumentField }>;
    function _insertLoginToken(
      userId: string,
      stampedLoginToken: StampedLoginToken,
    ): Promise<void>;
    function _tokenExpiration(when: Date): Date;
    const _options: {
      forbidClientAccountCreation?: boolean;
      [option: string]: WekanDocumentField;
    };
    // Optional at runtime: only present in builds with the 2FA feature.
    const _check2faEnabled: ((user: Meteor.User) => boolean) | undefined;
    function _isTokenValid(
      secret: WekanDocumentField,
      code: WekanDocumentField,
    ): boolean;
    function _handleError(
      message: string,
      throwError?: boolean,
      errorCode?: string,
    ): void;
  }
}

// @types/meteor's ReactiveVar omits the underlying Tracker dependency that
// Meteor exposes at runtime as `.dep`; the i18n layer depends on it directly to
// re-run reactive translation lookups.
declare module 'meteor/reactive-var' {
  interface ReactiveVar<T> {
    dep: Tracker.Dependency;
  }
}

// @types/meteor bundles its own (older) `mongodb`, so the Db type behind
// `defaultRemoteCollectionDriver().mongo.db` differs from the app's root
// `mongodb`. Source the Db type from Meteor's own accessor so every GridFS call
// site stays consistent with the value Meteor actually hands back.
type MeteorMongoDb = ReturnType<
  typeof MongoInternals.defaultRemoteCollectionDriver
>['mongo']['db'];

// Shape of the singular `MongoInternals.NpmModule` accessor. Meteor exposes it
// at runtime as the whole `mongodb` npm module, but @types/meteor only models
// the plural `NpmModules`, so consumers reach it via a cast to this interface.
// GridFSBucket returns the hand-rolled WekanGridFsBucket so the Db type from
// @types/meteor's bundled mongodb doesn't clash with the app's root mongodb.
interface WekanMongoNpmModule {
  GridFSBucket: new (
    db: MeteorMongoDb,
    options?: { bucketName?: string },
  ) => WekanGridFsBucket;
  ObjectId: typeof import('mongodb').ObjectId;
}

// The `MongoInternals` value narrowed to include the singular NpmModule accessor.
type WekanMongoInternals = typeof import('meteor/mongo').MongoInternals & {
  NpmModule: WekanMongoNpmModule;
};

// The raw Mongo connection object behind `defaultRemoteCollectionDriver().mongo`.
// @types/meteor models `.db` but not the oplog handle / raw driver client that
// the admin statistics method reads for oplog and active-session diagnostics.
interface WekanMongoConnection {
  db: MeteorMongoDb;
  _oplogHandle?: { onOplogEntry?: WekanDocumentField } | null;
  client?: { s?: { activeSessions?: { size?: number } } };
}

// ---------------------------------------------------------------------------
// Wekan attachment/file-storage shapes and globals used by models/lib.
// ---------------------------------------------------------------------------

interface WekanFileVersion {
  path?: string;
  storage?: string;
  size?: number;
  meta: Record<string, any>;
}

interface WekanFileObj {
  _id: string;
  name: string;
  type?: string;
  size?: number;
  isImage?: boolean;
  uploadedAt?: Date;
  userId?: string;
  fileSize?: number;
  collectionName?: string;
  meta: Record<string, any>;
  versions: Record<string, WekanFileVersion>;
}

// The Meteor-Files collection surface (Attachments / Avatars) touched by the
// storage strategies.
interface WekanFilesCollection {
  updateAsync(selector: object, modifier: object): Promise<number>;
  addFile(
    path: string,
    config: object,
    callback?: (error: Error | null, fileRef: WekanFileObj) => void,
    proceedAfterUpload?: boolean,
  ): void;
}

interface WekanGridFsUploadStream extends NodeJS.WritableStream {
  id: import('mongodb').ObjectId;
  gridFSFile?: { _id?: import('mongodb').ObjectId } | null;
}

interface WekanGridFsBucket {
  openDownloadStream(id: import('mongodb').ObjectId): import('stream').Readable;
  openUploadStream(
    filename: string,
    options?: { contentType?: string; metadata?: Record<string, any> },
  ): WekanGridFsUploadStream;
  delete(id: import('mongodb').ObjectId, callback?: (error?: Error | null) => void): void;
}

interface WekanCardDoc {
  _id?: string;
  boardId?: string;
  listId?: string;
  swimlaneId?: string;
}

interface WekanReactiveCache {
  getCard(id: string): WekanCardDoc;
  // The runtime ReactiveCache exposes a getX/getXs accessor per collection; the
  // metrics route reaches them through the global handle, so the remaining
  // accessors come in through this documented interop signature.
  [accessor: string]: (...args: WekanDocumentField[]) => WekanDocumentField;
}

declare const Attachments: WekanFilesCollection;
declare const ReactiveCache: WekanReactiveCache;
declare const Random: { id(n?: number): string };

// Client localStorage validation helpers (client/lib/localStorageValidator) are
// referenced from models/users' anonymous-user fallbacks as optional globals,
// always behind a `typeof … === 'function'` guard.
declare const getValidatedLocalStorageData: (
  key: string,
  validator?: WekanDocumentField,
) => WekanDocumentField;
declare const setValidatedLocalStorageData: (
  key: string,
  data: WekanDocumentField,
  validator?: WekanDocumentField,
) => WekanDocumentField;
declare const validators: Record<string, WekanDocumentField>;

// Legacy global referenced only by the (effectively dead) Users `remove` helper
// in models/users; modelled as the users collection it is meant to be so the
// migration adds no runtime behavior.
declare const User: import('meteor/mongo').Mongo.Collection<
  import('meteor/meteor').Meteor.User
>;

// Meteor exposes Node's require through the server-only `Npm.require` global for
// packages that ship without ES module wrappers.
declare const Npm: { require(id: string): WekanDocumentField };

// Meteor's webapp package. Wekan reaches it via `require('meteor/webapp')` in
// most routes, but the /metrics route uses it as a bare global; expose the
// small `handlers` surface it touches. The CORS/permissions-policy startup hook
// registers connect-style middleware on the lower-level `rawHandlers` router.
declare const WebApp: {
  handlers: WekanDocumentField;
  rawHandlers: {
    use(
      handler: (
        req: WekanWebAppRequest,
        res: WekanWebAppResponse,
        next: (error?: WekanDocumentField) => void,
      ) => void,
    ): void;
  };
};

// Meteor's `check` package registers `check` and `Match` as globals when loaded.
// @types/meteor only models them as exports of the 'meteor/check' module, so
// re-expose them globally with those same types.
declare const check: typeof import('meteor/check').check;
declare const Match: typeof import('meteor/check').Match;

// Some Wekan board-permission helpers are referenced in server model code as
// ambient globals guarded by `typeof helper === 'function'` (they are not
// imported there, so at runtime the guard is what decides whether they run).
// Declaring them keeps those guarded references type-checkable.
declare const allowIsBoardMemberWithWriteAccess: (
  userId: string,
  board: WekanDocumentField,
) => boolean;

// Meteor exposes every loaded package at runtime on the global `Package` object
// (e.g. `Package.meteor.Meteor`, `Package.mongo.Mongo`). @types/meteor already
// declares a global `namespace Package` for the build-time package API, so the
// runtime registry shape (keyed by the dynamic package name) is exposed through
// this documented interop alias, which call sites cast `Package` to.
type WekanRuntimePackageRegistry = Record<string, WekanDocumentField>;

// Activities are intentionally schema-less: different activity types carry
// different fields, so the document is modelled as an open shape.
interface WekanActivityDocument {
  _id?: string;
  createdAt?: Date;
  modifiedAt?: Date;
  [field: string]: WekanDocumentField;
}

// Wekan exposes some Mongo collections as ambient globals (legacy pattern);
// a few modules reference them without importing.
declare const Activities: import('meteor/mongo').Mongo.Collection<WekanActivityDocument>;

// Meteor injects its runtime config onto the browser window; only the ROOT_URL
// prefix is read by the client-side URL helpers.
interface Window {
  __meteor_runtime_config__?: { ROOT_URL?: string };
}

// ---------------------------------------------------------------------------
// Community Meteor packages not covered by @types/meteor.
// ---------------------------------------------------------------------------

// ostrio:flow-router-extra — the router used throughout the Wekan client.
declare module 'meteor/ostrio:flow-router-extra' {
  interface FlowRouteDefinition {
    name?: string;
    triggersEnter?: WekanRouteTrigger[];
    triggersExit?: WekanRouteTrigger[];
    action?: (this: WekanRouteContext, params: Record<string, string>) => void;
  }

  interface FlowRouterTriggers {
    enter(triggers: WekanRouteTrigger[]): void;
    exit(triggers: WekanRouteTrigger[]): void;
  }

  interface FlowRouterStatic {
    triggers: FlowRouterTriggers;
    route(path: string, definition: FlowRouteDefinition): void;
    go(pathName: string, params?: Record<string, string>): void;
    path(pathName: string, params?: Record<string, string>): string;
    url(pathDef: string, params?: Record<string, string>, queryParams?: Record<string, string>): string;
    reload(): void;
    getRouteName(): string;
    getQueryParam(key: string): string;
  }

  const FlowRouter: FlowRouterStatic;
  export { FlowRouter };
}

// reywood:publish-composite — publishes a tree of related cursors (a parent
// cursor plus per-document child cursors). Not covered by @types/meteor. The
// publication config's find() callbacks return Meteor cursors (or arrays of
// them, or null), optionally as promises; child find()s receive the parent
// document. Parent-doc and cursor element shapes vary per publication, so they
// come through the documented interop alias.
declare module 'meteor/reywood:publish-composite' {
  import { Meteor } from 'meteor/meteor';
  import { Mongo } from 'meteor/mongo';

  type PublishCompositeCursorResult =
    | Mongo.Cursor<WekanDocumentField>
    | Array<Mongo.Cursor<WekanDocumentField>>
    | WekanDocumentField[]
    | null;

  interface PublishCompositeNode {
    find(
      this: Meteor.Subscription,
      ...parents: WekanDocumentField[]
    ): PublishCompositeCursorResult | Promise<PublishCompositeCursorResult>;
    children?: PublishCompositeNode[];
  }

  type PublishCompositeConfig =
    | PublishCompositeNode
    | ((
        this: Meteor.Subscription,
        ...args: WekanDocumentField[]
      ) =>
        | PublishCompositeNode
        | WekanDocumentField[]
        | Promise<PublishCompositeNode | WekanDocumentField[]>);

  function publishComposite(name: string, config: PublishCompositeConfig): void;
  export { publishComposite };
}

// communitypackages:core (useraccounts) — the T9n translation registry used by
// the i18n/accounts layer to localise the login/account templates.
declare module 'meteor/communitypackages:core' {
  interface T9nStatic {
    setTracker(options: { Tracker: object }): void;
    map(language: string, translations: Record<string, string>): void;
    setLanguage(language: string): void;
  }

  const T9n: T9nStatic;
  export { T9n };
}

// ostrio:files (Meteor-Files) — the FilesCollection used for card Attachments
// and user Avatars. Only the surface Wekan touches is modelled here.
declare module 'meteor/ostrio:files' {
  // Bound `this` inside FilesCollection lifecycle callbacks (ostrio internals).
  interface WekanFilesCallbackContext {
    userId?: string | null;
    cacheControl?: string;
    _now?: Date;
    // Other ostrio-internal callback context members are accessed dynamically.
    [member: string]: WekanDocumentField;
  }

  // The `opts` object passed to `namingFunction`. Carries either client-side
  // (`name`/`meta`) or server-side (`file`/`fileId`) shapes.
  interface WekanFilesNamingOpts {
    name?: string;
    fileId?: string;
    meta: { fileId?: string; [key: string]: WekanDocumentField };
    file?: {
      name: string;
      extension?: string;
      extensionWithDot: string;
      [key: string]: WekanDocumentField;
    };
    [key: string]: WekanDocumentField;
  }

  // The candidate file passed to `onBeforeUpload` before it becomes a stored
  // WekanFileObj; `name` is mutated in place to sanitise it.
  interface WekanFileUploadCandidate {
    name: string;
    type: string;
    size: number;
    [prop: string]: WekanDocumentField;
  }

  interface FilesCollectionConfig {
    debug?: boolean;
    collectionName?: string;
    allowClientCode?: boolean;
    storagePath?: string | (() => string);
    namingFunction?: (opts: WekanFilesNamingOpts) => string;
    sanitize?: (str: string, max: number, replacement: string) => string;
    onBeforeUpload?: (
      this: WekanFilesCallbackContext,
      file: WekanFileUploadCandidate,
    ) => boolean | string;
    // Additional ostrio config options are passed through untouched.
    [option: string]: WekanDocumentField;
  }

  class FilesCollection {
    constructor(config?: FilesCollectionConfig);
    collection: import('meteor/mongo').Mongo.Collection<WekanFileObj>;
    find(selector?: WekanDocumentField): {
      fetch(): WekanFileObj[];
      fetchAsync(): Promise<WekanFileObj[]>;
      countAsync(): Promise<number>;
    };
    link(fileRef?: WekanFileObj, version?: string): string;
    addFile(
      path: string,
      config: object,
      callback?: (error: Error | null, fileRef: WekanFileObj) => void,
      proceedAfterUpload?: boolean,
    ): void;
    updateAsync(selector: WekanDocumentField, modifier: object): Promise<number>;
    removeAsync(selector: WekanDocumentField): Promise<number>;
    storagePath?: string | (() => string);
    onAfterUpload?: (
      this: WekanFilesCallbackContext,
      fileObj: WekanFileObj,
    ) => void | Promise<void>;
    onBeforeRemove?: (
      this: WekanFilesCallbackContext,
      filesInput: WekanDocumentField,
    ) => boolean | Promise<boolean>;
    onAfterRemove?: (
      this: WekanFilesCallbackContext,
      filesInput: WekanDocumentField,
    ) => void | Promise<void>;
    interceptDownload?: (
      this: WekanFilesCallbackContext,
      http: WekanDocumentField,
      fileObj: WekanFileObj,
      versionName: string,
    ) => boolean | void;
    protected?: (
      this: WekanFilesCallbackContext,
      fileObj: WekanFileObj,
    ) => boolean | Promise<boolean>;
    // Wekan attaches extra model helpers (e.g. backward-compatibility lookups)
    // directly onto the collection instance.
    [member: string]: WekanDocumentField;
  }

  export { FilesCollection };
}

// i18next post-processor plugin shipped without type definitions; the i18n layer
// only ever passes it straight to `i18next.use()`.
declare module 'i18next-sprintf-postprocessor';

// wekan-accounts-lockout — the community brute-force-lockout package. Not
// covered by @types/meteor; only the constructor + startup surface the
// lockoutSettings method drives is modelled here.
declare module 'meteor/wekan-accounts-lockout' {
  interface AccountsLockoutUserRules {
    failuresBeforeLockout: number;
    lockoutPeriod: number;
    failureWindow: number;
  }

  interface AccountsLockoutOptions {
    knownUsers: AccountsLockoutUserRules;
    unknownUsers: AccountsLockoutUserRules;
  }

  class AccountsLockout {
    constructor(options: AccountsLockoutOptions);
    startup(): void;
  }

  export { AccountsLockout };
}

// Spacebars appends a trailing keyword-arguments object (carrying `.hash`) to
// every Blaze helper call; the leading positional arguments are the translation
// key and its interpolation values.
interface BlazeSpacebarsKeywords {
  hash?: Record<string, string>;
}

type BlazeHelperArg =
  | string
  | number
  | boolean
  | null
  | undefined
  | BlazeSpacebarsKeywords;

// meteor/blaze exposes global template helpers via Blaze.registerHelper at
// runtime, but @types/meteor only declares registerHelper on Template.
declare module 'meteor/blaze' {
  namespace Blaze {
    function registerHelper(
      name: string,
      helper: (...args: BlazeHelperArg[]) => string,
    ): void;
  }
}

// ---------------------------------------------------------------------------
// Wekan app-level globals referenced by config/ files.
// ---------------------------------------------------------------------------

/** A single field descriptor managed by useraccounts / AccountsTemplates. */
interface AccountsTemplatesField {
  _id?: string;
  type?: string;
  displayName?: string;
  required?: boolean;
  minLength?: number;
  autocomplete?: string;
  template?: string;
}

/** Error object surfaced to the AccountsTemplates `onSubmitHook`. */
interface AccountsTemplatesError {
  reason?: string;
  message?: string;
  details?: Record<string, string | string[]>;
}

interface AccountsTemplatesTexts {
  title?: Record<string, string>;
}

interface AccountsTemplatesConfigureOptions {
  defaultLayout?: string;
  defaultContentRegion?: string;
  confirmPassword?: boolean;
  enablePasswordChange?: boolean;
  sendVerificationEmail?: boolean;
  showForgotPasswordLink?: boolean;
  forbidClientAccountCreation?: boolean;
  homeRoutePath?: string;
  texts?: AccountsTemplatesTexts;
  onSubmitHook?: (error: AccountsTemplatesError | null, state: string) => void;
  onLogoutHook?: () => void;
}

interface AccountsTemplatesRouteOptions {
  redirect?: () => void;
}

interface AccountsTemplatesStatic {
  removeField(fieldId: string): AccountsTemplatesField;
  addFields(fields: AccountsTemplatesField[]): void;
  configure(options: AccountsTemplatesConfigureOptions): void;
  configureRoute(route: string, options?: AccountsTemplatesRouteOptions): void;
  ensureSignedIn: WekanRouteTrigger;
}

declare const AccountsTemplates: AccountsTemplatesStatic;

// ---------------------------------------------------------------------------
// Community Meteor collection extensions used across the models/ layer.
// @types/meteor models none of these, so `Mongo.Collection` is augmented below:
//   - aldeed:simple-schema / collection2 -> attachSchema / simpleSchema
//   - dburles:collection-helpers          -> helpers
//   - matb33:collection-hooks             -> before / after / hookOptions
// ---------------------------------------------------------------------------

// A value crossing the untyped SimpleSchema boundary (a field's value under
// validation, a compiled schema, etc.). Modelled as a documented interop alias
// because SimpleSchema (aldeed:simple-schema) ships no usable public types.
type WekanSchemaValue = any;

// A single field of a Mongo document whose concrete type is runtime-dynamic.
// Used as the value of the documented index signature on model document
// interfaces for collections that are intentionally schema-less or hold
// heterogeneous, per-record fields (mirrors the WekanQueryResult interop alias
// in /imports/reactiveCache). Aliased so document interfaces avoid a bare `any`.
type WekanDocumentField = any;

// A loosely-typed document as returned by the untyped ReactiveCache interop
// layer (its getters resolve to WekanQueryResult = any). Server migrations and
// routes iterate these results with array helpers (filter/map/forEach/...);
// typing the callback element as this shape gives those callbacks a concrete
// parameter type instead of an implicit `any`, while its index signature keeps
// dynamic per-record field access available.
interface WekanReactiveDocument {
  _id?: string;
  [field: string]: WekanDocumentField;
}

// The SimpleSchema validation context bound to `this` inside a field's
// autoValue()/custom() callbacks.
interface WekanSchemaValidationContext {
  isInsert: boolean;
  isUpsert: boolean;
  isUpdate: boolean;
  isSet: boolean;
  // Present during insert validation so autoValue()s can default owner fields.
  userId?: string;
  operator: string | null;
  value: WekanSchemaValue;
  unset(): void;
  field(name: string): { isSet: boolean; value: WekanSchemaValue };
  siblingField(name: string): { isSet: boolean; value: WekanSchemaValue };
}

type WekanSchemaAutoValue = (this: WekanSchemaValidationContext) => WekanSchemaValue;
type WekanSchemaCustom = (this: WekanSchemaValidationContext) => string | undefined;

// A single field descriptor in a SimpleSchema definition. Only the callback
// members needing a bound `this` are modelled precisely; the remaining per-field
// options (type, optional, min/max, defaultValue, ...) vary widely and are
// accepted through the documented index signature.
interface WekanSchemaFieldDefinition {
  autoValue?: WekanSchemaAutoValue;
  custom?: WekanSchemaCustom;
  [option: string]: WekanSchemaValue;
}

type WekanSchemaDefinition = Record<string, WekanSchemaFieldDefinition>;

// A compiled SimpleSchema instance. The model layer only ever forwards the
// instance to attachSchema, so its surface is a documented interop shape.
interface WekanSimpleSchemaInstance {
  _schema?: WekanSchemaValue;
  _schemaDefinition?: WekanSchemaValue;
}

interface WekanSimpleSchemaConstructor {
  new (
    definition: WekanSchemaDefinition,
    options?: object,
  ): WekanSimpleSchemaInstance;
  // aldeed:simple-schema exposes a set of stock validation regexes (Email, Url,
  // ...) as statics; the model schemas reference them by name.
  RegEx: {
    Email: WekanSchemaValue;
    [pattern: string]: WekanSchemaValue;
  };
}

// A Mongo update modifier ($set/$unset/$inc/...); its operator keys and values
// are runtime-dynamic, hence the documented interop alias.
type WekanMongoModifier = any;

// A dburles:collection-helpers map: each helper runs with `this` bound to the
// transformed document. Helper argument and return types vary per helper.
type WekanCollectionHelperArg = any;
type WekanCollectionHelperReturn = any;
interface WekanCollectionHelpersMap<T> {
  [helperName: string]: (
    this: T,
    ...args: WekanCollectionHelperArg[]
  ) => WekanCollectionHelperReturn;
}

// A matb33:collection-hooks lifecycle callback set. The document argument is the
// collection's document type; hooks may run synchronously or return a promise.
interface WekanCollectionMutationHooks<T> {
  insert(hook: (userId: string, doc: T) => void | Promise<void>): void;
  update(
    hook: (
      userId: string,
      doc: T,
      fieldNames: string[],
      modifier: WekanMongoModifier,
    ) => void | Promise<void>,
  ): void;
  remove(hook: (userId: string, doc: T) => void | Promise<void>): void;
}

interface WekanCollectionHookOptions {
  after: {
    update: { fetchPrevious?: boolean };
  };
}

// The `meteor/mongo` module augmentation that adds these community-package
// methods to `Mongo.Collection` lives in `collectionExtensions.d.ts` (a
// module-scoped file, so it merges with @types/meteor instead of shadowing the
// rest of the 'meteor/mongo' surface such as MongoInternals). That file also
// adds the async/truthiness-friendly allow/deny overloads modelled below.

// ---------------------------------------------------------------------------
// allow/deny (server/permissions) policy shapes.
//
// @types/meteor only models synchronous, strictly-boolean allow/deny rules,
// whereas Wekan's server/permissions rules are async (they await the owning
// board/card before deciding) and rely on Meteor coercing the returned value to
// a boolean via truthiness (so a rule may return e.g. `board && board.hasAdmin(…)`
// which is `boolean | null | undefined`, or `userId && …` which is
// `string | boolean`). These types back the extra Mongo.Collection allow/deny
// overloads declared in collectionExtensions.d.ts.
// ---------------------------------------------------------------------------
type WekanAllowDenyResult =
  | boolean
  | string
  | null
  | undefined
  | Promise<boolean | string | null | undefined>;

interface WekanAllowDenyOptions<T> {
  insert?: (userId: string, doc: T) => WekanAllowDenyResult;
  update?: (
    userId: string,
    doc: T,
    fieldNames: string[],
    modifier: WekanMongoModifier,
  ) => WekanAllowDenyResult;
  remove?: (userId: string, doc: T) => WekanAllowDenyResult;
  fetch?: string[];
  transform?: (doc: T) => T;
}

// A board fetched inside an allow/deny rule exposes the dburles:collection-helpers
// membership predicates at runtime, but the model `BoardDocument` surfaces them
// only through its index signature (so it is not assignable to the narrow
// BoardAdminAccess / BoardMemberAccess / BoardCommentAccess parameter shapes the
// server/lib/utils helpers declare). Policy call sites view the fetched board
// through this documented interop shape, which carries the helper predicates as
// named members.
interface WekanPolicyBoard {
  // Shared named member with the model BoardDocument so a non-nullable board
  // value (e.g. an allow/deny `doc`) can be viewed through this shape.
  _id?: string;
  hasAdmin(userId: string): boolean;
  hasMember(userId: string): boolean;
  hasReadOnly(userId: string): boolean;
  hasReadAssignedOnly(userId: string): boolean;
  hasNoComments(userId: string): boolean;
  members?: WekanDocumentField;
  [field: string]: WekanDocumentField;
}

// A card fetched inside an allow/deny rule, viewed only for the board it belongs
// to (the write-access-by-card helpers need `boardId`). The model `CardDocument`
// exposes `boardId` through its index signature, which does not satisfy the weak
// `CardBoardRef` parameter shape, so call sites view it through this shape.
interface WekanPolicyCard {
  boardId?: string;
  [field: string]: WekanDocumentField;
}

// A board-scoped document handled by an allow/deny rule that reads `doc.boardId`.
// A few model document types (e.g. ActionDocument) do not declare `boardId` or an
// index signature, so those rules annotate their `doc` parameter with this shape.
interface WekanBoardScopedDoc {
  boardId?: string;
  [field: string]: WekanDocumentField;
}

/** Wekan's global modal helper. */
interface WekanModalStatic {
  open(
    template: string,
    options?: { header?: string; onCloseGoTo?: string },
  ): void;
  back(): void;
}

declare const Modal: WekanModalStatic;

// Wekan client-side helper bag (imports/utils). Its surface is large and
// client-only, so it is exposed through the documented interop alias.
declare const Utils: WekanDocumentField;

// Server-side per-user position-history collection (server/models). It is not
// present in the client bundle, so call sites guard access with
// `typeof UserPositionHistory !== 'undefined'`; modelled as a documented
// interop global.
declare const UserPositionHistory: WekanDocumentField;

// Wekan exposes the users collection (models/users) and the client-side board
// Filter helper (client/lib/filter) as ambient globals referenced without an
// import. Both surfaces are large and mostly client-only, so they are exposed
// through the documented interop alias.
declare const Users: WekanDocumentField;
declare const Filter: WekanDocumentField;

// ---------------------------------------------------------------------------
// Shape of the connect/WebApp request & response objects handled by the board
// export routes (models/export, models/exportExcel(Card), models/exportPDF).
// `WebApp` is reached through `require('meteor/webapp')` (untyped), so the
// handler callbacks annotate their params with these interfaces directly.
// ---------------------------------------------------------------------------
interface WekanWebAppRequest {
  params: Record<string, string>;
  query: Record<string, string>;
  // The incoming HTTP headers; a genuinely dynamic dictionary of header names.
  headers: Record<string, any>;
  userId?: string;
  // connect middleware augments the request with additional runtime members.
  [prop: string]: WekanDocumentField;
}

interface WekanWebAppResponse {
  writeHead(statusCode: number, headers?: Record<string, string | number>): WekanWebAppResponse;
  write(chunk: string | Uint8Array): boolean;
  end(chunk?: string | Uint8Array): void;
  // The node ServerResponse surface is large; the export routes only touch the
  // members above, the rest come through this documented index signature.
  [prop: string]: WekanDocumentField;
}

// Meteor 3 exposes a connect-style router at `WebApp.handlers` with per-verb
// registration methods (get/post/put/delete/use). @types/meteor only models the
// legacy `connectHandlers`, so the router that the server/models REST routes
// register on is added here. Handler callbacks are contextually typed with the
// shared Wekan request/response shapes above.
declare module 'meteor/webapp' {
  type WekanWebAppRouteHandler = (
    req: WekanWebAppRequest,
    res: WekanWebAppResponse,
    next: (error?: WekanDocumentField) => void,
  ) => void | Promise<void>;

  interface WekanWebAppHandlers {
    use(handler: WekanWebAppRouteHandler): void;
    use(path: string, handler: WekanWebAppRouteHandler): void;
    get(path: string, handler: WekanWebAppRouteHandler): void;
    post(path: string, handler: WekanWebAppRouteHandler): void;
    put(path: string, handler: WekanWebAppRouteHandler): void;
    delete(path: string, handler: WekanWebAppRouteHandler): void;
    options(path: string, handler: WekanWebAppRouteHandler): void;
  }

  namespace WebApp {
    const handlers: WekanWebAppHandlers;
  }
}

// The community `accounts-express` package exposes connect-style middleware
// that authenticates REST requests (populating `req.userId`). It ships no types,
// so the single factory the attachment API mounts is declared here, returning a
// handler compatible with the WebApp.handlers router.
declare module 'meteor/accounts-express' {
  function createAuthMiddleware(
    options?: WekanDocumentField,
  ): (
    req: WekanWebAppRequest,
    res: WekanWebAppResponse,
    next: (error?: WekanDocumentField) => void,
  ) => void;
  export { createAuthMiddleware };
}

// @types/meteor's `meteor/ddp` models the public DDP surface but not the
// internal `_CurrentMethodInvocation` environment variable. The Trello zip HTTP
// route (which has no method invocation context) uses it to run the importer as
// the uploading user, so the small surface it touches is declared here.
declare module 'meteor/ddp' {
  namespace DDP {
    const _CurrentMethodInvocation: {
      withValue<T>(
        value: { userId: string; isSimulation: boolean },
        fn: () => T,
      ): T;
    };
  }
}

// The matb33:collection-hooks package exposes a `CollectionHooks` object whose
// `getUserId` resolver server code reads and overrides (to inject a fake user id
// during system-initiated writes). @types/meteor doesn't model this package, so
// declare the small surface used by server/models.
declare module 'meteor/matb33:collection-hooks' {
  interface WekanCollectionHooksStatic {
    getUserId: () => string | null | undefined;
  }
  const CollectionHooks: WekanCollectionHooksStatic;
  export { CollectionHooks };
}
