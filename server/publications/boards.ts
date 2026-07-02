// This is the publication used to display the board list. We publish all the
// non-archived boards:
// 1. that the user is a member of
// 2. the user has starred
import { Meteor } from 'meteor/meteor';
import { check, Match } from 'meteor/check';
import { ReactiveCache } from '/imports/reactiveCache';
import { publishComposite } from 'meteor/reywood:publish-composite';
import { findWhere } from '/imports/lib/collectionHelpers';
import Users from "../../models/users";
import Org from "../../models/org";
import Team from "../../models/team";
import Attachments from '../../models/attachments';
import Boards from '/models/boards';
import { BoardMemberFull } from './types';

publishComposite('boards', function() {
  const userId = this.userId;
  // Ensure that the user is connected. If it is not, we need to return an empty
  // array to tell the client to remove the previously published docs.
  if (!Match.test(userId, String) || !userId) {
    return [];
  }

  return {
    async find() {
      // Publish a *live* cursor matching the boards the user can see, rather
      // than a one-time snapshot of ids (`_id: { $in: [...] }`). A snapshot
      // never picks up boards created after the client subscribes (e.g. a
      // background Trello import), so they only appeared after a page reload.
      // This selector mirrors Boards.userBoards(): a board the user becomes a
      // member of is matched and streamed automatically.
      const user = await ReactiveCache.getUser(userId);
      if (!user) {
        return [];
      }
      const selector = {
        archived: false,
        // #5850: also publish the user's template boards (template-container) so
        // the All Boards / Templates view can list them; the client filters by
        // type per sub-view.
        type: { $in: ['board', 'template-container'] },
        $or: [
          { permission: 'public' },
          { members: { $elemMatch: { userId, isActive: true } } },
          { orgs: { $elemMatch: { orgId: { $in: user.orgIds() }, isActive: true } } },
          { teams: { $elemMatch: { teamId: { $in: user.teamIds() }, isActive: true } } },
          // #5850: domain-based board sharing.
          { domains: { $elemMatch: { domain: { $in: user.emailDomains() }, isActive: true } } },
        ],
      };
      return await ReactiveCache.getBoards(
        selector,
        {
          sort: { sort: 1 /* boards default sorting */ },
        },
        true,
      );
    },
    children: [
      {
        async find(board) {
          // Publish lists with extended fields for proper sync
          // Including swimlaneId, modifiedAt, and _updatedAt for list order changes
          return await ReactiveCache.getLists(
            { boardId: board._id, archived: false },
            {
              fields: {
                _id: 1,
                title: 1,
                boardId: 1,
                swimlaneId: 1,
                archived: 1,
                sort: 1,
                color: 1,
                modifiedAt: 1,
                _updatedAt: 1,  // Hidden field to trigger updates
              }
            },
            true,
          );
        }
      },
      {
        async find(board) {
          return await ReactiveCache.getCards(
            { boardId: board._id, archived: false },
            {
              fields: {
                _id: 1,
                boardId: 1,
                listId: 1,
                archived: 1,
                sort: 1
              }
            },
            true,
          );
        }
      }
    ]
  };
});

