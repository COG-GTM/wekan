import { Meteor } from 'meteor/meteor';
import { Template } from 'meteor/templating';
import { Blaze } from 'meteor/blaze';
import { ReactiveVar } from 'meteor/reactive-var';
import { ReactiveCache } from '/imports/reactiveCache';
import { TAPi18n } from '/imports/i18n';
import Attachments from '/models/attachments';
import { CardSearchPaged } from '/client/lib/cardSearch';
import SessionData from '/models/usersessiondata';
import Boards from '/models/boards';
import Cards from '/models/cards';
import Rules from '/models/rules';
const { filesize } = require('filesize');

// --- Shared helper functions (formerly AdminReport base class methods) ---

function yesOrNo(value: any) {
  if (value) {
    return TAPi18n.__('yes');
  } else {
    return TAPi18n.__('no');
  }
}

function fileSizeHelper(size: any) {
  let ret = "";
  if (typeof size === 'number') {
    ret = filesize(size);
  }
  return ret;
}

function abbreviate(text: any) {
  if (text?.length > 30) {
    return `${text.substr(0, 29)}...`;
  }
  return text;
}

// The report publications already send only the current page (server-side
// search + limit/skip, sorted). Display exactly what was published, applying
// the same sort so minimongo order matches the server page. Re-applying
// skip/limit here would paginate an already-paginated set.
function collectionResults(collection: any, sort: any) {
  return collection.find({}, sort ? { sort } : {});
}

function collectionResultsCount(collection: any) {
  return collection.find().count();
}

// --- adminReports template ---

// Rows per page for the paginated reports (files, rules, boards, cards).
// Kept in sync with the admin People panel so all admin lists page alike.
const REPORTS_PER_PAGE = 25;

// Static description of each paginated report: which page/count reactive vars
// it uses, which publication feeds it and which count method backs it. Lets a
// single loadReport() drive all of them the same way.
function reportConfig(tmpl: AdminReportsInstance): Record<string, ReportConfigEntry> {
  return {
    'report-files': { page: tmpl.filesPage, count: tmpl.filesCount, search: tmpl.filesSearch, pub: 'attachmentsList', countMethod: 'getAttachmentsReportCount' },
    'report-rules': { page: tmpl.rulesPage, count: tmpl.rulesCount, search: tmpl.rulesSearch, pub: 'rulesReport', countMethod: 'getRulesReportCount' },
    'report-boards': { page: tmpl.boardsPage, count: tmpl.boardsCount, search: tmpl.boardsSearch, pub: 'boardsReport', countMethod: 'getBoardsReportCount' },
    'report-cards': { page: tmpl.cardsPage, count: tmpl.cardsCount, search: tmpl.cardsSearch, pub: 'cardsReport', countMethod: 'getCardsReportCount' },
  };
}

Template.adminReports.onCreated(function (this: AdminReportsInstance) {
  this.subscription = null;
  this.showFilesReport = new ReactiveVar(false);
  this.showBrokenCardsReport = new ReactiveVar(false);
  this.showOrphanedFilesReport = new ReactiveVar(false);
  this.showRulesReport = new ReactiveVar(false);
  this.showCardsReport = new ReactiveVar(false);
  this.showBoardsReport = new ReactiveVar(false);
  // SessionData.getSessionId is attached at runtime (see models/usersessiondata).
  this.sessionId = (SessionData as any).getSessionId();
  this.error = new ReactiveVar('');
  this.loading = new ReactiveVar(false);

  // Pagination state, one current-page + total-count pair per report.
  this.activeReport = new ReactiveVar('');
  this.filesPage = new ReactiveVar(1);
  this.rulesPage = new ReactiveVar(1);
  this.boardsPage = new ReactiveVar(1);
  this.cardsPage = new ReactiveVar(1);
  this.filesCount = new ReactiveVar(0);
  this.rulesCount = new ReactiveVar(0);
  this.boardsCount = new ReactiveVar(0);
  this.cardsCount = new ReactiveVar(0);
  // Current search term per report (empty string = no filter).
  this.filesSearch = new ReactiveVar('');
  this.rulesSearch = new ReactiveVar('');
  this.boardsSearch = new ReactiveVar('');
  this.cardsSearch = new ReactiveVar('');

  // (Re)subscribe the given report for its current page and refresh its total
  // count. Server-side search + limit/skip means only the matching page ever
  // reaches minimongo.
  this.loadReport = (reportId: any) => {
    const cfg = reportConfig(this)[reportId];
    if (!cfg) {
      return;
    }
    // Note: we deliberately do not toggle the global `loading` spinner here.
    // The spinner is shown once on tab switch (switchMenu); paging/searching
    // re-subscribes silently so the search box keeps focus and the report
    // stays mounted, just like the admin People panel.
    if (this.subscription) {
      this.subscription.stop();
    }
    const searchTerm = cfg.search.get();
    const limit = REPORTS_PER_PAGE;
    const skip = (cfg.page.get() - 1) * REPORTS_PER_PAGE;
    this.subscription = Meteor.subscribe(cfg.pub, searchTerm, limit, skip, () => {
      this.loading.set(false);
    });
    // error/count: any — untyped Meteor method callback.
    Meteor.call(cfg.countMethod, searchTerm, (error: any, count: any) => {
      if (error) {
        console.error(`Failed to load ${cfg.countMethod}:`, error);
        return;
      }
      const total = count || 0;
      const totalPages = Math.max(1, Math.ceil(total / REPORTS_PER_PAGE));
      // If rows were removed while on a now-out-of-range page, clamp and reload.
      if (cfg.page.get() > totalPages) {
        cfg.page.set(totalPages);
        this.loadReport(reportId);
        return;
      }
      cfg.count.set(total);
    });
  };
});

