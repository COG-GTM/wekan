import { Mongo } from 'meteor/mongo';

// Define presences collection
const Presences = new Mongo.Collection<PresenceDocument>('presences');

export default Presences;

interface PresenceDocument {
  _id?: string;
  [field: string]: WekanDocumentField;
}
