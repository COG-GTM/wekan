import { Meteor } from 'meteor/meteor';
import { check, Match } from 'meteor/check';
import Attachments from '/models/attachments';
import { ReactiveCache } from '/imports/reactiveCache';

// Escape a user-supplied search string so it is matched literally (and
// case-insensitively) instead of being interpreted as a regular expression.
function searchRegex(term: string) {
  return new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
}

// Card ids the given user is allowed to see attachments for. Shared by the
// paginated 'attachmentsList' publication and its matching count method so the
// total and the published page are always computed over the same set.
async function accessibleCardIds(userId: string | null) {
  const userBoards = (await ReactiveCache.getBoards({
    $or: [
      { permission: 'public' },
      { members: { $elemMatch: { userId, isActive: true } } }
    ]
  })).map((board: DocWithId) => board._id);

  if (userBoards.length === 0) {
    return [];
  }

  return (await ReactiveCache.getCards({
    boardId: { $in: userBoards },
    archived: false
  })).map((card: DocWithId) => card._id);
}

// Build the attachments query for the report: restricted to accessible cards,
// optionally filtered by attachment name. Returns null when the user has no
// accessible cards (caller should publish/return nothing).
async function attachmentsReportQuery(userId: string | null, searchTerm: string | null | undefined) {
  const userCards = await accessibleCardIds(userId);
  if (userCards.length === 0) {
    return null;
  }
  const query: MongoQuery = { 'meta.cardId': { $in: userCards } };
  if (searchTerm) {
    query.name = searchRegex(searchTerm);
  }
  return query;
}

Meteor.publish('attachmentsList', async function(searchTerm: string | null | undefined = '', limit: number, skip: number | null | undefined = 0) {
  check(searchTerm, Match.OneOf(String, null, undefined));
  check(limit, Number);
  check(skip, Match.OneOf(Number, null, undefined));

  const query = await attachmentsReportQuery(this.userId, searchTerm);
  if (!query) {
    return this.ready();
  }

  const ret = (await ReactiveCache.getAttachments(
    query,
    {
      fields: {
        _id: 1,
        name: 1,
        size: 1,
        type: 1,
        meta: 1,
        path: 1,
        versions: 1,
      },
      sort: {
        name: 1,
      },
      limit,
      skip: skip || 0,
    },
    true,
  )).cursor;
  return ret;
});

Meteor.methods({
  async getAttachmentsReportCount(searchTerm: string | null | undefined = '') {
    check(searchTerm, Match.OneOf(String, null, undefined));
    if (!(await ReactiveCache.getCurrentUser())?.isAdmin) {
      throw new Meteor.Error('not-authorized');
    }
    const query = await attachmentsReportQuery(this.userId, searchTerm);
    if (!query) {
      return 0;
    }
    const cursor = (await ReactiveCache.getAttachments(query, {}, true)).cursor;
    return typeof cursor.countAsync === 'function' ? await cursor.countAsync() : cursor.count();
  },
});

// A Mongo document referenced only by its id (board/card lookups above).
interface DocWithId {
  _id: string;
}
