import { Meteor } from 'meteor/meteor';
import { check, Match } from 'meteor/check';
import { ReactiveCache } from '/imports/reactiveCache';
import { publishComposite } from 'meteor/reywood:publish-composite';
import { findWhere } from '/imports/lib/collectionHelpers';
import { BoardMemberFull } from './types';
import escapeForRegex from 'escape-string-regexp';
import Users from '../../models/users';
import {
  formatDateTime,
  formatDate,
  formatTime,
  getISOWeek,
  isValidDate,
  isBefore,
  isAfter,
  isSame,
  add,
  subtract,
  startOf,
  endOf,
  format,
  parseDate,
  now,
  createDate,
  fromNow,
  calendar
} from '/imports/lib/dateUtils';
import Boards from '../../models/boards';
import Lists from '../../models/lists';
import Swimlanes from '../../models/swimlanes';
import Cards from '../../models/cards';
import CardComments from '../../models/cardComments';
import Attachments from '../../models/attachments';
import Checklists from '../../models/checklists';
import ChecklistItems from '../../models/checklistItems';
import SessionData from '../../models/usersessiondata';
import CustomFields from '../../models/customFields';
import {
  DEFAULT_LIMIT,
  OPERATOR_ASSIGNEE,
  OPERATOR_BOARD,
  OPERATOR_COMMENT,
  OPERATOR_CREATED_AT,
  OPERATOR_CREATOR,
  OPERATOR_DUE,
  OPERATOR_HAS,
  OPERATOR_LABEL,
  OPERATOR_LIMIT,
  OPERATOR_LIST,
  OPERATOR_MEMBER,
  OPERATOR_MODIFIED_AT, OPERATOR_ORG,
  OPERATOR_SORT,
  OPERATOR_STATUS,
  OPERATOR_SWIMLANE, OPERATOR_TEAM,
  OPERATOR_USER,
  OPERATOR_TITLE,
  OPERATOR_DESCRIPTION,
  OPERATOR_CUSTOMFIELD,
  OPERATOR_ATTACHMENT_TEXT,
  OPERATOR_CHECKLIST_TEXT,
  ORDER_ASCENDING,
  PREDICATE_ALL,
  PREDICATE_ARCHIVED,
  PREDICATE_ASSIGNEES,
  PREDICATE_ATTACHMENT,
  PREDICATE_CHECKLIST,
  PREDICATE_CREATED_AT,
  PREDICATE_DESCRIPTION,
  PREDICATE_DUE_AT,
  PREDICATE_END_AT,
  PREDICATE_ENDED,
  PREDICATE_MEMBERS,
  PREDICATE_MODIFIED_AT,
  PREDICATE_PRIVATE,
  PREDICATE_PUBLIC,
  PREDICATE_START_AT,
  PREDICATE_SYSTEM,
} from '/config/search-const';
import { QueryErrors, QueryParams, Query } from '/config/query-classes';
import { CARD_TYPES } from '../../config/const';
import Org from "../../models/org";
import Team from "../../models/team";

Meteor.publish('card', async function(cardId: string) {
  check(cardId, String);

  const userId = this.userId;
  const card = await ReactiveCache.getCard({ _id: cardId });

  if (!card || !card.boardId) {
    return [];
  }

  const board = await ReactiveCache.getBoard({ _id: card.boardId });
  if (!board || !board.isVisibleBy({ _id: userId })) {
    return [];
  }

  // If user has assigned-only permissions, check if they're assigned to this card
  if (userId && board.members) {
    const member = findWhere<BoardMemberFull>(board.members, { userId: userId, isActive: true });
    if (member && (member.isNormalAssignedOnly || member.isCommentAssignedOnly || member.isReadAssignedOnly)) {
      // User with assigned-only permissions can only view cards assigned to them
      if (!card.assignees || !card.assignees.includes(userId)) {
        return []; // Don't publish if user is not assigned
      }
    }
  }

  const ret = await ReactiveCache.getCards(
    { _id: cardId },
    {},
    true,
  );
  return ret;
});

/** publish all data which is necessary to display card details as popup
 * @returns array of cursors
 */
publishComposite('popupCardData', async function(cardId: string) {
  check(cardId, String);

  const userId = this.userId;
  const card = await ReactiveCache.getCard({ _id: cardId });

  if (!card || !card.boardId) {
    return [];
  }

  const board = await ReactiveCache.getBoard({ _id: card.boardId });
  if (!board || !board.isVisibleBy({ _id: userId })) {
    return [];
  }

  // If user has assigned-only permissions, check if they're assigned to this card
  if (userId && board.members) {
    const member = findWhere<BoardMemberFull>(board.members, { userId: userId, isActive: true });
    if (member && (member.isNormalAssignedOnly || member.isCommentAssignedOnly || member.isReadAssignedOnly)) {
      // User with assigned-only permissions can only view cards assigned to them
      if (!card.assignees || !card.assignees.includes(userId)) {
        return []; // Don't publish if user is not assigned
      }
    }
  }

  return {
    async find() {
      return await ReactiveCache.getCards({ _id: cardId }, {}, true);
    },
    children: [
      {
        async find(card) {
          return await ReactiveCache.getBoards({ _id: card.boardId }, {}, true);
        }
      },
      {
        async find(card) {
          return await ReactiveCache.getLists({ boardId: card.boardId }, {}, true);
        }
      }
    ]
  };
});

