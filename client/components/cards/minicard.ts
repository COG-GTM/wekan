import { Template } from 'meteor/templating';
import { Blaze } from 'meteor/blaze';
import { Meteor } from 'meteor/meteor';
import { ReactiveCache } from '/imports/reactiveCache';
import { TAPi18n } from '/imports/i18n';
import { CustomFieldStringTemplate } from '/client/lib/customFields';
import { handleFileUpload } from './attachments';
import uploadProgressManager from '../../lib/uploadProgressManager';
import { Utils } from '/client/lib/utils';
import ChecklistItems from '/models/checklistItems';
import Cards from '/models/cards';
import { normalizeDependencies } from '/models/metadata/dependencies';

// `board` is a dynamic board model doc indexed by the (legacy/current) flag
// field names; `legacyField` is null when a flag has no card-details fallback.
function getMinicardFlag(board: any, onMinicardField: string, legacyField: string | null, defaultValue: boolean) {
  if (!board) return false;
  if (board[onMinicardField] !== null && board[onMinicardField] !== undefined) {
    return board[onMinicardField];
  }
  if (legacyField && board[legacyField] !== null && board[legacyField] !== undefined) {
    return board[legacyField];
  }
  return defaultValue;
}

// Template.cards.events({
//   'click .member': Popup.open('cardMember')
// });

