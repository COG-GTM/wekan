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
  private _nowDate: Date;
  private members: Record<string, string>;
  private lists: Record<string, string>;
  private swimlanes: Record<string, string>;

  constructor(data: WekanDocumentField) {
    this._nowDate = new Date();
    this.members = data && data.membersMapping ? data.membersMapping : {};
    this.lists = {};
    this.swimlanes = {};
  }

  // Kanboard date values are dynamic (unix-seconds string, ISO string, or
  // number), so the argument is the documented interop alias.
  _now(dateString?: WekanDocumentField) {
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

  _tasks(data: WekanDocumentField) {
    if (Array.isArray(data)) return data;
    return data.tasks || [];
  }

  _columnNames(data: WekanDocumentField) {
    if (data.columns && data.columns.length) {
      return data.columns.map((c: WekanDocumentField) => c.title || c.name).filter(Boolean);
    }
    // Derive the column order from the tasks.
    const names: string[] = [];
    for (const task of this._tasks(data)) {
      const name = task.column_name || task.column || 'Imported';
      if (!names.includes(name)) names.push(name);
    }
    return names.length ? names : ['Imported'];
  }

  _swimlaneNames(data: WekanDocumentField) {
    if (data.swimlanes && data.swimlanes.length) {
      return data.swimlanes.map((s: WekanDocumentField) => s.name || s.title).filter(Boolean);
    }
    const names: string[] = [];
    for (const task of this._tasks(data)) {
      const name = task.swimlane_name || task.swimlane || 'Default';
      if (!names.includes(name)) names.push(name);
    }
    return names.length ? names : ['Default'];
  }

  async createBoard(data: WekanDocumentField) {
    const title =
      (data.board && (data.board.name || data.board.title)) ||
      `Imported Kanboard Board ${this._now()}`;
    const boardToCreate: KbBoardToCreate = {
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
    const tagNames = new Set<string>();
    for (const task of this._tasks(data)) {
      (task.tags || []).forEach((t: WekanDocumentField) => tagNames.add(typeof t === 'string' ? t : t.name));
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

  async createSwimlanes(data: WekanDocumentField, boardId: string) {
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

  async createLists(data: WekanDocumentField, boardId: string) {
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

  async createCards(data: WekanDocumentField, boardId: string) {
    const board = await ReactiveCache.getBoard(boardId);
    const firstSwimlane = Object.values(this.swimlanes)[0];
    for (const task of this._tasks(data)) {
      const columnName = task.column_name || task.column || this._columnNames(data)[0];
      const swimlaneName = task.swimlane_name || task.swimlane || 'Default';
      const cardToCreate: KbCardToCreate = {
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

  async create(board: WekanDocumentField, currentBoardId?: string) {
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

interface KbBoardLabel {
  _id: string;
  color: string;
  name: string;
}

interface KbBoardMember {
  userId: string | null;
  wekanId: string | null;
  isActive: boolean;
  isAdmin: boolean;
  isNoComments: boolean;
  isCommentOnly: boolean;
  swimlaneId: boolean;
}

interface KbBoardToCreate {
  archived: boolean;
  color: string;
  createdAt: Date;
  labels: KbBoardLabel[];
  members: KbBoardMember[];
  modifiedAt: Date;
  permission: string;
  slug: string;
  stars: number;
  title: WekanDocumentField;
}

interface KbCardToCreate {
  archived: boolean;
  boardId: string;
  dateLastActivity: Date;
  description: WekanDocumentField;
  listId: string;
  swimlaneId: string;
  sort: number;
  title: WekanDocumentField;
  userId: string | null;
  labelIds: string[];
  dueAt?: Date;
  createdAt?: Date;
  members?: string[];
}
