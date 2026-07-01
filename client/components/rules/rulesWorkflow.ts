import { Template } from 'meteor/templating';
import { Blaze } from 'meteor/blaze';
import { ReactiveVar } from 'meteor/reactive-var';
import { ReactiveCache } from '/imports/reactiveCache';
import { Utils } from '/client/lib/utils';
import Actions from '/models/actions';
import Rules from '/models/rules';
import Triggers from '/models/triggers';

// A drag-and-drop visual workflow editor for board rules. Triggers and actions
// are draggable chips; drag one of each into the builder (When → Then) and add
// the rule, or drag an action onto an existing rule to change what it does.
//
// The palette offers the parameter-free / wildcard ("any") variants so a rule
// can be built entirely by dragging. Parameterized rules (specific list, label,
// member, schedule time, …) are still created with the form builder on the
// List view.
const TRIGGER_PALETTE: PaletteItem[] = [
  { label: 'Card is created', doc: { activityType: 'createCard', listName: '*', swimlaneName: '*', cardTitle: '*', userId: '*' } },
  { label: 'Card is moved', doc: { activityType: 'moveCard', listName: '*', oldListName: '*', swimlaneName: '*', cardTitle: '*', userId: '*' } },
  { label: 'Card is archived', doc: { activityType: 'archivedCard', userId: '*' } },
  { label: 'Card is unarchived', doc: { activityType: 'restoredCard', userId: '*' } },
  { label: 'Any label is added', doc: { activityType: 'addedLabel', labelId: '*', userId: '*' } },
  { label: 'Any label is removed', doc: { activityType: 'removedLabel', labelId: '*', userId: '*' } },
  { label: 'A member is added', doc: { activityType: 'joinMember', username: '*', userId: '*' } },
  { label: 'A member is removed', doc: { activityType: 'unjoinMember', username: '*', userId: '*' } },
  { label: 'A checklist is added', doc: { activityType: 'addChecklist', checklistName: '*', userId: '*' } },
  { label: 'An attachment is added', doc: { activityType: 'addAttachment', userId: '*' } },
  { label: 'Every day at 09:00', doc: { activityType: 'scheduledTrigger', scheduleKind: 'calendar', scheduleType: 'daily', atTime: '09:00', listName: '*', swimlaneName: '*' } },
];

const ACTION_PALETTE: PaletteItem[] = [
  { label: 'Move card to top', doc: { actionType: 'moveCardToTop', listName: '*', swimlaneName: '*' } },
  { label: 'Move card to bottom', doc: { actionType: 'moveCardToBottom', listName: '*', swimlaneName: '*' } },
  { label: 'Archive card', doc: { actionType: 'archive' } },
  { label: 'Unarchive card', doc: { actionType: 'unarchive' } },
  { label: 'Mark card complete', doc: { actionType: 'markCardComplete' } },
  { label: 'Mark card incomplete', doc: { actionType: 'markCardIncomplete' } },
  { label: 'Remove all members', doc: { actionType: 'removeMember', username: '*' } },
  { label: 'Set received date to now', doc: { actionType: 'setDate', dateField: 'receivedAt' } },
];

Template.rulesWorkflow.onCreated(function (this: RulesWorkflowInstance) {
  this.builderTrigger = new ReactiveVar<PaletteItem | null>(null);
  this.builderAction = new ReactiveVar<PaletteItem | null>(null);
  this.dragItem = null; // {type:'trigger'|'action', idx}
  this.autorun(() => {
    const boardId = Session.get('currentBoard');
    if (boardId) this.subscribe('boardRules', boardId);
  });
});

Template.rulesWorkflow.helpers({
  currentBoard() {
    return Utils.getCurrentBoard();
  },
  triggerPalette() {
    return TRIGGER_PALETTE.map((t, idx) => ({ idx, label: t.label }));
  },
  actionPalette() {
    return ACTION_PALETTE.map((a, idx) => ({ idx, label: a.label }));
  },
  builderTrigger() {
    return (Template.instance() as RulesWorkflowInstance).builderTrigger.get();
  },
  builderTriggerLabel() {
    const t = (Template.instance() as RulesWorkflowInstance).builderTrigger.get();
    return t ? t.label : '';
  },
  builderAction() {
    return (Template.instance() as RulesWorkflowInstance).builderAction.get();
  },
  builderActionLabel() {
    const a = (Template.instance() as RulesWorkflowInstance).builderAction.get();
    return a ? a.label : '';
  },
  createDisabled() {
    const tpl = Template.instance() as RulesWorkflowInstance;
    return tpl.builderTrigger.get() && tpl.builderAction.get() ? false : true;
  },
  rules() {
    const boardId = Session.get('currentBoard');
    const rules = ReactiveCache.getRules({ boardId });
    return rules.map((rule: { _id: string; triggerId: string; actionId: string }) => {
      const trigger = ReactiveCache.getTrigger(rule.triggerId);
      const action = ReactiveCache.getAction(rule.actionId);
      return {
        ruleId: rule._id,
        whenText: (trigger && trigger.desc) || (trigger && trigger.activityType) || '',
        thenText: (action && action.desc) || (action && action.actionType) || '',
      };
    });
  },
});