Meteor.publish('archiveSidebar', async function(boardId: string, activeTab: string = 'cards', cardsLimit: number = 30, listsLimit: number = 30, swimlanesLimit: number = 30) {
  check(boardId, String);
  check(activeTab, String);
  check(cardsLimit, Match.Integer);
  check(listsLimit, Match.Integer);
  check(swimlanesLimit, Match.Integer);

  const userId = this.userId;

  const safeCardsLimit = Math.max(1, Math.min(cardsLimit, 500));
  const safeListsLimit = Math.max(1, Math.min(listsLimit, 500));
  const safeSwimlaneLimit = Math.max(1, Math.min(swimlanesLimit, 500));

  const board = await ReactiveCache.getBoard({ _id: boardId });
  if (!board) return this.ready();

  if (!userId) {
    // Unauthenticated users can only see archived lists/swimlanes on public boards
    if (board.permission !== 'public') return this.ready();

    const archivedListsSelector = { boardId, archived: true };
    const archivedSwimlanesSelector = { boardId, archived: true };
    const listsCursor = Lists.find(archivedListsSelector, {
      sort: { archivedAt: -1, modifiedAt: -1 },
      limit: safeListsLimit,
      fields: { title: 1, archivedAt: 1, boardId: 1, archived: 1 },
    });
    const swimlanesCursor = Swimlanes.find(archivedSwimlanesSelector, {
      sort: { archivedAt: -1, modifiedAt: -1 },
      limit: safeSwimlaneLimit,
      fields: { title: 1, archivedAt: 1, boardId: 1, archived: 1 },
    });
    return [listsCursor, swimlanesCursor];
  }

  if (!board.isVisibleBy({ _id: userId })) {
    return [];
  }

  const cardSelector: MongoQuery = {
    boardId: { $in: [board._id, board.subtasksDefaultBoardId] },
    archived: true,
  };

  // Respect assigned-only board permissions for archived cards as well.
  if (board.members) {
    const member = findWhere<BoardMemberFull>(board.members, { userId, isActive: true });
    if (
      member &&
      (member.isNormalAssignedOnly ||
        member.isCommentAssignedOnly ||
        member.isReadAssignedOnly)
    ) {
      cardSelector.assignees = { $in: [userId] };
    }
  }

  const archivedListsSelector = {
    boardId,
    archived: true,
  };
  const archivedSwimlanesSelector = {
    boardId,
    archived: true,
  };

  const cardsCursor = Cards.find(cardSelector, {
    sort: { archivedAt: -1, modifiedAt: -1 },
    limit: safeCardsLimit,
  });
  const listsCursor = Lists.find(archivedListsSelector, {
    sort: { archivedAt: -1, modifiedAt: -1 },
    limit: safeListsLimit,
  });
  const swimlanesCursor = Swimlanes.find(archivedSwimlanesSelector, {
    sort: { archivedAt: -1, modifiedAt: -1 },
    limit: safeSwimlaneLimit,
  });

  return [cardsCursor, listsCursor, swimlanesCursor];
});

Meteor.publish('myCards', async function(sessionId: string) {
  check(sessionId, String);

  if (!this.userId) return this.ready();

  const currentUser = await ReactiveCache.getCurrentUser();
  if (!currentUser) return this.ready();

  const queryParams = new QueryParams();
  queryParams.addPredicate(OPERATOR_USER, currentUser.username);
  queryParams.setPredicate(OPERATOR_LIMIT, 200);

  const query = await buildQuery(queryParams, this.userId);
  query.projection.sort = {
    boardId: 1,
    swimlaneId: 1,
    listId: 1,
  };

  const { cursors, sessionData } = await findCards(sessionId, query, this.userId);
  if (sessionData) this.added('sessiondata', sessionData._id, sessionData);
  return cursors;
});

// Optimized due cards publication for better performance
Meteor.publish('dueCards', async function(allUsers: boolean = false) {
  check(allUsers, Boolean);

  const userId = this.userId;
  if (!userId) {
    return this.ready();
  }

  // Get user's board memberships for efficient filtering
  const userBoards = (await ReactiveCache.getBoards({
    $or: [
      { permission: 'public' },
      { members: { $elemMatch: { userId, isActive: true } } }
    ]
  })).map((board: { _id: string }) => board._id);

  if (userBoards.length === 0) {
    return this.ready();
  }

  // Build optimized selector
  const selector: MongoQuery = {
    type: 'cardType-card',
    archived: false,
    dueAt: { $exists: true, $nin: [null, ''] },
    boardId: { $in: userBoards }
  };

  // Add user filtering if not showing all users
  if (!allUsers) {
    selector.$or = [
      { members: userId },
      { assignees: userId },
      { userId: userId }
    ];
  }

  const options = {
    sort: { dueAt: 1 }, // Sort by due date ascending (oldest first)
    // No limit: show ALL of the user's due cards across boards (issue #5999).
    // Previously a `limit: 100` capped the results, which (combined with the
    // per-user filter) hid many due cards compared to older versions.
    fields: {
      title: 1,
      dueAt: 1,
      boardId: 1,
      listId: 1,
      swimlaneId: 1,
      members: 1,
      assignees: 1,
      userId: 1,
      archived: 1,
      type: 1
    }
  };

  const result = Cards.find(selector, options);

  return result;
});

