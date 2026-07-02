import { Template } from 'meteor/templating';
import { Blaze } from 'meteor/blaze';
import Rules from '/models/rules';

// Lists the board's "card button" rules and runs one on the current card when
// clicked. Expects the card data context (cardId + boardId) inherited from the
// card detail template. The button metadata is denormalised onto the rule (see
// server/rulesButton.js), so this reads from the published `rules` collection
// alone — the schemaless `triggers` collection does not reach the client over
// the board subscription in this Meteor 3 setup.
Template.cardButtons.onCreated(function (this: Blaze.TemplateInstance) {
  this.autorun(() => {
    const boardId = this.data && this.data.boardId;
    if (boardId) this.subscribe('boardRules', boardId);
  });
});

function buttonRulesForBoard(boardId: string) {
  if (!boardId) return [];
  return (Rules.find({ boardId, buttonType: 'card' }).fetch() as RuleButtonDoc[])
    .map(rule => ({
      _id: rule._id,
      ruleId: rule._id,
      label: rule.buttonLabel || rule.title,
    }));
}

Template.cardButtons.helpers({
  hasCardButtons(this: { boardId: string }) {
    return buttonRulesForBoard(this.boardId).length > 0;
  },
  cardButtonRules(this: { boardId: string }) {
    return buttonRulesForBoard(this.boardId);
  },
});

Template.cardButtons.events({
  'click .js-run-card-button'(event: JQuery.TriggeredEvent, tpl: Blaze.TemplateInstance) {
    event.preventDefault();
    const ruleId = event.currentTarget.getAttribute('data-rule-id');
    const cardId = tpl.data && tpl.data._id;
    Meteor.call('rules.runButton', ruleId, cardId);
  },
});

// A "card button" rule document as read from the published `rules` collection:
// the button label/title are denormalised onto the rule (see server/rulesButton.js).
interface RuleButtonDoc {
  _id: string;
  buttonLabel?: string;
  title: string;
}