function persistRule(tpl: RulesWorkflowInstance) {
  const t = tpl.builderTrigger.get();
  const a = tpl.builderAction.get();
  if (!t || !a) return;
  const boardId = Session.get('currentBoard');
  const titleField = tpl.find('.js-workflow-rule-title') as HTMLInputElement;
  const title = (titleField.value || '').trim() || `${t.label} → ${a.label}`;
  const triggerId = Triggers.insert({ ...t.doc, boardId, desc: t.label });
  const actionId = Actions.insert({ ...a.doc, boardId, desc: a.label });
  Rules.insert({ title, triggerId, actionId, boardId });
  tpl.builderTrigger.set(null);
  tpl.builderAction.set(null);
  titleField.value = '';
}

Template.rulesWorkflow.events({
  'dragstart .js-trigger-chip'(event: JQuery.TriggeredEvent, tpl: RulesWorkflowInstance) {
    tpl.dragItem = { type: 'trigger', idx: Number(event.currentTarget.dataset.idx) };
  },
  'dragstart .js-action-chip'(event: JQuery.TriggeredEvent, tpl: RulesWorkflowInstance) {
    tpl.dragItem = { type: 'action', idx: Number(event.currentTarget.dataset.idx) };
  },
  // Allow dropping by preventing the default (which disables drop) on dragover.
  'dragover .js-when-slot, dragover .js-then-slot, dragover .js-rule-node'(event: JQuery.TriggeredEvent) {
    event.preventDefault();
  },
  'drop .js-when-slot'(event: JQuery.TriggeredEvent, tpl: RulesWorkflowInstance) {
    event.preventDefault();
    if (tpl.dragItem && tpl.dragItem.type === 'trigger') {
      tpl.builderTrigger.set(TRIGGER_PALETTE[tpl.dragItem.idx]);
    }
    tpl.dragItem = null;
  },
  'drop .js-then-slot'(event: JQuery.TriggeredEvent, tpl: RulesWorkflowInstance) {
    event.preventDefault();
    if (tpl.dragItem && tpl.dragItem.type === 'action') {
      tpl.builderAction.set(ACTION_PALETTE[tpl.dragItem.idx]);
    }
    tpl.dragItem = null;
  },
  // Drop an action onto an existing rule to replace what it does.
  'drop .js-rule-node'(event: JQuery.TriggeredEvent, tpl: RulesWorkflowInstance) {
    event.preventDefault();
    if (!tpl.dragItem || tpl.dragItem.type !== 'action') return;
    const ruleId = event.currentTarget.dataset.ruleId;
    const rule = ReactiveCache.getRule(ruleId);
    if (!rule) return;
    const a = ACTION_PALETTE[tpl.dragItem.idx];
    const boardId = Session.get('currentBoard');
    const oldActionId = rule.actionId;
    const newActionId = Actions.insert({ ...a.doc, boardId, desc: a.label });
    Rules.update(ruleId, { $set: { actionId: newActionId } });
    if (oldActionId) Actions.remove(oldActionId);
    tpl.dragItem = null;
  },
  'click .js-clear-when'(event: JQuery.TriggeredEvent, tpl: RulesWorkflowInstance) {
    event.preventDefault();
    tpl.builderTrigger.set(null);
  },
  'click .js-clear-then'(event: JQuery.TriggeredEvent, tpl: RulesWorkflowInstance) {
    event.preventDefault();
    tpl.builderAction.set(null);
  },
  'click .js-create-workflow-rule'(event: JQuery.TriggeredEvent, tpl: RulesWorkflowInstance) {
    event.preventDefault();
    persistRule(tpl);
  },
  'click .js-delete-workflow-rule'(event: JQuery.TriggeredEvent, tpl: RulesWorkflowInstance) {
    event.preventDefault();
    const node = event.currentTarget.closest('.js-rule-node');
    const ruleId = node && node.dataset.ruleId;
    const rule = ReactiveCache.getRule(ruleId);
    if (!rule) return;
    Rules.remove(rule._id);
    Actions.remove(rule.actionId);
    Triggers.remove(rule.triggerId);
  },
});

// A trigger/action palette entry: a human label plus the partial trigger/action
// document that gets inserted when the chip is dropped into the builder. The doc
// fields vary per entry (activityType/actionType and their wildcard params).
interface PaletteItem {
  label: string;
  doc: { [key: string]: string };
}

// A chip currently being dragged: which palette it came from and its index.
interface DragItem {
  type: 'trigger' | 'action';
  idx: number;
}

// The rulesWorkflow Blaze template instance holds the in-progress builder
// selections and the chip currently being dragged.
interface RulesWorkflowInstance extends Blaze.TemplateInstance {
  builderTrigger: ReactiveVar<PaletteItem | null>;
  builderAction: ReactiveVar<PaletteItem | null>;
  dragItem: DragItem | null;
}
