import { Template } from 'meteor/templating';
import { Blaze } from 'meteor/blaze';
import { Utils } from '/client/lib/utils';

Template.checklistTriggers.onCreated(function (this: Blaze.TemplateInstance) {
  this.subscribe('allRules');
});

Template.checklistTriggers.events({
  'click .js-add-gen-check-trigger'(event: JQuery.TriggeredEvent, tpl: Blaze.TemplateInstance) {
    const desc = Utils.getTriggerActionDesc(event, tpl);
    const datas = Template.currentData();
    const actionSelected = (tpl.find('#gen-check-action') as HTMLInputElement).value;
    const boardId = Session.get('currentBoard');
    if (actionSelected === 'created') {
      datas.triggerVar.set({
        activityType: 'addChecklist',
        boardId,
        checklistName: '*',
        desc,
      });
    }
    if (actionSelected === 'removed') {
      datas.triggerVar.set({
        activityType: 'removeChecklist',
        boardId,
        checklistName: '*',
        desc,
      });
    }
  },
  'click .js-add-spec-check-trigger'(event: JQuery.TriggeredEvent, tpl: Blaze.TemplateInstance) {
    const desc = Utils.getTriggerActionDesc(event, tpl);
    const datas = Template.currentData();
    const actionSelected = (tpl.find('#spec-check-action') as HTMLInputElement).value;
    const checklistId = (tpl.find('#check-name') as HTMLInputElement).value;
    const boardId = Session.get('currentBoard');
    if (actionSelected === 'created') {
      datas.triggerVar.set({
        activityType: 'addChecklist',
        boardId,
        checklistName: checklistId,
        desc,
      });
    }
    if (actionSelected === 'removed') {
      datas.triggerVar.set({
        activityType: 'removeChecklist',
        boardId,
        checklistName: checklistId,
        desc,
      });
    }
  },
  'click .js-add-gen-comp-trigger'(event: JQuery.TriggeredEvent, tpl: Blaze.TemplateInstance) {
    const desc = Utils.getTriggerActionDesc(event, tpl);

    const datas = Template.currentData();
    const actionSelected = (tpl.find('#gen-comp-check-action') as HTMLInputElement).value;
    const boardId = Session.get('currentBoard');
    if (actionSelected === 'completed') {
      datas.triggerVar.set({
        activityType: 'completeChecklist',
        boardId,
        checklistName: '*',
        desc,
      });
    }
    if (actionSelected === 'uncompleted') {
      datas.triggerVar.set({
        activityType: 'uncompleteChecklist',
        boardId,
        checklistName: '*',
        desc,
      });
    }
  },
  'click .js-add-spec-comp-trigger'(event: JQuery.TriggeredEvent, tpl: Blaze.TemplateInstance) {
    const desc = Utils.getTriggerActionDesc(event, tpl);
    const datas = Template.currentData();
    const actionSelected = (tpl.find('#spec-comp-check-action') as HTMLInputElement).value;
    const checklistId = (tpl.find('#spec-comp-check-name') as HTMLInputElement).value;
    const boardId = Session.get('currentBoard');
    if (actionSelected === 'completed') {
      datas.triggerVar.set({
        activityType: 'completeChecklist',
        boardId,
        checklistName: checklistId,
        desc,
      });
    }
    if (actionSelected === 'uncompleted') {
      datas.triggerVar.set({
        activityType: 'uncompleteChecklist',
        boardId,
        checklistName: checklistId,
        desc,
      });
    }
  },
  'click .js-add-gen-check-item-trigger'(event: JQuery.TriggeredEvent, tpl: Blaze.TemplateInstance) {
    const desc = Utils.getTriggerActionDesc(event, tpl);
    const datas = Template.currentData();
    const actionSelected = (tpl.find('#check-item-gen-action') as HTMLInputElement).value;
    const boardId = Session.get('currentBoard');
    if (actionSelected === 'checked') {
      datas.triggerVar.set({
        activityType: 'checkedItem',
        boardId,
        checklistItemName: '*',
        desc,
      });
    }
    if (actionSelected === 'unchecked') {
      datas.triggerVar.set({
        activityType: 'uncheckedItem',
        boardId,
        checklistItemName: '*',
        desc,
      });
    }
  },
  'click .js-add-spec-check-item-trigger'(event: JQuery.TriggeredEvent, tpl: Blaze.TemplateInstance) {
    const desc = Utils.getTriggerActionDesc(event, tpl);
    const datas = Template.currentData();
    const actionSelected = (tpl.find('#check-item-spec-action') as HTMLInputElement).value;
    const checklistItemId = (tpl.find('#check-item-name') as HTMLInputElement).value;
    const boardId = Session.get('currentBoard');
    if (actionSelected === 'checked') {
      datas.triggerVar.set({
        activityType: 'checkedItem',
        boardId,
        checklistItemName: checklistItemId,
        desc,
      });
    }
    if (actionSelected === 'unchecked') {
      datas.triggerVar.set({
        activityType: 'uncheckedItem',
        boardId,
        checklistItemName: checklistItemId,
        desc,
      });
    }
  },
});
