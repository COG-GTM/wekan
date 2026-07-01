import { ReactiveCache } from '/imports/reactiveCache';
import { Mongo } from 'meteor/mongo';

const Triggers = new Mongo.Collection<TriggerDocument>('triggers');

Triggers.before.insert((userId, doc) => {
  doc.createdAt = new Date();
  doc.updatedAt = doc.createdAt;
});

Triggers.before.update((userId, doc, fieldNames, modifier) => {
  modifier.$set = modifier.$set || {};
  modifier.$set.updatedAt = new Date();
});

Triggers.helpers({
  async rename(description: string) {
    return await Triggers.updateAsync(this._id!, {
      $set: { description },
    });
  },

  description() {
    return this.desc;
  },

  getRule() {
    return ReactiveCache.getRule({ triggerId: this._id });
  },

  fromList() {
    return ReactiveCache.getList(this.fromId);
  },

  toList() {
    return ReactiveCache.getList(this.toId);
  },

  findList(title: string) {
    return ReactiveCache.getList({
      title,
    });
  },

  labels() {
    const boardLabels = this.board().labels;
    const cardLabels = boardLabels.filter((label: WekanDocumentField) => {
      return (this.labelIds || []).includes(label._id);
    });
    return cardLabels;
  },
});

export default Triggers;

interface TriggerDocument {
  _id?: string;
  desc?: string;
  fromId?: string;
  toId?: string;
  labelIds?: string[];
  createdAt?: Date;
  updatedAt?: Date;
  [field: string]: WekanDocumentField;
}
