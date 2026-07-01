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

/** Wekan's global modal helper. */
interface WekanModalStatic {
  open(
    template: string,
    options?: { header?: string; onCloseGoTo?: string },
  ): void;
  back(): void;
}

declare const Modal: WekanModalStatic;
