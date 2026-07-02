import { ReactiveCache } from '/imports/reactiveCache';
import { Utils } from '/client/lib/utils';
import { Template } from 'meteor/templating';
import { Blaze } from 'meteor/blaze';
import { ReactiveVar } from 'meteor/reactive-var';
import { Meteor } from 'meteor/meteor';
import { Session } from 'meteor/session';

// Board "Table" view: lists every card of the current board in a table that
// reuses the My Cards table styling (the .my-cards-board-table CSS classes in
// client/components/main/myCards.css). It is the per-board counterpart of the
// My Cards table view, which spans all boards.
//
// Search, column sorting (Excel-like) and pagination all run client-side: the
// board's cards are already loaded reactively via board.cards(), so there is no
// need for the server-side limit/skip publication the Admin People page uses.

const rowsPerPage = 25;

Template.tableView.onCreated(function (this: TableViewInstance) {
  this.searchQuery = new ReactiveVar('');
  this.sortField = new ReactiveVar('card'); // card | list | swimlane | due
  this.sortDirection = new ReactiveVar(1); // 1 ascending, -1 descending
  this.page = new ReactiveVar(1);
  this.filteredRows = new ReactiveVar([]);

  // Recompute the flat, filtered and sorted row list whenever the board cards,
  // search query or sort order change. Pagination is applied separately in the
  // rows() helper so paging does not rebuild the whole list.
  this.autorun(() => {
    const board = Utils.getCurrentBoard();
    if (!board) {
      this.filteredRows.set([]);
      return;
    }

    const query = this.searchQuery.get().trim().toLowerCase();
    const field = this.sortField.get();
    const direction = this.sortDirection.get();

    // rows: any[] — flattened per-card view rows built for the table.
    const rows: any[] = [];
    board.cards().forEach((card: any) => {
      const swimlane = card.getSwimlane();
      const list = card.getList();
      if (!swimlane || swimlane.archived || !list || list.archived) return;

      const labels = (card.labelIds || [])
        .map((labelId: any) => {
          const label = board.getLabelById(labelId);
          return label ? { name: label.name || '', color: label.color } : null;
        })
        .filter(Boolean);

      rows.push({
        card,
        title: card.title || '',
        listTitle: list.title || '',
        swimlaneTitle: swimlane.title || '',
        colorClass: board.colorClass(),
        receivedAt: card.getReceived() || null,
        startAt: card.getStart() || null,
        dueAt: card.getDue() || null,
        endAt: card.getEnd() || null,
        labels,
      });
    });

    let filtered = rows;
    if (query) {
      filtered = rows.filter((row: any) => {
        const haystack = [
          row.title,
          row.listTitle,
          row.swimlaneTitle,
          ...row.labels.map((label: any) => label.name),
        ]
          .join(' ')
          .toLowerCase();
        return haystack.indexOf(query) !== -1;
      });
    }

    // Map a date sort field to the matching row property.
    const dateFieldProp: Record<string, string> = {
      received: 'receivedAt',
      start: 'startAt',
      due: 'dueAt',
      end: 'endAt',
    };

    filtered = filtered.slice().sort((a: any, b: any) => {
      const dateProp = dateFieldProp[field];
      if (dateProp) {
        // Cards without the date sort last, regardless of direction.
        const av = a[dateProp] ? new Date(a[dateProp]).getTime() : Infinity;
        const bv = b[dateProp] ? new Date(b[dateProp]).getTime() : Infinity;
        return (av - bv) * direction;
      }
      let av;
      let bv;
      if (field === 'list') {
        av = a.listTitle;
        bv = b.listTitle;
      } else if (field === 'swimlane') {
        av = a.swimlaneTitle;
        bv = b.swimlaneTitle;
      } else {
        av = a.title;
        bv = b.title;
      }
      return (
        av.localeCompare(bv, undefined, { numeric: true, sensitivity: 'base' }) *
        direction
      );
    });

    this.filteredRows.set(filtered);
  });
});