Meteor.publish('boardsReport', async function(searchTerm: string | null | undefined = '', limit: number, skip: number | null | undefined = 0) {
  check(searchTerm, Match.OneOf(String, null, undefined));
  check(limit, Number);
  check(skip, Match.OneOf(Number, null, undefined));
  const userId = this.userId;
  // Ensure that the user is connected. If it is not, we need to return an empty
  // array to tell the client to remove the previously published docs.
  if (!Match.test(userId, String) || !userId) return [];

  // `userBoardIds` is a runtime static on the Boards collection (models/boards),
  // not part of the typed Mongo.Collection, hence `any`.
  const query: MongoQuery = { _id: { $in: await (Boards as any).userBoardIds(userId, null) } };
  if (searchTerm) {
    query.title = new RegExp(searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  }

  const boards = await ReactiveCache.getBoards(
    query,
    {
      fields: {
        _id: 1,
        boardId: 1,
        archived: 1,
        slug: 1,
        title: 1,
        description: 1,
        color: 1,
        backgroundImageURL: 1,
        members: 1,
        orgs: 1,
        teams: 1,
        permission: 1,
        type: 1,
        sort: 1,
      },
      sort: { sort: 1 /* boards default sorting */ },
      limit,
      skip: skip || 0,
    },
    true,
  );

  const userIds: string[] = [];
  const orgIds: string[] = [];
  const teamIds: string[] = [];
  boards.forEach((board: BoardReportDoc) => {
    if (board.members) {
      board.members.forEach((member: BoardMemberRef) => {
        userIds.push(member.userId);
      });
    }
    if (board.orgs) {
      board.orgs.forEach((org: BoardOrgRef) => {
        orgIds.push(org.orgId);
      });
    }
    if (board.teams) {
      board.teams.forEach((team: BoardTeamRef) => {
        teamIds.push(team.teamId);
      });
    }
  })

  const ret = [
    boards,
    // `safeFields` is a runtime static on the Users collection (models/users),
    // not part of the typed Mongo.Collection, hence `any`.
    await ReactiveCache.getUsers({ _id: { $in: userIds } }, { fields: (Users as any).safeFields }, true),
    await ReactiveCache.getTeams({ _id: { $in: teamIds } }, {}, true),
    await ReactiveCache.getOrgs({ _id: { $in: orgIds } }, {}, true),
  ]
  return ret;
});

Meteor.methods({
  async getBoardsReportCount(searchTerm: string | null | undefined = '') {
    check(searchTerm, Match.OneOf(String, null, undefined));
    const user = await ReactiveCache.getCurrentUser();
    if (!user || !user.isAdmin) {
      throw new Meteor.Error('not-authorized');
    }
    // `userBoardIds` is a runtime static on the Boards collection (see above).
    const query: MongoQuery = { _id: { $in: await (Boards as any).userBoardIds(this.userId, null) } };
    if (searchTerm) {
      query.title = new RegExp(searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    }
    const cursor = await ReactiveCache.getBoards(query, {}, true);
    return typeof cursor.countAsync === 'function' ? await cursor.countAsync() : cursor.count();
  },

  // #5799: compute one page of the current user's All Boards grid on the server,
  // so the client can render only the current page of board icons instead of all
  // of them. Returns the ordered board ids for the page plus the total count for
  // the active filter. Visibility, menu/workspace filtering, search and sort are
  // all resolved here against the *effective* current user — so it also works
  // when a GlobalAdmin impersonates a user (impersonate() calls this.setUserId(),
  // so this.userId / getCurrentUser() are the impersonated user).
  async getAllBoardsPage(params: AllBoardsPageParams) {
    check(params, {
      search: Match.Optional(String),
      sortBy: Match.Optional(String),
      menu: Match.Optional(String),
      page: Match.Optional(Number),
      perPage: Match.Optional(Number),
    });

    const userId = this.userId;
    if (!Match.test(userId, String) || !userId) {
      return { ids: [], total: 0 };
    }
    const user = await ReactiveCache.getUser(userId);
    if (!user) {
      return { ids: [], total: 0 };
    }

    const perPage = Math.min(200, Math.max(1, params.perPage || 25));
    const page = Math.max(1, params.page || 1);
    const search = (params.search || '').trim();
    const sortBy = params.sortBy && ['title-asc', 'title-desc'].includes(params.sortBy)
      ? params.sortBy
      : 'title-asc';
    const menu = params.menu || 'remaining';

    // Same visibility selector as the live `boards` publication.
    const selector: MongoQuery = {
      archived: false,
      type: { $in: ['board', 'template-container'] },
      $or: [
        { permission: 'public' },
        { members: { $elemMatch: { userId, isActive: true } } },
        { orgs: { $elemMatch: { orgId: { $in: user.orgIds() }, isActive: true } } },
        { teams: { $elemMatch: { teamId: { $in: user.teamIds() }, isActive: true } } },
        { domains: { $elemMatch: { domain: { $in: user.emailDomains() }, isActive: true } } },
      ],
    };
    if (search) {
      selector.title = new RegExp(
        search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
        'i',
      );
    }

    // Lightweight fetch: only the fields needed to filter/sort/paginate. The
    // board icons themselves are rendered client-side from the live `boards`
    // subscription, keyed by the ids returned here.
    let boards = await ReactiveCache.getBoards(
      selector,
      { fields: { _id: 1, title: 1, type: 1 } },
      true,
    );
    boards = typeof boards.fetchAsync === 'function'
      ? await boards.fetchAsync()
      : (typeof boards.fetch === 'function' ? boards.fetch() : boards);

    // Menu / workspace filtering uses the user's profile maps. A search spans
    // every category, so it skips the menu filter (matching the client).
    const profile = user.profile || {};
    const assignments = profile.boardWorkspaceAssignments || {};
    const starred = profile.starredBoards || [];
    if (!search) {
      if (menu === 'starred') {
        boards = boards.filter((b: BoardPageDoc) => starred.includes(b._id));
      } else if (menu === 'templates') {
        boards = boards.filter((b: BoardPageDoc) => b.type === 'template-container');
      } else if (menu === 'remaining') {
        boards = boards.filter(
          (b: BoardPageDoc) => !assignments[b._id] && b.type !== 'template-container',
        );
      } else {
        // menu is a workspace id
        boards = boards.filter((b: BoardPageDoc) => assignments[b._id] === menu);
      }
    }

    boards.sort((a: BoardPageDoc, b: BoardPageDoc) => {
      const cmp = (a.title || '').localeCompare(b.title || '', undefined, {
        sensitivity: 'base',
      });
      return sortBy === 'title-desc' ? -cmp : cmp;
    });

    const total = boards.length;
    const start = (page - 1) * perPage;
    const ids = boards.slice(start, start + perPage).map((b: BoardPageDoc) => b._id);
    return { ids, total };
  },
});

Meteor.publish('archivedBoards', async function() {
  const userId = this.userId;
  if (!Match.test(userId, String)) return [];

  const ret = await ReactiveCache.getBoards(
    {
      archived: true,
      type: { $nin: ['template-container', 'template-board'] },
      // #4255: only publish archived boards the user can actually delete.
      // Boards.remove is gated by hasAdmin(), which requires an ACTIVE admin
      // member (isActive: true && isAdmin: true). Matching that here — rather
      // than isAdmin alone — stops the archive from listing boards whose delete
      // then fails with "remove failed: Access denied" (an inactive admin).
      members: {
         $elemMatch: {
           userId,
           isActive: true,
           isAdmin: true,
         },
       },
    },
    {
      fields: {
        _id: 1,
        archived: 1,
        slug: 1,
        title: 1,
        createdAt: 1,
        modifiedAt: 1,
        archivedAt: 1,
      },
      sort: { archivedAt: -1, modifiedAt: -1 },
    },
    true,
  );
  return ret;
});

// OPTIMIZED BOARD PUBLICATION
//
// Performance improvements implemented to reduce N+1 query problem:
// - Batches card-related queries (comments, attachments, checklists) instead of querying per-card
// - Uses field projections to minimize data transfer
// - Removed automatic loading of entire linked boards (cardType-linkedBoard)
// - Only loads visible data: cards, comments, attachments, checklists for current board
//
// Estimated improvement:
// - Before: ~800-1000 queries for board with 100 cards
// - After: ~15-20 batched queries for same board (40-50x reduction)
//
// If isArchived = false, this will only return board elements which are not archived.
// If isArchived = true, this will only return board elements which are archived.
publishComposite('board', async function(boardId: string, isArchived: boolean) {
  check(boardId, String);
  check(isArchived, Boolean);

  const thisUserId = this.userId;
  const $or: MongoQuery[] = [{ permission: 'public' }];

  let currUser = (!Match.test(thisUserId, String) || !thisUserId) ? 'undefined' : await ReactiveCache.getUser(thisUserId);
  let orgIdsUserBelongs = currUser !== 'undefined' && currUser.teams !== 'undefined' ? currUser.orgIdsUserBelongs() : '';
  let teamIdsUserBelongs = currUser !== 'undefined' && currUser.teams !== 'undefined' ? currUser.teamIdsUserBelongs() : '';
  let orgsIds: string[] = [];
  let teamsIds: string[] = [];
  // #5850: the user's email domain(s) for domain-based board sharing.
  let emailDomains = currUser !== 'undefined' && typeof currUser.emailDomains === 'function'
    ? currUser.emailDomains()
    : [];

  if (orgIdsUserBelongs && orgIdsUserBelongs != '') {
    orgsIds = orgIdsUserBelongs.split(',');
  }
  if (teamIdsUserBelongs && teamIdsUserBelongs != '') {
    teamsIds = teamIdsUserBelongs.split(',');
  }

  if (thisUserId) {
    $or.push({ members: { $elemMatch: { userId: thisUserId, isActive: true } } });
    $or.push({ 'orgs.orgId': { $in: orgsIds } });
    $or.push({ 'teams.teamId': { $in: teamsIds } });
    $or.push({ 'domains.domain': { $in: emailDomains } });
  }

  return {
    async find() {
      return await ReactiveCache.getBoards(
        {
          _id: boardId,
          // Template boards are always accessible regardless of archived state.
          // $nor is used because $or is already taken by the access control below.
          $nor: [{ archived: true, type: { $nin: ['template-container', 'template-board'] } }],
          // If the board is not public the user has to be a member of it to see it.
          $or,
        },
        { limit: 1, sort: { sort: 1 /* boards default sorting */ } },
        true,
      );
    },
    children: [
      // Lists
      {
        async find(board) {
          return await ReactiveCache.getLists({ boardId: board._id, archived: isArchived }, {}, true);
        }
      },
      // Swimlanes
      {
        async find(board) {
          return await ReactiveCache.getSwimlanes({ boardId: board._id, archived: isArchived }, {}, true);
        }
      },
      // Integrations
      {
        async find(board) {
          return await ReactiveCache.getIntegrations(
            { boardId: board._id },
            { fields: { token: 0 } },
            true,
          );
        }
      },
      // CardCommentReactions at board level
      {
        async find(board) {
          return await ReactiveCache.getCardCommentReactions({ boardId: board._id }, {}, true);
        }
      },
      // CustomFields
      {
        async find(board) {
          return await ReactiveCache.getCustomFields(
            { boardIds: { $in: [board._id] } },
            { sort: { name: 1 } },
            true,
          );
        }
      },
      // Cards
      {
        async find(board) {
          const cardSelector: MongoQuery = {
            boardId: { $in: [board._id, board.subtasksDefaultBoardId] },
            archived: isArchived,
          };

          // Check if current user has assigned-only permissions
          if (thisUserId && board.members) {
            const member = findWhere<BoardMemberFull>(board.members, { userId: thisUserId, isActive: true });
            if (member && (member.isNormalAssignedOnly || member.isCommentAssignedOnly || member.isReadAssignedOnly)) {
              // User with assigned-only permissions should only see cards assigned to them
              cardSelector.assignees = { $in: [thisUserId] };
            }
          }

          return await ReactiveCache.getCards(cardSelector, {}, true);
        },
        // Comments and attachments are published as CHILDREN of the cards
        // cursor so they react to newly added cards (publish-composite runs them
        // per card as it appears). Checklists and checklist items are instead
        // published below as single board-level cursors filtered by their
        // denormalized boardId — same reactivity for new cards, but one cursor
        // per collection instead of one per card. (They used to be batched at
        // board level with a static `cardId: { $in: cardIds }` snapshot that did
        // not react to new cards, so a new checklist on a new card only appeared
        // after logout/login.)
        children: [
          // CardComments for each card
          {
            async find(card) {
              return await ReactiveCache.getCardComments({ cardId: card._id }, {}, true);
            }
          },
          // Attachments for each card
          {
            async find(card) {
              const result = await ReactiveCache.getAttachments({ 'meta.cardId': card._id }, {}, true);
              return result.cursor || result;
            }
          },
        ]
      },
      // Checklists for the whole board — a single cursor on the denormalized
      // boardId, so checklists on newly added cards publish reactively without a
      // per-card-id snapshot that goes stale.
      {
        async find(board) {
          const boardIds = [board._id];
          if (board.subtasksDefaultBoardId) boardIds.push(board.subtasksDefaultBoardId);
          // Assigned-only members must not receive checklists for cards they are
          // not assigned to; boardId alone cannot express that, so fall back to
          // the assigned cards' ids for those members.
          if (thisUserId && board.members) {
            const member = findWhere<BoardMemberFull>(board.members, { userId: thisUserId, isActive: true });
            if (member && (member.isNormalAssignedOnly || member.isCommentAssignedOnly || member.isReadAssignedOnly)) {
              const cards = await ReactiveCache.getCards(
                { boardId: { $in: boardIds }, archived: isArchived, assignees: { $in: [thisUserId] } },
                { fields: { _id: 1 } },
                false,
              );
              const cardIds = (cards || []).map((c: CardLinkDoc) => c._id);
              return await ReactiveCache.getChecklists({ cardId: { $in: cardIds } }, {}, true);
            }
          }
          return await ReactiveCache.getChecklists({ boardId: { $in: boardIds } }, {}, true);
        }
      },
      // ChecklistItems for the whole board — single cursor on denormalized boardId
      {
        async find(board) {
          const boardIds = [board._id];
          if (board.subtasksDefaultBoardId) boardIds.push(board.subtasksDefaultBoardId);
          if (thisUserId && board.members) {
            const member = findWhere<BoardMemberFull>(board.members, { userId: thisUserId, isActive: true });
            if (member && (member.isNormalAssignedOnly || member.isCommentAssignedOnly || member.isReadAssignedOnly)) {
              const cards = await ReactiveCache.getCards(
                { boardId: { $in: boardIds }, archived: isArchived, assignees: { $in: [thisUserId] } },
                { fields: { _id: 1 } },
                false,
              );
              const cardIds = (cards || []).map((c: CardLinkDoc) => c._id);
              return await ReactiveCache.getChecklistItems({ cardId: { $in: cardIds } }, {}, true);
            }
          }
          return await ReactiveCache.getChecklistItems({ boardId: { $in: boardIds } }, {}, true);
        }
      },
      // Parent cards (for subtasks)
      {
        async find(board) {
          const cardSelector: MongoQuery = {
            boardId: { $in: [board._id, board.subtasksDefaultBoardId] },
            archived: isArchived,
          };

          if (thisUserId && board.members) {
            const member = findWhere<BoardMemberFull>(board.members, { userId: thisUserId, isActive: true });
            if (member && (member.isNormalAssignedOnly || member.isCommentAssignedOnly || member.isReadAssignedOnly)) {
              cardSelector.assignees = { $in: [thisUserId] };
            }
          }

          const cards = await ReactiveCache.getCards(cardSelector, { fields: { _id: 1, parentId: 1 } }, false);
          if (!cards || cards.length === 0) return null;

          const parentIds = cards.filter((c: CardLinkDoc) => c.parentId).map((c: CardLinkDoc) => c.parentId);
          if (parentIds.length === 0) return null;

          return await ReactiveCache.getCards({ _id: { $in: parentIds } }, {}, true);
        }
      },
      // Linked cards (cardType-linkedCard)
      {
        async find(board) {
          const cardSelector: MongoQuery = {
            boardId: { $in: [board._id, board.subtasksDefaultBoardId] },
            archived: isArchived,
          };

          if (thisUserId && board.members) {
            const member = findWhere<BoardMemberFull>(board.members, { userId: thisUserId, isActive: true });
            if (member && (member.isNormalAssignedOnly || member.isCommentAssignedOnly || member.isReadAssignedOnly)) {
              cardSelector.assignees = { $in: [thisUserId] };
            }
          }

          const cards = await ReactiveCache.getCards(cardSelector, { fields: { _id: 1, type: 1, linkedId: 1 } }, false);
          if (!cards || cards.length === 0) return null;

          const linkedCardIds = cards.filter((c: CardLinkDoc) => c.type === 'cardType-linkedCard' && c.linkedId).map((c: CardLinkDoc) => c.linkedId);
          if (linkedCardIds.length === 0) return null;

          return await ReactiveCache.getCards({ _id: { $in: linkedCardIds }, archived: isArchived }, {}, true);
        }
      },
      // Comments for linked cards
      {
        async find(board) {
          const cardSelector: MongoQuery = {
            boardId: { $in: [board._id, board.subtasksDefaultBoardId] },
            archived: isArchived,
          };

          if (thisUserId && board.members) {
            const member = findWhere<BoardMemberFull>(board.members, { userId: thisUserId, isActive: true });
            if (member && (member.isNormalAssignedOnly || member.isCommentAssignedOnly || member.isReadAssignedOnly)) {
              cardSelector.assignees = { $in: [thisUserId] };
            }
          }

          const cards = await ReactiveCache.getCards(cardSelector, { fields: { _id: 1, type: 1, linkedId: 1 } }, false);
          if (!cards || cards.length === 0) return null;

          const linkedCardIds = cards.filter((c: CardLinkDoc) => c.type === 'cardType-linkedCard' && c.linkedId).map((c: CardLinkDoc) => c.linkedId);
          if (linkedCardIds.length === 0) return null;

          return await ReactiveCache.getCardComments({ cardId: { $in: linkedCardIds } }, {}, true);
        }
      },
      // Attachments for linked cards
      {
        async find(board) {
          const cardSelector: MongoQuery = {
            boardId: { $in: [board._id, board.subtasksDefaultBoardId] },
            archived: isArchived,
          };

          if (thisUserId && board.members) {
            const member = findWhere<BoardMemberFull>(board.members, { userId: thisUserId, isActive: true });
            if (member && (member.isNormalAssignedOnly || member.isCommentAssignedOnly || member.isReadAssignedOnly)) {
              cardSelector.assignees = { $in: [thisUserId] };
            }
          }

          const cards = await ReactiveCache.getCards(cardSelector, { fields: { _id: 1, type: 1, linkedId: 1 } }, false);
          if (!cards || cards.length === 0) return null;

          const linkedCardIds = cards.filter((c: CardLinkDoc) => c.type === 'cardType-linkedCard' && c.linkedId).map((c: CardLinkDoc) => c.linkedId);
          if (linkedCardIds.length === 0) return null;

          const result = await ReactiveCache.getAttachments({ 'meta.cardId': { $in: linkedCardIds } }, {}, true);
          return result.cursor || result;
        }
      },
      // Checklists for linked cards
      {
        async find(board) {
          const cardSelector: MongoQuery = {
            boardId: { $in: [board._id, board.subtasksDefaultBoardId] },
            archived: isArchived,
          };

          if (thisUserId && board.members) {
            const member = findWhere<BoardMemberFull>(board.members, { userId: thisUserId, isActive: true });
            if (member && (member.isNormalAssignedOnly || member.isCommentAssignedOnly || member.isReadAssignedOnly)) {
              cardSelector.assignees = { $in: [thisUserId] };
            }
          }

          const cards = await ReactiveCache.getCards(cardSelector, { fields: { _id: 1, type: 1, linkedId: 1 } }, false);
          if (!cards || cards.length === 0) return null;

          const linkedCardIds = cards.filter((c: CardLinkDoc) => c.type === 'cardType-linkedCard' && c.linkedId).map((c: CardLinkDoc) => c.linkedId);
          if (linkedCardIds.length === 0) return null;

          return await ReactiveCache.getChecklists({ cardId: { $in: linkedCardIds } }, {}, true);
        }
      },
      // ChecklistItems for linked cards
      {
        async find(board) {
          const cardSelector: MongoQuery = {
            boardId: { $in: [board._id, board.subtasksDefaultBoardId] },
            archived: isArchived,
          };

          if (thisUserId && board.members) {
            const member = findWhere<BoardMemberFull>(board.members, { userId: thisUserId, isActive: true });
            if (member && (member.isNormalAssignedOnly || member.isCommentAssignedOnly || member.isReadAssignedOnly)) {
              cardSelector.assignees = { $in: [thisUserId] };
            }
          }

          const cards = await ReactiveCache.getCards(cardSelector, { fields: { _id: 1, type: 1, linkedId: 1 } }, false);
          if (!cards || cards.length === 0) return null;

          const linkedCardIds = cards.filter((c: CardLinkDoc) => c.type === 'cardType-linkedCard' && c.linkedId).map((c: CardLinkDoc) => c.linkedId);
          if (linkedCardIds.length === 0) return null;

          return await ReactiveCache.getChecklistItems({ cardId: { $in: linkedCardIds } }, {}, true);
        }
      },
      // Board members/Users
      {
        async find(board) {
          if (board.members) {
            // Board members. This publication also includes former board members that
            // aren't members anymore but may have some activities attached to them in
            // the history.
            const memberIds = board.members.map((x: BoardMemberRef) => x.userId);

            // We omit the current user because the client should already have that data,
            // and sending it triggers a subtle bug:
            // https://github.com/wefork/wekan/issues/15
            return await ReactiveCache.getUsers(
              {
                _id: { $in: memberIds.filter((x: string) => x !== thisUserId) },
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
          }
          return null;
        }
      }
    ]
  };
});

Meteor.methods({
  async copyBoard(boardId: string, properties: MongoQuery) {
    check(boardId, String);
    check(properties, Object);

    if (!this.userId) throw new Meteor.Error('not-authorized');
    const board = await ReactiveCache.getBoard(boardId);
    if (!board) throw new Meteor.Error('not-found');
    // Require board admin, matching the REST endpoint
    // POST /api/boards/:boardId/copy (checkAdminOrCondition with adminAccess).
    if (!board.hasAdmin(this.userId)) throw new Meteor.Error('not-authorized');

    // Strip fields the caller must not control on the copy
    const { members, permission, ...safeProperties } = properties;
    for (const key of Object.keys(safeProperties)) {
      board[key] = safeProperties[key];
    }

    return board.copy();
  },
});

// A board member reference stored on Boards.members (report/roster lookups).
interface BoardMemberRef {
  userId: string;
}

// A board org reference stored on Boards.orgs.
interface BoardOrgRef {
  orgId: string;
}

// A board team reference stored on Boards.teams.
interface BoardTeamRef {
  teamId: string;
}

// The subset of a board document read by the boardsReport publication when
// collecting related member/org/team ids.
interface BoardReportDoc {
  members?: BoardMemberRef[];
  orgs?: BoardOrgRef[];
  teams?: BoardTeamRef[];
}

// Arguments accepted by the getAllBoardsPage method (all optional; validated
// with Match.Optional).
interface AllBoardsPageParams {
  search?: string;
  sortBy?: string;
  menu?: string;
  page?: number;
  perPage?: number;
}

// The subset of a board document used to filter/sort/paginate in getAllBoardsPage.
interface BoardPageDoc {
  _id: string;
  title?: string;
  type?: string;
}

// The subset of a card document read while resolving subtask/linked-card ids in
// the composite 'board' publication.
interface CardLinkDoc {
  _id: string;
  parentId?: string;
  type?: string;
  linkedId?: string;
}
