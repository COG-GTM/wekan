import { ReactiveCache } from '/imports/reactiveCache';
import { TAPi18n } from '/imports/i18n';
import { Filter } from '/client/lib/filter';
import { EscapeActions } from '/client/lib/escapeActions';
import { MultiSelection } from '/client/lib/multiSelection';
import { Utils } from '/client/lib/utils';
import { DEPENDENCY_TYPES } from '/models/metadata/dependencies';
import { Template } from 'meteor/templating';
import { Blaze } from 'meteor/blaze';
import { ReactiveVar } from 'meteor/reactive-var';

Template.filterSidebar.helpers({
  // #3392: relation types offered in the dependency ("Red Strings") filter.
  dependencyTypes() {
    return DEPENDENCY_TYPES.map((t: any) => ({
      id: t.id,
      label: `dependency-type-${t.id}`,
    }));
  },
});

// SubsManager removed for Meteor 3 migration

// fallbackId: any — the id used when the element has no data-filter-id.
function getFilterIdFromEvent(evt: JQuery.TriggeredEvent, fallbackId: any) {
  const filterId = evt.currentTarget?.getAttribute('data-filter-id');
  if (filterId === '__none__') {
    return undefined;
  }
  if (filterId !== null) {
    return filterId;
  }
  return fallbackId;
}

Template.filterSidebar.events({
  'submit .js-list-filter'(evt: JQuery.TriggeredEvent, tpl: Blaze.TemplateInstance) {
    evt.preventDefault();
    Filter.lists.set((tpl.find('.js-list-filter input') as HTMLInputElement).value.trim());
  },
  'change .js-field-card-filter'(evt: JQuery.TriggeredEvent, tpl: Blaze.TemplateInstance) {
    evt.preventDefault();
    Filter.title.set((tpl.find('.js-field-card-filter') as HTMLInputElement).value.trim());
    Filter.resetExceptions();
  },
  // this: any — the label data context exposes `_id`.
  'click .js-toggle-label-filter'(this: any, evt: JQuery.TriggeredEvent) {
    evt.preventDefault();
    Filter.labelIds.toggle(getFilterIdFromEvent(evt, this?._id));
    Filter.resetExceptions();
  },
  // this: any — the member data context exposes `_id`.
  'click .js-toggle-member-filter'(this: any, evt: JQuery.TriggeredEvent) {
    evt.preventDefault();
    Filter.members.toggle(getFilterIdFromEvent(evt, this?._id));
    Filter.resetExceptions();
  },
  // this: any — the assignee data context exposes `_id`.
  'click .js-toggle-assignee-filter'(this: any, evt: JQuery.TriggeredEvent) {
    evt.preventDefault();
    Filter.assignees.toggle(getFilterIdFromEvent(evt, this?._id));
    Filter.resetExceptions();
  },
  'click .js-toggle-no-due-date-filter'(evt: JQuery.TriggeredEvent) {
    evt.preventDefault();
    Filter.dueAt.noDate();
    Filter.resetExceptions();
  },
  'click .js-toggle-overdue-filter'(evt: JQuery.TriggeredEvent) {
    evt.preventDefault();
    Filter.dueAt.past();
    Filter.resetExceptions();
  },
  'click .js-toggle-due-today-filter'(evt: JQuery.TriggeredEvent) {
    evt.preventDefault();
    Filter.dueAt.today();
    Filter.resetExceptions();
  },
  'click .js-toggle-due-tomorrow-filter'(evt: JQuery.TriggeredEvent) {
    evt.preventDefault();
    Filter.dueAt.tomorrow();
    Filter.resetExceptions();
  },
  'click .js-toggle-due-this-week-filter'(evt: JQuery.TriggeredEvent) {
    evt.preventDefault();
    Filter.dueAt.thisWeek();
    Filter.resetExceptions();
  },
  'click .js-toggle-due-next-week-filter'(evt: JQuery.TriggeredEvent) {
    evt.preventDefault();
    Filter.dueAt.nextWeek();
    Filter.resetExceptions();
  },
  'click .js-toggle-archive-filter'(evt: JQuery.TriggeredEvent) {
    evt.preventDefault();
    Filter.archive.toggle(Template.currentData()._id);
    Filter.resetExceptions();
    const currentBoardId = Session.get('currentBoard');
    if (!currentBoardId) return;
    Meteor.subscribe(
      'board',
      currentBoardId,
      // Filter.archive as any — isSelected() is called with no args at runtime.
      (Filter.archive as any).isSelected(),
    );
  },
  'click .js-toggle-hideEmpty-filter'(evt: JQuery.TriggeredEvent) {
    evt.preventDefault();
    Filter.hideEmpty.toggle(Template.currentData()._id);
    Filter.resetExceptions();
  },
  // this: any — the custom-field data context exposes `_id`.
  'click .js-toggle-custom-fields-filter'(this: any, evt: JQuery.TriggeredEvent) {
    evt.preventDefault();
    Filter.customFields.toggle(getFilterIdFromEvent(evt, this?._id));
    Filter.resetExceptions();
  },
  // this: any — the dependency-type data context exposes `_id`.
  'click .js-toggle-dependency-filter'(this: any, evt: JQuery.TriggeredEvent) {
    evt.preventDefault();
    Filter.cardDependencies.toggle(getFilterIdFromEvent(evt, this?._id));
    Filter.resetExceptions();
  },
  'change .js-field-advanced-filter'(evt: JQuery.TriggeredEvent, tpl: Blaze.TemplateInstance) {
    evt.preventDefault();
    Filter.advanced.set(
      (tpl.find('.js-field-advanced-filter') as HTMLInputElement).value.trim(),
    );
    Filter.resetExceptions();
  },
  'click .js-clear-all'(evt: JQuery.TriggeredEvent) {
    evt.preventDefault();
    Filter.reset();
  },
  'click .js-filter-to-selection'(evt: JQuery.TriggeredEvent) {
    evt.preventDefault();
    const selectedCards = ReactiveCache.getCards(Filter.mongoSelector()).map((c: any) => {
      return c._id;
    });
    MultiSelection.add(selectedCards);
  },
});

