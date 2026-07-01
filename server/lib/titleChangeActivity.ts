// Pure helper used by the Cards.before.update hook to detect a card title change.
// Extracted so the title-change activity logic (issue #3619) can be unit-tested
// without the Meteor/Mongo collection machinery.
//
// Returns true only when the update modifier sets `title` to a value that
// differs from the current document's title. This mirrors how sibling tracked
// fields (e.g. dueAt) are detected in the before.update hook, so the existing
// Activities.after.insert outgoing-webhook hook fires on title changes too.
export function titleChanged(
  oldDoc: TitleDoc | null | undefined,
  modifier: TitleModifier | null | undefined,
) {
  if (!modifier || !modifier.$set || !('title' in modifier.$set)) {
    return false;
  }
  const oldTitle = (oldDoc && oldDoc.title) || '';
  const newTitle = modifier.$set.title;
  return newTitle !== oldTitle;
}

// The card document (or a minimal stub) whose title may change.
interface TitleDoc {
  title?: string;
}

// A Mongo update modifier; only the tracked `title` field is modelled, other
// $set fields come through the documented interop index signature.
interface TitleModifier {
  $set?: { title?: string; [field: string]: WekanDocumentField };
}
