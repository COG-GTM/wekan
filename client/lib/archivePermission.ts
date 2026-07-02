// Pure, Meteor-free permission helper for archiving a card.
//
// A board member with the comment-only role must not be able to archive a
// card (issue #5810). The client archive handler already knows whether the
// current user can modify the card via Utils.canModifyCard() (which is false
// for comment-only / read-only / worker users), so archiving is allowed only
// when the card can be modified.
//
// Kept free of Meteor imports so it can be unit tested in isolation.
export function canArchiveCard({ canModifyCard }: CanArchiveCardArgs = {}) {
  return !!canModifyCard;
}

interface CanArchiveCardArgs {
  // Normally the boolean result of Utils.canModifyCard(), but the value is only
  // ever read through `!!`, so any truthy value is accepted and coerced (see
  // server/lib/tests/archivePermission.tests.ts, which passes `1`). `any` here
  // documents that intentionally-coercive contract.
  canModifyCard?: any;
}