Meteor.publish('globalSearch', async function(sessionId: string, params: Record<string, any>, text: string) {
  check(sessionId, String);
  check(params, Object);
  check(text, String);

  if (!this.userId) return this.ready();

  const { cursors, sessionData } = await findCards(
    sessionId,
    await buildQuery(new QueryParams(params, text), this.userId),
    this.userId,
  );
  if (sessionData) this.added('sessiondata', sessionData._id, sessionData);
  return cursors;
});

Meteor.publish('sessionData', async function(sessionId: string) {
  check(sessionId, String);
  const userId = this.userId;

  if (!userId) {
    return [];
  }

  // Return the cursor immediately - data should already be in the collection
  // from the globalSearch publication or earlier searches
  const cursor = SessionData.find({ userId, sessionId });
  return cursor;
});

async function buildSelector(queryParams: QueryParams, userId: string) {
  const errors = new QueryErrors();

  let selector: MongoQuery = {};

  // `selector` is not a declared QueryParams field; this pre-existing read
  // yields undefined unless a caller attached one, hence `any`.
  if ((queryParams as any).selector) {
    selector = (queryParams as any).selector;
  } else {
    const boardsSelector: MongoQuery = {};

    let archived: boolean | null = false;
    let endAt: MongoQuery | null = null;
    if (queryParams.hasOperator(OPERATOR_STATUS)) {
      queryParams.getPredicates(OPERATOR_STATUS).forEach((status: string) => {
        if (status === PREDICATE_ARCHIVED) {
          archived = true;
        } else if (status === PREDICATE_ALL) {
          archived = null;
        } else if (status === PREDICATE_ENDED) {
          endAt = { $nin: [null, ''] };
        } else if ([PREDICATE_PRIVATE, PREDICATE_PUBLIC].includes(status)) {
          boardsSelector.permission = status;
        }
      });
    }

    if (queryParams.hasOperator(OPERATOR_ORG)) {
      const orgs: string[] = [];
      for (const name of queryParams.getPredicates(OPERATOR_ORG)) {
        const org = await ReactiveCache.getOrg({
          $or: [
            { orgDisplayName: name },
            { orgShortName: name }
          ]
        });
        if (org) {
          orgs.push(org._id);
        } else {
          errors.addNotFound(OPERATOR_ORG, name);
        }
      }
      if (orgs.length) {
        boardsSelector.orgs = {
          $elemMatch: { orgId: { $in: orgs }, isActive: true }
        };
      }
    }

    if (queryParams.hasOperator(OPERATOR_TEAM)) {
      const teams: string[] = [];
      for (const name of queryParams.getPredicates(OPERATOR_TEAM)) {
        const team = await ReactiveCache.getTeam({
          $or: [
            { teamDisplayName: name },
            { teamShortName: name }
          ]
        });
        if (team) {
          teams.push(team._id);
        } else {
          errors.addNotFound(OPERATOR_TEAM, name);
        }
      }
      if (teams.length) {
        boardsSelector.teams = {
          $elemMatch: { teamId: { $in: teams }, isActive: true }
        };
      }
    }

    selector = {
      type: 'cardType-card',
      // boardId: { $in: Boards.userBoardIds(userId) },
      $and: [],
    };

    if (archived !== null) {
      if (archived) {
        selector.boardId = {
          $in: await (Boards as any).userBoardIds(userId, null, boardsSelector),
        };
        selector.$and.push({
          $or: [
            {
              boardId: {
                $in: await (Boards as any).userBoardIds(userId, archived, boardsSelector),
              },
            },
            { swimlaneId: { $in: (Swimlanes as any).userArchivedSwimlaneIds(userId) } },
            { listId: { $in: (Lists as any).userArchivedListIds(userId) } },
            { archived: true },
          ],
        });
      } else {
        selector.boardId = {
          $in: await (Boards as any).userBoardIds(userId, false, boardsSelector),
        };
        selector.swimlaneId = { $nin: await (Swimlanes as any).archivedSwimlaneIds() };
        selector.listId = { $nin: await (Lists as any).archivedListIds() };
        selector.archived = false;
      }
    } else {
      const userBoardIds = await (Boards as any).userBoardIds(userId, null, boardsSelector);
      selector.boardId = {
        $in: userBoardIds,
      };
    }
    if (endAt !== null) {
      selector.endAt = endAt;
    }

    if (queryParams.hasOperator(OPERATOR_BOARD)) {
      const queryBoards: string[] = [];
      for (const query of queryParams.getPredicates(OPERATOR_BOARD)) {
        const boards = await (Boards as any).userSearch(userId, {
          title: new RegExp(escapeForRegex(query), 'i'),
        });
        if (boards.length) {
          boards.forEach((board: { _id: string }) => {
            queryBoards.push(board._id);
          });
        } else {
          errors.addNotFound(OPERATOR_BOARD, query);
        }
      }

      selector.boardId.$in = queryBoards;
    }

    if (queryParams.hasOperator(OPERATOR_SWIMLANE)) {
      const querySwimlanes: string[] = [];
      for (const query of queryParams.getPredicates(OPERATOR_SWIMLANE)) {
        const swimlanes = await ReactiveCache.getSwimlanes({
          title: new RegExp(escapeForRegex(query), 'i'),
        });
        if (swimlanes.length) {
          swimlanes.forEach((swim: { _id: string }) => {
            querySwimlanes.push(swim._id);
          });
        } else {
          errors.addNotFound(OPERATOR_SWIMLANE, query);
        }
      }

      // eslint-disable-next-line no-prototype-builtins
      if (!selector.swimlaneId.hasOwnProperty('swimlaneId')) {
        selector.swimlaneId = { $in: [] };
      }
      selector.swimlaneId.$in = querySwimlanes;
    }

    if (queryParams.hasOperator(OPERATOR_LIST)) {
      const queryLists: string[] = [];
      for (const query of queryParams.getPredicates(OPERATOR_LIST)) {
        const lists = await ReactiveCache.getLists({
          title: new RegExp(escapeForRegex(query), 'i'),
        });
        if (lists.length) {
          lists.forEach((list: { _id: string }) => {
            queryLists.push(list._id);
          });
        } else {
          errors.addNotFound(OPERATOR_LIST, query);
        }
      }

      // eslint-disable-next-line no-prototype-builtins
      if (!selector.hasOwnProperty('listId')) {
        selector.listId = { $in: [] };
      }
      selector.listId.$in = queryLists;
    }

    if (queryParams.hasOperator(OPERATOR_COMMENT)) {
      const commentsFound = typeof (CardComments as any).textSearch === 'function' ? await (CardComments as any).textSearch(
        userId,
        queryParams.getPredicates(OPERATOR_COMMENT),
      ) : [];
      const cardIds = commentsFound.map((com: { cardId: string }) => com.cardId);
      if (cardIds.length) {
        selector._id = { $in: cardIds };
      } else {
        queryParams.getPredicates(OPERATOR_COMMENT).forEach((comment: string) => {
          errors.addNotFound(OPERATOR_COMMENT, comment);
        });
      }
    }

    [OPERATOR_DUE, OPERATOR_CREATED_AT, OPERATOR_MODIFIED_AT].forEach(field => {
      if (queryParams.hasOperator(field)) {
        selector[field] = {};
        const predicate = queryParams.getPredicate(field);
        selector[field][predicate.operator] = new Date(predicate.value);
      }
    });

    const queryUsers: MongoQuery = {};
    queryUsers[OPERATOR_ASSIGNEE] = [];
    queryUsers[OPERATOR_MEMBER] = [];
    queryUsers[OPERATOR_CREATOR] = [];

    if (queryParams.hasOperator(OPERATOR_USER)) {
      const users: string[] = [];
      for (const username of queryParams.getPredicates(OPERATOR_USER)) {
        const user = await ReactiveCache.getUser({ username });
        if (user) {
          users.push(user._id);
        } else {
          errors.addNotFound(OPERATOR_USER, username);
        }
      }
      if (users.length) {
        selector.$and.push({
          $or: [{ members: { $in: users } }, { assignees: { $in: users } }],
        });
      }
    }

    for (const key of [OPERATOR_MEMBER, OPERATOR_ASSIGNEE, OPERATOR_CREATOR]) {
      if (queryParams.hasOperator(key)) {
        const users: string[] = [];
        for (const username of queryParams.getPredicates(key)) {
          const user = await ReactiveCache.getUser({ username });
          if (user) {
            users.push(user._id);
          } else {
            errors.addNotFound(key, username);
          }
        }
        if (users.length) {
          selector[key] = { $in: users };
        }
      }
    }

    if (queryParams.hasOperator(OPERATOR_LABEL)) {
      const queryLabels: string[] = [];
      for (const label of queryParams.getPredicates(OPERATOR_LABEL)) {
        let boards = await (Boards as any).userBoards(userId, null, {
          labels: { $elemMatch: { color: label.toLowerCase() } },
        });

        if (boards.length) {
          boards.forEach((board: BoardLabelsDoc) => {
            board.labels
              .filter(boardLabel => {
                return boardLabel.color === label.toLowerCase();
              })
              .forEach(boardLabel => {
                queryLabels.push(boardLabel._id);
              });
          });
        } else {
          const reLabel = new RegExp(escapeForRegex(label), 'i');
          boards = await (Boards as any).userBoards(userId, null, {
            labels: { $elemMatch: { name: reLabel } },
          });

          if (boards.length) {
            boards.forEach((board: BoardLabelsDoc) => {
              board.labels
                .filter(boardLabel => {
                  if (!boardLabel.name) {
                    return false;
                  }
                  return boardLabel.name.match(reLabel);
                })
                .forEach(boardLabel => {
                  queryLabels.push(boardLabel._id);
                });
            });
          } else {
            errors.addNotFound(OPERATOR_LABEL, label);
          }
        }
      }
      if (queryLabels.length) {
        selector.labelIds = { $in: [...new Set(queryLabels)] };
      }
    }

    if (queryParams.hasOperator(OPERATOR_HAS)) {
      for (const has of queryParams.getPredicates(OPERATOR_HAS)) {
        switch (has.field) {
          case PREDICATE_ATTACHMENT:
            selector.$and.push({
              _id: {
                $in: (await ReactiveCache.getAttachments({}, { fields: { cardId: 1 } })).map(
                  (a: { cardId: string }) => a.cardId,
                ),
              },
            });
            break;
          case PREDICATE_CHECKLIST:
            selector.$and.push({
              _id: {
                $in: (await ReactiveCache.getChecklists({}, { fields: { cardId: 1 } })).map(
                  (a: { cardId: string }) => a.cardId,
                ),
              },
            });
            break;
          case PREDICATE_DESCRIPTION:
          case PREDICATE_START_AT:
          case PREDICATE_DUE_AT:
          case PREDICATE_END_AT:
            if (has.exists) {
              selector[has.field] = { $exists: true, $nin: [null, ''] };
            } else {
              selector[has.field] = { $in: [null, ''] };
            }
            break;
          case PREDICATE_ASSIGNEES:
          case PREDICATE_MEMBERS:
            if (has.exists) {
              selector[has.field] = { $exists: true, $nin: [null, []] };
            } else {
              selector[has.field] = { $in: [null, []] };
            }
            break;
        }
      }
    }

    if (queryParams.text) {
      const regex = new RegExp(escapeForRegex(queryParams.text), 'i');

      const items = await ReactiveCache.getChecklistItems(
        { title: regex },
        { fields: { cardId: 1, checklistId: 1 } },
      );
      const checklists = await ReactiveCache.getChecklists(
        {
          $or: [
            { title: regex },
            { _id: { $in: items.map((item: { checklistId: string }) => item.checklistId) } },
          ],
        },
        { fields: { cardId: 1 } },
      );

      const attachments = await ReactiveCache.getAttachments({ 'original.name': regex });

      // #5910: free-text search must match text inside card comments, for BOTH
      // global and board-level (board:) search. Board scoping is preserved by the
      // surrounding `selector.boardId` / `$and` constraints, so a comment match on
      // a card outside the searched board is naturally excluded. This mirrors the
      // pure `cardMatchesQuery({title, description, commentTexts}, query)` helper
      // in server/lib/cardMatch.js, which is the single source of truth for the
      // (title OR description OR comment) matching rule and is unit-tested.
      const comments = await ReactiveCache.getCardComments(
        { text: regex },
        { fields: { cardId: 1 } },
      );

      let cardsSelector: MongoQuery[] = [
          { title: regex },
          { description: regex },
          { customFields: { $elemMatch: { value: regex } } },
          { _id: { $in: checklists.map((list: { cardId: string }) => list.cardId) } },
          { _id: { $in: attachments.map((attach: { cardId: string }) => attach.cardId) } },
          // #5910: include cards whose comment text matches (board-scoped).
          { _id: { $in: comments.map((com: { cardId: string }) => com.cardId) } },
        ];
      if (queryParams.text === "false" || queryParams.text === "true") {
        cardsSelector.push({ customFields: { $elemMatch: { value: queryParams.text === "true" } } } );
      }
      selector.$and.push({ $or: cardsSelector });
    }

    if (queryParams.hasOperator(OPERATOR_TITLE)) {
      const regexes = queryParams.getPredicates(OPERATOR_TITLE).map((t: string) => new RegExp(escapeForRegex(t), 'i'));
      selector.$and.push({ $or: regexes.map((regex: RegExp) => ({ title: regex })) });
    }

    if (queryParams.hasOperator(OPERATOR_DESCRIPTION)) {
      const regexes = queryParams.getPredicates(OPERATOR_DESCRIPTION).map((t: string) => new RegExp(escapeForRegex(t), 'i'));
      selector.$and.push({ $or: regexes.map((regex: RegExp) => ({ description: regex })) });
    }

    if (queryParams.hasOperator(OPERATOR_CUSTOMFIELD)) {
      const regexes = queryParams.getPredicates(OPERATOR_CUSTOMFIELD).map((t: string) => new RegExp(escapeForRegex(t), 'i'));
      selector.$and.push({ $or: regexes.map((regex: RegExp) => ({ customFields: { $elemMatch: { value: regex } } })) });
    }

    if (queryParams.hasOperator(OPERATOR_ATTACHMENT_TEXT)) {
      for (const t of queryParams.getPredicates(OPERATOR_ATTACHMENT_TEXT)) {
        const regex = new RegExp(escapeForRegex(t), 'i');
        const attachments = await ReactiveCache.getAttachments({ 'original.name': regex });
        if (attachments.length) {
          selector.$and.push({ _id: { $in: attachments.map((attach: { cardId: string }) => attach.cardId) } });
        } else {
          selector.$and.push({ _id: null });
        }
      }
    }

    if (queryParams.hasOperator(OPERATOR_CHECKLIST_TEXT)) {
      for (const t of queryParams.getPredicates(OPERATOR_CHECKLIST_TEXT)) {
        const regex = new RegExp(escapeForRegex(t), 'i');
        const items = await ReactiveCache.getChecklistItems(
          { title: regex },
          { fields: { cardId: 1, checklistId: 1 } },
        );
        const checklists = await ReactiveCache.getChecklists(
          {
            $or: [
              { title: regex },
              { _id: { $in: items.map((item: { checklistId: string }) => item.checklistId) } },
            ],
          },
          { fields: { cardId: 1 } },
        );
        if (checklists.length) {
          selector.$and.push({ _id: { $in: checklists.map((list: { cardId: string }) => list.cardId) } });
        } else {
          selector.$and.push({ _id: null });
        }
      }
    }

    if (selector.$and.length === 0) {
      delete selector.$and;
    }
  }

  const query = new Query();
  query.selector = selector;
  query.setQueryParams(queryParams);
  query._errors = errors;

  return query;
}

