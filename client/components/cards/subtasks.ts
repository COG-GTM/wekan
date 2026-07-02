import { Template } from 'meteor/templating';
import { Blaze } from 'meteor/blaze';
import { ReactiveVar } from 'meteor/reactive-var';
import { Meteor } from 'meteor/meteor';
import { ReactiveCache } from '/imports/reactiveCache';
import { FlowRouter } from 'meteor/ostrio:flow-router-extra';
import Cards from '/models/cards';
import { Filter } from '/client/lib/filter';
import { subtaskStatusLabel } from './subtaskStatusHelpers';
import { subtaskNavTarget } from './subtaskViewHelpers';
import { Utils } from '/client/lib/utils';

Template.subtasks.events({
  'click .js-open-subtask-details-menu'(this: any, event: JQuery.TriggeredEvent) {
    // Close any existing popup first to avoid accumulating content
    if (Popup.isOpen()) {
      Popup.close();
    }
    // Now open the popup for this specific subtask
    Popup.open('subtaskActions').call(this, event);
  },
  async 'submit .js-add-subtask'(event: JQuery.TriggeredEvent, tpl: SubtasksInstance) {
    event.preventDefault();
    const textarea = tpl.find('textarea.js-add-subtask-item') as HTMLTextAreaElement;
    const title = textarea.value.trim();
    const cardId = Template.currentData().cardId;

    if (title) {
      // Subtask creation is performed server-side by the `addSubtaskCard` Meteor
      // method, so the default subtasks board/list/swimlane are resolved (and
      // lazily created exactly once) on the server. This prevents the client
      // from creating duplicate subtasks boards / swimlanes / columns
      // (#3868 / #5788 / #2256) and lets multiple subtasks be created reliably
      // (#4782), and the method applies the destination board's automatic
      // custom fields to the new subtask (#4037 / #3562).
      const _id = await Meteor.callAsync('addSubtaskCard', cardId, title);

      if (_id) {
        // In case the filter is active we need to add the newly inserted card in
        // the list of exceptions -- cards that are not filtered. Otherwise the
        // card will disappear instantly.
        // See https://github.com/wekan/wekan/issues/80
        Filter.addException(_id);

        setTimeout(() => {
          tpl.$('.add-subtask-item')
            .last()
            .click();
        }, 100);
      }
    }
    textarea.value = '';
    textarea.focus();
  },
  'submit .js-edit-subtask-title'(event: JQuery.TriggeredEvent, tpl: SubtasksInstance) {
    event.preventDefault();
    const textarea = tpl.find('textarea.js-edit-subtask-item') as HTMLTextAreaElement;
    const title = textarea.value.trim();
    const subtask = Template.currentData().subtask;
    subtask.setTitle(title);
  },
  async 'click .js-delete-subtask-item'() {
    const subtask = Template.currentData().subtask;
    if (subtask && subtask._id) {
      await subtask.archive();
    }
  },
  keydown(event: JQuery.TriggeredEvent) {
    //If user press enter key inside a form, submit it
    //Unless the user is also holding down the 'shift' key
    if (event.keyCode === 13 && !event.shiftKey) {
      event.preventDefault();
      const $form = $(event.currentTarget).closest('form');
      $form.find('button[type=submit]').click();
    }
  },
});

Template.subtasks.onCreated(function (this: SubtasksInstance) {
  this.toggleDeleteDialog = new ReactiveVar(false);
});

Template.subtasks.helpers({
  isBoardAdmin() {
    return ReactiveCache.getCurrentUser()?.isBoardAdmin();
  },
  toggleDeleteDialog() {
    return (Template.instance() as SubtasksInstance).toggleDeleteDialog;
  },
});

Template.subtaskDetail.helpers({
  // #6091: show the subtask's current status, i.e. the list it resides in
  // (prefixed with the board title when the subtask lives on another board
  // than the parent card).
  subtaskStatus(this: any) {
    const subtask = this.subtask;
    if (!subtask) {
      return '';
    }
    const list = subtask.list && subtask.list();
    const listTitle = list ? list.title : '';
    const board = subtask.board && subtask.board();
    const boardTitle = board ? board.title : '';
    const parentCard = Utils.getCurrentCard();
    const sameBoard = !!parentCard && parentCard.boardId === subtask.boardId;
    return subtaskStatusLabel({ listTitle, boardTitle, sameBoard });
  },
});

Template.subtaskItemDetail.events({
  async 'click .js-subtasks-item .check-box-container'() {
    const item = Template.currentData().item;
    if (item && item._id) {
      await item.toggleItem();
    }
  },
});

Template.subtaskActionsPopup.helpers({
  isBoardAdmin() {
    return ReactiveCache.getCurrentUser()?.isBoardAdmin();
  },
});

Template.subtaskActionsPopup.events({
  'click .js-view-subtask'(event: JQuery.TriggeredEvent) {
    if ($(event.target).hasClass('js-view-subtask')) {
      const subtask = Template.currentData().subtask;
      // #3743: open the SUBTASK card itself, not the parent/current card.
      // subtaskNavTarget derives boardId/slug/cardId from the subtask only.
      // #4762: it also returns undefined while the subtask's board is not
      // loaded yet (ReactiveCache miss), mirroring js-go-to-subtask-board.
      const target = subtaskNavTarget(subtask);
      if (target) {
        FlowRouter.go('card', target);
      }
    }
  },
  'click .js-go-to-subtask-board'() {
    const subtask = Template.currentData().subtask;
    const board = subtask.board();
    if (board) {
      Popup.close();
      FlowRouter.go('board', { id: board._id, slug: board.slug });
    }
  },
  'click .js-delete-subtask' : Popup.afterConfirm('subtaskDelete', async function (this: any) {
    Popup.back(2);
    const subtask = this.subtask;
    if (subtask && subtask._id) {
      await subtask.archive();
    }
  }),
});

Template.editSubtaskItemForm.helpers({
  user(this: any) {
    return ReactiveCache.getUser(this.userId);
  },
  isBoardAdmin() {
    return ReactiveCache.getCurrentUser()?.isBoardAdmin();
  },
});

// The subtasks template instance tracks whether the delete-confirm dialog is open.
interface SubtasksInstance extends Blaze.TemplateInstance {
  toggleDeleteDialog: ReactiveVar<boolean>;
}
