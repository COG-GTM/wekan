import { Meteor } from 'meteor/meteor';
import { Mongo, MongoInternals } from 'meteor/mongo';
// Import Attachments directly to avoid relying on an implicit global that
// does not exist in Meteor's ES-module scope.
import Attachments from '../attachments';

/**
 * Backward compatibility layer for CollectionFS to Meteor-Files migration
 * Handles reading attachments from old CollectionFS database structure
 */

// Old CollectionFS collections. Their legacy documents have dynamic, untyped
// shapes, so the collections are typed as `Mongo.Collection<any>`.
const OldAttachmentsFiles = new Mongo.Collection<any>('cfs_gridfs.attachments.files');
const OldAttachmentsFileRecord = new Mongo.Collection<any>('cfs.attachments.filerecord');
const OldAvatarsFiles = new Mongo.Collection<any>('cfs_gridfs.avatars.files');
const OldAvatarsFileRecord = new Mongo.Collection<any>('cfs.avatars.filerecord');

function oldCollections(coll: string) {
  return coll === 'avatars'
    ? { FileRecord: OldAvatarsFileRecord, Files: OldAvatarsFiles }
    : { FileRecord: OldAttachmentsFileRecord, Files: OldAttachmentsFiles };
}

// The GridFS binary is keyed by copies.<coll>.key (an ObjectId hex), NOT by the
// filerecord _id. Resolve it safely to an ObjectId.
// `fileRecord` is a raw legacy CollectionFS document, hence `any`.
function gridFsObjectIdFromRecord(coll: string, fileRecord: any) {
  const key = fileRecord && fileRecord.copies && fileRecord.copies[coll] && fileRecord.copies[coll].key;
  if (!key) return null;
  try {
    return new MongoInternals.NpmModule.ObjectId(String(key));
  } catch (error) {
    return null;
  }
}

/**
 * Check if an attachment exists in the new Meteor-Files structure
 * @param {string} attachmentId - The attachment ID to check
 * @returns {Promise<boolean>} - True if exists in new structure
 */
export async function isNewAttachmentStructure(attachmentId: string) {
  if (Meteor.isServer) {
    if (Attachments && Attachments.collection) {
      const cursor = Attachments.collection;
      return !!(typeof cursor.findOneAsync === 'function' ? await cursor.findOneAsync({ _id: attachmentId }) : cursor.findOne({ _id: attachmentId }));
    }
  }
  return false;
}

/**
 * Get attachment data from old CollectionFS structure
 * @param {string} attachmentId - The attachment ID
 * @returns {Promise<Object|null>} - Attachment data in new format or null if not found
 */
export async function getOldAttachmentData(attachmentId: string, coll = 'attachments') {
  if (Meteor.isServer) {
    try {
      const { FileRecord, Files } = oldCollections(coll);
      // Look up the filerecord (metadata) by its _id.
      const fileRecord = await FileRecord.findOneAsync({ _id: attachmentId });
      if (!fileRecord) {
        return null;
      }

      // The binary lives in the cfs_gridfs.<coll> bucket keyed by
      // copies.<coll>.key (an ObjectId), NOT by the filerecord _id.
      const gridFsId = gridFsObjectIdFromRecord(coll, fileRecord);
      let fileData = null;
      if (gridFsId) {
        fileData = await Files.findOneAsync({ _id: gridFsId });
      }

      const copy = (fileRecord.copies && fileRecord.copies[coll]) || {};
      const name = fileRecord.original?.name || copy.name || fileData?.filename || 'Unknown';
      const type = fileRecord.original?.type || copy.type || fileData?.contentType || 'application/octet-stream';
      const size = fileRecord.original?.size || copy.size || fileData?.length || 0;

      // Convert old structure to a Meteor-Files-shaped document. `meta.source`
      // is 'legacy' so the file server streams it from the CollectionFS bucket,
      // and `gridFsKey` lets the stream helper find the binary without a second
      // filerecord lookup.
      const convertedAttachment = {
        _id: attachmentId,
        name,
        size,
        type,
        extension: getFileExtension(name),
        extensionWithDot: getFileExtensionWithDot(name),
        meta: {
          boardId: fileRecord.boardId,
          swimlaneId: fileRecord.swimlaneId,
          listId: fileRecord.listId,
          cardId: fileRecord.cardId,
          userId: fileRecord.userId,
          source: 'legacy',
        },
        userId: fileRecord.userId,
        gridFsKey: gridFsId ? gridFsId.toString() : null,
        collectionFsColl: coll,
        uploadedAt: fileRecord.uploadedAt || fileData?.uploadDate || new Date(),
        updatedAt: fileRecord.original?.updatedAt || fileData?.uploadDate || new Date(),
        uploadedAtOstrio: fileRecord.uploadedAt || fileData?.uploadDate || new Date(),
        isImage: isImageFile(type),
        isVideo: isVideoFile(type),
        isAudio: isAudioFile(type),
        isText: isTextFile(type),
        isJSON: isJSONFile(type),
        isPDF: isPDFFile(type),
        _downloadRoute: '/cdn/storage',
        _collectionName: coll,
        link(version: string = 'original') {
          return `/cdn/storage/${coll}/${this._id}`;
        },
        versions: {
          original: {
            path: `/cdn/storage/${coll}/${attachmentId}`,
            size,
            type,
            storage: 'gridfs',
          },
        },
      };

      return convertedAttachment;
    } catch (error) {
      console.error('Error reading old attachment data:', error);
      return null;
    }
  }
  return null;
}

