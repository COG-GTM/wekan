import { Meteor } from 'meteor/meteor';
import fs from 'fs';
import type { GridFSBucket } from 'mongodb';

export const createOnAfterUpload = (bucket: GridFSBucket) =>
  function onAfterUpload(this: FilesCollectionContext, file: UploadedFile) {
    const self = this;

    // here you could manipulate your file
    // and create a new version, for example a scaled 'thumbnail'
    // ...

    // then we read all versions we have got so far
    Object.keys(file.versions).forEach(versionName => {
      const metadata = { ...file.meta, versionName, fileId: file._id };
      fs.createReadStream(file.versions[versionName].path)

        // this is where we upload the binary to the bucket using bucket.openUploadStream
        // see http://mongodb.github.io/node-mongodb-native/3.2/api/GridFSBucket.html#openUploadStream
        .pipe(
          // `contentType` is a legacy GridFS write option no longer in the
          // driver's typings; kept to preserve existing runtime behavior.
          bucket.openUploadStream(file.name, {
            contentType: file.type || 'binary/octet-stream',
            metadata,
          } as import('mongodb').GridFSBucketWriteStreamOptions),
        )

        // and we unlink the file from the fs on any error
        // that occurred during the upload to prevent zombie files
        .on('error', err => {
          // console.error("[createOnAfterUpload error]", err);
          self.unlink(file, versionName); // Unlink files from FS
        })

        // once we are finished, we attach the gridFS Object id on the
        // FilesCollection document's meta section and finally unlink the
        // upload file from the filesystem
        .on(
          'finish',
          (ver: GridFsFinishFile) => {
            const property = `versions.${versionName}.meta.gridFsFileId`;

            self.collection.updateAsync(file._id, {
              $set: {
                [property]: ver._id.toHexString(),
              },
            }).catch(err => {
              console.error('[createOnAfterUpload update error]', err);
            });

            self.unlink(file, versionName); // Unlink files from FS
          },
        );
    });
  };

// One stored variant (original, thumbnail, …) of an uploaded file on disk.
interface UploadedFileVersion {
  path: string;
}

// A Meteor-Files document as passed to the onAfterUpload hook.
interface UploadedFile {
  _id: string;
  name: string;
  type?: string;
  // `meta` is a free-form bag copied verbatim onto each version's metadata.
  meta?: { [key: string]: any };
  versions: { [versionName: string]: UploadedFileVersion };
}

// The GridFS file document supplied to the write stream's `finish` handler
// (its `_id` is stored back on the FilesCollection document's meta section).
interface GridFsFinishFile {
  _id: { toHexString(): string };
}

// The FilesCollection `this` context available inside the hook.
interface FilesCollectionContext {
  unlink(file: UploadedFile, versionName: string): void;
  collection: {
    updateAsync(id: string, modifier: object): Promise<number>;
  };
}