Template.adminReports.helpers({
  showFilesReport() {
    return (Template.instance() as AdminReportsInstance).showFilesReport;
  },
  showBrokenCardsReport() {
    return (Template.instance() as AdminReportsInstance).showBrokenCardsReport;
  },
  showOrphanedFilesReport() {
    return (Template.instance() as AdminReportsInstance).showOrphanedFilesReport;
  },
  showRulesReport() {
    return (Template.instance() as AdminReportsInstance).showRulesReport;
  },
  showCardsReport() {
    return (Template.instance() as AdminReportsInstance).showCardsReport;
  },
  showBoardsReport() {
    return (Template.instance() as AdminReportsInstance).showBoardsReport;
  },
  loading() {
    return (Template.instance() as AdminReportsInstance).loading;
  },

  // --- Pagination helpers, passed down into each report sub-template ---
  filesCurrentPage() { return (Template.instance() as AdminReportsInstance).filesPage.get(); },
  filesTotalPages() { return Math.max(1, Math.ceil(((Template.instance() as AdminReportsInstance).filesCount.get() || 0) / REPORTS_PER_PAGE)); },
  hasFilesPrevPage() { return (Template.instance() as AdminReportsInstance).filesPage.get() > 1; },
  hasFilesNextPage() {
    const tpl = Template.instance() as AdminReportsInstance;
    return tpl.filesPage.get() < Math.max(1, Math.ceil((tpl.filesCount.get() || 0) / REPORTS_PER_PAGE));
  },

  rulesCurrentPage() { return (Template.instance() as AdminReportsInstance).rulesPage.get(); },
  rulesTotalPages() { return Math.max(1, Math.ceil(((Template.instance() as AdminReportsInstance).rulesCount.get() || 0) / REPORTS_PER_PAGE)); },
  hasRulesPrevPage() { return (Template.instance() as AdminReportsInstance).rulesPage.get() > 1; },
  hasRulesNextPage() {
    const tpl = Template.instance() as AdminReportsInstance;
    return tpl.rulesPage.get() < Math.max(1, Math.ceil((tpl.rulesCount.get() || 0) / REPORTS_PER_PAGE));
  },

  boardsCurrentPage() { return (Template.instance() as AdminReportsInstance).boardsPage.get(); },
  boardsTotalPages() { return Math.max(1, Math.ceil(((Template.instance() as AdminReportsInstance).boardsCount.get() || 0) / REPORTS_PER_PAGE)); },
  hasBoardsPrevPage() { return (Template.instance() as AdminReportsInstance).boardsPage.get() > 1; },
  hasBoardsNextPage() {
    const tpl = Template.instance() as AdminReportsInstance;
    return tpl.boardsPage.get() < Math.max(1, Math.ceil((tpl.boardsCount.get() || 0) / REPORTS_PER_PAGE));
  },

  cardsCurrentPage() { return (Template.instance() as AdminReportsInstance).cardsPage.get(); },
  cardsTotalPages() { return Math.max(1, Math.ceil(((Template.instance() as AdminReportsInstance).cardsCount.get() || 0) / REPORTS_PER_PAGE)); },
  hasCardsPrevPage() { return (Template.instance() as AdminReportsInstance).cardsPage.get() > 1; },
  hasCardsNextPage() {
    const tpl = Template.instance() as AdminReportsInstance;
    return tpl.cardsPage.get() < Math.max(1, Math.ceil((tpl.cardsCount.get() || 0) / REPORTS_PER_PAGE));
  },
});

