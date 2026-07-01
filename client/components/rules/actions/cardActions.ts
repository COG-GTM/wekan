import { Template } from 'meteor/templating';
import { Blaze } from 'meteor/blaze';
import { ReactiveVar } from 'meteor/reactive-var';
import Actions from '/models/actions';
import { CARD_COLORS } from '/models/metadata/colors';
import Rules from '/models/rules';
import Triggers from '/models/triggers';
import { Utils } from '/client/lib/utils';

let cardColors: string[];
Meteor.startup(() => {
  cardColors = CARD_COLORS;
});

// Module-level shared state so the color popup can read/write the
// cardColorButtonValue without relying on BlazeComponent.getOpenerComponent().
let sharedCardColorButtonValue: ReactiveVar<string>;

Template.cardActions.onCreated(function (this: CardActionsInstance) {
  this.subscribe('allRules');
  this.cardColorButtonValue = new ReactiveVar('green');
  sharedCardColorButtonValue = this.cardColorButtonValue;
});

Template.cardActions.helpers({
  cardColorButton() {
    return (Template.instance() as CardActionsInstance).cardColorButtonValue.get();
  },

  cardColorButtonText() {
    return `color-${(Template.instance() as CardActionsInstance).cardColorButtonValue.get()}`;
  },

  labels() {
    const labels = Utils.getCurrentBoard().labels;
    for (let i = 0; i < labels.length; i++) {
      if (labels[i].name === '' || labels[i].name === undefined) {
        labels[i].name = labels[i].color.toUpperCase();
      }
    }
    return labels;
  },
});

