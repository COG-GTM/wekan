import { Template } from 'meteor/templating';
import { Blaze } from 'meteor/blaze';
import { ReactiveVar } from 'meteor/reactive-var';
import { ReactiveCache } from '/imports/reactiveCache';

Template.rulesActions.onCreated(function (this: RulesActionsInstance) {
  this.currentActions = new ReactiveVar('board');
});

Template.rulesActions.helpers({
  currentActions() {
    return (Template.instance() as RulesActionsInstance).currentActions;
  },

  data() {
    return Template.currentData();
  },

  ruleNameStr() {
    const rn = Template.currentData() && Template.currentData().ruleName;
    try {
      return rn && typeof rn.get === 'function' ? rn.get() : '';
    } catch (_) {
      return '';
    }
  },

  rules() {
    const ret = ReactiveCache.getRules({});
    return ret;
  },

  name() {
    // console.log(Template.currentData());
  },
});

function setBoardActions(tpl: RulesActionsInstance) {
  tpl.currentActions.set('board');
  $('.js-set-card-actions').removeClass('active');
  $('.js-set-board-actions').addClass('active');
  $('.js-set-checklist-actions').removeClass('active');
  $('.js-set-mail-actions').removeClass('active');
}

function setCardActions(tpl: RulesActionsInstance) {
  tpl.currentActions.set('card');
  $('.js-set-card-actions').addClass('active');
  $('.js-set-board-actions').removeClass('active');
  $('.js-set-checklist-actions').removeClass('active');
  $('.js-set-mail-actions').removeClass('active');
}

function setChecklistActions(tpl: RulesActionsInstance) {
  tpl.currentActions.set('checklist');
  $('.js-set-card-actions').removeClass('active');
  $('.js-set-board-actions').removeClass('active');
  $('.js-set-checklist-actions').addClass('active');
  $('.js-set-mail-actions').removeClass('active');
}

function setMailActions(tpl: RulesActionsInstance) {
  tpl.currentActions.set('mail');
  $('.js-set-card-actions').removeClass('active');
  $('.js-set-board-actions').removeClass('active');
  $('.js-set-checklist-actions').removeClass('active');
  $('.js-set-mail-actions').addClass('active');
}

Template.rulesActions.events({
  'click .js-set-board-actions'(event: JQuery.TriggeredEvent, tpl: RulesActionsInstance) {
    setBoardActions(tpl);
  },
  'click .js-set-card-actions'(event: JQuery.TriggeredEvent, tpl: RulesActionsInstance) {
    setCardActions(tpl);
  },
  'click .js-set-mail-actions'(event: JQuery.TriggeredEvent, tpl: RulesActionsInstance) {
    setMailActions(tpl);
  },
  'click .js-set-checklist-actions'(event: JQuery.TriggeredEvent, tpl: RulesActionsInstance) {
    setChecklistActions(tpl);
  },
});

// The rulesActions Blaze template instance tracks which action category tab
// (board/card/checklist/mail) is currently shown.
interface RulesActionsInstance extends Blaze.TemplateInstance {
  currentActions: ReactiveVar<string>;
}