function buildProjection(query: Query) {

  let skip = 0;
  // `skip` is not a declared QueryParams field; this pre-existing read yields
  // undefined at runtime (skip is carried on the projection instead), hence `any`.
  if ((query.getQueryParams() as any).skip) {
    skip = (query.getQueryParams() as any).skip;
  }
  let limit = DEFAULT_LIMIT;
  const configLimit = parseInt(process.env.RESULTS_PER_PAGE || '', 10);
  if (!isNaN(configLimit) && configLimit > 0) {
    limit = configLimit;
  }

  if (query.getQueryParams().hasOperator(OPERATOR_LIMIT)) {
    limit = query.getQueryParams().getPredicate(OPERATOR_LIMIT);
  }

  const projection: MongoQuery = {
    fields: {
      _id: 1,
      archived: 1,
      boardId: 1,
      swimlaneId: 1,
      listId: 1,
      title: 1,
      type: 1,
      sort: 1,
      members: 1,
      assignees: 1,
      colors: 1,
      dueAt: 1,
      createdAt: 1,
      modifiedAt: 1,
      labelIds: 1,
      customFields: 1,
      userId: 1,
      description: 1,
    },
    sort: {
      boardId: 1,
      swimlaneId: 1,
      listId: 1,
      sort: 1,
    },
    skip,
  };
  if (limit > 0) {
    projection.limit = limit;
  }

  if (query.getQueryParams().hasOperator(OPERATOR_SORT)) {
    const order =
      query.getQueryParams().getPredicate(OPERATOR_SORT).order ===
      ORDER_ASCENDING
        ? 1
        : -1;
    switch (query.getQueryParams().getPredicate(OPERATOR_SORT).name) {
      case PREDICATE_DUE_AT:
        projection.sort = {
          dueAt: order,
          boardId: 1,
          swimlaneId: 1,
          listId: 1,
          sort: 1,
        };
        break;
      case PREDICATE_MODIFIED_AT:
        projection.sort = {
          modifiedAt: order,
          boardId: 1,
          swimlaneId: 1,
          listId: 1,
          sort: 1,
        };
        break;
      case PREDICATE_CREATED_AT:
        projection.sort = {
          createdAt: order,
          boardId: 1,
          swimlaneId: 1,
          listId: 1,
          sort: 1,
        };
        break;
      case PREDICATE_SYSTEM:
        projection.sort = {
          boardId: order,
          swimlaneId: order,
          listId: order,
          modifiedAt: order,
          sort: order,
        };
        break;
    }
  }



  query.projection = projection;

  return query;
}