// mutationNameOrCallback: any — either a Card method name or a callback.
async function mutateSelectedCards(mutationNameOrCallback: any, ...args: any[]) {
  const cards = ReactiveCache.getCards(MultiSelection.getMongoSelector(), {sort: ['sort']});
  for (const card of cards) {
    if (typeof mutationNameOrCallback === 'function') {
      await mutationNameOrCallback(card);
    } else {
      // card as any — indexing the Card by a dynamic mutation method name.
      await (card as any)[mutationNameOrCallback](...args);
    }
  }
}

function getSelectedCardsSorted() {
  return ReactiveCache.getCards(MultiSelection.getMongoSelector(), { sort: ['sort'] });
}

function getListsForBoardSwimlane(boardId: any, swimlaneId: any) {
  if (!boardId) return [];
  const board = ReactiveCache.getBoard(boardId);
  if (!board) return [];

  // selector: the lists query, extended with swimlaneId below.
  const selector: Record<string, any> = {
    boardId,
    archived: false,
  };

  if (swimlaneId) {
    const defaultSwimlane = board.getDefaultSwimline && board.getDefaultSwimline();
    if (defaultSwimlane && defaultSwimlane._id === swimlaneId) {
      selector.swimlaneId = { $in: [swimlaneId, null, ''] };
    } else {
      selector.swimlaneId = swimlaneId;
    }
  }

  return ReactiveCache.getLists(selector, { sort: { sort: 1 } });
}

function getMaxSortForList(listId: any, swimlaneId: any) {
  if (!listId || !swimlaneId) return null;
  const card = ReactiveCache.getCard(
    { listId, swimlaneId, archived: false },
    { sort: { sort: -1 } },
    true,
  );
  return card ? card.sort : null;
}

