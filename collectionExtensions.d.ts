// Module-scoped augmentation of `meteor/mongo`'s `Mongo.Collection`.
//
// The Wekan models use community Meteor packages that @types/meteor does not
// model:
//   - aldeed:simple-schema / collection2 -> attachSchema / simpleSchema
//   - dburles:collection-helpers          -> helpers
//   - matb33:collection-hooks             -> before / after / hookOptions
//
// This file is a MODULE (note the side-effect import below), so the
// `declare module 'meteor/mongo'` block is a declaration-merging augmentation
// rather than an authoritative ambient module. That keeps the rest of
// @types/meteor's 'meteor/mongo' surface (e.g. MongoInternals) intact.
//
// The Wekan* helper types referenced here are declared globally in
// `declarations.d.ts`.
import 'meteor/mongo';

declare module 'meteor/mongo' {
  namespace Mongo {
    interface Collection<T extends import('mongodb').Document, U = T> {
      attachSchema(
        schema: WekanSimpleSchemaInstance | WekanSchemaDefinition,
        options?: object,
      ): void;
      simpleSchema(): WekanSimpleSchemaInstance | null;
      helpers(helpers: WekanCollectionHelpersMap<U>): void;
      before: WekanCollectionMutationHooks<T>;
      after: WekanCollectionMutationHooks<T>;
      hookOptions: WekanCollectionHookOptions;
      // Wekan attaches model-specific "static" helpers directly onto collection
      // instances (e.g. Boards.userBoardIds, CardComments.textSearch). Those are
      // declared per-model where practical; this documented index signature
      // covers the remaining dynamically-assigned members.
      [member: string]: WekanDocumentField;
    }
  }
}