async function buildQuery(queryParams: QueryParams, userId: string) {
  const query = await buildSelector(queryParams, userId);

  return buildProjection(query);
}

Meteor.publish('brokenCards', async function(sessionId: string) {
  check(sessionId, String);

  const params = new QueryParams();
  params.addPredicate(OPERATOR_STATUS, PREDICATE_ALL);
  // `this.userId` is `string | null`; the query helpers accept the null at
  // runtime (an unauthenticated subscription simply matches no boards).
  const query = await buildQuery(params, this.userId as string);
  query.selector.$or = [
    { boardId: { $in: [null, ''] } },
    { swimlaneId: { $in: [null, ''] } },
    { listId: { $in: [null, ''] } },
    { type: { $nin: CARD_TYPES } },
  ];

  const { cursors: brokenCursors, sessionData: brokenSessionData } = await findCards(sessionId, query, this.userId as string);
  if (brokenSessionData) this.added('sessiondata', brokenSessionData._id, brokenSessionData);
  return brokenCursors;
});

Meteor.publish('nextPage', async function(sessionId: string) {
  check(sessionId, String);

  const session = await ReactiveCache.getSessionData({ sessionId });
  const projection = session.getProjection();
  projection.skip = session.lastHit;

  const { cursors: nextCursors, sessionData: nextSessionData } = await findCards(sessionId, new Query(session.getSelector(), projection), this.userId as string);
  if (nextSessionData) this.added('sessiondata', nextSessionData._id, nextSessionData);
  return nextCursors;
});