Template.minicard.helpers({
  // #3392: show a drag-to-connect handle on the minicard when the board's
  // dependency overlay is on and the user can edit the board. Dragging it onto
  // another card creates a dependency (handled in dependencyOverlay.js).
  showDependencyConnectHandle(this: any) {
    const board = ReactiveCache.getBoard(this.boardId);
    return !!(board && board.showDependencies && Utils.canModifyBoard());
  },
  // #3392: PI Program Board "Red Strings". Show a small badge on the minicard
  // when a card has dependencies: the first dependency's icon and color plus the
  // total count.
  dependencyBadge(this: any) {
    const deps = normalizeDependencies(this.cardDependencies);
    if (deps.length === 0) return null;
    return {
      icon: deps[0].icon,
      color: deps[0].color,
      count: deps.length,
    };
  },
  // #3984: visual card aging — fade cards that have not been touched recently,
  // based on dateLastActivity, when the board has card aging enabled.
  agingClass(this: any) {
    const board = ReactiveCache.getBoard(this.boardId);
    if (!board || !board.cardAging) return '';
    const last = this.dateLastActivity || this.modifiedAt || this.createdAt;
    if (!last) return '';
    const days = (Date.now() - new Date(last).getTime()) / 86400000;
    // #3984: thresholds are board-configurable (board settings / cardSettings API),
    // defaulting to 7 / 14 / 28 days.
    const d1 = board.cardAgingDays1 != null ? board.cardAgingDays1 : 7;
    const d2 = board.cardAgingDays2 != null ? board.cardAgingDays2 : 14;
    const d3 = board.cardAgingDays3 != null ? board.cardAgingDays3 : 28;
    if (days >= d3) return 'minicard-aging-3';
    if (days >= d2) return 'minicard-aging-2';
    if (days >= d1) return 'minicard-aging-1';
    return '';
  },
  formattedCurrencyCustomFieldValue(this: any, definition: any) {
    const customField = this
      .customFieldsWD()
      .find((f: any) => f._id === definition._id);
    const customFieldTrueValue =
      customField && customField.trueValue ? customField.trueValue : '';

    const locale = TAPi18n.getLanguage();
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: definition.settings.currencyCode,
    }).format(customFieldTrueValue);
  },

  formattedStringtemplateCustomFieldValue(this: any, definition: any) {
    const customField = this
      .customFieldsWD()
      .find((f: any) => f._id === definition._id);

    const customFieldTrueValue =
      customField && customField.trueValue ? customField.trueValue : [];

    const ret = new CustomFieldStringTemplate(definition).getFormattedValue(customFieldTrueValue);
    return ret;
  },

  showCreatorOnMinicard(this: any) {
    // cache "board" to reduce the mini-mongodb access
    const board = this.board();
    let ret = false;
    if (board) {
      ret = board.allowsCreatorOnMinicard ?? false;
    }
    return ret;
  },
  isWatching(this: any) {
    return this.findWatcher(Meteor.userId());
  },

  showMembers(this: any) {
    const board = this.board();
    return getMinicardFlag(board, 'allowsMembersOnMinicard', 'allowsMembers', true);
  },

  showAssignee(this: any) {
    const board = this.board();
    return getMinicardFlag(board, 'allowsAssigneeOnMinicard', 'allowsAssignee', true);
  },
  showReceived(this: any) {
    const board = this.board();
    return getMinicardFlag(board, 'allowsReceivedDateOnMinicard', 'allowsReceivedDate', true);
  },
  showStart(this: any) {
    const board = this.board();
    return getMinicardFlag(board, 'allowsStartDateOnMinicard', 'allowsStartDate', true);
  },
  showDue(this: any) {
    const board = this.board();
    return getMinicardFlag(board, 'allowsDueDateOnMinicard', 'allowsDueDate', true);
  },
  showEnd(this: any) {
    const board = this.board();
    return getMinicardFlag(board, 'allowsEndDateOnMinicard', 'allowsEndDate', true);
  },
  showLabels(this: any) {
    const board = this.board();
    return getMinicardFlag(board, 'allowsLabelsOnMinicard', 'allowsLabels', true);
  },
  showCardNumber(this: any) {
    const board = this.board();
    return getMinicardFlag(board, 'allowsCardNumberOnMinicard', 'allowsCardNumber', false);
  },
  // "Mark as complete" toggle on the minicard. No legacy fallback to the
  // card-details setting (allowsDueComplete): hidden by default so it only
  // appears when explicitly enabled in Card Settings > Show at Minicard.
  showDueComplete(this: any) {
    const board = this.board();
    return getMinicardFlag(board, 'allowsDueCompleteOnMinicard', null, false);
  },
  showSubtasks(this: any) {
    const board = this.board();
    return getMinicardFlag(board, 'allowsSubtasksOnMinicard', 'allowsSubtasks', true);
  },

  hiddenMinicardLabelText() {
    const currentUser = ReactiveCache.getCurrentUser();
    if (currentUser) {
      return (currentUser.profile || {}).hiddenMinicardLabelText;
    } else if (window.localStorage.getItem('hiddenMinicardLabelText')) {
      return true;
    } else {
      return false;
    }
  },
  cover(this: any) {
    if (!this.coverId) return null;
    const attachment = ReactiveCache.getAttachment(this.coverId);
    if (!attachment) return null;
    const coverLink = typeof attachment.link === 'function' ? attachment.link() : '';
    if (!coverLink) return null;
    return {
      link() {
        return coverLink;
      },
    };
  },
  // XXX resolve this nasty hack for https://github.com/veliovgroup/Meteor-Files/issues/763
  sess() {
    // Meteor.connection (and its internal _lastSessionId) is not in @types/meteor.
    const connection = (Meteor as any).connection;
    return connection && connection._lastSessionId
      ? connection._lastSessionId
      : null;
  },
  // Upload progress helpers
  hasActiveUploads(this: any) {
    return uploadProgressManager.hasActiveUploads(this._id);
  },
  uploads(this: any) {
    return uploadProgressManager.getUploadsForCard(this._id);
  },
  uploadCount(this: any) {
    return uploadProgressManager.getUploadCountForCard(this._id);
  },
  listName(this: any) {
    const list = this.list();
    return list ? list.title : '';
  },

  shouldShowListOnMinicard(this: any) {
    // Show list name if either:
    // 1. Board-wide setting is enabled, OR
    // 2. This specific card has the setting enabled
    const currentBoard = this.board();
    if (!currentBoard) return false;
    return currentBoard.allowsShowListsOnMinicard || this.showListOnMinicard;
  },

  shouldShowChecklistAtMinicard(this: any) {
    // Return checklists that should be shown on minicard
    const currentBoard = this.board();
    if (!currentBoard) return [];

    const checklists = this.checklists();
    const visibleChecklists: any[] = [];

    checklists.forEach((checklist: any) => {
      // Show checklist if either:
      // 1. Board-wide setting is enabled, OR
      // 2. This specific checklist has the setting enabled
      // #5565: use the same board field the sidebar toggle writes
      // (`allowsChecklistsOnMinicard`); this previously checked a different,
      // UI-less field (`allowsChecklistAtMinicard`), so the board toggle to show
      // checklists on minicards had no effect.
      if (currentBoard.allowsChecklistsOnMinicard || checklist.showChecklistAtMinicard) {
        visibleChecklists.push(checklist);
      }
    });

    return visibleChecklists;
  }
});

// #459: accessible reordering — keyboard/screen-reader users can move a card up
// or down within its list via sr-only buttons (no drag-and-drop required). The
// move swaps the card's sort value with its neighbour in the same list+swimlane.
function moveCardBy(card: any, delta: number) {
  const siblings = ReactiveCache.getCards(
    { listId: card.listId, swimlaneId: card.swimlaneId, archived: false },
    { sort: { sort: 1 } },
  );
  const idx = siblings.findIndex((c: any) => c._id === card._id);
  const target = siblings[idx + delta];
  if (idx < 0 || !target) return;
  // Capture both sort values before either update; the docs are reactive and
  // card.sort would otherwise change after the first move.
  const cardSort = card.sort;
  const targetSort = target.sort;
  // Persist through the card model's move() mutation — the canonical client
  // path (e.g. editCardSortOrderPopup). A raw Cards.update of `sort` is the
  // wrong path here and would be reverted.
  card.move(card.boardId, card.swimlaneId, card.listId, targetSort);
  target.move(target.boardId, target.swimlaneId, target.listId, cardSort);
}