/**
 * Get file extension from filename
 * @param {string} filename - The filename
 * @returns {string} - File extension without dot
 */
function getFileExtension(filename: string) {
  if (!filename) return '';
  const lastDot = filename.lastIndexOf('.');
  if (lastDot === -1) return '';
  return filename.substring(lastDot + 1).toLowerCase();
}

/**
 * Get file extension with dot
 * @param {string} filename - The filename
 * @returns {string} - File extension with dot
 */
function getFileExtensionWithDot(filename: string) {
  const ext = getFileExtension(filename);
  return ext ? `.${ext}` : '';
}

/**
 * Check if file is an image
 * @param {string} mimeType - MIME type
 * @returns {boolean} - True if image
 */
function isImageFile(mimeType: string) {
  return mimeType && mimeType.startsWith('image/');
}

/**
 * Check if file is a video
 * @param {string} mimeType - MIME type
 * @returns {boolean} - True if video
 */
function isVideoFile(mimeType: string) {
  return mimeType && mimeType.startsWith('video/');
}

/**
 * Check if file is audio
 * @param {string} mimeType - MIME type
 * @returns {boolean} - True if audio
 */
function isAudioFile(mimeType: string) {
  return mimeType && mimeType.startsWith('audio/');
}

/**
 * Check if file is text
 * @param {string} mimeType - MIME type
 * @returns {boolean} - True if text
 */
function isTextFile(mimeType: string) {
  return mimeType && mimeType.startsWith('text/');
}

/**
 * Check if file is JSON
 * @param {string} mimeType - MIME type
 * @returns {boolean} - True if JSON
 */
function isJSONFile(mimeType: string) {
  return mimeType === 'application/json';
}

/**
 * Check if file is PDF
 * @param {string} mimeType - MIME type
 * @returns {boolean} - True if PDF
 */
function isPDFFile(mimeType: string) {
  return mimeType === 'application/pdf';
}

/**
 * Get attachment with backward compatibility
 * @param {string} attachmentId - The attachment ID
 * @returns {Promise<Object|null>} - Attachment data or null if not found
 */
export async function getAttachmentWithBackwardCompatibility(attachmentId: string) {
  // First try new structure
  if (Meteor.isServer) {
    if (Attachments && Attachments.collection) {
      const cursor = Attachments.collection;
      const newAttachment = typeof cursor.findOneAsync === 'function' ? await cursor.findOneAsync({ _id: attachmentId }) : cursor.findOne({ _id: attachmentId });
      if (newAttachment) {
        return newAttachment;
      }
    }
  }

  // Fall back to old structure
  const oldAttachment = await getOldAttachmentData(attachmentId);
  return oldAttachment;
}

