import { Mongo } from 'meteor/mongo';

const CronJobStatus = new Mongo.Collection<CronJobStatusDocument>('cronJobStatus');

export default CronJobStatus;

interface CronJobStatusDocument {
  _id?: string;
  // The cron-job status documents are schema-less; fields are dynamic.
  [field: string]: WekanDocumentField;
}
