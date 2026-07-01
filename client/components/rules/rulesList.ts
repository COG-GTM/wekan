import { Template } from 'meteor/templating';
import { Blaze } from 'meteor/blaze';
import { ReactiveVar } from 'meteor/reactive-var';
import { ReactiveCache } from '/imports/reactiveCache';
import Actions from '/models/actions';
import Rules from '/models/rules';
import Triggers from '/models/triggers';

function boardRuleIds() {
  const boardId = Session.get('currentBoard');
  return ReactiveCache.getRules({ boardId }).map((r: { _id: string }) => r._id);
}

function getSelected(): string[] {
  return (Session.get('selectedRuleIds') as string[]) || [];
}

function setSelected(ids: string[]) {
  Session.set('selectedRuleIds', ids);
}

Template.rulesList.onCreated(function (this: RulesListInstance) {
  this.autorun(() => {
    const boardId = Session.get('currentBoard');
    if (boardId) this.subscribe('boardRules', boardId);
  });
  this.editingRuleId = new ReactiveVar(null);
});

Template.rulesList.helpers({
  rules() {
    const boardId = Session.get('currentBoard');
    return ReactiveCache.getRules({ boardId });
  },
  canAdmin() {
    const user = ReactiveCache.getCurrentUser();
    return user && (user.isAdmin || user.isBoardAdmin);
  },
  isSelected(this: { _id: string }) {
    return getSelected().includes(this._id);
  },
  isEditing(this: { _id: string }) {
    return (Template.instance() as RulesListInstance).editingRuleId.get() === this._id;
  },
});

Template.rulesList.events({
  'change .js-rule-select'(event: JQuery.TriggeredEvent) {
    const ruleId = event.currentTarget.getAttribute('data-rule-id');
    const selected = new Set(getSelected());
    if (event.currentTarget.checked) {
      selected.add(ruleId);
    } else {
      selected.delete(ruleId);
    }
    setSelected([...selected]);
  },
  'click .js-rules-select-all'() {
    setSelected(boardRuleIds());
  },
  'click .js-rules-select-none'() {
    setSelected([]);
  },
  'click .js-rules-delete-selected'() {
    getSelected().forEach((ruleId: string) => {
      const rule = ReactiveCache.getRule(ruleId);
      if (rule) {
        Rules.remove(rule._id);
        Actions.remove(rule.actionId);
        Triggers.remove(rule.triggerId);
      }
    });
    setSelected([]);
  },
  'click .js-rules-export-selected': Popup.open('rulesImportExport'),
  // Inline rename of a rule.
  'click .js-edit-rule'(this: { _id: string }, event: JQuery.TriggeredEvent, tpl: RulesListInstance) {
    tpl.editingRuleId.set(this._id);
  },
  'keydown .js-edit-rule-input'(this: { _id: string }, event: JQuery.TriggeredEvent, tpl: RulesListInstance) {
    if (event.key === 'Enter') {
      const title = event.currentTarget.value.trim();
      if (title) Rules.update(this._id, { $set: { title } });
      tpl.editingRuleId.set(null);
    } else if (event.key === 'Escape') {
      tpl.editingRuleId.set(null);
    }
  },
  'blur .js-edit-rule-input'(this: { _id: string }, event: JQuery.TriggeredEvent, tpl: RulesListInstance) {
    const title = event.currentTarget.value.trim();
    if (title) Rules.update(this._id, { $set: { title } });
    tpl.editingRuleId.set(null);
  },
});

// The rulesList Blaze template instance carries the id of the rule currently
// being inline-renamed (or null when none is being edited).
interface RulesListInstance extends Blaze.TemplateInstance {
  editingRuleId: ReactiveVar<string | null>;
}