Meteor.publish('previousPage', async function(sessionId: string) {
  check(sessionId, String);

  const session = await ReactiveCache.getSessionData({ sessionId });
  const projection = session.getProjection();
  projection.skip = session.lastHit - session.resultsCount - projection.limit;

  const { cursors: prevCursors, sessionData: prevSessionData } = await findCards(sessionId, new Query(session.getSelector(), projection), this.userId as string);
  if (prevSessionData) this.added('sessiondata', prevSessionData._id, prevSessionData);
  return prevCursors;
});

async function findCards(sessionId: string, query: Query, userId: string) {
  let textMatches = query.getQueryParams().text;
  let isTextSearch = !!textMatches;
  let dbProjection = query.projection;
  if (isTextSearch) {
    dbProjection = Object.assign({}, query.projection);
    delete dbProjection.limit;
    delete dbProjection.skip;
  }

  let cards = await ReactiveCache.getCards(query.selector, dbProjection, true);
  let totalCardsCount = cards ? (typeof cards.countAsync === 'function' ? await cards.countAsync() : cards.count()) : 0;
  let orderedIds: string[] = [];

  if (isTextSearch && totalCardsCount > 0) {
    let fetched = typeof cards.fetchAsync === 'function' ? await cards.fetchAsync() : cards.fetch();
    const regex = new RegExp(escapeForRegex(textMatches), 'i');
    fetched.forEach((c: SearchCardDoc) => {
      c._score = 0;
      if (c.title && regex.test(c.title)) c._score += 10;
      else if (c.description && regex.test(c.description)) c._score += 5;
      else if (c.customFields && c.customFields.some(f => f.value && regex.test(String(f.value)))) c._score += 1;
    });
    fetched.sort((a: SearchCardDoc, b: SearchCardDoc) => {
      if (b._score !== a._score) return (b._score ?? 0) - (a._score ?? 0);
      return (a.title || '').localeCompare(b.title || '');
    });

    const skip = query.projection.skip || 0;
    const limit = query.projection.limit || 25;
    const page = fetched.slice(skip, skip + limit);
    orderedIds = page.map((c: { _id: string }) => c._id);

    // override the cursor to only contain the paginated results for this page
    cards = await ReactiveCache.getCards({ _id: { $in: orderedIds } }, { fields: query.projection.fields }, true);
  }



  const update = {
    $set: {
      totalHits: 0,
      lastHit: 0,
      resultsCount: 0,
      cards: [] as string[],
      selector: (SessionData as any).pickle(query.selector),
      projection: (SessionData as any).pickle(query.projection),
      errors: query.errors(),
      modifiedAt: new Date()
    },
  };

  if (cards && totalCardsCount > 0) {
    update.$set.totalHits = totalCardsCount;
    update.$set.lastHit =
      query.projection.skip + query.projection.limit < totalCardsCount
        ? query.projection.skip + query.projection.limit
        : totalCardsCount;

    // For text search preserve our sorted IDs, else grab from db order
    if (isTextSearch) {
      update.$set.cards = orderedIds;
    } else {
      const cardArray = typeof cards.fetchAsync === 'function' ? await cards.fetchAsync() : cards.fetch();
      update.$set.cards = cardArray.map((card: { _id: string }) => card._id);
    }
    update.$set.resultsCount = update.$set.cards.length;
  }


  const upsertResult = typeof SessionData.upsertAsync === 'function' ? await SessionData.upsertAsync({ userId, sessionId }, update) : SessionData.upsert({ userId, sessionId }, update);

  // Check if the session data was actually stored
  const storedSessionData = typeof SessionData.findOneAsync === 'function' ? await SessionData.findOneAsync({ userId, sessionId }) : SessionData.findOne({ userId, sessionId });

  // remove old session data
  const removeSelector = {
    userId,
    modifiedAt: {
      $lt: new Date(
        subtract(now(), 1, 'day').toISOString(),
      ),
    },
  };
  if (typeof SessionData.removeAsync === 'function') {
    await SessionData.removeAsync(removeSelector);
  } else {
    SessionData.remove(removeSelector);
  }

  if (cards && totalCardsCount > 0) {
    const boards: string[] = [];
    const swimlanes: string[] = [];
    const lists: string[] = [];
    const customFieldIds: string[] = [];
    const users = [userId];

    const cardArray = typeof cards.fetchAsync === 'function' ? await cards.fetchAsync() : cards.fetch();
    const cardIds = cardArray.map((c: { _id: string }) => c._id);

    cardArray.forEach((card: SearchCardDoc) => {
      if (card.boardId) boards.push(card.boardId);
      if (card.swimlaneId) swimlanes.push(card.swimlaneId);
      if (card.listId) lists.push(card.listId);
      if (card.userId) {
        users.push(card.userId);
      }
      if (card.members) {
        card.members.forEach(userId => {
          users.push(userId);
        });
      }
      if (card.assignees) {
        card.assignees.forEach(userId => {
          users.push(userId);
        });
      }
      if (card.customFields) {
        card.customFields.forEach(field => {
          customFieldIds.push(field._id);
        });
      }
    });

    const fields = {
      _id: 1,
      title: 1,
      archived: 1,
      sort: 1,
      type: 1,
    };
    const attachmentsResult = await ReactiveCache.getAttachments({ 'meta.cardId': { $in: cardIds } }, {}, true);
    // Return all cursors except sessiondata - we'll add sessiondata separately after fetch
    return {
      cursors: [
        cards,
        await ReactiveCache.getBoards({ _id: { $in: boards } }, { fields: { ...fields, labels: 1, color: 1 } }, true),
        await ReactiveCache.getSwimlanes({ _id: { $in: swimlanes } }, { fields: { ...fields, color: 1 } }, true),
        await ReactiveCache.getLists({ _id: { $in: lists } }, { fields: { ...fields, color: 1 } }, true),
        await ReactiveCache.getCustomFields({ _id: { $in: customFieldIds } }, {}, true),
        await ReactiveCache.getUsers({ _id: { $in: users } }, { fields: (Users as any).safeFields }, true),
        await ReactiveCache.getChecklists({ cardId: { $in: cardIds } }, {}, true),
        await ReactiveCache.getChecklistItems({ cardId: { $in: cardIds } }, {}, true),
        attachmentsResult.cursor || attachmentsResult,
        await ReactiveCache.getCardComments({ cardId: { $in: cardIds } }, {}, true),
      ],
      sessionData: storedSessionData,
    };
  } else {
    return {
      cursors: [],
      sessionData: storedSessionData,
    };
  }
}