function buildInsertionSortIndexes(cardsCount: number, targetCard: any, position: any, listId: any, swimlaneId: any) {
  const indexes: number[] = [];
  if (cardsCount <= 0) return indexes;

  if (targetCard) {
    const step = 0.5;
    if (position === 'above') {
      const start = targetCard.sort - step * cardsCount;
      for (let i = 0; i < cardsCount; i += 1) {
        indexes.push(start + step * i);
      }
    } else {
      const start = targetCard.sort + step;
      for (let i = 0; i < cardsCount; i += 1) {
        indexes.push(start + step * i);
      }
    }
    return indexes;
  }

  const maxSort = getMaxSortForList(listId, swimlaneId);
  const start = maxSort === null ? 0 : maxSort + 1;
  for (let i = 0; i < cardsCount; i += 1) {
    indexes.push(start + i);
  }
  return indexes;
}

function mapSelection(kind: any, _id: any) {
  return ReactiveCache.getCards(MultiSelection.getMongoSelector(), {sort: ['sort']}).map((card: any) => {
    const methodName = kind === 'label' ? 'hasLabel' : 'isAssigned';
    return card[methodName](_id);
  });
}

Template.multiselectionSidebar.helpers({
  isBoardAdmin() {
    return ReactiveCache.getCurrentUser()?.isBoardAdmin();
  },
  isCommentOnly() {
    return ReactiveCache.getCurrentUser().isCommentOnly();
  },
  allSelectedElementHave(kind: any, _id: any) {
    if (MultiSelection.isEmpty()) return false;
    else return mapSelection(kind, _id).every(Boolean);
  },
  someSelectedElementHave(kind: any, _id: any) {
    if (MultiSelection.isEmpty()) return false;
    else return mapSelection(kind, _id).some(Boolean);
  },
});

Template.multiselectionSidebar.events({
  'click .js-toggle-label-multiselection'(evt: JQuery.TriggeredEvent) {
    const labelId = Template.currentData()._id;
    const mappedSelection = mapSelection('label', labelId);

    if (mappedSelection.every(Boolean)) {
      mutateSelectedCards('removeLabel', labelId);
    } else if (mappedSelection.every((bool: any) => !bool)) {
      mutateSelectedCards('addLabel', labelId);
    } else {
      const popup = Popup.open('disambiguateMultiLabel');
      // XXX We need to have a better integration between the popup and the
      // UI components systems.
      popup.call(Template.currentData(), evt);
    }
  },
  'click .js-toggle-member-multiselection'(evt: JQuery.TriggeredEvent) {
    const memberId = Template.currentData()._id;
    const mappedSelection = mapSelection('member', memberId);
    if (mappedSelection.every(Boolean)) {
      mutateSelectedCards('unassignMember', memberId);
    } else if (mappedSelection.every((bool: any) => !bool)) {
      mutateSelectedCards('assignMember', memberId);
    } else {
      const popup = Popup.open('disambiguateMultiMember');
      // XXX We need to have a better integration between the popup and the
      // UI components systems.
      popup.call(Template.currentData(), evt);
    }
  },
  'click .js-move-selection': Popup.open('moveSelection'),
  'click .js-copy-selection': Popup.open('copySelection'),
  'click .js-selection-color': Popup.open('setSelectionColor'),
  'click .js-archive-selection'() {
    mutateSelectedCards('archive');
    EscapeActions.executeUpTo('multiselection');
  },
});

Template.disambiguateMultiLabelPopup.events({
  // this: any — the label data context exposes `_id`.
  'click .js-remove-label'(this: any) {
    mutateSelectedCards('removeLabel', this._id);
    Popup.back();
  },
  'click .js-add-label'(this: any) {
    mutateSelectedCards('addLabel', this._id);
    Popup.back();
  },
});

Template.disambiguateMultiMemberPopup.events({
  // this: any — the member data context exposes `_id`.
  'click .js-unassign-member'(this: any) {
    mutateSelectedCards('assignMember', this._id);
    Popup.back();
  },
  'click .js-assign-member'(this: any) {
    mutateSelectedCards('unassignMember', this._id);
    Popup.back();
  },
});