Template.cardActions.events({
  'click .js-set-date-action'(event: JQuery.TriggeredEvent, tpl: CardActionsInstance) {
    const data = Template.currentData();
    const ruleName = data.ruleName.get();
    const trigger = data.triggerVar.get();
    const triggerId = Triggers.insert(trigger);
    const actionSelected = (tpl.find('#setdate-action') as HTMLInputElement).value;
    const dateFieldSelected = (tpl.find('#setdate-datefield') as HTMLInputElement).value;
    const boardId = Session.get('currentBoard');
    const desc = Utils.getTriggerActionDesc(event, tpl);

    const actionId = Actions.insert({
      actionType: actionSelected,
      dateField: dateFieldSelected,
      boardId,
      desc,
    });

    Rules.insert({
      title: ruleName,
      triggerId,
      actionId,
      boardId,
      desc,
    });
  },

  'click .js-remove-datevalue-action'(event: JQuery.TriggeredEvent, tpl: CardActionsInstance) {
    const data = Template.currentData();
    const ruleName = data.ruleName.get();
    const trigger = data.triggerVar.get();
    const triggerId = Triggers.insert(trigger);
    const dateFieldSelected = (tpl.find('#setdate-removedatefieldvalue') as HTMLInputElement)
      .value;
    const boardId = Session.get('currentBoard');
    const desc = Utils.getTriggerActionDesc(event, tpl);

    const actionId = Actions.insert({
      actionType: 'removeDate',
      dateField: dateFieldSelected,
      boardId,
      desc,
    });

    Rules.insert({
      title: ruleName,
      triggerId,
      actionId,
      boardId,
      desc,
    });
  },
  'click .js-add-label-action'(event: JQuery.TriggeredEvent, tpl: CardActionsInstance) {
    const data = Template.currentData();
    const ruleName = data.ruleName.get();
    const trigger = data.triggerVar.get();
    const actionSelected = (tpl.find('#label-action') as HTMLInputElement).value;
    const labelId = (tpl.find('#label-id') as HTMLInputElement).value;
    const boardId = Session.get('currentBoard');
    const desc = Utils.getTriggerActionDesc(event, tpl);
    if (actionSelected === 'add') {
      const triggerId = Triggers.insert(trigger);
      const actionId = Actions.insert({
        actionType: 'addLabel',
        labelId,
        boardId,
        desc,
      });
      Rules.insert({
        title: ruleName,
        triggerId,
        actionId,
        boardId,
      });
    }
    if (actionSelected === 'remove') {
      const triggerId = Triggers.insert(trigger);
      const actionId = Actions.insert({
        actionType: 'removeLabel',
        labelId,
        boardId,
        desc,
      });
      Rules.insert({
        title: ruleName,
        triggerId,
        actionId,
        boardId,
      });
    }
  },
  'click .js-add-member-action'(event: JQuery.TriggeredEvent, tpl: CardActionsInstance) {
    const data = Template.currentData();
    const ruleName = data.ruleName.get();
    const trigger = data.triggerVar.get();
    const actionSelected = (tpl.find('#member-action') as HTMLInputElement).value;
    const username = (tpl.find('#member-name') as HTMLInputElement).value;
    const boardId = Session.get('currentBoard');
    const desc = Utils.getTriggerActionDesc(event, tpl);
    if (actionSelected === 'add') {
      const triggerId = Triggers.insert(trigger);
      const actionId = Actions.insert({
        actionType: 'addMember',
        username,
        boardId,
        desc,
      });
      Rules.insert({
        title: ruleName,
        triggerId,
        actionId,
        boardId,
        desc,
      });
    }
    if (actionSelected === 'remove') {
      const triggerId = Triggers.insert(trigger);
      const actionId = Actions.insert({
        actionType: 'removeMember',
        username,
        boardId,
        desc,
      });
      Rules.insert({
        title: ruleName,
        triggerId,
        actionId,
        boardId,
      });
    }
  },
  'click .js-add-removeall-action'(event: JQuery.TriggeredEvent, tpl: CardActionsInstance) {
    const data = Template.currentData();
    const ruleName = data.ruleName.get();
    const trigger = data.triggerVar.get();
    const triggerId = Triggers.insert(trigger);
    const desc = Utils.getTriggerActionDesc(event, tpl);
    const boardId = Session.get('currentBoard');
    const actionId = Actions.insert({
      actionType: 'removeMember',
      //  deepcode ignore NoHardcodedCredentials: it's no credential
      username: '*',
      boardId,
      desc,
    });
    Rules.insert({
      title: ruleName,
      triggerId,
      actionId,
      boardId,
    });
  },
  'click .js-show-color-palette'(event: JQuery.TriggeredEvent, tpl: CardActionsInstance) {
    const funct = Popup.open('setCardActionsColor');
    const colorButton = tpl.find('#color-action') as HTMLInputElement;
    if (colorButton.value === '') {
      colorButton.value = 'green';
    }
    funct.call(this, event);
  },
  'click .js-set-color-action'(event: JQuery.TriggeredEvent, tpl: CardActionsInstance) {
    const data = Template.currentData();
    const ruleName = data.ruleName.get();
    const trigger = data.triggerVar.get();
    const selectedColor = tpl.cardColorButtonValue.get();
    const boardId = Session.get('currentBoard');
    const desc = Utils.getTriggerActionDesc(event, tpl);
    const triggerId = Triggers.insert(trigger);
    const actionId = Actions.insert({
      actionType: 'setColor',
      selectedColor,
      boardId,
      desc,
    });
    Rules.insert({
      title: ruleName,
      triggerId,
      actionId,
      boardId,
    });
  },
  'click .js-set-complete-action'(event: JQuery.TriggeredEvent, tpl: CardActionsInstance) {
    const data = Template.currentData();
    const ruleName = data.ruleName.get();
    const trigger = data.triggerVar.get();
    const boardId = Session.get('currentBoard');
    const desc = Utils.getTriggerActionDesc(event, tpl);
    const actionType = (tpl.find('#complete-action') as HTMLInputElement).value;
    const triggerId = Triggers.insert(trigger);
    const actionId = Actions.insert({ actionType, boardId, desc });
    Rules.insert({ title: ruleName, triggerId, actionId, boardId });
  },
  'click .js-set-reldate-action'(event: JQuery.TriggeredEvent, tpl: CardActionsInstance) {
    const data = Template.currentData();
    const ruleName = data.ruleName.get();
    const trigger = data.triggerVar.get();
    const boardId = Session.get('currentBoard');
    const desc = Utils.getTriggerActionDesc(event, tpl);
    const dateField = (tpl.find('#reldate-datefield') as HTMLInputElement).value;
    const days = parseInt((tpl.find('#reldate-days') as HTMLInputElement).value, 10) || 0;
    const triggerId = Triggers.insert(trigger);
    const actionId = Actions.insert({
      actionType: 'setDateRelative',
      dateField,
      days,
      boardId,
      desc,
    });
    Rules.insert({ title: ruleName, triggerId, actionId, boardId });
  },
});

Template.setCardActionsColorPopup.onCreated(function (this: SetCardActionsColorPopupInstance) {
  this.currentColor = new ReactiveVar(
    sharedCardColorButtonValue.get()
  );
  this.colorButtonValue = sharedCardColorButtonValue;
});

Template.setCardActionsColorPopup.helpers({
  colors() {
    return cardColors.map(color => ({ color, name: '' }));
  },

  isSelected(color: string) {
    return (Template.instance() as SetCardActionsColorPopupInstance).currentColor.get() === color;
  },
});

Template.setCardActionsColorPopup.events({
  'click .js-palette-color'(event: JQuery.TriggeredEvent, tpl: SetCardActionsColorPopupInstance) {
    tpl.currentColor.set(Template.currentData().color);
  },
  'click .js-submit'(event: JQuery.TriggeredEvent, tpl: SetCardActionsColorPopupInstance) {
    tpl.colorButtonValue.set(tpl.currentColor.get());
    Popup.back();
  },
});

// The cardActions Blaze template instance carries the currently-chosen card
// colour for the "set colour" action button.
interface CardActionsInstance extends Blaze.TemplateInstance {
  cardColorButtonValue: ReactiveVar<string>;
}

// The colour-palette popup instance: the colour highlighted in the popup and a
// shared reference back to the cardActions button value it writes on submit.
interface SetCardActionsColorPopupInstance extends Blaze.TemplateInstance {
  currentColor: ReactiveVar<string>;
  colorButtonValue: ReactiveVar<string>;
}