Template.minicard.events({
  'click .js-linked-link'(this: any) {
    if (this.isLinkedCard()) Utils.goCardId(this.linkedId);
    else if (this.isLinkedBoard())
      Utils.goBoardId(this.linkedId);
  },
  'click .js-card-move-up'(this: any, event: JQuery.TriggeredEvent) {
    // The move buttons sit inside the minicard anchor; don't let the click
    // bubble up and open the card detail view.
    event.preventDefault();
    event.stopPropagation();
    moveCardBy(this, -1);
  },
  'click .js-card-move-down'(this: any, event: JQuery.TriggeredEvent) {
    event.preventDefault();
    event.stopPropagation();
    moveCardBy(this, 1);
  },
  'click .js-toggle-card-complete'(this: any, event: JQuery.TriggeredEvent) {
    // Trello-style "mark complete" toggle (left of the title). Don't let the
    // click open the card.
    event.preventDefault();
    event.stopPropagation();
    if (!Utils.canModifyCard()) {
      return;
    }
    this.setDueComplete(!this.getDueComplete());
  },
  'click .js-toggle-minicard-label-text'() {
    if (window.localStorage.getItem('hiddenMinicardLabelText')) {
      window.localStorage.removeItem('hiddenMinicardLabelText'); //true
    } else {
      window.localStorage.setItem('hiddenMinicardLabelText', 'true'); //true
    }
  },
  'click span.badge-icon.fa.fa-sort, click span.badge-text.check-list-sort' : Popup.open("editCardSortOrder"),
  'click .minicard-labels'(event: JQuery.TriggeredEvent, tpl: Blaze.TemplateInstance) {
    if (tpl.find('.js-card-label:hover')) {
      Popup.open("cardLabels")(event, {dataContextIfCurrentDataIsUndefined: Template.currentData()});
    }
  },
  'click .js-open-minicard-details-menu'(event: JQuery.TriggeredEvent, tpl: Blaze.TemplateInstance) {
    event.preventDefault();
    event.stopPropagation();
    const card = Template.currentData();
    Popup.open('cardDetailsActions').call({currentData: () => card}, event);
  },
  // Drag and drop file upload handlers
  'dragover .minicard'(event: JQuery.TriggeredEvent) {
    // Only prevent default for file drags to avoid interfering with sortable
    const dataTransfer = (event.originalEvent as DragEvent).dataTransfer;
    if (dataTransfer && dataTransfer.types && dataTransfer.types.includes('Files')) {
      event.preventDefault();
      event.stopPropagation();
    }
  },
  'dragenter .minicard'(this: any, event: JQuery.TriggeredEvent) {
    const dataTransfer = (event.originalEvent as DragEvent).dataTransfer;
    if (dataTransfer && dataTransfer.types && dataTransfer.types.includes('Files')) {
      event.preventDefault();
      event.stopPropagation();
      const card = this;
      const board = card.board();
      // Only allow drag-and-drop if user can modify card and board allows attachments
      if (Utils.canModifyCard() && board && board.allowsAttachments) {
        $(event.currentTarget).addClass('is-dragging-over');
      }
    }
  },
  'dragleave .minicard'(event: JQuery.TriggeredEvent) {
    const dataTransfer = (event.originalEvent as DragEvent).dataTransfer;
    if (dataTransfer && dataTransfer.types && dataTransfer.types.includes('Files')) {
      event.preventDefault();
      event.stopPropagation();
      $(event.currentTarget).removeClass('is-dragging-over');
    }
  },
  'drop .minicard'(this: any, event: JQuery.TriggeredEvent) {
    const dataTransfer = (event.originalEvent as DragEvent).dataTransfer;
    if (dataTransfer && dataTransfer.types && dataTransfer.types.includes('Files')) {
      event.preventDefault();
      event.stopPropagation();
      $(event.currentTarget).removeClass('is-dragging-over');

      const card = this;
      const board = card.board();

      // Check permissions
      if (!Utils.canModifyCard() || !board || !board.allowsAttachments) {
        return;
      }

      // Check if this is a file drop (not a card reorder)
      if (!dataTransfer.files || dataTransfer.files.length === 0) {
        return;
      }

      const files = dataTransfer.files;
      if (files && files.length > 0) {
        handleFileUpload(card, files);
      }
    }
  },
});

