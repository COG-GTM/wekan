// Pure helpers that build the Activity document shape for "delete" events so the
// Activities.after.insert outgoing-webhook hook fires when a card or board is
// permanently removed (not just archived).
//
// These are intentionally side-effect free (no DB access) so they can be unit
// tested in isolation. The server remove hooks call them and pass the result to
// Activities.insertAsync().
//
// The shapes mirror the existing create/archive activities:
//   - createCard / archivedCard: { userId, activityType, boardId, listId, cardId, swimlaneId, ... }
//   - createBoard / removeBoard: { userId, type, activityType, activityTypeId, boardId }

export function buildDeleteCardActivity({
  cardId,
  boardId,
  listId,
  swimlaneId,
  userId,
  cardTitle,
}: DeleteCardActivityInput = {}) {
  const activity: DeleteCardActivity = {
    userId,
    activityType: 'deleteCard',
    boardId,
    listId,
    cardId,
    swimlaneId,
  };
  if (cardTitle !== undefined) {
    activity.cardTitle = cardTitle;
  }
  return activity;
}

export function buildDeleteBoardActivity({ boardId, userId }: DeleteBoardActivityInput = {}) {
  return {
    userId,
    type: 'board',
    activityType: 'deleteBoard',
    activityTypeId: boardId,
    boardId,
  };
}

interface DeleteCardActivityInput {
  cardId?: string;
  boardId?: string;
  listId?: string;
  swimlaneId?: string;
  userId?: string;
  cardTitle?: string;
}

interface DeleteCardActivity {
  userId?: string;
  activityType: string;
  boardId?: string;
  listId?: string;
  cardId?: string;
  swimlaneId?: string;
  cardTitle?: string;
}

interface DeleteBoardActivityInput {
  boardId?: string;
  userId?: string;
}
