import { MongoInternals } from 'meteor/mongo';

export const createBucket = (bucketName?: string) => {
  const options = bucketName ? { bucketName } : void 0;
  return new (MongoInternals as WekanMongoInternals).NpmModule.GridFSBucket(
    MongoInternals.defaultRemoteCollectionDriver().mongo.db,
    options,
  );
};
