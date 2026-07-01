import { Meteor } from 'meteor/meteor';
import { Mongo } from 'meteor/mongo';
import { Session } from 'meteor/session';
import { incrementCounter } from './counters';
const { SimpleSchema }: { SimpleSchema: SimpleSchemaStatic } = require('/imports/simpleSchema');

const SessionData = new Mongo.Collection('sessiondata');

/**
 * A UserSessionData in Wekan. Organization in Trello.
 */
SessionData.attachSchema(
  new SimpleSchema({
    _id: {
      /**
       * the organization id
       */
      type: Number,
      optional: true,
      // eslint-disable-next-line consistent-return
      autoValue() {
        if (this.isInsert && !this.isSet) {
          return incrementCounter('orgId', 1);
        }
      },
    },
    userId: {
      /**
       * userId of the user
       */
      type: String,
      optional: false,
    },
    sessionId: {
      /**
       * unique session ID
       */
      type: String,
      optional: false,
    },
    totalHits: {
      /**
       * total number of hits in the last report query
       */
      type: Number,
      optional: true,
    },
    resultsCount: {
      /**
       * number of results returned
       */
      type: Number,
      optional: true,
    },
    lastHit: {
      /**
       * the last hit returned from a report query
       */
      type: Number,
      optional: true,
    },
    cards: {
      type: Array,
      optional: true,
    },
    'cards.$': {
      type: String,
    },
    selector: {
      type: String,
      optional: true,
      blackbox: true,
    },
    projection: {
      type: String,
      optional: true,
      blackbox: true,
      defaultValue: {},
    },
    errorMessages: {
      type: Array,
      optional: true,
    },
    'errorMessages.$': {
      type: String,
    },
    errors: {
      type: Array,
      optional: true,
      defaultValue: [],
    },
    debug: {
      type: String,
      optional: true,
    },
    'errors.$': {
      type: new SimpleSchema({
        tag: {
          /**
           * i18n tag
           */
          type: String,
          optional: false,
        },
        value: {
          /**
           * value for the tag
           */
          type: String,
          optional: true,
          defaultValue: null,
        },
        color: {
          type: Boolean,
          optional: true,
          defaultValue: false,
        },
      }),
    },
    createdAt: {
      /**
       * creation date of the team
       */
      type: Date,
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

SessionData.helpers({
  getSelector() {
    return (SessionData as any).unpickle(this.selector);
  },
  getProjection() {
    return (SessionData as any).unpickle(this.projection);
  },
});

// Custom (de)serialization statics attached to the collection instance; not
// part of the Mongo.Collection type, so the assignments go through `any`.
(SessionData as any).unpickle = (pickle: string) => {
  return JSON.parse(pickle, (key, value) => {
    return unpickleValue(value);
  });
};

// `value` is an arbitrary JSON value from the (de)serializer, hence `any`.
function unpickleValue(value: any) {
  if (value === null) {
    return null;
  } else if (typeof value === 'object') {
    // eslint-disable-next-line no-prototype-builtins
    if (value.hasOwnProperty('$$class')) {
      switch (value.$$class) {
        case 'RegExp':
          return new RegExp(value.source, value.flags);
        case 'Date':
          return new Date(value.stringValue);
        case 'Object':
          return unpickleObject(value);
      }
    }
  }
  return value;
}

function unpickleObject(obj: any) {
  const newObject: { [key: string]: any } = {};
  Object.entries(obj).forEach(([key, value]) => {
    newObject[key] = unpickleValue(value);
  });
  return newObject;
}

(SessionData as any).pickle = (value: any) => {
  return JSON.stringify(value, (key, value) => {
    return pickleValue(value);
  }, 2);
};

// `value` is an arbitrary JSON value from the serializer, hence `any`.
function pickleValue(value: any) {
  if (value === null) {
    return null;
  } else if (typeof value === 'object') {
    switch (value.constructor.name) {
      case 'RegExp':
        return {
          $$class: 'RegExp',
          source: value.source,
          flags: value.flags,
        };
      case 'Date':
        return {
          $$class: 'Date',
          stringValue: String(value),
        };
      case 'Object':
        return pickleObject(value);
    }
  }
  return value;
}

function pickleObject(obj: any) {
  const newObject: { [key: string]: any } = {};
  Object.entries(obj).forEach(([key, value]) => {
    newObject[key] = pickleValue(value);
  });
  return newObject;
}

if (!Meteor.isServer) {
  (SessionData as any).getSessionId = () => {
    let sessionId = Session.get('sessionId');
    if (!sessionId) {
      const randomBytes = new Uint8Array(16);
      crypto.getRandomValues(randomBytes);
      const randomSuffix = Array.from(randomBytes, byte =>
        byte.toString(16).padStart(2, '0')).join('');
      sessionId = `${String(Meteor.userId())}-${randomSuffix}`;
      Session.set('sessionId', sessionId);
    }

    return sessionId;
  };
}

export default SessionData;