Template.moveSelectionPopup.onCreated(function(this: SelectionPopupInstance) {
  this.selectedBoardId = new ReactiveVar(Session.get('currentBoard'));
  this.selectedSwimlaneId = new ReactiveVar('');
  this.selectedListId = new ReactiveVar('');
  this.selectedCardId = new ReactiveVar('');
  this.position = new ReactiveVar('above');

  this.getBoardData = function(this: SelectionPopupInstance, boardId: any) {
    const self = this;
    Meteor.subscribe('board', boardId, false, {
      onReady() {
        const sameBoardId = self.selectedBoardId.get() === boardId;
        self.selectedBoardId.set(boardId);

        if (!sameBoardId) {
          self.setFirstSwimlaneId();
          self.setFirstListId();
        }
      },
    });
  };

  this.setFirstSwimlaneId = function(this: SelectionPopupInstance) {
    try {
      // board: any — guarded by the surrounding try/catch.
      const board: any = ReactiveCache.getBoard(this.selectedBoardId.get());
      const swimlaneId = board.swimlanes()[0]._id;
      this.selectedSwimlaneId.set(swimlaneId);
    } catch (e) {}
  };

  this.setFirstListId = function(this: SelectionPopupInstance) {
    try {
      const boardId = this.selectedBoardId.get();
      const swimlaneId = this.selectedSwimlaneId.get();
      const lists = getListsForBoardSwimlane(boardId, swimlaneId);
      const listId = lists[0] ? lists[0]._id : '';
      this.selectedListId.set(listId);
      this.selectedCardId.set('');
    } catch (e) {}
  };

  this.getBoardData(Session.get('currentBoard'));
  this.setFirstSwimlaneId();
  this.setFirstListId();
});

Template.moveSelectionPopup.helpers({
  boards() {
    return ReactiveCache.getBoards(
      {
        archived: false,
        'members.userId': Meteor.userId(),
        _id: { $ne: ReactiveCache.getCurrentUser().getTemplatesBoardId() },
      },
      {
        sort: { sort: 1 },
      },
    );
  },
  swimlanes() {
    const board = ReactiveCache.getBoard((Template.instance() as SelectionPopupInstance).selectedBoardId.get());
    return board ? board.swimlanes() : [];
  },
  lists() {
    const instance = Template.instance() as SelectionPopupInstance;
    return getListsForBoardSwimlane(
      instance.selectedBoardId.get(),
      instance.selectedSwimlaneId.get(),
    );
  },
  cards() {
    const instance = Template.instance() as SelectionPopupInstance;
    const list = ReactiveCache.getList(instance.selectedListId.get());
    if (!list) return [];
    return list.cards(instance.selectedSwimlaneId.get()).sort((a: any, b: any) => a.sort - b.sort);
  },
  isDialogOptionBoardId(boardId: any) {
    return (Template.instance() as SelectionPopupInstance).selectedBoardId.get() === boardId;
  },
  isDialogOptionSwimlaneId(swimlaneId: any) {
    return (Template.instance() as SelectionPopupInstance).selectedSwimlaneId.get() === swimlaneId;
  },
  isDialogOptionListId(listId: any) {
    return (Template.instance() as SelectionPopupInstance).selectedListId.get() === listId;
  },
  isTitleDefault(title: any) {
    if (
      title.startsWith("key 'default") &&
      title.endsWith('returned an object instead of string.')
    ) {
      const translated = `${TAPi18n.__('defaultdefault')}`;
      if (
        translated.startsWith("key 'default") &&
        translated.endsWith('returned an object instead of string.')
      ) {
        return 'Default';
      }
      return translated;
    }
    if (title === 'Default') {
      return `${TAPi18n.__('defaultdefault')}`;
    }
    return title;
  },
});

