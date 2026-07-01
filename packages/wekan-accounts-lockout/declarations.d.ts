import type { Mongo } from 'meteor/mongo';

// `Meteor.Collection` is a runtime alias for `Mongo.Collection` that is missing
// from `@types/meteor`; declare it with the real constructor type.
declare module 'meteor/meteor' {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Meteor {
    const Collection: typeof Mongo.Collection;
  }
}
