import Boards from '/models/boards';
import Cards from '/models/cards';
import Checklists from '/models/checklists';

export function allowIsBoardAdmin(userId: string, board: BoardAccess | null | undefined) {
  return board && board.hasAdmin(userId);
}

export function allowIsBoardMember(userId: string, board: BoardAccess | null | undefined) {
  return board && board.hasMember(userId);
}

export function allowIsAnyBoardMember(userId: string, boards: Array<BoardAccess | null | undefined>) {
  return boards.some(board => {
    return board && board.hasMember(userId);
  });
}

export function allowIsBoardMemberCommentOnly(userId: string, board: BoardAccess | null | undefined) {
  return board && board.hasMember(userId) && !board.hasReadOnly(userId) && !board.hasReadAssignedOnly(userId) && !board.hasNoComments(userId);
}

export function allowIsBoardMemberNoComments(userId: string, board: BoardAccess | null | undefined) {
  return board && board.hasMember(userId) && !board.hasNoComments(userId);
}

// Check if user has write access to board (can create/edit cards and lists)
export function allowIsBoardMemberWithWriteAccess(userId: string, board: BoardAccess | null | undefined) {
  return board && board.members && board.members.some(e => e.userId === userId && e.isActive && !e.isNoComments && !e.isCommentOnly && !e.isWorker && !e.isReadOnly && !e.isReadAssignedOnly);
}

// Write-access variant of allowIsAnyBoardMember: true if the user has write
// access on at least one of the boards. Used where an object (e.g. a Custom
// Field) spans several boards but read-only/comment-only/worker members must
// still be blocked from mutating it.
export function allowIsAnyBoardMemberWithWriteAccess(userId: string, boards: Array<BoardAccess | null | undefined>) {
  return boards.some(board => allowIsBoardMemberWithWriteAccess(userId, board));
}

// Security (GHSA-gm7v-pc38-53jr): the Cards/Lists/Swimlanes allow rules only
// authorize an update against the document's CURRENT (source) boardId. A
// malicious DDP client can therefore relocate a document it owns into a private
// board it is not a member of by setting a new boardId in the update modifier:
// the allow rule still sees the attacker's own source board and approves it.
// This deny rule closes that hole by rejecting any update that moves a document
// to a destination boardId on which the caller does not have write access.
// Returns true to DENY. Used by the Cards/Lists/Swimlanes deny() rules.
export async function denyCrossBoardMove(userId: string, modifier: UpdateModifier | null | undefined) {
  const set = modifier && modifier.$set;
  if (!set) return false;
  const newBoardId = set.boardId;
  // Nothing being moved across boards.
  if (typeof newBoardId !== 'string' || !newBoardId) return false;
  // Caller must have write access to the destination board.
  // Boards.findOneAsync exposes only the loose Mongo document type; at runtime
  // the returned board carries the collection-helper methods this expects.
  return !allowIsBoardMemberWithWriteAccess(userId, (await Boards.findOneAsync(newBoardId)) as BoardAccess | undefined);
}

// Shared destination gate for the checklist deny rules below: returns true to
// DENY when boardId names a board the caller cannot write to. An unknown/missing
// board id also denies, matching denyCrossBoardMove's fail-closed behavior.
async function denyMoveToUnwritableBoard(userId: string, boardId: string | undefined) {
  if (typeof boardId !== 'string' || !boardId) return false;
  // See denyCrossBoardMove: narrow the loose Mongo document to the helper type.
  return !allowIsBoardMemberWithWriteAccess(userId, (await Boards.findOneAsync(boardId)) as BoardAccess | undefined);
}

