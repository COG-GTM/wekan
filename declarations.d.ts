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
    // Wekan flags site administrators directly on the user document.
    interface User {
      isAdmin?: boolean;
    }
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
}

declare const Attachments: WekanFilesCollection;
declare const ReactiveCache: WekanReactiveCache;
declare const Random: { id(n?: number): string };

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
    find(selector?: WekanDocumentField): { fetch(): WekanFileObj[] };
    link(fileRef?: WekanFileObj, version?: string): string;
    addFile(
      path: string,
      config: object,
      callback?: (error: Error | null, fileRef: WekanFileObj) => void,
      proceedAfterUpload?: boolean,
    ): void;
    updateAsync(selector: object, modifier: object): Promise<number>;
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
// rest of the 'meteor/mongo' surface such as MongoInternals).

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
  userId?: string;
  // connect middleware augments the request with additional runtime members.
  [prop: string]: WekanDocumentField;
}

interface WekanWebAppResponse {
  writeHead(statusCode: number, headers?: Record<string, string>): WekanWebAppResponse;
  write(chunk: string | Uint8Array): boolean;
  end(chunk?: string | Uint8Array): void;
  // The node ServerResponse surface is large; the export routes only touch the
  // members above, the rest come through this documented index signature.
  [prop: string]: WekanDocumentField;
}
