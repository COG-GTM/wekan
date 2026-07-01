import Boards from '/models/boards';
import Integrations from '/models/integrations';
import { allowIsBoardAdmin } from '/server/lib/utils';

const permissionHelper = {
  async allow(userId: string, doc: WekanBoardScopedDoc) {
    const user = await Meteor.users.findOneAsync(userId);
    const isAdmin = user && user.isAdmin;
    return isAdmin || allowIsBoardAdmin(userId, (await Boards.findOneAsync(doc.boardId)) as WekanPolicyBoard | undefined);
  },
};
Integrations.allow({
  async insert(userId, doc) {
    return await permissionHelper.allow(userId, doc);
  },
  async update(userId, doc) {
    return await permissionHelper.allow(userId, doc);
  },
  async remove(userId, doc) {
    return await permissionHelper.allow(userId, doc);
  },
  fetch: ['boardId'],
});
