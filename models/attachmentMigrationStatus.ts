import { Mongo } from 'meteor/mongo';

const AttachmentMigrationStatus = new Mongo.Collection<AttachmentMigrationStatusDocument>('attachmentMigrationStatus');

export default AttachmentMigrationStatus;

interface AttachmentMigrationStatusDocument {
  _id?: string;
  boardId?: string;
  userId?: string;
  cardId?: string;
  attachmentId?: string;
  status?: string;
  updatedAt?: Date;
}
