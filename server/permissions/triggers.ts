import Boards from '/models/boards';
import Triggers from '/models/triggers';
import { allowIsBoardAdmin, BoardAccess } from '/server/lib/utils';

Triggers.allow({
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