/**
 * Get attachments for a card with backward compatibility
 * @param {Object} query - Query object
 * @returns {Promise<Array>} - Array of attachments
 */
// `query` is a Mongo selector whose shape is dynamic, hence `any`.
export async function getAttachmentsWithBackwardCompatibility(query: any) {
  // Attachment documents from the (untyped) collection, hence `any[]`.
  let newAttachments: any[] = [];

  // Get new attachments
  if (Meteor.isServer) {
    if (Attachments && Attachments.collection) {
      const cursor = Attachments.collection.find(query);
      newAttachments = typeof cursor.fetchAsync === 'function' ? await cursor.fetchAsync() : cursor.fetch();
    }
  }

  const oldAttachments: any[] = [];

  if (Meteor.isServer) {
    try {
      // Query old structure for the same card
      const cardId = query['meta.cardId'];
      if (cardId) {
        const cursor = OldAttachmentsFileRecord.find({ cardId });
        const oldFileRecords = typeof cursor.fetchAsync === 'function' ? await cursor.fetchAsync() : cursor.fetch();
        for (const fileRecord of oldFileRecords) {
          const oldAttachment = await getOldAttachmentData(fileRecord._id);
          if (oldAttachment) {
            oldAttachments.push(oldAttachment);
          }
        }
      }
    } catch (error) {
      console.error('Error reading old attachments:', error);
    }
  }

  // Combine and deduplicate
  const allAttachments = [...newAttachments, ...oldAttachments];
  const uniqueAttachments = allAttachments.filter((attachment, index, self) =>
    index === self.findIndex(a => a._id === attachment._id)
  );

  return uniqueAttachments;
}

/**
 * Get file stream from old GridFS structure
 * @param {string} attachmentId - The attachment ID
 * @returns {Object|null} - GridFS file stream or null if not found
 */
export async function getOldAttachmentStream(attachmentId: string, coll = 'attachments') {
  if (Meteor.isServer) {
    try {
      const { FileRecord } = oldCollections(coll);
      const fileRecord = await FileRecord.findOneAsync({ _id: attachmentId });
      const gridFsId = gridFsObjectIdFromRecord(coll, fileRecord);
      if (!gridFsId) {
        return null;
      }
      const db = MongoInternals.defaultRemoteCollectionDriver().mongo.db;
      const bucket = new MongoInternals.NpmModule.GridFSBucket(db, {
        bucketName: `cfs_gridfs.${coll}`,
      });
      // The binary is addressed by the GridFS file ObjectId, not the filename.
      return bucket.openDownloadStream(gridFsId);
    } catch (error) {
      console.error('Error creating GridFS stream:', error);
      return null;
    }
  }
  return null;
}

/**
 * Get file data from old GridFS structure
 * @param {string} attachmentId - The attachment ID
 * @returns {Buffer|null} - File data buffer or null if not found
 */
export async function getOldAttachmentDataBuffer(attachmentId: string, coll = 'attachments') {
  if (Meteor.isServer) {
    try {
      const { FileRecord } = oldCollections(coll);
      const fileRecord = await FileRecord.findOneAsync({ _id: attachmentId });
      const gridFsId = gridFsObjectIdFromRecord(coll, fileRecord);
      if (!gridFsId) {
        return null;
      }
      const db = MongoInternals.defaultRemoteCollectionDriver().mongo.db;
      const bucket = new MongoInternals.NpmModule.GridFSBucket(db, {
        bucketName: `cfs_gridfs.${coll}`,
      });

      return await new Promise<Buffer>((resolve, reject) => {
        const chunks: Buffer[] = [];
        // The binary is addressed by the GridFS file ObjectId, not the filename.
        const downloadStream = bucket.openDownloadStream(gridFsId);

        downloadStream.on('data', (chunk) => {
          chunks.push(chunk);
        });

        downloadStream.on('end', () => {
          resolve(Buffer.concat(chunks));
        });

        downloadStream.on('error', (error) => {
          reject(error);
        });
      });
    } catch (error) {
      console.error('Error reading GridFS data:', error);
      return null;
    }
  }
  return null;
}
