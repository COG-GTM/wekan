import Avatars from '/models/avatars';
import AttachmentStorageSettings from '/models/attachmentStorageSettings';

// `doc` is the raw Avatars file document (dynamic shape), hence `any`.
function isOwner(userId: string, doc: any) {
  return userId && userId === doc.userId;
}

// Admin-level hard stop for avatar uploads (Admin Panel > Attachments >
// Transfer limits, default off). Mirrors the attachmentsUploadBlocked check in
// server/permissions/attachments.js. When blocked, only inserts (new uploads)
// are rejected; updating/removing an existing avatar still works.
async function avatarUploadsBlocked() {
  try {
    const settings = await AttachmentStorageSettings.findOneAsync({});
    return settings?.limitSettings?.avatarsUploadBlocked === true;
  } catch (error) {
    if (process.env.DEBUG === 'true') {
      console.warn('Could not read avatar upload block setting:', error);
    }
    return false;
  }
}

Avatars.allow({
  // `doc` is the raw Avatars file document (dynamic shape), hence `any`.
  async insert(userId: string, doc: any) {
    if (await avatarUploadsBlocked()) {
      return false;
    }
    return isOwner(userId, doc);
  },
  update: isOwner,
  remove: isOwner,
  fetch: ['userId'],
});
