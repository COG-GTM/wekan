import Actions from '/models/actions';
import Boards from '/models/boards';
import { allowIsBoardAdmin } from '/server/lib/utils';

Actions.allow({
  async insert(userId, doc: WekanBoardScopedDoc) {
    return allowIsBoardAdmin(userId, (await Boards.findOneAsync(doc.boardId)) as WekanPolicyBoard | undefined);
  },
  async update(userId, doc: WekanBoardScopedDoc) {
    return allowIsBoardAdmin(userId, (await Boards.findOneAsync(doc.boardId)) as WekanPolicyBoard | undefined);
  },
  async remove(userId, doc: WekanBoardScopedDoc) {
    return allowIsBoardAdmin(userId, (await Boards.findOneAsync(doc.boardId)) as WekanPolicyBoard | undefined);
  },
});