Template.moveSelectionPopup.events({
  'change .js-select-boards'(event: JQuery.TriggeredEvent) {
    const boardId = $(event.currentTarget).val();
    (Template.instance() as SelectionPopupInstance).getBoardData(boardId);
  },
  'change .js-select-swimlanes'(event: JQuery.TriggeredEvent) {
    const instance = Template.instance() as SelectionPopupInstance;
    instance.selectedSwimlaneId.set($(event.currentTarget).val());
    instance.setFirstListId();
  },
  'change .js-select-lists'(event: JQuery.TriggeredEvent) {
    const instance = Template.instance() as SelectionPopupInstance;
    instance.selectedListId.set($(event.currentTarget).val());
    instance.selectedCardId.set('');
  },
  'change .js-select-cards'(event: JQuery.TriggeredEvent) {
    (Template.instance() as SelectionPopupInstance).selectedCardId.set($(event.currentTarget).val());
  },
  'change input[name="position"]'(event: JQuery.TriggeredEvent) {
    (Template.instance() as SelectionPopupInstance).position.set($(event.currentTarget).val());
  },
  async 'click .js-done'() {
    const instance = Template.instance() as SelectionPopupInstance;
    const boardId = instance.selectedBoardId.get();
    const swimlaneId = instance.selectedSwimlaneId.get();
    const listId = instance.selectedListId.get();
    const cardId = instance.selectedCardId.get();
    const position = instance.position.get();

    const selectedCards = getSelectedCardsSorted();
    const targetCard = cardId ? ReactiveCache.getCard(cardId) : null;
    const sortIndexes = buildInsertionSortIndexes(
      selectedCards.length,
      targetCard,
      position,
      listId,
      swimlaneId,
    );

    for (let i = 0; i < selectedCards.length; i += 1) {
      await selectedCards[i].move(boardId, swimlaneId, listId, sortIndexes[i]);
    }
    EscapeActions.executeUpTo('multiselection');
  },
});

Template.copySelectionPopup.onCreated(function(this: SelectionPopupInstance) {
  this.selectedBoardId = new ReactiveVar(Session.get('currentBoard'));
  this.selectedSwimlaneId = new ReactiveVar('');
  this.selectedListId = new ReactiveVar('');
  this.selectedCardId = new ReactiveVar('');
  this.position = new ReactiveVar('above');

  this.getBoardData = function(this: SelectionPopupInstance, boardId: any) {
    const self = this;
    Meteor.subscribe('board', boardId, false, {
      onReady() {
        const sameBoardId = self.selectedBoardId.get() === boardId;
        self.selectedBoardId.set(boardId);

        if (!sameBoardId) {
          self.setFirstSwimlaneId();
          self.setFirstListId();
        }
      },
    });
  };

  this.setFirstSwimlaneId = function(this: SelectionPopupInstance) {
    try {
      // board: any — guarded by the surrounding try/catch.
      const board: any = ReactiveCache.getBoard(this.selectedBoardId.get());
      const swimlaneId = board.swimlanes()[0]._id;
      this.selectedSwimlaneId.set(swimlaneId);
    } catch (e) {}
  };

  this.setFirstListId = function(this: SelectionPopupInstance) {
    try {
      const boardId = this.selectedBoardId.get();
      const swimlaneId = this.selectedSwimlaneId.get();
      const lists = getListsForBoardSwimlane(boardId, swimlaneId);
      const listId = lists[0] ? lists[0]._id : '';
      this.selectedListId.set(listId);
      this.selectedCardId.set('');
    } catch (e) {}
  };

  this.getBoardData(Session.get('currentBoard'));
  this.setFirstSwimlaneId();
  this.setFirstListId();
});

