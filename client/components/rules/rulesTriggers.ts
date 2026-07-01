import { Template } from 'meteor/templating';
import { Blaze } from 'meteor/blaze';
import { ReactiveVar } from 'meteor/reactive-var';
import { ReactiveCache } from '/imports/reactiveCache';

Template.rulesTriggers.onCreated(function (this: RulesTriggersInstance) {
  this.showBoardTrigger = new ReactiveVar(true);
  this.showCardTrigger = new ReactiveVar(false);
  this.showChecklistTrigger = new ReactiveVar(false);
  this.showScheduledTrigger = new ReactiveVar(false);
  this.showButtonTrigger = new ReactiveVar(false);
});

Template.rulesTriggers.helpers({
  ruleNameStr() {
    const rn = Template.currentData() && Template.currentData().ruleName;
    try {
      return rn && typeof rn.get === 'function' ? rn.get() : '';
    } catch (_) {
      return '';
    }
  },

  showBoardTrigger() {
    return (Template.instance() as RulesTriggersInstance).showBoardTrigger;
  },

  showCardTrigger() {
    return (Template.instance() as RulesTriggersInstance).showCardTrigger;
  },

  showChecklistTrigger() {
    return (Template.instance() as RulesTriggersInstance).showChecklistTrigger;
  },

  showScheduledTrigger() {
    return (Template.instance() as RulesTriggersInstance).showScheduledTrigger;
  },

  showButtonTrigger() {
    return (Template.instance() as RulesTriggersInstance).showButtonTrigger;
  },

  rules() {
    const ret = ReactiveCache.getRules({});
    return ret;
  },

  name() {
    // console.log(Template.currentData());
  },
});

// Show only the chosen trigger category and highlight its side-menu item.
function selectTriggerTab(tpl: RulesTriggersInstance, active: string) {
  const tabs: Record<string, ReactiveVar<boolean>> = {
    board: tpl.showBoardTrigger,
    card: tpl.showCardTrigger,
    checklist: tpl.showChecklistTrigger,
    scheduled: tpl.showScheduledTrigger,
    button: tpl.showButtonTrigger,
  };
  Object.keys(tabs).forEach(key => tabs[key].set(key === active));
  const classes: Record<string, string> = {
    board: '.js-set-board-triggers',
    card: '.js-set-card-triggers',
    checklist: '.js-set-checklist-triggers',
    scheduled: '.js-set-scheduled-triggers',
    button: '.js-set-button-triggers',
  };
  Object.keys(classes).forEach(key =>
    $(classes[key]).toggleClass('active', key === active),
  );
}

Template.rulesTriggers.events({
  'click .js-set-board-triggers'(event: JQuery.TriggeredEvent, tpl: RulesTriggersInstance) {
    selectTriggerTab(tpl, 'board');
  },
  'click .js-set-card-triggers'(event: JQuery.TriggeredEvent, tpl: RulesTriggersInstance) {
    selectTriggerTab(tpl, 'card');
  },
  'click .js-set-checklist-triggers'(event: JQuery.TriggeredEvent, tpl: RulesTriggersInstance) {
    selectTriggerTab(tpl, 'checklist');
  },
  'click .js-set-scheduled-triggers'(event: JQuery.TriggeredEvent, tpl: RulesTriggersInstance) {
    selectTriggerTab(tpl, 'scheduled');
  },
  'click .js-set-button-triggers'(event: JQuery.TriggeredEvent, tpl: RulesTriggersInstance) {
    selectTriggerTab(tpl, 'button');
  },
});

// The rulesTriggers Blaze template instance carries a reactive visibility flag
// per trigger category (only one is shown at a time).
interface RulesTriggersInstance extends Blaze.TemplateInstance {
  showBoardTrigger: ReactiveVar<boolean>;
  showCardTrigger: ReactiveVar<boolean>;
  showChecklistTrigger: ReactiveVar<boolean>;
  showScheduledTrigger: ReactiveVar<boolean>;
  showButtonTrigger: ReactiveVar<boolean>;
}
