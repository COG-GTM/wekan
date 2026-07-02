import { Utils } from '/client/lib/utils';
import { Template } from 'meteor/templating';
import { Blaze } from 'meteor/blaze';
import { ReactiveVar } from 'meteor/reactive-var';

Template.searchSidebar.onCreated(function (this: SearchSidebarInstance) {
  this.term = new ReactiveVar('');
});

Template.searchSidebar.helpers({
  cards() {
    const currentBoard = Utils.getCurrentBoard();
    return currentBoard.searchCards((Template.instance() as SearchSidebarInstance).term.get());
  },

  lists() {
    const currentBoard = Utils.getCurrentBoard();
    return currentBoard.searchLists((Template.instance() as SearchSidebarInstance).term.get());
  },
});

Template.searchSidebar.events({
  'click .js-minicard'(evt: JQuery.TriggeredEvent) {
    if (Utils.isMiniScreen()) {
      evt.preventDefault();
      Session.set('popupCardId', Template.currentData()._id);
      if (!Popup.isOpen()) {
        Popup.open("cardDetails")(evt);
      }
    }
  },
  'submit .js-search-term-form'(evt: JQuery.TriggeredEvent, tpl: SearchSidebarInstance) {
    evt.preventDefault();
    // evt.target as any — the form element's named `searchTerm` field.
    tpl.term.set((evt.target as any).searchTerm.value);
  },
});

// The `searchSidebar` template instance with its search term.
interface SearchSidebarInstance extends Blaze.TemplateInstance {
  term: ReactiveVar<string>;
}
