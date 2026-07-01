import { ReactiveVar } from 'meteor/reactive-var';
import { Tracker } from 'meteor/tracker';
import { ReactiveCache } from '/imports/reactiveCache';

export const BoardMultiSelection = {
  _selectedBoards: new ReactiveVar<string[]>([]),

  _isActive: new ReactiveVar(false),

  reset() {
    this._selectedBoards.set([]);
  },

  isActive() {
    return this._isActive.get();
  },

  count() {
    return this._selectedBoards.get().length;
  },

  isEmpty() {
    return this.count() === 0;
  },

  getSelectedBoardIds() {
    return this._selectedBoards.get();
  },

  activate() {
    if (!this.isActive()) {
      this._isActive.set(true);
      Tracker.flush();
    }
  },

  disable() {
    if (this.isActive()) {
      this._isActive.set(false);
      this.reset();
    }
  },

  add(boardIds: string | string[]) {
    return this.toggle(boardIds, { add: true, remove: false });
  },

  remove(boardIds: string | string[]) {
    return this.toggle(boardIds, { add: false, remove: true });
  },

  toogle(boardIds: string | string[]) {
    return this.toggle(boardIds, { add: true, remove: true });
  },

  toggle(
    boardIds: string | string[],
    { add, remove }: { add?: boolean; remove?: boolean } = {},
  ) {
    boardIds = typeof boardIds === 'string' ? [boardIds] : boardIds;
    let selectedBoards = this._selectedBoards.get();

    boardIds.forEach(boardId => {
      const index = selectedBoards.indexOf(boardId);
      if (index > -1 && remove) {
        selectedBoards = selectedBoards.filter(id => id !== boardId);
      } else if (index === -1 && add) {
        selectedBoards.push(boardId);
      }
    });

    this._selectedBoards.set(selectedBoards);
  },

  isSelected(boardId: string) {
    return this._selectedBoards.get().includes(boardId);
  },
};
