import { Meteor } from 'meteor/meteor';
import { ReactiveCache } from '/imports/reactiveCache';
import Activities from '/models/activities';
import Boards from './boards';
import Cards from '/models/cards';
import Lists from '/models/lists';
import Swimlanes from '/models/swimlanes';

// Creates a WeKan board from a Kanboard export.
//
// Kanboard's JSON-RPC API (getBoard / getAllTasks) or a hand-assembled object of
// the shape below is accepted. Kanboard "columns" become WeKan lists, "tasks"
// become cards, swimlanes are preserved, task tags become board labels and the
// task owner becomes the card member (when mapped):
//
//   {
//     "board":     { "name": "..." },                         // optional
//     "columns":   [ { "title": "Backlog" }, ... ],           // optional (derived from tasks if absent)
//     "swimlanes": [ { "name": "Default" }, ... ],            // optional
//     "tasks": [ { "title", "description", "column_name", "swimlane_name",
//                  "date_due", "owner_id"|"owner_name"|"owner_username",
//                  "tags": [ ... ] }, ... ]
//   }
export class KanboardCreator {
  _nowDate: Date;
  members: { [key: string]: any };
  lists: { [key: string]: any };
  swimlanes: { [key: string]: any };

  // `data` is the parsed Kanboard export payload (dynamic shape), hence `any`.
  constructor(data: any) {
    this._nowDate = new Date();
    this.members = data && data.membersMapping ? data.membersMapping : {};
    this.lists = {};
    this.swimlanes = {};
  }

  // `dateString` may be a unix-timestamp string/number or a date string
  // (dynamic from the export), hence `any`.
  _now(dateString?: any) {
    if (dateString) {
      // Kanboard often uses unix timestamps (seconds) for dates.
      if (/^\d+$/.test(String(dateString))) {
        return new Date(parseInt(dateString, 10) * 1000);
      }
      return new Date(dateString);
    }
    if (!this._nowDate) this._nowDate = new Date();
    return this._nowDate;
  }

  _user(key?: string) {
    if (key && this.members[key]) return this.members[key];
    return Meteor.userId();
  }

  _tasks(data: any) {
    if (Array.isArray(data)) return data;
    return data.tasks || [];
  }

  _columnNames(data: any) {
    if (data.columns && data.columns.length) {
      return data.columns.map((c: any) => c.title || c.name).filter(Boolean);
    }
    // Derive the column order from the tasks.
    const names: any[] = [];
    for (const task of this._tasks(data)) {
      const name = task.column_name || task.column || 'Imported';
      if (!names.includes(name)) names.push(name);
    }
    return names.length ? names : ['Imported'];
  }

  _swimlaneNames(data: any) {
    if (data.swimlanes && data.swimlanes.length) {
      return data.swimlanes.map((s: any) => s.name || s.title).filter(Boolean);
    }
    const names: any[] = [];
    for (const task of this._tasks(data)) {
      const name = task.swimlane_name || task.swimlane || 'Default';
      if (!names.includes(name)) names.push(name);
    }
    return names.length ? names : ['Default'];
  }

  async createBoard(data: any) {
    const title =
      (data.board && (data.board.name || data.board.title)) ||
      `Imported Kanboard Board ${this._now()}`;
    // `boardToCreate` is a board document assembled incrementally, hence `any`.
    const boardToCreate: { [key: string]: any } = {
      archived: false,
      color: 'belize',
      createdAt: this._now(),
      labels: [],
      members: [
        {
          userId: Meteor.userId(),
          wekanId: Meteor.userId(),
          isActive: true,
          isAdmin: true,
          isNoComments: false,
          isCommentOnly: false,
          swimlaneId: false,
        },
      ],
      modifiedAt: this._now(),
      permission: 'private',
      slug: 'board',
      stars: 0,
      title,
    };
    // Tags -> board labels.
    // Tags may be plain strings or { name } objects, hence `Set<any>`.
    const tagNames = new Set<any>();
    for (const task of this._tasks(data)) {
      (task.tags || []).forEach((t: any) => tagNames.add(typeof t === 'string' ? t : t.name));
    }
    for (const name of tagNames) {
      if (name) boardToCreate.labels.push({ _id: Random.id(6), color: 'black', name });
    }

    const boardId = await Boards.direct.insertAsync(boardToCreate);
    await Activities.direct.insertAsync({
      activityType: 'importBoard',
      boardId,
      createdAt: this._now(),
      source: { id: boardId, system: 'Kanboard' },
      userId: this._user(),
    });
    return boardId;
  }

  async createSwimlanes(data: any, boardId: string) {
    let sort = 0;
    for (const name of this._swimlaneNames(data)) {
      const swimlaneId = await Swimlanes.direct.insertAsync({
        archived: false,
        boardId,
        createdAt: this._now(),
        title: name,
        sort,
      });
      this.swimlanes[name] = swimlaneId;
      sort += 1;
    }
  }

  async createLists(data: any, boardId: string) {
    let sort = 0;
    for (const name of this._columnNames(data)) {
      const listId = await Lists.direct.insertAsync({
        archived: false,
        boardId,
        createdAt: this._now(),
        title: name,
        sort,
      });
      this.lists[name] = listId;
      sort += 1;
    }
  }

  async createCards(data: any, boardId: string) {
    const board = await ReactiveCache.getBoard(boardId);
    const firstSwimlane = Object.values(this.swimlanes)[0];
    for (const task of this._tasks(data)) {
      const columnName = task.column_name || task.column || this._columnNames(data)[0];
      const swimlaneName = task.swimlane_name || task.swimlane || 'Default';
      // `cardToCreate` is a card document assembled incrementally, hence `any`.
      const cardToCreate: { [key: string]: any } = {
        archived: false,
        boardId,
        dateLastActivity: this._now(),
        description: task.description || '',
        listId: this.lists[columnName] || Object.values(this.lists)[0],
        swimlaneId: this.swimlanes[swimlaneName] || firstSwimlane,
        sort: 0,
        title: task.title || 'Imported task',
        userId: this._user(),
        labelIds: [],
      };
      if (task.date_due) cardToCreate.dueAt = this._now(task.date_due);
      if (task.date_creation) cardToCreate.createdAt = this._now(task.date_creation);
      for (const t of task.tags || []) {
        const name = typeof t === 'string' ? t : t.name;
        const label = name && board.getLabel(name, 'black');
        if (label) cardToCreate.labelIds.push(label._id);
      }
      const ownerKey = task.owner_id || task.owner_username || task.owner_name;
      if (ownerKey && this.members[ownerKey]) {
        cardToCreate.members = [this.members[ownerKey]];
      }
      await Cards.direct.insertAsync(cardToCreate);
    }
  }

  async create(board: any, currentBoardId?: string | null) {
    const isSandstorm =
      Meteor.settings && Meteor.settings.public && Meteor.settings.public.sandstorm;
    if (isSandstorm && currentBoardId) {
      const currentBoard = await ReactiveCache.getBoard(currentBoardId);
      await currentBoard.archive();
    }
    const boardId = await this.createBoard(board);
    await this.createSwimlanes(board, boardId);
    await this.createLists(board, boardId);
    await this.createCards(board, boardId);
    return boardId;
  }
}