// Admin "Cards report" — a flat, paginated listing of every card with its
// board/swimlane/list/member context. Uses plain server-side limit/skip just
// like the org/team/people admin lists, so only the current page is ever sent
// to the browser instead of the whole Cards collection.
Meteor.publish('cardsReport', async function(searchTerm: string | null | undefined = '', limit: number, skip: number | null | undefined = 0) {
  check(searchTerm, Match.OneOf(String, null, undefined));
  check(limit, Number);
  check(skip, Match.OneOf(Number, null, undefined));
  if (!this.userId || !(await ReactiveCache.getUser(this.userId))?.isAdmin) {
    return this.ready();
  }

  const query: MongoQuery = {};
  if (searchTerm) {
    query.title = new RegExp(searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  }

  const cards = await ReactiveCache.getCards(
    query,
    { sort: { boardId: 1, sort: 1 }, limit, skip: skip || 0 },
    true,
  );

  const boardIds = new Set<string>();
  const listIds = new Set<string>();
  const swimlaneIds = new Set<string>();
  const userIds = new Set<string>();
  cards.forEach((card: CardReportDoc) => {
    if (card.boardId) boardIds.add(card.boardId);
    if (card.listId) listIds.add(card.listId);
    if (card.swimlaneId) swimlaneIds.add(card.swimlaneId);
    (card.members || []).forEach(userId => userIds.add(userId));
    (card.assignees || []).forEach(userId => userIds.add(userId));
  });

  return [
    cards,
    await ReactiveCache.getBoards({ _id: { $in: [...boardIds] } }, { fields: { title: 1 } }, true),
    await ReactiveCache.getLists({ _id: { $in: [...listIds] } }, { fields: { title: 1 } }, true),
    await ReactiveCache.getSwimlanes({ _id: { $in: [...swimlaneIds] } }, { fields: { title: 1 } }, true),
    await ReactiveCache.getUsers({ _id: { $in: [...userIds] } }, { fields: (Users as any).safeFields }, true),
  ];
});

Meteor.methods({
  async getCardsReportCount(searchTerm: string | null | undefined = '') {
    check(searchTerm, Match.OneOf(String, null, undefined));
    if (!this.userId || !(await ReactiveCache.getUser(this.userId))?.isAdmin) {
      throw new Meteor.Error('not-authorized');
    }
    const query: MongoQuery = {};
    if (searchTerm) {
      query.title = new RegExp(searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    }
    const cursor = await ReactiveCache.getCards(query, {}, true);
    return typeof cursor.countAsync === 'function' ? await cursor.countAsync() : cursor.count();
  },
});

// A custom-field entry on a card; `value` may hold any supported field value
// type (text, number, date, boolean, dropdown id), hence `any`.
interface CardCustomFieldRef {
  _id: string;
  value?: any;
}

// A card document read back from the Cards collection for search-result scoring
// and cursor assembly; `_score` is a synthetic ranking field added at runtime
// during text search.
interface SearchCardDoc {
  _id: string;
  _score?: number;
  title?: string;
  description?: string;
  boardId?: string;
  swimlaneId?: string;
  listId?: string;
  userId?: string;
  members?: string[];
  assignees?: string[];
  customFields?: CardCustomFieldRef[];
}

// A board label, matched by color or name when resolving label search operators.
interface BoardLabelRef {
  _id: string;
  color?: string;
  name?: string;
}

// A board document exposing just its labels, used when resolving label queries.
interface BoardLabelsDoc {
  labels: BoardLabelRef[];
}

// A card document for the admin cards report, referenced only for its board /
// list / swimlane context and member/assignee ids.
interface CardReportDoc {
  boardId?: string;
  listId?: string;
  swimlaneId?: string;
  members?: string[];
  assignees?: string[];
}
