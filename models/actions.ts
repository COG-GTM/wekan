import { ReactiveCache } from '/imports/reactiveCache';
import { Mongo } from 'meteor/mongo';

const Actions = new Mongo.Collection<ActionDocument>('actions');

Actions.before.insert((userId, doc) => {
  doc.createdAt = new Date();
  doc.modifiedAt = doc.createdAt;
});

Actions.before.update((userId, doc, fieldNames, modifier) => {
  modifier.$set = modifier.$set || {};
  modifier.$set.modifiedAt = new Date();
});

Actions.helpers({
  description() {
    return this.desc;
  },
});

export default Actions;

interface ActionDocument {
  _id?: string;
  desc?: string;
  createdAt?: Date;
  modifiedAt?: Date;
}
