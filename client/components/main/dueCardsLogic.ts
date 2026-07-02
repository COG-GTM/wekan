// Pure, side-effect-free helpers for the Due Cards view.
//
// These are extracted from dueCards.js so they can be unit-tested in
// isolation (see client/lib/tests/dueCards.logic.tests.js). They must not
// reference Meteor, Blaze, ReactiveCache or the DOM.

// A far-future sentinel used to push cards with a missing/invalid dueAt to the
// end of the ascending sort instead of dropping them.
const FAR_FUTURE = new Date('2100-12-31').getTime();

// Normalize a dueAt value (Date | string | null | undefined) to a comparable
// millisecond timestamp. Invalid / empty values sort last.
export function dueAtToTime(value: Date | string | null | undefined, farFuture: number = FAR_FUTURE) {
  if (value === null || value === undefined || value === '') return farFuture;
  if (value instanceof Date) return value.getTime();
  const t = new Date(value);
  if (!isNaN(t.getTime())) return t.getTime();
  return farFuture;
}

// Decide whether a card belongs to the current user (member, assignee or
// author). Used when the view is "me" rather than "all".
export function cardMatchesUser(card: DueCardLike | null | undefined, userId: string | null | undefined) {
  if (!card || !userId) return false;
  const isMember = Array.isArray(card.members) && card.members.includes(userId);
  const isAssignee =
    Array.isArray(card.assignees) && card.assignees.includes(userId);
  const isAuthor = card.userId === userId;
  return isMember || isAssignee || isAuthor;
}

// Filter (by user, unless allUsers) and sort (ascending by due date) a list of
// due cards. Returns a new array; does not mutate the input. Importantly this
// imposes NO cap on the number of results (issue #5999 / #5930).
export function filterAndSortDueCards(
  cards: DueCardLike[] | null | undefined,
  { allUsers = false, userId = null }: { allUsers?: boolean; userId?: string | null } = {},
) {
  const list = Array.isArray(cards) ? cards.slice() : [];

  const filtered =
    allUsers || !userId
      ? list
      : list.filter((card: DueCardLike) => cardMatchesUser(card, userId));

  filtered.sort((a: DueCardLike, b: DueCardLike) => {
    const x = dueAtToTime(a.dueAt);
    const y = dueAtToTime(b.dueAt);
    if (x > y) return 1;
    if (x < y) return -1;
    return 0;
  });

  return filtered;
}

// Minimal shape of a due card as read by these pure helpers (members/assignees/
// author for the "me" filter, dueAt for sorting).
interface DueCardLike {
  members?: string[];
  assignees?: string[];
  userId?: string;
  dueAt?: Date | string | null;
}