Template.copySelectionPopup.helpers({
  boards() {
    return ReactiveCache.getBoards(
      {
        archived: false,
        'members.userId': Meteor.userId(),
        _id: { $ne: ReactiveCache.getCurrentUser().getTemplatesBoardId() },
      },
      {
        sort: { sort: 1 },
      },
    );
  },
  swimlanes() {
    const board = ReactiveCache.getBoard((Template.instance() as SelectionPopupInstance).selectedBoardId.get());
    return board ? board.swimlanes() : [];
  },
  lists() {
    const instance = Template.instance() as SelectionPopupInstance;
    return getListsForBoardSwimlane(
      instance.selectedBoardId.get(),
      instance.selectedSwimlaneId.get(),
    );
  },
  cards() {
    const instance = Template.instance() as SelectionPopupInstance;
    const list = ReactiveCache.getList(instance.selectedListId.get());
    if (!list) return [];
    return list.cards(instance.selectedSwimlaneId.get()).sort((a: any, b: any) => a.sort - b.sort);
  },
  isDialogOptionBoardId(boardId: any) {
    return (Template.instance() as SelectionPopupInstance).selectedBoardId.get() === boardId;
  },
  isDialogOptionSwimlaneId(swimlaneId: any) {
    return (Template.instance() as SelectionPopupInstance).selectedSwimlaneId.get() === swimlaneId;
  },
  isDialogOptionListId(listId: any) {
    return (Template.instance() as SelectionPopupInstance).selectedListId.get() === listId;
  },
  isTitleDefault(title: any) {
    if (
      title.startsWith("key 'default") &&
      title.endsWith('returned an object instead of string.')
    ) {
      const translated = `${TAPi18n.__('defaultdefault')}`;
      if (
        translated.startsWith("key 'default") &&
        translated.endsWith('returned an object instead of string.')
      ) {
        return 'Default';
      }
      return translated;
    }
    if (title === 'Default') {
      return `${TAPi18n.__('defaultdefault')}`;
    }
    return title;
  },
});

Template.copySelectionPopup.events({
  'change .js-select-boards'(event: JQuery.TriggeredEvent) {
    const boardId = $(event.currentTarget).val();
    (Template.instance() as SelectionPopupInstance).getBoardData(boardId);
  },
  'change .js-select-swimlanes'(event: JQuery.TriggeredEvent) {
    const instance = Template.instance() as SelectionPopupInstance;
    instance.selectedSwimlaneId.set($(event.currentTarget).val());
    instance.setFirstListId();
  },
  'change .js-select-lists'(event: JQuery.TriggeredEvent) {
    const instance = Template.instance() as SelectionPopupInstance;
    instance.selectedListId.set($(event.currentTarget).val());
    instance.selectedCardId.set('');
  },
  'change .js-select-cards'(event: JQuery.TriggeredEvent) {
    (Template.instance() as SelectionPopupInstance).selectedCardId.set($(event.currentTarget).val());
  },
  'change input[name="position"]'(event: JQuery.TriggeredEvent) {
    (Template.instance() as SelectionPopupInstance).position.set($(event.currentTarget).val());
  },
  async 'click .js-done'() {
    const instance = Template.instance() as SelectionPopupInstance;
    const boardId = instance.selectedBoardId.get();
    const swimlaneId = instance.selectedSwimlaneId.get();
    const listId = instance.selectedListId.get();
    const cardId = instance.selectedCardId.get();
    const position = instance.position.get();

    const selectedCards = getSelectedCardsSorted();
    const targetCard = cardId ? ReactiveCache.getCard(cardId) : null;
    const sortIndexes = buildInsertionSortIndexes(
      selectedCards.length,
      targetCard,
      position,
      listId,
      swimlaneId,
    );

    for (let i = 0; i < selectedCards.length; i += 1) {
      const card = selectedCards[i];
      const newCardId = await Meteor.callAsync(
        'copyCard',
        card._id,
        boardId,
        swimlaneId,
        listId,
        true,
        { title: card.title },
      );
      if (!newCardId) continue;

      const newCard = ReactiveCache.getCard(newCardId);
      if (!newCard) continue;

      await newCard.move(boardId, swimlaneId, listId, sortIndexes[i]);
    }
    EscapeActions.executeUpTo('multiselection');
  },
});

// Shared instance shape for the move/copy selection popups: selection state
// plus the board-data helpers wired up in onCreated.
interface SelectionPopupInstance extends Blaze.TemplateInstance {
  selectedBoardId: ReactiveVar<any>;
  selectedSwimlaneId: ReactiveVar<any>;
  selectedListId: ReactiveVar<any>;
  selectedCardId: ReactiveVar<any>;
  position: ReactiveVar<any>;
  getBoardData: (boardId: any) => void;
  setFirstSwimlaneId: () => void;
  setFirstListId: () => void;
}
