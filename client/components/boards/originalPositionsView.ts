import { ReactiveVar } from 'meteor/reactive-var';
import { Meteor } from 'meteor/meteor';
import { Template } from 'meteor/templating';
import { Blaze } from 'meteor/blaze';
import { Session } from 'meteor/session';

/**
 * Component to display original positions for all entities on a board
 */

Template.originalPositionsView.onCreated(function (this: OriginalPositionsInstance) {
  this.showOriginalPositions = new ReactiveVar(false);
  this.boardHistory = new ReactiveVar([]);
  this.isLoading = new ReactiveVar(false);
  this.filterType = new ReactiveVar('all'); // 'all', 'swimlane', 'list', 'card'

  const tpl = this;

  this.loadBoardHistory = function () {
    const boardId = Session.get('currentBoard');
    if (!boardId) return;

    tpl.isLoading.set(true);

    // error/result: any — untyped Meteor method callback.
    Meteor.call('positionHistory.getBoardHistory', boardId, (error: any, result: any) => {
      tpl.isLoading.set(false);
      if (error) {
        console.error('Error loading board history:', error);
        tpl.boardHistory.set([]);
      } else {
        tpl.boardHistory.set(result);
      }
    });
  };
});

Template.originalPositionsView.onRendered(function (this: OriginalPositionsInstance) {
  this.loadBoardHistory();
});

Template.originalPositionsView.helpers({
  isShowingOriginalPositions() {
    return (Template.instance() as OriginalPositionsInstance).showOriginalPositions.get();
  },

  isLoading() {
    return (Template.instance() as OriginalPositionsInstance).isLoading.get();
  },

  getBoardHistory() {
    return (Template.instance() as OriginalPositionsInstance).boardHistory.get();
  },

  getFilteredHistory() {
    const tpl = Template.instance() as OriginalPositionsInstance;
    const history = tpl.boardHistory.get();
    const filterType = tpl.filterType.get();

    if (filterType === 'all') {
      return history;
    }

    return history.filter((item: any) => item.entityType === filterType);
  },

  isFilterType(type: any) {
    return (Template.instance() as OriginalPositionsInstance).filterType.get() === type;
  },

  getEntityDisplayName(entity: any) {
    const position = entity.originalPosition || {};
    return position.title || `Entity ${entity.entityId}`;
  },

  getEntityOriginalPositionDescription(entity: any) {
    const position = entity.originalPosition || {};
    let description = `Position: ${position.sort || 0}`;

    if (entity.entityType === 'list' && entity.originalSwimlaneId) {
      description += ` in swimlane ${entity.originalSwimlaneId}`;
    } else if (entity.entityType === 'card') {
      if (entity.originalSwimlaneId) {
        description += ` in swimlane ${entity.originalSwimlaneId}`;
      }
      if (entity.originalListId) {
        description += ` in list ${entity.originalListId}`;
      }
    }

    return description;
  },

  getEntityTypeIcon(entityType: any) {
    switch (entityType) {
      case 'swimlane':
        return 'fa-bars';
      case 'list':
        return 'fa-columns';
      case 'card':
        return 'fa-sticky-note';
      default:
        return 'fa-question';
    }
  },

  getEntityTypeLabel(entityType: any) {
    switch (entityType) {
      case 'swimlane':
        return 'Swimlane';
      case 'list':
        return 'List';
      case 'card':
        return 'Card';
      default:
        return 'Unknown';
    }
  },

  formatDate(date: any) {
    return new Date(date).toLocaleString();
  },
});

Template.originalPositionsView.events({
  'click .js-toggle-original-positions'(evt: JQuery.TriggeredEvent, tpl: OriginalPositionsInstance) {
    tpl.showOriginalPositions.set(!tpl.showOriginalPositions.get());
  },

  'click .js-refresh-history'(evt: JQuery.TriggeredEvent, tpl: OriginalPositionsInstance) {
    tpl.loadBoardHistory();
  },

  'click .js-filter-type'(evt: JQuery.TriggeredEvent, tpl: OriginalPositionsInstance) {
    const type = (evt.currentTarget as HTMLElement).dataset.filterType;
    tpl.filterType.set(type);
  },
});

// Template instance for the original-positions history panel. History entries
// are dynamic position-history records, so ReactiveVar<any>.
interface OriginalPositionsInstance extends Blaze.TemplateInstance {
  showOriginalPositions: ReactiveVar<any>;
  boardHistory: ReactiveVar<any>;
  isLoading: ReactiveVar<any>;
  filterType: ReactiveVar<any>;
  loadBoardHistory: () => void;
}
