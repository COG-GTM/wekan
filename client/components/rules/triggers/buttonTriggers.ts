import { Template } from 'meteor/templating';
import { Blaze } from 'meteor/blaze';
import { Utils } from '/client/lib/utils';

// Button "triggers" are manual: the rule runs only when a user clicks the button
// (rendered on the card detail for card buttons, or the board for board buttons).
// They are never matched against activities; the rules.runButton method runs them.

Template.buttonTriggers.events({
  'click .js-add-button-trigger'(event: JQuery.TriggeredEvent, tpl: Blaze.TemplateInstance) {
    const datas = Template.currentData();
    const desc = Utils.getTriggerActionDesc(event, tpl);
    const boardId = Session.get('currentBoard');
    const buttonLabel = (tpl.find('#button-label') as HTMLInputElement).value || 'Run';
    const buttonType = (tpl.find('#button-type') as HTMLInputElement).value || 'card';
    datas.triggerVar.set({
      activityType: 'button',
      buttonType,
      buttonLabel,
      boardId,
      desc,
    });
  },
});
