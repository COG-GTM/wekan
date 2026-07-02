import { Template } from 'meteor/templating';
import { Blaze } from 'meteor/blaze';
import { Utils } from '/client/lib/utils';

// All triggers here are time-based: they are evaluated by the server SyncedCron
// scanner in server/scheduledRules.js rather than by activity matching. They all
// share activityType 'scheduledTrigger' with a `scheduleKind` discriminator.

Template.scheduledTriggers.events({
  'click .js-add-scheduled-trigger'(event: JQuery.TriggeredEvent, tpl: Blaze.TemplateInstance) {
    const datas = Template.currentData();
    const desc = Utils.getTriggerActionDesc(event, tpl);
    const boardId = Session.get('currentBoard');
    const scheduleType = (tpl.find('#schedule-type') as HTMLInputElement).value;
    const atTime = (tpl.find('#schedule-time') as HTMLInputElement).value || '09:00';
    const weekday = parseInt((tpl.find('#schedule-weekday') as HTMLInputElement).value, 10);
    const dayOfMonth = parseInt((tpl.find('#schedule-dom') as HTMLInputElement).value, 10) || 1;
    const onDate = (tpl.find('#schedule-date') as HTMLInputElement).value || '';
    const listName = (tpl.find('#schedule-list-name') as HTMLInputElement).value || '*';
    datas.triggerVar.set({
      activityType: 'scheduledTrigger',
      scheduleKind: 'calendar',
      scheduleType,
      atTime,
      weekday,
      dayOfMonth,
      onDate,
      listName,
      swimlaneName: '*',
      boardId,
      desc,
    });
  },
  'click .js-add-due-trigger'(event: JQuery.TriggeredEvent, tpl: Blaze.TemplateInstance) {
    const datas = Template.currentData();
    const desc = Utils.getTriggerActionDesc(event, tpl);
    const boardId = Session.get('currentBoard');
    const dueCondition = (tpl.find('#due-condition') as HTMLInputElement).value;
    const days = parseInt((tpl.find('#due-days') as HTMLInputElement).value, 10) || 0;
    const atTime = (tpl.find('#due-time') as HTMLInputElement).value || '09:00';
    datas.triggerVar.set({
      activityType: 'scheduledTrigger',
      scheduleKind: 'due',
      dueCondition,
      days,
      atTime,
      listName: '*',
      swimlaneName: '*',
      boardId,
      desc,
    });
  },
  'click .js-add-aging-trigger'(event: JQuery.TriggeredEvent, tpl: Blaze.TemplateInstance) {
    const datas = Template.currentData();
    const desc = Utils.getTriggerActionDesc(event, tpl);
    const boardId = Session.get('currentBoard');
    const listName = (tpl.find('#aging-list-name') as HTMLInputElement).value || '*';
    const days = parseInt((tpl.find('#aging-days') as HTMLInputElement).value, 10) || 7;
    const atTime = (tpl.find('#aging-time') as HTMLInputElement).value || '09:00';
    datas.triggerVar.set({
      activityType: 'scheduledTrigger',
      scheduleKind: 'aging',
      days,
      atTime,
      listName,
      swimlaneName: '*',
      boardId,
      desc,
    });
  },
});