Template.minicardChecklist.helpers({
  visibleItems(this: any) {
    const checklist = this.checklist || this;
    const items = checklist.items();

    return items.filter((item: any) => {
      // Hide finished items if hideCheckedChecklistItems is true
      if (item.isFinished && checklist.hideCheckedChecklistItems) {
        return false;
      }
      // Hide all items if hideAllChecklistItems is true
      if (checklist.hideAllChecklistItems) {
        return false;
      }
      return true;
    });
  },
});

Template.minicardChecklist.events({
  'click .js-convert-checklist-item-to-card'(event: JQuery.TriggeredEvent) {
    event.stopPropagation();
    // dynamic Blaze data context of the checklist-item form
    const formData = Blaze.getData(event.currentTarget) as any;
    if (!formData) return;
    const context = { currentData: () => formData };
    Popup.open('convertChecklistItemToCard').call(context, event);
  },
  'click .js-open-checklist-menu'(this: any, event: JQuery.TriggeredEvent) {
    const data = Template.currentData();
    const checklist = data.checklist || data;
    const card = data.card || this;
    const context = { currentData: () => ({ checklist, card }) };
    Popup.open('checklistActions').call(context, event);
  },
  'click .js-checklist-item .check-box-container'(event: JQuery.TriggeredEvent) {
    event.stopPropagation();
    event.preventDefault();
    // dynamic Blaze data context of the checklist item row
    const data = (Blaze.getData(event.target) || Blaze.getData(event.currentTarget)) as any;
    const item = data && data.item;
    if (item && item._id) {
      item.toggleItem();
    }
  },
  'click .js-submit-edit-checklist-item-form'(event: JQuery.TriggeredEvent) {
    event.preventDefault();
    event.stopPropagation();
    const $btn = $(event.currentTarget);
    const $form = $btn.closest('form');
    const textarea = $form.find('textarea.js-edit-checklist-item')[0] as HTMLTextAreaElement;
    if (!textarea) return;
    const title = textarea.value.trim();
    if (!title) return;
    // dynamic Blaze data context of the checklist-item edit form
    const formData = Blaze.getData($form[0]) as any;
    if (formData && formData.item && formData.item._id) {
      formData.item.setTitle(title);
    } else if (formData && formData.checklist && formData.checklist._id) {
      formData.checklist.setTitle(title);
    }
    $form.find('.js-close-inlined-form').trigger('click');
  },
  'submit .js-add-checklist-item'(event: JQuery.TriggeredEvent, tpl: Blaze.TemplateInstance) {
    event.preventDefault();
    const textarea = tpl.find('textarea.js-add-checklist-item') as HTMLTextAreaElement;
    if (!textarea) return;
    const title = textarea.value.trim();
    const data = Template.currentData() || {};
    const checklist = data.checklist;
    if (!checklist || !title) return;
    const items = checklist.items();
    const lastItem = items[items.length - 1] || null;
    const sortIndex = Utils.calculateIndexData(lastItem, null).base;
    ChecklistItems.insert({
      title,
      checklistId: checklist._id,
      cardId: checklist.cardId,
      sort: sortIndex,
    });
    textarea.value = '';
    textarea.focus();
  },
  'click .js-delete-checklist-item': Popup.afterConfirm('checklistItemDelete', function (this: any) {
    Popup.back();
    const item = this && this.item ? this.item : this;
    if (item && item._id) {
      ChecklistItems.remove(item._id);
    }
  }),
  'keydown textarea.js-add-checklist-item'(event: JQuery.TriggeredEvent) {
    if (event.keyCode === 13 && !event.shiftKey) {
      event.preventDefault();
      const $form = $(event.currentTarget).closest('form');
      $form.find('button[type=submit]').click();
    }
  },
});

Template.editCardSortOrderPopup.events({
  'keydown input.js-edit-card-sort-popup'(evt: JQuery.TriggeredEvent, tpl: Blaze.TemplateInstance) {
    // enter = save
    if (evt.keyCode === 13) {
      (tpl.find('button[type=submit]') as HTMLElement).click();
    }
  },
  'click button.js-submit-edit-card-sort-popup'(this: any, event: JQuery.TriggeredEvent, tpl: Blaze.TemplateInstance) {
    // save button pressed
    event.preventDefault();
    const sort = (tpl.$('.js-edit-card-sort-popup')[0] as HTMLInputElement)
      .value
      .trim();
    // `sort` is a string here; Number.isNaN(string) is always false (kept to
    // preserve the original runtime behavior).
    if (!Number.isNaN(sort as any)) {
      let card = this;
      card.move(card.boardId, card.swimlaneId, card.listId, sort);
      Popup.back();
    }
  },
});