Template.adminReports.events({
  'click a.js-report-broken'(event: JQuery.TriggeredEvent) {
    switchMenu(event, Template.instance() as AdminReportsInstance);
  },
  'click a.js-report-files'(event: JQuery.TriggeredEvent) {
    switchMenu(event, Template.instance() as AdminReportsInstance);
  },
  'click a.js-report-rules'(event: JQuery.TriggeredEvent) {
    switchMenu(event, Template.instance() as AdminReportsInstance);
  },
  'click a.js-report-cards'(event: JQuery.TriggeredEvent) {
    switchMenu(event, Template.instance() as AdminReportsInstance);
  },
  'click a.js-report-boards'(event: JQuery.TriggeredEvent) {
    switchMenu(event, Template.instance() as AdminReportsInstance);
  },

  // --- Pagination controls (buttons live inside the report sub-templates,
  // their clicks bubble up to this parent template) ---
  'click .js-files-prev-page'(event: JQuery.TriggeredEvent, tmpl: AdminReportsInstance) { goPrevPage(event, tmpl, 'report-files'); },
  'click .js-files-next-page'(event: JQuery.TriggeredEvent, tmpl: AdminReportsInstance) { goNextPage(event, tmpl, 'report-files'); },
  'click .js-rules-prev-page'(event: JQuery.TriggeredEvent, tmpl: AdminReportsInstance) { goPrevPage(event, tmpl, 'report-rules'); },
  'click .js-rules-next-page'(event: JQuery.TriggeredEvent, tmpl: AdminReportsInstance) { goNextPage(event, tmpl, 'report-rules'); },
  'click .js-boards-prev-page'(event: JQuery.TriggeredEvent, tmpl: AdminReportsInstance) { goPrevPage(event, tmpl, 'report-boards'); },
  'click .js-boards-next-page'(event: JQuery.TriggeredEvent, tmpl: AdminReportsInstance) { goNextPage(event, tmpl, 'report-boards'); },
  'click .js-cards-prev-page'(event: JQuery.TriggeredEvent, tmpl: AdminReportsInstance) { goPrevPage(event, tmpl, 'report-cards'); },
  'click .js-cards-next-page'(event: JQuery.TriggeredEvent, tmpl: AdminReportsInstance) { goNextPage(event, tmpl, 'report-cards'); },

  // --- Search (one input + button per report, mirrors the People panel) ---
  'click .js-files-search-button'(event: JQuery.TriggeredEvent, tmpl: AdminReportsInstance) { runSearch(tmpl, 'report-files', '.js-files-search-input'); },
  'keydown .js-files-search-input'(event: JQuery.TriggeredEvent, tmpl: AdminReportsInstance) { if (event.keyCode === 13 && !event.shiftKey) runSearch(tmpl, 'report-files', '.js-files-search-input'); },
  'click .js-rules-search-button'(event: JQuery.TriggeredEvent, tmpl: AdminReportsInstance) { runSearch(tmpl, 'report-rules', '.js-rules-search-input'); },
  'keydown .js-rules-search-input'(event: JQuery.TriggeredEvent, tmpl: AdminReportsInstance) { if (event.keyCode === 13 && !event.shiftKey) runSearch(tmpl, 'report-rules', '.js-rules-search-input'); },
  'click .js-boards-search-button'(event: JQuery.TriggeredEvent, tmpl: AdminReportsInstance) { runSearch(tmpl, 'report-boards', '.js-boards-search-input'); },
  'keydown .js-boards-search-input'(event: JQuery.TriggeredEvent, tmpl: AdminReportsInstance) { if (event.keyCode === 13 && !event.shiftKey) runSearch(tmpl, 'report-boards', '.js-boards-search-input'); },
  'click .js-cards-search-button'(event: JQuery.TriggeredEvent, tmpl: AdminReportsInstance) { runSearch(tmpl, 'report-cards', '.js-cards-search-input'); },
  'keydown .js-cards-search-input'(event: JQuery.TriggeredEvent, tmpl: AdminReportsInstance) { if (event.keyCode === 13 && !event.shiftKey) runSearch(tmpl, 'report-cards', '.js-cards-search-input'); },
});

