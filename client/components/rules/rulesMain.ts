import { Template } from 'meteor/templating';
import { Blaze } from 'meteor/blaze';
import { ReactiveVar } from 'meteor/reactive-var';
import { ReactiveCache } from '/imports/reactiveCache';
import { FlowRouter } from 'meteor/ostrio:flow-router-extra';
import { Utils } from '/client/lib/utils';
import Actions from '/models/actions';
import Rules from '/models/rules';
import Triggers from '/models/triggers';

Template.rulesMain.onCreated(function (this: RulesMainInstance) {
  this.rulesCurrentTab = new ReactiveVar('rulesList');
  this.ruleName = new ReactiveVar('');
  this.triggerVar = new ReactiveVar<TriggerDraft | undefined>(undefined);
  this.ruleId = new ReactiveVar<string | undefined>(undefined);

  // The Rules page is now a standalone board-scoped route, so subscribe to the
  // board data (lists, swimlanes, labels, members) the trigger/action forms need,
  // in addition to the rules themselves.
  this.autorun(() => {
    const boardId = Session.get('currentBoard');
    if (boardId) {
      this.subscribe('board', boardId, false);
      this.subscribe('boardRules', boardId);
    }
  });
});

Template.rulesMain.helpers({
  rulesCurrentTab() {
    return (Template.instance() as RulesMainInstance).rulesCurrentTab;
  },
  ruleName() {
    return (Template.instance() as RulesMainInstance).ruleName;
  },
  triggerVar() {
    return (Template.instance() as RulesMainInstance).triggerVar;
  },
  ruleId() {
    return (Template.instance() as RulesMainInstance).ruleId;
  },
  currentBoard() {
    return Utils.getCurrentBoard();
  },
  isWorkflowView() {
    return Session.get('rulesViewMode') === 'workflow';
  },
});

Template.rulesHeaderBar.helpers({
  currentBoard() {
    return Utils.getCurrentBoard();
  },
  isWorkflowView() {
    return Session.get('rulesViewMode') === 'workflow';
  },
});

Template.rulesHeaderBar.events({
  'click .js-rules-back-to-board'(event: JQuery.TriggeredEvent) {
    event.preventDefault();
    const currentBoard = Utils.getCurrentBoard();
    if (currentBoard) {
      FlowRouter.go('board', {
        id: currentBoard._id,
        slug: currentBoard.slug,
      });
    }
  },
  'click .js-rules-toggle-view'(event: JQuery.TriggeredEvent) {
    event.preventDefault();
    const mode = Session.get('rulesViewMode') === 'workflow' ? 'list' : 'workflow';
    Session.set('rulesViewMode', mode);
  },
  'click .js-rules-import-export': Popup.open('rulesImportExport'),
});

function sanitizeObject(obj: TriggerDraft) {
  Object.keys(obj).forEach(key => {
    if (obj[key] === '' || obj[key] === undefined) {
      obj[key] = '*';
    }
  });
}

Template.rulesMain.events({
  'click .js-delete-rule'() {
    const rule = Template.currentData();
    Rules.remove(rule._id);
    Actions.remove(rule.actionId);
    Triggers.remove(rule.triggerId);
  },
  'click .js-goto-trigger'(event: JQuery.TriggeredEvent, tpl: RulesMainInstance) {
    event.preventDefault();
    const ruleTitle = (tpl.find('#ruleTitle') as HTMLInputElement).value;
    if (ruleTitle !== undefined && ruleTitle !== '') {
      (tpl.find('#ruleTitle') as HTMLInputElement).value = '';
      tpl.ruleName.set(ruleTitle);
      tpl.rulesCurrentTab.set('trigger');
    }
  },
  'click .js-goto-action'(event: JQuery.TriggeredEvent, tpl: RulesMainInstance) {
    event.preventDefault();
    // Add user to the trigger
    const username = $(event.currentTarget.offsetParent)
      .find('.user-name')
      .val();
    let trigger = tpl.triggerVar.get() as TriggerDraft;
    trigger.userId = '*';
    if (username !== undefined) {
      const userFound = ReactiveCache.getUser({ username });
      if (userFound !== undefined) {
        trigger.userId = userFound._id;
        tpl.triggerVar.set(trigger);
      }
    }
    // Sanitize trigger
    trigger = tpl.triggerVar.get() as TriggerDraft;
    sanitizeObject(trigger);
    tpl.triggerVar.set(trigger);
    tpl.rulesCurrentTab.set('action');
  },
  'click .js-show-user-field'(event: JQuery.TriggeredEvent) {
    event.preventDefault();
    $(event.currentTarget.offsetParent)
      .find('.user-details')
      .removeClass('hide-element');
  },
  'click .js-goto-rules'(event: JQuery.TriggeredEvent, tpl: RulesMainInstance) {
    event.preventDefault();
    tpl.rulesCurrentTab.set('rulesList');
  },
  'click .js-goback'(event: JQuery.TriggeredEvent, tpl: RulesMainInstance) {
    event.preventDefault();
    if (
      tpl.rulesCurrentTab.get() === 'trigger' ||
      tpl.rulesCurrentTab.get() === 'ruleDetails'
    ) {
      tpl.rulesCurrentTab.set('rulesList');
    }
    if (tpl.rulesCurrentTab.get() === 'action') {
      tpl.rulesCurrentTab.set('trigger');
    }
  },
  'click .js-goto-details'(event: JQuery.TriggeredEvent, tpl: RulesMainInstance) {
    event.preventDefault();
    const rule = Template.currentData();
    tpl.ruleId.set(rule._id);
    tpl.rulesCurrentTab.set('ruleDetails');
  },
});

// A trigger document being assembled by the rules wizard. Its fields vary by
// trigger category (activityType, listName, userId, labelId, …) and are set
// dynamically as the user fills in the form, so it is keyed by field name.
interface TriggerDraft {
  [key: string]: any;
}

// The rulesMain Blaze template instance drives the multi-step rule wizard: the
// current tab, the in-progress rule name, the trigger being built, and the id of
// the rule whose details are being viewed.
interface RulesMainInstance extends Blaze.TemplateInstance {
  rulesCurrentTab: ReactiveVar<string>;
  ruleName: ReactiveVar<string>;
  triggerVar: ReactiveVar<TriggerDraft | undefined>;
  ruleId: ReactiveVar<string | undefined>;
}