// Security (GHSA-gv8h-5p3p-6hx7): Checklists and ChecklistItems are attached to a
// card and carry a denormalized boardId. They are MOVED between cards by setting a
// new cardId (and, for items, a new checklistId) in a direct collection update; a
// before.update hook then re-derives boardId from the destination card. The allow
// rules only authorize against the document's CURRENT (source) cardId, so a DDP
// client with write access to its own board can relocate a checklist/item it owns
// onto a card in a private board it is not a member of. This is the same class as
// denyCrossBoardMove / BoardBleed, but for the card-attached checklist documents
// that the boardId-only deny rule does not cover.
//
// Returns true to DENY any update whose destination board — resolved from a new
// boardId or a new cardId in the modifier — the caller cannot write to.
// Legitimate moves (destination writable) and same-card edits are unaffected, and
// server-side Meteor methods bypass allow/deny entirely, so the trusted
// moveChecklist method still works.
export async function denyCrossBoardMoveByCard(userId: string, modifier: UpdateModifier | null | undefined) {
  const set = modifier && modifier.$set;
  if (!set) return false;
  // Direct boardId change (defense in depth, same as denyCrossBoardMove).
  if (await denyMoveToUnwritableBoard(userId, set.boardId)) return true;
  // cardId change: resolve the destination card's board.
  if (typeof set.cardId === 'string' && set.cardId) {
    const card = await Cards.findOneAsync(set.cardId);
    if (!card) return true;
    if (await denyMoveToUnwritableBoard(userId, card.boardId)) return true;
  }
  return false;
}

// As denyCrossBoardMoveByCard, plus the ChecklistItem-only checklistId move: an
// item can be re-parented to another checklist, which (via that checklist's card)
// may live on a board the caller cannot write to. Returns true to DENY.
export async function denyCrossBoardMoveByChecklistItem(userId: string, modifier: UpdateModifier | null | undefined) {
  if (await denyCrossBoardMoveByCard(userId, modifier)) return true;
  const set = modifier && modifier.$set;
  if (set && typeof set.checklistId === 'string' && set.checklistId) {
    const checklist = await Checklists.findOneAsync(set.checklistId);
    if (!checklist) return true;
    const card = await Cards.findOneAsync(checklist.cardId);
    if (!card) return true;
    if (await denyMoveToUnwritableBoard(userId, card.boardId)) return true;
  }
  return false;
}

// Check if user has write access via a card's board
export async function allowIsBoardMemberWithWriteAccessByCard(userId: string, card: CardRef | null | undefined) {
  // Narrow the loose Mongo document to the helper interface (see above).
  const board = card && (await Boards.findOneAsync(card.boardId)) as BoardAccess | undefined;
  return allowIsBoardMemberWithWriteAccess(userId, board);
}

export async function allowIsBoardMemberByCard(userId: string, card: CardRef | null | undefined) {
  const board = card && await Boards.findOneAsync(card.boardId);
  return board && board.hasMember(userId);
}

// Policy: can a user update a board's 'sort' field?
// Requirements:
//  - user must be authenticated
//  - update must include 'sort' field
//  - user must be a member of the board
export function canUpdateBoardSort(userId: string | null | undefined, board: BoardAccess | null | undefined, fieldNames: string[]) {
  return !!userId && (fieldNames || []).includes('sort') && allowIsBoardMember(userId, board);
}

// Issue #5998: the REST board-member endpoints historically took eight separate
// boolean permission flags. They now also accept a single named `role`, which
// this helper maps to that flag set. Returns null for an unknown role so callers
// can return a 400. All flags default to false; 'normal'/'member' means a plain
// board member (all flags false).
export const BOARD_MEMBER_ROLE_FLAGS = [
  'isAdmin',
  'isNoComments',
  'isCommentOnly',
  'isWorker',
  'isNormalAssignedOnly',
  'isCommentAssignedOnly',
  'isReadOnly',
  'isReadAssignedOnly',
];