function goPrevPage(event: JQuery.TriggeredEvent, tmpl: AdminReportsInstance, reportId: any) {
  event.preventDefault();
  const cfg = reportConfig(tmpl)[reportId];
  const current = cfg.page.get();
  if (current > 1) {
    cfg.page.set(current - 1);
    tmpl.loadReport(reportId);
  }
}

function goNextPage(event: JQuery.TriggeredEvent, tmpl: AdminReportsInstance, reportId: any) {
  event.preventDefault();
  const cfg = reportConfig(tmpl)[reportId];
  const total = cfg.count.get() || 0;
  const totalPages = Math.max(1, Math.ceil(total / REPORTS_PER_PAGE));
  const current = cfg.page.get();
  if (current < totalPages) {
    cfg.page.set(current + 1);
    tmpl.loadReport(reportId);
  }
}

// Read the report's search box, store the term, reset to page 1 and reload.
function runSearch(tmpl: AdminReportsInstance, reportId: any, inputSelector: any) {
  const cfg = reportConfig(tmpl)[reportId];
  // .val() as string — jQuery typing is a union; the search box holds text.
  const value = ((tmpl.$(inputSelector).val() as string) || '').trim();
  cfg.search.set(value);
  cfg.page.set(1);
  tmpl.loadReport(reportId);
}

function switchMenu(event: JQuery.TriggeredEvent, tmpl: AdminReportsInstance) {
  const target = $(event.target);
  if (!target.hasClass('active')) {
    tmpl.loading.set(true);
    tmpl.showFilesReport.set(false);
    tmpl.showBrokenCardsReport.set(false);
    tmpl.showOrphanedFilesReport.set(false);
    tmpl.showRulesReport.set(false);
    tmpl.showBoardsReport.set(false);
    tmpl.showCardsReport.set(false);
    if (tmpl.subscription) {
      tmpl.subscription.stop();
    }

    $('.side-menu li.active').removeClass('active');
    target.parent().addClass('active');
    const targetID = target.data('id');
    tmpl.activeReport.set(targetID);

    if ('report-broken' === targetID) {
      tmpl.showBrokenCardsReport.set(true);
      tmpl.subscription = Meteor.subscribe(
        'brokenCards',
        (SessionData as any).getSessionId(),
        () => {
          tmpl.loading.set(false);
        },
      );
    } else if ('report-files' === targetID) {
      tmpl.showFilesReport.set(true);
      tmpl.filesPage.set(1);
      tmpl.filesSearch.set('');
      tmpl.loadReport('report-files');
    } else if ('report-rules' === targetID) {
      tmpl.showRulesReport.set(true);
      tmpl.rulesPage.set(1);
      tmpl.rulesSearch.set('');
      tmpl.loadReport('report-rules');
    } else if ('report-boards' === targetID) {
      tmpl.showBoardsReport.set(true);
      tmpl.boardsPage.set(1);
      tmpl.boardsSearch.set('');
      tmpl.loadReport('report-boards');
    } else if ('report-cards' === targetID) {
      tmpl.showCardsReport.set(true);
      tmpl.cardsPage.set(1);
      tmpl.cardsSearch.set('');
      tmpl.loadReport('report-cards');
    }
  }
}

// --- filesReport template ---

Template.filesReport.helpers({
  results() {
    return collectionResults(Attachments, { name: 1 });
  },
  resultsCount() {
    return collectionResultsCount(Attachments);
  },
  fileSize(size: any) {
    return fileSizeHelper(size);
  },
});

// --- rulesReport template ---

Template.rulesReport.helpers({
  results() {
    // rules: any[] — flattened rule rows for display.
    const rules: any[] = [];

    ReactiveCache.getRules({}, { sort: { boardId: 1 } }).forEach((rule: any) => {
      rules.push({
        _id: rule._id,
        title: rule.title,
        boardId: rule.boardId,
        boardTitle: rule.board()?.title,
        action: rule.action(),
        trigger: rule.trigger(),
      });
    });

    return rules;
  },
  resultsCount() {
    return collectionResultsCount(Rules);
  },
});

// --- boardsReport template ---

