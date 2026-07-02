import Boards from '/models/boards';
import Rules from '/models/rules';
import { allowIsBoardAdmin, BoardAccess } from '/server/lib/utils';

Rules.allow({
  async insert(userId, doc) {
    return allowIsBoardAdmin(userId, (await Boards.findOneAsync(doc.boardId)) as BoardAccess | undefined);
  },
  async update(userId, doc) {
    return allowIsBoardAdmin(userId, (await Boards.findOneAsync(doc.boardId)) as BoardAccess | undefined);
  },
  async remove(userId, doc) {
    return allowIsBoardAdmin(userId, (await Boards.findOneAsync(doc.boardId)) as BoardAccess | undefined);
  },
});
