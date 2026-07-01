import UnsavedEditCollection from '/models/unsavedEdits';

function isAuthor(
  userId: string,
  doc: { userId?: string; [field: string]: WekanDocumentField },
  fieldNames: string[] = [],
) {
  return userId === doc.userId && fieldNames.indexOf('userId') === -1;
}

UnsavedEditCollection.allow({
  insert: isAuthor,
  update: isAuthor,
  remove: isAuthor,
  fetch: ['userId'],
});