Template.boardsReport.helpers({
  results() {
    return collectionResults(Boards, { sort: 1 });
  },
  resultsCount() {
    return collectionResultsCount(Boards);
  },
  yesOrNo(value: any) {
    return yesOrNo(value);
  },
  abbreviate(text: any) {
    return abbreviate(text);
  },
  userNames(members: any) {
    const ret = (members || [])
      // #5122: removing a member from a board marks it `isActive: false` (the
      // entry stays in board.members for role history / re-activation). The
      // boards report must not list those removed members as current members.
      .filter((_member: any) => _member.isActive !== false)
      .map((_member: any) => {
        const _ret = ReactiveCache.getUser(_member.userId)?.username || _member.userId;
        return _ret;
      })
      .join(", ");
    return ret;
  },
  teams(memberTeams: any) {
    const ret = (memberTeams || [])
      .map((_memberTeam: any) => {
        const _ret = ReactiveCache.getTeam(_memberTeam.teamId)?.teamDisplayName || _memberTeam.teamId;
        return _ret;
      })
      .join(", ");
    return ret;
  },
  orgs(orgs: any) {
    const ret = (orgs || [])
      .map((_orgs: any) => {
        const _ret = ReactiveCache.getOrg(_orgs.orgId)?.orgDisplayName || _orgs.orgId;
        return _ret;
      })
      .join(", ");
    return ret;
  },
});

// --- cardsReport template ---

Template.cardsReport.helpers({
  results() {
    return collectionResults(Cards, { boardId: 1, sort: 1 });
  },
  resultsCount() {
    return collectionResultsCount(Cards);
  },
  abbreviate(text: any) {
    return abbreviate(text);
  },
  userNames(userIds: any) {
    const ret = (userIds || [])
      .map((_userId: any) => {
        const _ret = ReactiveCache.getUser(_userId)?.username;
        return _ret;
      })
      .join(", ");
    return ret;
  },
});

// --- brokenCardsReport template ---

Template.brokenCardsReport.onCreated(function (this: BrokenCardsReportInstance) {
  const search = new CardSearchPaged(this);
  this.search = search;
});

Template.brokenCardsReport.helpers({
  resultsCount() {
    return (Template.instance() as BrokenCardsReportInstance).search.resultsCount;
  },
  resultsHeading() {
    return (Template.instance() as BrokenCardsReportInstance).search.resultsHeading;
  },
  results() {
    return (Template.instance() as BrokenCardsReportInstance).search.results;
  },
  getSearchHref() {
    return (Template.instance() as BrokenCardsReportInstance).search.getSearchHref();
  },
  hasPreviousPage() {
    return (Template.instance() as BrokenCardsReportInstance).search.hasPreviousPage;
  },
  hasNextPage() {
    return (Template.instance() as BrokenCardsReportInstance).search.hasNextPage;
  },
});

Template.brokenCardsReport.events({
  'click .js-next-page'(evt: JQuery.TriggeredEvent, tpl: BrokenCardsReportInstance) {
    evt.preventDefault();
    tpl.search.nextPage();
  },
  'click .js-previous-page'(evt: JQuery.TriggeredEvent, tpl: BrokenCardsReportInstance) {
    evt.preventDefault();
    tpl.search.previousPage();
  },
});

// adminReports instance: report-visibility flags, pagination/search state per
// report and the shared subscription + loadReport driver.
interface AdminReportsInstance extends Blaze.TemplateInstance {
  // subscription: any — the active Meteor subscription handle (or null).
  subscription: any;
  showFilesReport: ReactiveVar<any>;
  showBrokenCardsReport: ReactiveVar<any>;
  showOrphanedFilesReport: ReactiveVar<any>;
  showRulesReport: ReactiveVar<any>;
  showCardsReport: ReactiveVar<any>;
  showBoardsReport: ReactiveVar<any>;
  // sessionId: any — the current user session id.
  sessionId: any;
  error: ReactiveVar<any>;
  loading: ReactiveVar<any>;
  activeReport: ReactiveVar<any>;
  filesPage: ReactiveVar<any>;
  rulesPage: ReactiveVar<any>;
  boardsPage: ReactiveVar<any>;
  cardsPage: ReactiveVar<any>;
  filesCount: ReactiveVar<any>;
  rulesCount: ReactiveVar<any>;
  boardsCount: ReactiveVar<any>;
  cardsCount: ReactiveVar<any>;
  filesSearch: ReactiveVar<any>;
  rulesSearch: ReactiveVar<any>;
  boardsSearch: ReactiveVar<any>;
  cardsSearch: ReactiveVar<any>;
  loadReport: (reportId: any) => void;
}

// brokenCardsReport instance: wraps a CardSearchPaged for the broken-cards list.
interface BrokenCardsReportInstance extends Blaze.TemplateInstance {
  // search: any — a CardSearchPaged instance.
  search: any;
}

// Per-report pagination/search config used by reportConfig().
interface ReportConfigEntry {
  page: ReactiveVar<any>;
  count: ReactiveVar<any>;
  search: ReactiveVar<any>;
  pub: string;
  countMethod: string;
}
