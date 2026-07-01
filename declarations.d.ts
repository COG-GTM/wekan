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
    }
  }
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
}

declare const Accounts: AccountsStatic;

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
