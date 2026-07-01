import { Meteor } from 'meteor/meteor';
import { Template } from 'meteor/templating';
import { Blaze } from 'meteor/blaze';
import { CardSearchPaged } from '../../lib/cardSearch';

Template.brokenCards.onCreated(function (this: BrokenCardsInstance) {
  const search = new CardSearchPaged(this);
  this.search = search;

  Meteor.subscribe('brokenCards', search.sessionId);
});

Template.brokenCards.helpers({
  userId() {
    return Meteor.userId();
  },

  // Return ReactiveVars so jade can use .get pattern
  searching() {
    return (Template.instance() as BrokenCardsInstance).search.searching;
  },
  hasResults() {
    return (Template.instance() as BrokenCardsInstance).search.hasResults;
  },
  hasQueryErrors() {
    return (Template.instance() as BrokenCardsInstance).search.hasQueryErrors;
  },
  errorMessages() {
    return (Template.instance() as BrokenCardsInstance).search.queryErrorMessages();
  },
  resultsCount() {
    return (Template.instance() as BrokenCardsInstance).search.resultsCount;
  },
  resultsHeading() {
    return (Template.instance() as BrokenCardsInstance).search.resultsHeading;
  },
  results() {
    return (Template.instance() as BrokenCardsInstance).search.results;
  },
  getSearchHref() {
    return (Template.instance() as BrokenCardsInstance).search.getSearchHref();
  },
  hasPreviousPage() {
    return (Template.instance() as BrokenCardsInstance).search.hasPreviousPage;
  },
  hasNextPage() {
    return (Template.instance() as BrokenCardsInstance).search.hasNextPage;
  },
});

Template.brokenCards.events({
  'click .js-next-page'(evt: JQuery.TriggeredEvent, tpl: BrokenCardsInstance) {
    evt.preventDefault();
    tpl.search.nextPage();
  },
  'click .js-previous-page'(evt: JQuery.TriggeredEvent, tpl: BrokenCardsInstance) {
    evt.preventDefault();
    tpl.search.previousPage();
  },
});

interface BrokenCardsInstance extends Blaze.TemplateInstance {
  search: CardSearchPaged;
}
