/**
 * Collection extensions shim (Meteor 3.4 migration).
 *
 * This module only patches collection prototype helpers that older app code
 * still relies on. SimpleSchema now lives in `/imports/simpleSchema`.
 */
const MeteorPackage = typeof Package !== 'undefined' ? (Package as WekanPackageRegistry).meteor : undefined;
const MongoPackage = typeof Package !== 'undefined' ? (Package as WekanPackageRegistry).mongo : undefined;
const CollectionHooksPackage =
  typeof Package !== 'undefined' ? (Package as WekanPackageRegistry)['matb33:collection-hooks'] : undefined;
const Meteor = MeteorPackage && MeteorPackage.Meteor;
const Mongo = MongoPackage && MongoPackage.Mongo;
const CollectionHooks = CollectionHooksPackage && CollectionHooksPackage.CollectionHooks;

if (Mongo && Mongo.Collection && Mongo.Collection.prototype && !Mongo.Collection.prototype.helpers) {
  Mongo.Collection.prototype.helpers = function helpers(helpersMap: Record<string, CollectionHelperFn>) {
    if (this._transform && !this._helpersConstructor) {
      throw new Error(
        `Can't apply helpers to '${this._name}': a transform function already exists.`,
      );
    }

    if (!this._helpersConstructor) {
      this._helpersConstructor = function CollectionDocument(doc: object) {
        Object.assign(this, doc);
      };
      this._transform = (doc: object) => new this._helpersConstructor(doc);
    }

    Object.keys(helpersMap).forEach(key => {
      this._helpersConstructor.prototype[key] = helpersMap[key];
    });
  };
}

if (Mongo && Mongo.Collection && Mongo.Collection.prototype && !Mongo.Collection.prototype.attachSchema) {
  Mongo.Collection.prototype.attachSchema = function attachSchema(schema: CollectionSchema) {
    if (schema && schema._schemaDefinition) {
      schema._schema = schema._schemaDefinition;
    }
    this._simpleSchema = schema;
    return this;
  };
}

if (Mongo && Mongo.Collection && Mongo.Collection.prototype && !Mongo.Collection.prototype.simpleSchema) {
  Mongo.Collection.prototype.simpleSchema = function simpleSchema() {
    return this._simpleSchema;
  };
}

if (Mongo && Mongo.Collection && CollectionHooks && !Mongo.Collection._wekanHookBootstrapPatched) {
  const OriginalCollection = Mongo.Collection;
  const originalExtendCollectionInstance = CollectionHooks.extendCollectionInstance;

  function ensureHookSurface(collection: CollectionInstance, constructor: CollectionConstructor) {
    if (!collection || collection._wekanHookSurfaceReady) {
      return collection;
    }

    const safeConstructor =
      constructor && constructor.prototype ? constructor : OriginalCollection;

    if (
      Meteor &&
      Meteor.isServer &&
      (!collection._collection ||
        typeof collection._collection.insertAsync !== 'function' ||
        typeof collection._collection.updateAsync !== 'function' ||
        typeof collection._collection.removeAsync !== 'function')
    ) {
      Object.defineProperty(collection, '_collection', {
        value: collection,
        configurable: true,
        enumerable: false,
        writable: true,
      });
    }

    originalExtendCollectionInstance.call(CollectionHooks, collection, safeConstructor);
    Object.defineProperty(collection, '_wekanHookSurfaceReady', {
      value: true,
      configurable: true,
      enumerable: false,
      writable: true,
    });
    return collection;
  }

  CollectionHooks.extendCollectionInstance = function extendCollectionInstance(collection: CollectionInstance, constructor: CollectionConstructor) {
    return ensureHookSurface(collection, constructor);
  };

  function PatchedCollection(this: CollectionArg, ...args: CollectionArg[]) {
    const ret = OriginalCollection.apply(this, args);
    const collection =
      ret && typeof ret === 'object' ? ret : this;

    ensureHookSurface(collection, OriginalCollection);
    return ret;
  }

  PatchedCollection.prototype = OriginalCollection.prototype;
  PatchedCollection.prototype.constructor = PatchedCollection;

  Object.keys(OriginalCollection).forEach(key => {
    (PatchedCollection as CollectionArg)[key] = OriginalCollection[key];
  });

  Object.defineProperty(PatchedCollection, '_wekanHookBootstrapPatched', {
    value: true,
    configurable: true,
    enumerable: false,
    writable: true,
  });

  Mongo.Collection = PatchedCollection as CollectionArg;
  if (Meteor) {
    Meteor.Collection = PatchedCollection as CollectionArg;
  }
}

// Values crossing the untyped Meteor collection boundary: the collection
// internals this shim rewrites (prototype methods, statics, transform results)
// have no public type surface, so they are modelled as this documented alias
// rather than annotated ad-hoc.
type CollectionArg = any;

// A single collection helper attached to transformed documents (e.g. so app
// code can call card.board()); its signature varies per helper.
type CollectionHelperFn = (...args: CollectionArg[]) => CollectionArg;

type CollectionTransform = (doc: CollectionArg) => CollectionArg;

type CollectionExtender = (
  collection: CollectionInstance,
  constructor: CollectionConstructor,
) => CollectionInstance;

// Meteor exposes loaded packages on the runtime `Package` global (distinct from
// the build-time package.js API that @types/meteor models). We read three of
// them here to patch collection prototypes for older app code.
interface WekanPackageRegistry {
  meteor?: MeteorPackageExports;
  mongo?: MongoPackageExports;
  'matb33:collection-hooks'?: CollectionHooksPackageExports;
}

interface MeteorPackageExports {
  Meteor?: PatchableMeteor;
}

interface MongoPackageExports {
  Mongo?: PatchableMongo;
}

interface CollectionHooksPackageExports {
  CollectionHooks?: CollectionHooksApi;
}

interface PatchableMeteor {
  isServer?: boolean;
  Collection?: CollectionConstructor;
}

interface PatchableMongo {
  Collection: CollectionConstructor;
}

// The matb33:collection-hooks internal surface used by the bootstrap patch.
interface CollectionHooksApi {
  extendCollectionInstance: CollectionExtender;
}

// A Mongo.Collection constructor as this shim manipulates it: instantiable, with
// a mutable prototype carrying the app's helper methods, plus arbitrary static
// members copied across when the constructor is re-wrapped.
interface CollectionConstructor {
  new (...args: CollectionArg[]): CollectionInstance;
  apply(thisArg: CollectionArg, args: CollectionArg[]): CollectionInstance;
  prototype: CollectionInstance;
  _wekanHookBootstrapPatched?: boolean;
  [staticMember: string]: CollectionArg;
}

interface CollectionSchema {
  _schemaDefinition?: CollectionArg;
  _schema?: CollectionArg;
}

// A live Mongo.Collection instance; only the internal fields this shim reads or
// writes are modelled, alongside an index signature for the untyped remainder.
interface CollectionInstance {
  _name?: string;
  _transform?: CollectionTransform;
  // Reassigned at runtime to a per-collection document constructor; kept as the
  // interop alias because it is invoked with `new` and mutated dynamically.
  _helpersConstructor?: CollectionArg;
  _simpleSchema?: CollectionSchema | null;
  _collection?: CollectionInstance;
  _wekanHookSurfaceReady?: boolean;
  [member: string]: CollectionArg;
}

module.exports = {};
