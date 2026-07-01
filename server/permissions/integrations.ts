import { Meteor } from 'meteor/meteor';
import Boards from '/models/boards';
import Integrations from '/models/integrations';
import { allowIsBoardAdmin, BoardAccess } from '/server/lib/utils';

const permissionHelper = {
  // `doc` is the raw Integrations Mongo document (dynamic shape), hence `any`.
  async allow(userId: string, doc: any) {
    const user = await Meteor.users.findOneAsync(userId);
    const isAdmin = user && user.isAdmin;
    return isAdmin || allowIsBoardAdmin(userId, (await Boards.findOneAsync(doc.boardId)) as BoardAccess | undefined);
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
