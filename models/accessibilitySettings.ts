import { Mongo } from 'meteor/mongo';
import { ReactiveCache } from '/imports/reactiveCache';
const { SimpleSchema }: { SimpleSchema: WekanSimpleSchemaConstructor } = require('/imports/simpleSchema');

const AccessibilitySettings = new Mongo.Collection<AccessibilitySettingsDocument>('accessibilitySettings');

AccessibilitySettings.attachSchema(
  new SimpleSchema({
    enabled: {
      type: Boolean,
      defaultValue: false,
    },
    title: {
      type: String,
      optional: true,
    },
    body: {
      type: String,
      optional: true,
    },
    createdAt: {
      type: Date,
      optional: true,
      // eslint-disable-next-line consistent-return
      autoValue() {
        if (this.isInsert) {
          return new Date();
        } else if (this.isUpsert) {
          return { $setOnInsert: new Date() };
        } else {
          this.unset();
        }
      },
    },
    modifiedAt: {
      type: Date,
      // eslint-disable-next-line consistent-return
      autoValue() {
        if (this.isInsert || this.isUpsert || this.isUpdate) {
          return new Date();
        } else {
          this.unset();
        }
      },
    },
  }),
);

export default AccessibilitySettings;

interface AccessibilitySettingsDocument {
  _id?: string;
  enabled: boolean;
  title?: string;
  body?: string;
  createdAt?: Date;
  modifiedAt?: Date;
}
