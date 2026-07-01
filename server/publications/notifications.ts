import { ReactiveCache } from '/imports/reactiveCache';

// We use these when displaying notifications in the notificationsDrawer

// gets all activities associated with the current user
Meteor.publish('notificationActivities', async () => {
  return await activityCursor();
});

// gets all attachments associated with activities associated with the current user
Meteor.publish('notificationAttachments', async function() {
  const activityEntries = await activityDocs();
  const ret = await ReactiveCache.getAttachments(
    {
      _id: {
        $in: activityEntries
          .map((v: WekanDocumentField) => v.attachmentId)
          .filter((v: WekanDocumentField) => !!v),
      },
    },
    {},
    true,
  );
  return ret;
});

// gets all cards associated with activities associated with the current user
Meteor.publish('notificationCards', async function() {
  const activityEntries = await activityDocs();
  const ret = await ReactiveCache.getCards(
    {
      _id: {
        $in: activityEntries
          .map((v: WekanDocumentField) => v.cardId)
          .filter((v: WekanDocumentField) => !!v),
      },
    },
    {},
    true,
  );
  return ret;
});

// gets all checklistItems associated with activities associated with the current user
Meteor.publish('notificationChecklistItems', async function() {
  const activityEntries = await activityDocs();
  const ret = await ReactiveCache.getChecklistItems(
    {
      _id: {
        $in: activityEntries
          .map((v: WekanDocumentField) => v.checklistItemId)
          .filter((v: WekanDocumentField) => !!v),
      },
    },
    {},
    true,
  );
  return ret;
});

// gets all checklists associated with activities associated with the current user
Meteor.publish('notificationChecklists', async function() {
  const activityEntries = await activityDocs();
  const ret = await ReactiveCache.getChecklists(
    {
      _id: {
        $in: activityEntries
          .map((v: WekanDocumentField) => v.checklistId)
          .filter((v: WekanDocumentField) => !!v),
      },
    },
    {},
    true,
  );
  return ret;
});

// gets all comments associated with activities associated with the current user
Meteor.publish('notificationComments', async function() {
  const activityEntries = await activityDocs();
  const ret = await ReactiveCache.getCardComments(
    {
      _id: {
        $in: activityEntries
          .map((v: WekanDocumentField) => v.commentId)
          .filter((v: WekanDocumentField) => !!v),
      },
    },
    {},
    true,
  );
  return ret;
});

// gets all lists associated with activities associated with the current user
Meteor.publish('notificationLists', async function() {
  const activityEntries = await activityDocs();
  const ret = await ReactiveCache.getLists(
    {
      _id: {
        $in: activityEntries
          .map((v: WekanDocumentField) => v.listId)
          .filter((v: WekanDocumentField) => !!v),
      },
    },
    {},
    true,
  );
  return ret;
});

// gets all swimlanes associated with activities associated with the current user
Meteor.publish('notificationSwimlanes', async function() {
  const activityEntries = await activityDocs();
  const ret = await ReactiveCache.getSwimlanes(
    {
      _id: {
        $in: activityEntries
          .map((v: WekanDocumentField) => v.swimlaneId)
          .filter((v: WekanDocumentField) => !!v),
      },
    },
    {},
    true,
  );
  return ret;
});

// gets all users associated with activities associated with the current user
Meteor.publish('notificationUsers', async function() {
  const activityEntries = await activityDocs();
  const ret = await ReactiveCache.getUsers(
    {
      _id: {
        $in: activityEntries
          .map((v: WekanDocumentField) => v.userId)
          .filter((v: WekanDocumentField) => !!v),
      },
    },
    {
      fields: {
        username: 1,
        'profile.fullname': 1,
        'profile.avatarUrl': 1,
        'profile.initials': 1,
      },
    },
    true,
  );
  return ret;
});

async function activityIds() {
  const activityIds = (await ReactiveCache.getCurrentUser())?.profile?.notifications?.map((v: WekanDocumentField) => v.activity) || [];
  return activityIds;
}

async function activityDocs() {
  const ids = await activityIds();
  if (ids.length === 0) {
    return [];
  }
  return await ReactiveCache.getActivities({
    _id: { $in: ids },
  });
}

async function activityCursor() {
  const ids = await activityIds();
  if (ids.length === 0) {
    return [];
  }
  return await ReactiveCache.getActivities(
    {
      _id: { $in: ids },
    },
    {},
    true,
  );
}
