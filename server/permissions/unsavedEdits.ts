import UnsavedEditCollection from '/models/unsavedEdits';

// `doc` is the raw UnsavedEdit Mongo document (dynamic per-collection shape),
// hence `any`.
function isAuthor(userId: string, doc: any, fieldNames: string[] = []) {
  return userId === doc.userId && fieldNames.indexOf('userId') === -1;
}

UnsavedEditCollection.allow({
  insert: isAuthor,
  update: isAuthor,
  remove: isAuthor,
  fetch: ['userId'],
});