export function boardMemberRoleToFlags(role: string | null | undefined) {
  const flags: { [flag: string]: boolean } = {};
  BOARD_MEMBER_ROLE_FLAGS.forEach(flag => {
    flags[flag] = false;
  });
  const normalized = String(role || '').trim().toLowerCase();
  const roleMap: { [role: string]: string } = {
    admin: 'isAdmin',
    nocomments: 'isNoComments',
    comment: 'isCommentOnly',
    commentonly: 'isCommentOnly',
    worker: 'isWorker',
    normalassignedonly: 'isNormalAssignedOnly',
    commentassignedonly: 'isCommentAssignedOnly',
    readonly: 'isReadOnly',
    readassignedonly: 'isReadAssignedOnly',
  };
  if (normalized === 'normal' || normalized === 'member') {
    return flags;
  }
  if (Object.prototype.hasOwnProperty.call(roleMap, normalized)) {
    flags[roleMap[normalized]] = true;
    return flags;
  }
  return null;
}

// Copy/Move endpoints accept a 0-based target position counted from the top
// (top-left), e.g. "place after N items". This converts that index into a
// numeric `sort` value placed between the existing siblings, so callers don't
// have to know WeKan's fractional sort scheme. `siblings` must be the
// destination items (EXCLUDING the item being moved) sorted ascending by sort.
export function computeSortForIndex(siblings: SortableItem[], position: number) {
  const list = Array.isArray(siblings) ? siblings : [];
  if (list.length === 0) {
    return 0;
  }
  const sortValue = (item: SortableItem) =>
    typeof item.sort === 'number' && !Number.isNaN(item.sort) ? item.sort : 0;
  const index = Number.isFinite(position) ? Math.max(0, Math.floor(position)) : list.length;
  if (index <= 0) {
    return sortValue(list[0]) - 1;
  }
  if (index >= list.length) {
    return sortValue(list[list.length - 1]) + 1;
  }
  return (sortValue(list[index - 1]) + sortValue(list[index])) / 2;
}

// Issue #5819: merge label ids on a card — keep existing labels, drop the ones
// in removeLabelIds, add the ones in addLabelIds, de-duplicated and order-stable.
// Pure function so the bulk-labels behavior is unit-testable.
export function mergeLabelIds(currentLabelIds: string[], addLabelIds: string[] = [], removeLabelIds: string[] = []) {
  const current = Array.isArray(currentLabelIds) ? currentLabelIds : [];
  const add = Array.isArray(addLabelIds) ? addLabelIds : [];
  const removeSet = new Set(Array.isArray(removeLabelIds) ? removeLabelIds : []);
  return Array.from(new Set([...current.filter(id => !removeSet.has(id)), ...add]));
}

// Issue #5998: a board member may only be assigned to a card (as member or
// assignee) when they are an active member of that card's board.
export function canAssignCardMember(board: BoardAccess | null | undefined, userId: string) {
  return !!board && !!userId && board.hasMember(userId);
}

// Issue #5846: a card date (received/start/due/end) is CLEARED when the request
// supplies an empty string, null, or the literal "null"; any other value SETS
// it. Pure so the add/remove-date behavior is unit-testable.
// `value` is an arbitrary REST body value (string, Date, number, null, ...),
// so any is unavoidable at this boundary.
export function isCardDateClear(value: any) {
  return value === '' || value === null || value === 'null';
}

interface BoardMemberEntry {
  userId?: string;
  isActive?: boolean;
  isNoComments?: boolean;
  isCommentOnly?: boolean;
  isWorker?: boolean;
  isReadOnly?: boolean;
  isReadAssignedOnly?: boolean;
}

export interface BoardAccess {
  hasAdmin(memberId: string): boolean;
  hasMember(memberId: string): boolean;
  hasReadOnly(memberId: string): boolean;
  hasReadAssignedOnly(memberId: string): boolean;
  hasNoComments(memberId: string): boolean;
  members?: BoardMemberEntry[];
}

interface CardRef {
  boardId?: string;
}

interface UpdateModifier {
  $set?: {
    boardId?: string;
    cardId?: string;
    checklistId?: string;
    // A Mongo `$set` may carry any other document fields (e.g. `title`); only
    // the move-related ids above are inspected by the deny helpers.
    [field: string]: string | undefined;
  };
}

interface SortableItem {
  sort?: number;
}
