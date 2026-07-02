import { Template } from 'meteor/templating';
import { Blaze } from 'meteor/blaze';
import { ReactiveVar } from 'meteor/reactive-var';
import { Utils } from '/client/lib/utils';

Template.boardTriggers.onCreated(function (this: BoardTriggersInstance) {
  this.provaVar = new ReactiveVar('');
  this.currentPopupTriggerId = 'def';
  this.cardTitleFilters = {};
  this.setNameFilter = (name: string) => {
    this.cardTitleFilters[this.currentPopupTriggerId] = name;
  };
});

Template.boardTriggers.events({
  'click .js-open-card-title-popup'(event: JQuery.TriggeredEvent, tpl: BoardTriggersInstance) {
    const funct = Popup.open('boardCardTitle');
    const divId = $(event.currentTarget.parentNode.parentNode).attr('id') as string;
    tpl.currentPopupTriggerId = divId;
    funct.call(this, event);
  },
  'click .js-add-create-trigger'(event: JQuery.TriggeredEvent, tpl: BoardTriggersInstance) {
    const desc = Utils.getTriggerActionDesc(event, tpl);
    const datas = Template.currentData();
    const listName = (tpl.find('#create-list-name') as HTMLInputElement).value;
    const swimlaneName = (tpl.find('#create-swimlane-name') as HTMLInputElement).value;
    const boardId = Session.get('currentBoard');
    const divId = $(event.currentTarget.parentNode).attr('id') as string;
    const cardTitle = tpl.cardTitleFilters[divId];
    // move to generic funciont
    datas.triggerVar.set({
      activityType: 'createCard',
      boardId,
      cardTitle,
      swimlaneName,
      listName,
      desc,
    });
  },
  'click .js-add-moved-trigger'(event: JQuery.TriggeredEvent, tpl: BoardTriggersInstance) {
    const datas = Template.currentData();
    const desc = Utils.getTriggerActionDesc(event, tpl);
    const swimlaneName = (tpl.find('#create-swimlane-name-2') as HTMLInputElement).value;
    const actionSelected = (tpl.find('#move-action') as HTMLInputElement).value;
    const listName = (tpl.find('#move-list-name') as HTMLInputElement).value;
    const boardId = Session.get('currentBoard');
    const divId = $(event.currentTarget.parentNode).attr('id') as string;
    const cardTitle = tpl.cardTitleFilters[divId];
    if (actionSelected === 'moved-to') {
      datas.triggerVar.set({
        activityType: 'moveCard',
        boardId,
        listName,
        cardTitle,
        swimlaneName,
        oldListName: '*',
        desc,
      });
    }
    if (actionSelected === 'moved-from') {
      datas.triggerVar.set({
        activityType: 'moveCard',
        boardId,
        cardTitle,
        swimlaneName,
        listName: '*',
        oldListName: listName,
        desc,
      });
    }
  },
  'click .js-add-gen-moved-trigger'(event: JQuery.TriggeredEvent, tpl: BoardTriggersInstance) {
    const datas = Template.currentData();
    const desc = Utils.getTriggerActionDesc(event, tpl);
    const boardId = Session.get('currentBoard');

    datas.triggerVar.set({
      activityType: 'moveCard',
      boardId,
      swimlaneName: '*',
      listName: '*',
      oldListName: '*',
      desc,
    });
  },
  'click .js-add-arch-trigger'(event: JQuery.TriggeredEvent, tpl: BoardTriggersInstance) {
    const datas = Template.currentData();
    const desc = Utils.getTriggerActionDesc(event, tpl);
    const actionSelected = (tpl.find('#arch-action') as HTMLInputElement).value;
    const boardId = Session.get('currentBoard');
    if (actionSelected === 'archived') {
      datas.triggerVar.set({
        activityType: 'archivedCard',
        boardId,
        desc,
      });
    }
    if (actionSelected === 'unarchived') {
      datas.triggerVar.set({
        activityType: 'restoredCard',
        boardId,
        desc,
      });
    }
  },
});

Template.boardCardTitlePopup.events({
  submit(event: JQuery.TriggeredEvent) {
    const title = ($(event.target)
      .find('.js-card-filter-name')
      .val() as string)
      .trim();
    const opener = Popup.getOpenerComponent();
    if (opener?.setNameFilter) {
      opener.setNameFilter(title);
    }
    event.preventDefault();
    Popup.back();
  },
});

// The boardTriggers Blaze template instance tracks the card-title filter popup:
// which trigger row opened it (currentPopupTriggerId), the per-row filter text
// (cardTitleFilters), and a setter the popup calls back into.
interface BoardTriggersInstance extends Blaze.TemplateInstance {
  provaVar: ReactiveVar<string>;
  currentPopupTriggerId: string;
  cardTitleFilters: Record<string, string>;
  setNameFilter: (name: string) => void;
}