Template.tableView.helpers({
  currentBoard() {
    return Utils.getCurrentBoard();
  },

  rows() {
    const tpl = Template.instance() as TableViewInstance;
    const all = tpl.filteredRows.get();
    const totalPages = Math.max(1, Math.ceil(all.length / rowsPerPage));
    // Clamp on read so a shrinking list (deleted cards) never shows an empty
    // page; no write here, to avoid a reactive loop.
    const page = Math.min(tpl.page.get(), totalPages);
    const start = (page - 1) * rowsPerPage;
    return all.slice(start, start + rowsPerPage);
  },

  currentPage() {
    return (Template.instance() as TableViewInstance).page.get();
  },

  totalPages() {
    const count = (Template.instance() as TableViewInstance).filteredRows.get().length;
    return Math.max(1, Math.ceil(count / rowsPerPage));
  },

  hasPrevPage() {
    return (Template.instance() as TableViewInstance).page.get() > 1;
  },

  hasNextPage() {
    const tpl = Template.instance() as TableViewInstance;
    const totalPages = Math.max(
      1,
      Math.ceil(tpl.filteredRows.get().length / rowsPerPage),
    );
    return tpl.page.get() < totalPages;
  },

  // A date column is shown unless BOTH its "Show at Card" (allowsXxxDate) and
  // "Show at Minicard" (allowsXxxDateOnMinicard) board settings are unchecked.
  showReceivedColumn() {
    const board = Utils.getCurrentBoard();
    return !!board && (board.allowsReceivedDate || board.allowsReceivedDateOnMinicard);
  },

  showStartColumn() {
    const board = Utils.getCurrentBoard();
    return !!board && (board.allowsStartDate || board.allowsStartDateOnMinicard);
  },

  showDueColumn() {
    const board = Utils.getCurrentBoard();
    return !!board && (board.allowsDueDate || board.allowsDueDateOnMinicard);
  },

  showEndColumn() {
    const board = Utils.getCurrentBoard();
    return !!board && (board.allowsEndDate || board.allowsEndDateOnMinicard);
  },

  // Excel-like sort arrow shown on the active sort column header.
  sortIndicator(field: any) {
    const tpl = Template.instance() as TableViewInstance;
    if (tpl.sortField.get() !== field) return '';
    return tpl.sortDirection.get() === 1 ? '▲' : '▼';
  },
});

Template.tableView.events({
  'click .js-table-view-search-button'(event: JQuery.TriggeredEvent, tpl: TableViewInstance) {
    event.preventDefault();
    tpl.searchQuery.set(tpl.$('.js-table-view-search').val() || '');
    tpl.page.set(1);
  },

  'keydown .js-table-view-search'(event: JQuery.TriggeredEvent, tpl: TableViewInstance) {
    if (event.keyCode === 13) {
      event.preventDefault();
      tpl.searchQuery.set(tpl.$('.js-table-view-search').val() || '');
      tpl.page.set(1);
    }
  },

  'click .js-table-view-prev-page'(event: JQuery.TriggeredEvent, tpl: TableViewInstance) {
    event.preventDefault();
    const current = tpl.page.get();
    if (current > 1) tpl.page.set(current - 1);
  },

  'click .js-table-view-next-page'(event: JQuery.TriggeredEvent, tpl: TableViewInstance) {
    event.preventDefault();
    const totalPages = Math.max(
      1,
      Math.ceil(tpl.filteredRows.get().length / rowsPerPage),
    );
    const current = tpl.page.get();
    if (current < totalPages) tpl.page.set(current + 1);
  },

  'click .js-table-view-sort'(event: JQuery.TriggeredEvent, tpl: TableViewInstance) {
    event.preventDefault();
    const field = (event.currentTarget as HTMLElement).dataset.sort;
    if (!field) return;
    if (tpl.sortField.get() === field) {
      tpl.sortDirection.set(tpl.sortDirection.get() * -1);
    } else {
      tpl.sortField.set(field);
      tpl.sortDirection.set(1);
    }
    tpl.page.set(1);
  },

  // Clicking the leftmost "Edit" link opens the Card Details popup on top of the
  // Board Table view (same mechanism as opening a card from search results).
  'click .js-table-view-edit-card'(event: JQuery.TriggeredEvent) {
    event.preventDefault();
    const cardId = (event.currentTarget as HTMLElement).dataset.cardId;
    if (!cardId) return;
    const board = Utils.getCurrentBoard();
    Meteor.subscribe('popupCardData', cardId, {
      onReady() {
        Session.set('popupCardId', cardId);
        if (board) Session.set('popupCardBoardId', board._id);
        if (!Popup.isOpen()) {
          Popup.open('cardDetails')(event);
        }
      },
    });
  },

  // Adding a date to a card that has none. The data context of each add button
  // is the card (set with `with row.card` in the template), so the popup edits
  // the right card. Editing an existing date is handled by the cardXxxDate
  // badge templates themselves (their own .js-edit-date click handlers).
  'click .js-received-date': Popup.open('editCardReceivedDate'),
  'click .js-start-date': Popup.open('editCardStartDate'),
  'click .js-due-date': Popup.open('editCardDueDate'),
  'click .js-end-date': Popup.open('editCardEndDate'),
});

// Template instance for the board Table view. Rows are dynamic per-card view
// models built in the autorun, so ReactiveVar<any>.
interface TableViewInstance extends Blaze.TemplateInstance {
  searchQuery: ReactiveVar<any>;
  sortField: ReactiveVar<any>;
  sortDirection: ReactiveVar<any>;
  page: ReactiveVar<any>;
  filteredRows: ReactiveVar<any>;
}
