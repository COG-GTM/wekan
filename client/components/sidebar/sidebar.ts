import { Meteor } from 'meteor/meteor';
import { Template } from 'meteor/templating';
import { Blaze } from 'meteor/blaze';
import { ReactiveVar } from 'meteor/reactive-var';
import { ReactiveCache } from '/imports/reactiveCache';
import { TAPi18n } from '/imports/i18n';
import { FlowRouter } from 'meteor/ostrio:flow-router-extra';
import { InfiniteScrolling } from '/client/lib/infiniteScrolling';
import AccessibilitySettings from '/models/accessibilitySettings';
import Boards from '/models/boards';
import Attachments from '/models/attachments';
import { generateUniversalAttachmentUrl } from '/models/lib/universalUrlGenerator';
import Integrations from '/models/integrations';
import Lists from '/models/lists';
import { BOARD_COLORS } from '/models/metadata/colors';
import { Filter } from '/client/lib/filter';
import { EscapeActions } from '/client/lib/escapeActions';
import { Utils } from '/client/lib/utils';
import {
  exportDependenciesJson,
  exportDependenciesSvg,
} from '/client/lib/exportDependencies';
import { parseDependencyLines } from '/client/lib/importDependencies';
import {
  clearSidebarInstance,
  setSidebarInstance,
} from '/client/features/sidebar/service';

// Sidebar: any — the sidebar template instance (see SidebarInstance), exposed
// globally for programmatic access; null until the template is created.
export let Sidebar: any = null;

const defaultView = 'home';
const MCB = '.materialCheckBox';
const CKCLS = 'is-checked';

// board: any — a Board document; onMinicardField/cardField are dynamic keys.
function getMinicardSetting(board: any, onMinicardField: any, cardField: any, defaultValue: any) {
  if (!board) return false;
  if (board[onMinicardField] !== null && board[onMinicardField] !== undefined) {
    return board[onMinicardField];
  }
  if (cardField && board[cardField] !== null && board[cardField] !== undefined) {
    return board[cardField];
  }
  return defaultValue;
}

const viewTitles: Record<string, string> = {
  filter: 'filter-cards',
  search: 'search-cards',
  multiselection: 'multi-selection',
  customFields: 'custom-fields',
  archives: 'archives',
};

Template.sidebar.onCreated(function(this: SidebarInstance) {
  this._isOpen = new ReactiveVar(false);
  this._view = new ReactiveVar(defaultView);
  this._hideCardCounterList = new ReactiveVar(false);
  this._hideBoardMemberList = new ReactiveVar(false);
  this.infiniteScrolling = new InfiniteScrolling();
  this.activitiesInstance = null;
  Sidebar = this;
  setSidebarInstance(this);

  // Subscribe to accessibility settings
  Meteor.subscribe('accessibilitySettings');

  // Methods on the template instance for programmatic access via the Sidebar global
  this.isOpen = function() {
    return this._isOpen.get();
  };

  this.open = function() {
    if (!this._isOpen.get()) {
      this._isOpen.set(true);
      EscapeActions.executeUpTo('detailsPane');
    }
  };

  this.hide = function() {
    if (this._isOpen.get()) {
      this._isOpen.set(false);
    }
  };

  this.toggle = function() {
    this._isOpen.set(!this._isOpen.get());
  };

  this.calculateNextPeak = function() {
    const sidebarElement = this.find('.js-board-sidebar-content');
    if (sidebarElement) {
      const altitude = sidebarElement.scrollHeight;
      this.infiniteScrolling.setNextPeak(altitude);
    }
  };

  this.reachNextPeak = function() {
    if (this.activitiesInstance && typeof this.activitiesInstance.loadNextPage === 'function') {
      this.activitiesInstance.loadNextPage();
    }
  };

  this.isTongueHidden = function() {
    return this.isOpen() && this.getView() !== defaultView;
  };

  this.scrollTop = function() {
    this.$('.js-board-sidebar-content').scrollTop(0);
  };

  this.getView = function() {
    return this._view.get();
  };

  this.setView = function(this: SidebarInstance, view?: any) {
    view = typeof view === 'string' ? view : defaultView;
    if (this._view.get() !== view) {
      this._view.set(view);
      this.scrollTop();
      EscapeActions.executeUpTo('detailsPane');
    }
    this.open();
  };

  this.isDefaultView = function() {
    return this.getView() === defaultView;
  };

  this.getViewTemplate = function() {
    return `${this.getView()}Sidebar`;
  };

  this.getViewTitle = function() {
    return TAPi18n.__(viewTitles[this.getView()]);
  };

  this.showTongueTitle = function() {
    if (this.isOpen()) return `${TAPi18n.__('sidebar-close')}`;
    else return `${TAPi18n.__('sidebar-open')}`;
  };
});

Template.sidebar.onDestroyed(function(this: SidebarInstance) {
  clearSidebarInstance(this);
  Sidebar = null;
});

Template.sidebar.helpers({
  isOpen() {
    return Sidebar && Sidebar.isOpen();
  },
  isTongueHidden() {
    return Sidebar && Sidebar.isTongueHidden();
  },
  isDefaultView() {
    return Sidebar && Sidebar.isDefaultView();
  },
  getViewTemplate() {
    return Sidebar && Sidebar.getViewTemplate();
  },
  getViewTitle() {
    return Sidebar && Sidebar.getViewTitle();
  },
  showTongueTitle() {
    return Sidebar && Sidebar.showTongueTitle();
  },
  isKeyboardShortcuts() {
    const user = ReactiveCache.getCurrentUser();
    return user && user.isKeyboardShortcuts();
  },
  isVerticalScrollbars() {
    const user = ReactiveCache.getCurrentUser();
    return user && user.isVerticalScrollbars();
  },
  isAccessibilityEnabled() {
    const setting = AccessibilitySettings.findOne({});
    return setting && setting.enabled;
  },
});

Template.sidebar.events({
  'click .js-hide-sidebar'(event: JQuery.TriggeredEvent, tpl: SidebarInstance) {
    tpl.hide();
  },
  'click .js-toggle-sidebar'(event: JQuery.TriggeredEvent, tpl: SidebarInstance) {
    tpl.toggle();
  },
  'click .js-back-home'(event: JQuery.TriggeredEvent, tpl: SidebarInstance) {
    tpl.setView();
  },
  'click .js-toggle-minicard-label-text'() {
    const currentUser = ReactiveCache.getCurrentUser();
    if (currentUser) {
      Meteor.call('toggleMinicardLabelText');
    } else if (window.localStorage.getItem('hiddenMinicardLabelText')) {
      window.localStorage.removeItem('hiddenMinicardLabelText');
      location.reload();
    } else {
      window.localStorage.setItem('hiddenMinicardLabelText', 'true');
      location.reload();
    }
  },
  'click .js-shortcuts'() {
    FlowRouter.go('shortcuts');
  },
  'click .js-keyboard-shortcuts-toggle'() {
    const user = ReactiveCache.getCurrentUser();
    if (user) user.toggleKeyboardShortcuts();
  },
  'click .js-vertical-scrollbars-toggle'() {
    ReactiveCache.getCurrentUser().toggleVerticalScrollbars();
  },
  'click .js-show-week-of-year-toggle'() {
    const user = ReactiveCache.getCurrentUser();
    if (user) {
      user.toggleShowWeekOfYear();
    } else {
      const current = window.localStorage.getItem('showWeekOfYear') === 'true';
      window.localStorage.setItem('showWeekOfYear', String(!current));
    }
  },
  'click .sidebar-accessibility'(event: JQuery.TriggeredEvent, tpl: SidebarInstance) {
    FlowRouter.go('accessibility');
    tpl.toggle();
  },
  'click .js-close-sidebar'(event: JQuery.TriggeredEvent, tpl: SidebarInstance) {
    tpl.toggle();
  },
  'scroll .js-board-sidebar-content'(event: JQuery.TriggeredEvent, tpl: SidebarInstance) {
    tpl.infiniteScrolling.checkScrollPosition(event.currentTarget, () => {
      tpl.reachNextPeak();
    });
  },
});

Blaze.registerHelper('Sidebar', () => Sidebar);

Template.homeSidebar.helpers({
  hiddenMinicardLabelText() {
    const currentUser = ReactiveCache.getCurrentUser();
    if (currentUser) {
      return (currentUser.profile || {}).hiddenMinicardLabelText;
    } else if (window.localStorage.getItem('hiddenMinicardLabelText')) {
      return true;
    } else {
      return false;
    }
  },
  isVerticalScrollbars() {
    const user = ReactiveCache.getCurrentUser();
    return user && user.isVerticalScrollbars();
  },
  isShowWeekOfYear() {
    const user = ReactiveCache.getCurrentUser();
    if (!user) return window.localStorage.getItem('showWeekOfYear') === 'true';
    return user.isShowWeekOfYear();
  },
  showActivities() {
    let ret = Utils.getCurrentBoard().showActivities ?? false;
    return ret;
  },
});

Template.homeSidebar.events({
  async 'click .js-toggle-show-activities'() {
    await Utils.getCurrentBoard().toggleShowActivities();
  },
});



Template.boardInfoOnMyBoardsPopup.helpers({
  hideCardCounterList() {
    return Utils.isMiniScreen() && Session.get('currentBoard');
  },
  hideBoardMemberList() {
    return Utils.isMiniScreen() && Session.get('currentBoard');
  },
});

EscapeActions.register(
  'sidebarView',
  () => {
    if (Sidebar) {
      Sidebar.setView(defaultView);
    }
  },
  () => {
    return Sidebar && Sidebar.getView() !== defaultView;
  },
);

Template.memberPopup.helpers({
  user() {
    return ReactiveCache.getUser(this.userId);
  },
  isBoardAdmin() {
    return ReactiveCache.getCurrentUser()?.isBoardAdmin();
  },
  memberType() {
    const type = ReactiveCache.getUser(this.userId).isBoardAdmin() ? 'admin' : 'normal';
    if (type === 'normal') {
      const currentBoard = Utils.getCurrentBoard();
      const commentOnly = currentBoard.hasCommentOnly(this.userId);
      const noComments = currentBoard.hasNoComments(this.userId);
      const worker = currentBoard.hasWorker(this.userId);
      const normalAssignedOnly = currentBoard.hasNormalAssignedOnly(this.userId);
      const commentAssignedOnly = currentBoard.hasCommentAssignedOnly(this.userId);
      const readOnly = currentBoard.hasReadOnly(this.userId);
      const readAssignedOnly = currentBoard.hasReadAssignedOnly(this.userId);
      if (readAssignedOnly) {
        return TAPi18n.__('read-assigned-only');
      } else if (readOnly) {
        return TAPi18n.__('read-only');
      } else if (commentAssignedOnly) {
        return TAPi18n.__('comment-assigned-only');
      } else if (commentOnly) {
        return TAPi18n.__('comment-only');
      } else if (normalAssignedOnly) {
        return TAPi18n.__('normal-assigned-only');
      } else if (noComments) {
        return TAPi18n.__('no-comments');
      } else if (worker) {
        return TAPi18n.__('worker');
      } else {
        return TAPi18n.__(type);
      }
    } else {
      return TAPi18n.__(type);
    }
  },
  isInvited() {
    return ReactiveCache.getUser(this.userId).isInvitedTo(Session.get('currentBoard'));
  },
});


Template.boardMenuPopup.events({
  'click .js-rename-board': Popup.open('boardChangeTitle'),
  'click .js-open-rules-view'() {
    const currentBoard = Utils.getCurrentBoard();
    Popup.back();
    if (currentBoard) {
      FlowRouter.go('board-rules', {
        id: currentBoard._id,
        slug: currentBoard.slug,
      });
    }
  },
  'click .js-custom-fields'() {
    if (Sidebar) {
      Sidebar.setView('customFields');
    }
    Popup.back();
  },
  'click .js-open-archives'() {
    if (Sidebar) {
      Sidebar.setView('archives');
    }
    Popup.back();
  },
  'click .js-change-board-color': Popup.open('boardChangeColor'),
  'click .js-change-background-image': Popup.open('boardChangeBackgroundImage'),
  'click .js-manage-board-backgrounds': Popup.open('boardBackgrounds'),
  'click .js-board-info-on-my-boards': Popup.open('boardInfoOnMyBoards'),
  'click .js-change-language': Popup.open('changeLanguage'),
  'click .js-delete-duplicate-lists': Popup.afterConfirm('deleteDuplicateLists', function() {
    const currentBoard = Utils.getCurrentBoard();
    if (!currentBoard) return;

    // Get all lists in the current board
    const allLists = ReactiveCache.getLists({ boardId: currentBoard._id, archived: false });

    // Group lists by title to find duplicates
    // listsByTitle: any[] values — List documents grouped by their title.
    const listsByTitle: Record<string, any[]> = {};
    allLists.forEach((list: any) => {
      if (!listsByTitle[list.title]) {
        listsByTitle[list.title] = [];
      }
      listsByTitle[list.title].push(list);
    });

    // Find and delete duplicate lists that have no cards
    let deletedCount = 0;
    Object.keys(listsByTitle).forEach(title => {
      const listsWithSameTitle = listsByTitle[title];
      if (listsWithSameTitle.length > 1) {
        // Keep the first list, delete the rest if they have no cards
        for (let i = 1; i < listsWithSameTitle.length; i++) {
          const list = listsWithSameTitle[i];
          const cardsInList = ReactiveCache.getCards({ listId: list._id, archived: false });

          if (cardsInList.length === 0) {
            Lists.remove(list._id);
            deletedCount++;
          }
        }
      }
    });

    // Show notification
    if (deletedCount > 0) {
      // You could add a toast notification here if available
    }
  }),
  'click .js-archive-board ': Popup.afterConfirm('archiveBoard', async function() {
    const currentBoard = Utils.getCurrentBoard();
    try {
      await Meteor.callAsync('archiveBoard', currentBoard._id);
      FlowRouter.go('home');
    } catch (err) {
      alert(err?.reason || err?.message || 'Failed to archive board');
    }
  }),
  'click .js-delete-board': Popup.afterConfirm('deleteBoard', function() {
    const currentBoard = Utils.getCurrentBoard();
    Popup.back();
    Boards.remove(currentBoard._id);
    FlowRouter.go('home');
  }),
  'click .js-outgoing-webhooks': Popup.open('outgoingWebhooks'),
  'click .js-import-board': Popup.open('chooseBoardSource'),
  'click .js-subtask-settings': Popup.open('boardSubtaskSettings'),
  'click .js-card-settings': Popup.open('boardCardSettings'),
  'click .js-export-board': Popup.open('exportBoard'),
});

Template.boardMenuPopup.onCreated(function(this: BoardMenuPopupInstance) {
  this.apiEnabled = new ReactiveVar(false);
  // e/result: any — untyped Meteor method callback.
  Meteor.call('_isApiEnabled', (e: any, result: any) => {
    this.apiEnabled.set(result);
  });
});

Template.boardMenuPopup.helpers({
  isBoardAdmin() {
    return ReactiveCache.getCurrentUser()?.isBoardAdmin();
  },
  withApi() {
    return (Template.instance() as BoardMenuPopupInstance).apiEnabled.get();
  },
  exportUrl() {
    const params = {
      boardId: Session.get('currentBoard'),
    };
    const queryParams = {
      authToken: Accounts._storedLoginToken(),
    };
    return FlowRouter.path('/api/boards/:boardId/export', params, queryParams);
  },
  exportFilename() {
    const boardId = Session.get('currentBoard');
    return `export-board-${boardId}.json`;
  },
});

Template.memberPopup.events({
  // this: any — the member data context exposes `userId`.
  'click .js-filter-member'(this: any) {
    Filter.members.toggle(this.userId);
    Popup.back();
  },
  'click .js-change-role': Popup.open('changePermissions'),
  // this: any — the member data context exposes `userId`.
  'click .js-remove-member': Popup.afterConfirm('removeMember', async function(this: any) {
    // This works from removing member from board, card members and assignees.
    const boardId = Session.get('currentBoard');
    const memberId = this.userId;
    ReactiveCache.getCards({ boardId, members: memberId }).forEach((card: any) => {
      card.unassignMember(memberId);
    });
    ReactiveCache.getCards({ boardId, assignees: memberId }).forEach((card: any) => {
      card.unassignAssignee(memberId);
    });
    await ReactiveCache.getBoard(boardId).removeMember(memberId);
    Popup.back();
  }),
  'click .js-leave-member': Popup.afterConfirm('leaveBoard', () => {
    const boardId = Session.get('currentBoard');
    Meteor.call('quitBoard', boardId, () => {
      Popup.back();
      FlowRouter.go('home');
    });
  }),

});

Template.removeMemberPopup.helpers({
  // this: any — the member data context exposes `userId`.
  user(this: any) {
    return ReactiveCache.getUser(this.userId);
  },
  board() {
    return Utils.getCurrentBoard();
  },
});

Template.leaveBoardPopup.helpers({
  board() {
    return Utils.getCurrentBoard();
  },
});

Template.membersWidget.onCreated(function(this: OrgTeamPopupInstance) {
  this.error = new ReactiveVar('');
  this.loading = new ReactiveVar(false);
  this.findOrgsOptions = new ReactiveVar({});
  this.findTeamsOptions = new ReactiveVar({});

  this.page = new ReactiveVar(1);
  this.teamPage = new ReactiveVar(1);
  this.autorun(() => {
    const limitOrgs = this.page.get() * Number.MAX_SAFE_INTEGER;
    this.subscribe('org', this.findOrgsOptions.get(), limitOrgs, () => {});
  });

  this.autorun(() => {
    const limitTeams = this.teamPage.get() * Number.MAX_SAFE_INTEGER;
    this.subscribe('team', this.findTeamsOptions.get(), limitTeams, () => {});
  });

  this.setError = function(this: OrgTeamPopupInstance, error: any) {
    this.error.set(error);
  };

  this.setLoading = function(this: OrgTeamPopupInstance, w: any) {
    this.loading.set(w);
  };

  this.isLoading = function(this: OrgTeamPopupInstance) {
    return this.loading.get();
  };
});

Template.membersWidget.onRendered(function() {
  const tpl = Template.instance() as OrgTeamPopupInstance;
  if (tpl.setLoading) tpl.setLoading(false);
});

Template.membersWidget.helpers({
  isInvited() {
    const user = ReactiveCache.getCurrentUser();
    return user && user.isInvitedTo(Session.get('currentBoard'));
  },
  isWorker() {
    const user = ReactiveCache.getCurrentUser();
    if (user) {
      // Boards as any — hasWorker is a model helper not on the Collection type.
      return Meteor.call((Boards as any).hasWorker(user.memberId));
    } else {
      return false;
    }
  },
  isBoardAdmin() {
    return ReactiveCache.getCurrentUser()?.isBoardAdmin();
  },
  AtLeastOneOrgWasCreated(){
    let orgs = ReactiveCache.getOrgs({}, {sort: { createdAt: -1 }});
    if(orgs === undefined)
      return false;

    return orgs.length > 0;
  },

  AtLeastOneTeamWasCreated(){
    let teams = ReactiveCache.getTeams({}, {sort: { createdAt: -1 }});
    if(teams === undefined)
      return false;

    return teams.length > 0;
  },
  tabs() {
    return [
      { name: TAPi18n.__('people'), slug: 'people' },
      { name: TAPi18n.__('organizations'), slug: 'organizations' },
      { name: TAPi18n.__('teams'), slug: 'teams' },
      { name: TAPi18n.__('domains'), slug: 'domains' },
    ];
  },
});

Template.membersWidget.events({
  'click .js-member': Popup.open('member'),
  'click .js-open-board-menu': Popup.open('boardMenu'),
  'click .js-manage-board-members': Popup.open('addMember'),
  'click .js-manage-board-addOrg': Popup.open('addBoardOrg'),
  'click .js-manage-board-addTeam': Popup.open('addBoardTeam'),
  'click .js-manage-board-addDomain': Popup.open('addBoardDomain'),
  'click .js-import-board': Popup.open('chooseBoardSource'),
  'click .js-open-archived-board'() {
    Modal.open('archivedBoards');
  },
  'click .sandstorm-powerbox-request-identity'() {
    // window as any — sandstormRequestIdentity is injected by the Sandstorm host.
    (window as any).sandstormRequestIdentity();
  },
  'click .js-member-invite-accept'() {
    const boardId = Session.get('currentBoard');
    ReactiveCache.getCurrentUser().removeInvite(boardId);
  },
  'click .js-member-invite-decline'() {
    const boardId = Session.get('currentBoard');
    // err/ret: any — untyped Meteor method callback.
    Meteor.call('quitBoard', boardId, (err: any, ret: any) => {
      if (!err && ret) {
        ReactiveCache.getCurrentUser().removeInvite(boardId);
        FlowRouter.go('home');
      }
    });
  },
});

Template.outgoingWebhooksPopup.helpers({
  boardId() {
    return Session.get('currentBoard') || (Integrations as any).Const.GLOBAL_WEBHOOK_ID;
  },
  integrations() {
    const boardId = Session.get('currentBoard') || (Integrations as any).Const.GLOBAL_WEBHOOK_ID;
    const ret = ReactiveCache.getIntegrations({ boardId });
    return ret;
  },
  types() {
    return (Integrations as any).Const.WEBHOOK_TYPES;
  },
  // cond: any — a partial Integration query merged with the current boardId.
  integration(cond: any) {
    const boardId = Session.get('currentBoard') || (Integrations as any).Const.GLOBAL_WEBHOOK_ID;
    const condition = { boardId, ...cond };
    for (const k in condition) {
      if (!condition[k]) delete condition[k];
    }
    return ReactiveCache.getIntegration(condition);
  },
});

Template.outgoingWebhooksPopup.events({
  'click .js-toggle-webhook-enabled'(evt: JQuery.TriggeredEvent) {
    evt.preventDefault();
    $(evt.currentTarget).find(MCB).toggleClass(CKCLS);
  },
  // evt: any — the submit event; evt.target is the webhook <form> with named inputs.
  async submit(evt: any) {
    evt.preventDefault();
    const url = evt.target.url.value.trim();
    const boardId = Session.get('currentBoard') || (Integrations as any).Const.GLOBAL_WEBHOOK_ID;
    let id = null;
    let integration = null;
    const title = evt.target.title.value.trim();
    const token = evt.target.token.value.trim();
    const type = evt.target.type.value.trim();
    const enabled = !$(evt.target)
      .find('.js-toggle-webhook-enabled')
      .find(MCB)
      .hasClass(CKCLS);
    let remove = false;
    const values = {
      url,
      type,
      token,
      title,
      enabled,
    };

    const findIntegration = function(cond: any) {
      const condition: Record<string, any> = { boardId, ...cond };
      for (const k in condition) {
        if (!condition[k]) delete condition[k];
      }
      return ReactiveCache.getIntegration(condition);
    };

    if (evt.target.id) {
      id = evt.target.id.value;
      integration = findIntegration({ _id: id });
      remove = !url;
    } else if (url) {
      integration = findIntegration({ url, token });
    }

    try {
      if (remove && integration && integration._id) {
        await Integrations.removeAsync(integration._id);
      } else if (integration && integration._id) {
        await Integrations.updateAsync(integration._id, {
          $set: values,
        });
      } else if (url) {
        await Integrations.insertAsync({
          ...values,
          userId: Meteor.userId(),
          enabled,
          boardId,
          activities: ['all'],
        });
      }
      Popup.back();
    } catch (error) {
      alert(error?.reason || error?.message || 'Failed to save webhook');
    }
  },
});

Template.exportBoardPopup.helpers({
  withApi() {
    // Template.instance() as any — exportBoardPopup has no apiEnabled var; this
    // helper reads it defensively (undefined until set elsewhere).
    return (Template.instance() as any).apiEnabled.get();
  },
  exportUrl() {
    const params = {
      boardId: Session.get('currentBoard'),
    };
    const queryParams = {
      authToken: Accounts._storedLoginToken(),
    };
    return FlowRouter.path('/api/boards/:boardId/export', params, queryParams);
  },
  // #5870: JSON export omitting base64 attachment data, so very large boards
  // (whose inlined attachments would otherwise overflow the JSON serializer)
  // can still be exported.
  exportUrlNoAttachments() {
    const params = {
      boardId: Session.get('currentBoard'),
    };
    const queryParams = {
      authToken: Accounts._storedLoginToken(),
      attachments: 'false',
    };
    return FlowRouter.path('/api/boards/:boardId/export', params, queryParams);
  },
  exportUrlExcel() {
    const params = {
      boardId: Session.get('currentBoard'),
    };
    const queryParams = {
      authToken: Accounts._storedLoginToken(),
    };
    return FlowRouter.path(
      '/api/boards/:boardId/exportExcel',
      params,
      queryParams,
    );
  },
  exportUrlPDF() {
    const params = {
      boardId: Session.get('currentBoard'),
    };
    const queryParams = {
      authToken: Accounts._storedLoginToken(),
    };
    return FlowRouter.path('/api/boards/:boardId/exportPDF', params, queryParams);
  },
  exportFilenamePDF() {
    const boardId = Session.get('currentBoard');
    return `export-board-${boardId}.pdf`;
  },
  exportUrlKanboard() {
    const params = {
      boardId: Session.get('currentBoard'),
    };
    const queryParams = {
      authToken: Accounts._storedLoginToken(),
    };
    return FlowRouter.path('/api/boards/:boardId/export/kanboard', params, queryParams);
  },
  exportFilenameKanboard() {
    const boardId = Session.get('currentBoard');
    return `export-board-kanboard-${boardId}.json`;
  },
  // Generalized export URL/filename for the external tools (Deck, OpenProject,
  // GitHub, GitLab, Gitea, Forgejo).
  exportUrlExternal(format: any) {
    return FlowRouter.path(
      `/api/boards/:boardId/export/${format}`,
      { boardId: Session.get('currentBoard') },
      { authToken: Accounts._storedLoginToken() },
    );
  },
  exportFilenameExternal(format: any) {
    return `export-board-${format}-${Session.get('currentBoard')}.json`;
  },
  exportFilenameExcel() {
    const boardId = Session.get('currentBoard');
    return `export-board-excel-${boardId}.xlsx`;
  },
  exportCsvUrl() {
    const params = {
      boardId: Session.get('currentBoard'),
    };
    const queryParams = {
      authToken: Accounts._storedLoginToken(),
      delimiter: ',',
    };
    return FlowRouter.path(
      '/api/boards/:boardId/export/csv',
      params,
      queryParams,
    );
  },
  exportScsvUrl() {
    const params = {
      boardId: Session.get('currentBoard'),
    };
    const queryParams = {
      authToken: Accounts._storedLoginToken(),
      delimiter: ';',
    };
    return FlowRouter.path(
      '/api/boards/:boardId/export/csv',
      params,
      queryParams,
    );
  },
  exportTsvUrl() {
    const params = {
      boardId: Session.get('currentBoard'),
    };
    const queryParams = {
      authToken: Accounts._storedLoginToken(),
      delimiter: '\t',
    };
    return FlowRouter.path(
      '/api/boards/:boardId/export/csv',
      params,
      queryParams,
    );
  },
  exportJsonFilename() {
    const boardId = Session.get('currentBoard');
    return `export-board-${boardId}.json`;
  },
  exportCsvFilename() {
    const boardId = Session.get('currentBoard');
    return `export-board-${boardId}.csv`;
  },
  exportTsvFilename() {
    const boardId = Session.get('currentBoard');
    return `export-board-${boardId}.tsv`;
  },
});

Template.exportBoardPopup.events({
  'click .html-export-board': async (event: JQuery.TriggeredEvent) => {
    event.preventDefault();
    // window as any — ExportHtml is a global installed on window by exportHTML.ts.
    await (window as any).ExportHtml(Popup)();
  },
  // #3392: export the board's card dependency ("Red Strings") lines.
  'click .js-export-dependencies-json'(event: JQuery.TriggeredEvent) {
    event.preventDefault();
    exportDependenciesJson(Session.get('currentBoard'));
    Popup.close();
  },
  'click .js-export-dependencies-svg'(event: JQuery.TriggeredEvent) {
    event.preventDefault();
    exportDependenciesSvg(Session.get('currentBoard'));
    Popup.close();
  },
});

// #3392: import dependency ("Red Strings") lines from a JSON/SVG file into a
// chosen board. Reachable from All Boards / New / Import / Dependencies.
Template.chooseBoardSourcePopup.events({
  'click .js-import-dependencies': Popup.open('importDependencies'),
});

Template.importDependenciesPopup.onCreated(function (this: ImportDependenciesPopupInstance) {
  this.fileText = new ReactiveVar('');
  this.importResult = new ReactiveVar('');
});

Template.importDependenciesPopup.helpers({
  boardsForDependencyImport() {
    const userId = Meteor.userId();
    return ReactiveCache.getBoards(
      { 'members.userId': userId, archived: false },
      { sort: { sort: 1, title: 1 } },
    );
  },
  importResult() {
    return (Template.instance() as ImportDependenciesPopupInstance).importResult.get();
  },
});

Template.importDependenciesPopup.events({
  'change .js-import-dependencies-file'(event: JQuery.TriggeredEvent, tpl: ImportDependenciesPopupInstance) {
    const target = event.currentTarget as HTMLInputElement;
    const file = target.files && target.files[0];
    if (!file) return;
    const reader = new FileReader();
    // e: any — the FileReader load event; e.target.result is the file text.
    reader.onload = (e: any) => tpl.fileText.set(e.target.result || '');
    reader.readAsText(file);
  },
  'submit .js-import-dependencies-form'(event: JQuery.TriggeredEvent, tpl: ImportDependenciesPopupInstance) {
    event.preventDefault();
    const boardId = (tpl.find('.js-import-dependencies-board') as HTMLInputElement).value;
    const fileEl = tpl.find('.js-import-dependencies-file') as HTMLInputElement | null;
    const filename =
      fileEl && fileEl.files && fileEl.files[0] ? fileEl.files[0].name : '';
    const text =
      tpl.fileText.get() || (tpl.find('.js-import-dependencies-text') as HTMLInputElement).value || '';
    let lines: any[] = [];
    try {
      lines = parseDependencyLines(text, filename);
    } catch (e) {
      tpl.importResult.set(TAPi18n.__('import-dependencies-parse-error'));
      return;
    }
    if (!boardId || lines.length === 0) {
      tpl.importResult.set(TAPi18n.__('import-dependencies-empty'));
      return;
    }
    // err/res: any — untyped Meteor method callback.
    Meteor.call('importBoardDependencies', boardId, lines, (err: any, res: any) => {
      if (err) {
        tpl.importResult.set(err.reason || err.message || String(err));
        return;
      }
      tpl.importResult.set(
        TAPi18n.__('import-dependencies-done', {
          imported: res.imported,
          unmatched: res.unmatched,
        }),
      );
    });
  },
});

Template.labelsWidget.events({
  'click .js-label': Popup.open('editLabel'),
  'click .js-add-label': Popup.open('createLabel'),
});

Template.labelsWidget.helpers({
  isBoardAdmin() {
    return ReactiveCache.getCurrentUser()?.isBoardAdmin();
  },
});

// Board members can assign people or labels by drag-dropping elements from the
// sidebar to the cards on the board. In order to re-initialize the jquery-ui
// plugin any time a draggable member or label is modified or removed we use a
// autorun function and register a dependency on the both members and labels
// fields of the current board document.
// this: any — bound to the membersWidget/labelsWidget Blaze instance via onRendered.
function draggableMembersLabelsWidgets(this: any) {
  this.autorun(() => {
    const currentBoardId = Tracker.nonreactive(() => {
      return Session.get('currentBoard');
    });
    ReactiveCache.getBoard(currentBoardId, {
      fields: {
        members: 1,
        labels: 1,
      },
    });
    Tracker.afterFlush(() => {
      const $draggables = this.$('.js-member,.js-label');
      $draggables.draggable({
        appendTo: 'body',
        helper: 'clone',
        revert: 'invalid',
        revertDuration: 150,
        snap: false,
        snapMode: 'both',
        start() {
          EscapeActions.executeUpTo('popup-back');
        },
      });

      function userIsMember() {
        return ReactiveCache.getCurrentUser()?.isBoardMember();
      }

      this.autorun(() => {
        $draggables.draggable('option', 'disabled', !userIsMember());
      });
    });
  });
}

Template.membersWidget.onRendered(draggableMembersLabelsWidgets);
Template.labelsWidget.onRendered(draggableMembersLabelsWidgets);

Template.boardChangeColorPopup.helpers({
  backgroundColors() {
    return BOARD_COLORS;
  },
  isSelected() {
    const currentBoard = Utils.getCurrentBoard();
    return currentBoard.color === Template.currentData().toString();
  },
});

Template.boardChangeColorPopup.events({
  // this: any — the color-string data context.
  async 'click .js-select-background'(this: any, evt: JQuery.TriggeredEvent) {
    evt.preventDefault();
    evt.stopPropagation();
    const currentBoard = Utils.getCurrentBoard();
    const newColor = this.toString();
    await currentBoard.setColor(newColor);
  },
});

Template.boardChangeBackgroundImagePopup.events({
  async submit(event: JQuery.TriggeredEvent, tpl: Blaze.TemplateInstance) {
    const currentBoard = Utils.getCurrentBoard();
    const backgroundImageURL = (tpl.find('.js-board-background-image-url') as HTMLInputElement).value.trim();
    await currentBoard.setBackgroundImageURL(backgroundImageURL);
    // as any — Utils.setBackgroundImage's url param is optional at runtime
    // (it reads the board's own URL); callers invoke it with no args.
    (Utils.setBackgroundImage as any)();
    Popup.back();
    event.preventDefault();
  },
  'click .js-remove-background-image'(event: JQuery.TriggeredEvent) {
    const currentBoard = Utils.getCurrentBoard();
    currentBoard.setBackgroundImageURL("");
    Popup.back();
    Utils.reload();
    event.preventDefault();
  },
});

Template.boardChangeBackgroundImagePopup.helpers({
  backgroundImageURL() {
    const currentBoard = Utils.getCurrentBoard();
    return currentBoard.backgroundImageURL;
  },
});

// Manage the board's stored background images (upload / set active / download /
// delete). Backgrounds are board-level Attachments (meta.boardId, no cardId,
// meta.source === 'board-background') in the default attachments storage.
Template.boardBackgroundsPopup.onCreated(function (this: BoardBackgroundsPopupInstance) {
  this.uploading = new ReactiveVar(false);
  this.error = new ReactiveVar('');
  const board = Utils.getCurrentBoard();
  this.boardId = board && board._id;
  if (this.boardId) {
    this.subscribe('boardBackgrounds', this.boardId);
  }
});

Template.boardBackgroundsPopup.helpers({
  uploading() {
    return (Template.instance() as BoardBackgroundsPopupInstance).uploading;
  },
  error() {
    return (Template.instance() as BoardBackgroundsPopupInstance).error;
  },
  backgrounds() {
    // Raw collection docs don't carry the .link() helper, so compute the URL.
    return Attachments.collection
      .find({
        'meta.boardId': (Template.instance() as BoardBackgroundsPopupInstance).boardId,
        'meta.source': 'board-background',
      })
      .fetch()
      .map((att: any) => ({
        _id: att._id,
        name: att.name,
        link: generateUniversalAttachmentUrl(att._id),
      }));
  },
  // this: any — the background attachment data context exposes `_id`.
  isActiveBackground(this: any) {
    const board = Utils.getCurrentBoard();
    return board && board.backgroundImageId === this._id;
  },
});

Template.boardBackgroundsPopup.events({
  'click .js-bg-upload-button'(event: JQuery.TriggeredEvent, tpl: BoardBackgroundsPopupInstance) {
    event.preventDefault();
    tpl.find('.js-bg-upload-input').click();
  },
  async 'change .js-bg-upload-input'(event: JQuery.TriggeredEvent, tpl: BoardBackgroundsPopupInstance) {
    const target = event.currentTarget as HTMLInputElement;
    const file = target.files && target.files[0];
    if (!file) return;
    tpl.error.set('');
    tpl.uploading.set(true);
    // uploader: any — the ostrio:files upload handle.
    const uploader: any = await Attachments.insertAsync(
      {
        file,
        chunkSize: 'dynamic',
        meta: { boardId: tpl.boardId, source: 'board-background' },
      },
      false,
    );
    uploader.on('end', (err: any) => {
      tpl.uploading.set(false);
      if (err) tpl.error.set(err.reason || 'upload-failed');
    });
    uploader.on('error', (err: any) => {
      tpl.uploading.set(false);
      tpl.error.set((err && err.reason) || 'upload-failed');
    });
    uploader.start();
    // allow re-selecting the same file later
    target.value = '';
  },
  // this: any — the background attachment data context exposes `_id`.
  async 'click .js-set-board-background'(this: any) {
    const board = Utils.getCurrentBoard();
    await board.setBackgroundImage(this._id);
    // as any — Utils.setBackgroundImage's url param is optional at runtime
    // (it reads the board's own URL); callers invoke it with no args.
    (Utils.setBackgroundImage as any)();
  },
  // this: any — the background attachment data context exposes `_id`.
  'click .js-delete-board-background': Popup.afterConfirm('deleteBoardBackground', function (this: any) {
    Meteor.call('removeBoardBackground', this._id);
    Popup.back();
  }),
});

Template.boardInfoOnMyBoardsPopup.onCreated(function(this: CurrentBoardPopupInstance) {
  this.currentBoard = Utils.getCurrentBoard();
});

Template.boardInfoOnMyBoardsPopup.helpers({
  hideCardCounterList() {
    return Utils.isMiniScreen() && Session.get('currentBoard');
  },
  hideBoardMemberList() {
    return Utils.isMiniScreen() && Session.get('currentBoard');
  },
  allowsCardCounterList() {
    const tpl = Template.instance() as CurrentBoardPopupInstance;
    return tpl.currentBoard.allowsCardCounterList;
  },
  cardAging() {
    const tpl = Template.instance() as CurrentBoardPopupInstance;
    return tpl.currentBoard.cardAging;
  },
  cardAgingDays1() {
    return (Template.instance() as CurrentBoardPopupInstance).currentBoard.cardAgingDays1 ?? 7;
  },
  cardAgingDays2() {
    return (Template.instance() as CurrentBoardPopupInstance).currentBoard.cardAgingDays2 ?? 14;
  },
  cardAgingDays3() {
    return (Template.instance() as CurrentBoardPopupInstance).currentBoard.cardAgingDays3 ?? 28;
  },
  allowsBoardMemberList() {
    const tpl = Template.instance() as CurrentBoardPopupInstance;
    return tpl.currentBoard.allowsBoardMemberList;
  },
  allowsPersonalListWidth() {
    const tpl = Template.instance() as CurrentBoardPopupInstance;
    return tpl.currentBoard.allowsPersonalListWidth;
  },
});

Template.boardInfoOnMyBoardsPopup.events({
  'click .js-field-has-personal-list-width'(evt: JQuery.TriggeredEvent, tpl: CurrentBoardPopupInstance) {
    // #6409: toggle whether list widths are shared (board default, everyone
    // sees the same) or personal (per user).
    evt.preventDefault();
    tpl.currentBoard.allowsPersonalListWidth = !tpl.currentBoard
      .allowsPersonalListWidth;
    tpl.currentBoard.setAllowsPersonalListWidth(
      tpl.currentBoard.allowsPersonalListWidth,
    );
    $(`.js-field-has-personal-list-width ${MCB}`).toggleClass(
      CKCLS,
      tpl.currentBoard.allowsPersonalListWidth,
    );
    $('.js-field-has-personal-list-width').toggleClass(
      CKCLS,
      tpl.currentBoard.allowsPersonalListWidth,
    );
  },
  'click .js-field-has-cardcounterlist'(evt: JQuery.TriggeredEvent, tpl: CurrentBoardPopupInstance) {
    evt.preventDefault();
    tpl.currentBoard.allowsCardCounterList = !tpl.currentBoard
      .allowsCardCounterList;
      tpl.currentBoard.setAllowsCardCounterList(
        tpl.currentBoard.allowsCardCounterList,
    );
    $(`.js-field-has-cardcounterlist ${MCB}`).toggleClass(
      CKCLS,
      tpl.currentBoard.allowsCardCounterList,
    );
    $('.js-field-has-cardcounterlist').toggleClass(
      CKCLS,
      tpl.currentBoard.allowsCardCounterList,
    );
  },
  'click .js-field-has-cardaging'(evt: JQuery.TriggeredEvent, tpl: CurrentBoardPopupInstance) {
    evt.preventDefault();
    tpl.currentBoard.cardAging = !tpl.currentBoard.cardAging;
    tpl.currentBoard.setCardAging(tpl.currentBoard.cardAging);
    $(`.js-field-has-cardaging ${MCB}`).toggleClass(CKCLS, tpl.currentBoard.cardAging);
    $('.js-field-has-cardaging').toggleClass(CKCLS, tpl.currentBoard.cardAging);
  },
  'change .js-card-aging-days'(evt: JQuery.TriggeredEvent, tpl: CurrentBoardPopupInstance) {
    // #3984: save the three board-configurable card-aging day thresholds.
    const vals = $('.js-card-aging-days')
      .map((i: number, el: any) => parseInt(el.value, 10) || 0)
      .get();
    tpl.currentBoard.setCardAgingDays(vals[0], vals[1], vals[2]);
  },
  'click .js-field-has-boardmemberlist'(evt: JQuery.TriggeredEvent, tpl: CurrentBoardPopupInstance) {
    evt.preventDefault();
    tpl.currentBoard.allowsBoardMemberList = !tpl.currentBoard
      .allowsBoardMemberList;
      tpl.currentBoard.setAllowsBoardMemberList(
        tpl.currentBoard.allowsBoardMemberList,
    );
    $(`.js-field-has-boardmemberlist ${MCB}`).toggleClass(
      CKCLS,
      tpl.currentBoard.allowsBoardMemberList,
    );
    $('.js-field-has-boardmemberlist').toggleClass(
      CKCLS,
      tpl.currentBoard.allowsBoardMemberList,
    );
  },
});

Template.boardSubtaskSettingsPopup.onCreated(function(this: CurrentBoardPopupInstance) {
  // Same reactive-snapshot fix as boardCardSettingsPopup (#6385): the
  // allowsSubtasks toggle reads tpl.currentBoard, so keep it current in an
  // autorun so the setting can be reversed without a page refresh.
  this.autorun(() => {
    this.currentBoard = Utils.getCurrentBoard();
  });
});

Template.boardSubtaskSettingsPopup.helpers({
  allowsSubtasks() {
    // Get the current board reactively using board ID from Session
    const boardId = Session.get('currentBoard');
    const currentBoard = ReactiveCache.getBoard(boardId);
    const result = currentBoard ? currentBoard.allowsSubtasks : false;
    return result;
  },
  allowsReceivedDate() {
    const tpl = Template.instance() as CurrentBoardPopupInstance;
    return tpl.currentBoard.allowsReceivedDate;
  },
  isBoardSelected() {
    const tpl = Template.instance() as CurrentBoardPopupInstance;
    return tpl.currentBoard.subtasksDefaultBoardId === Template.currentData()._id;
  },
  isNullBoardSelected() {
    const tpl = Template.instance() as CurrentBoardPopupInstance;
    return (
      tpl.currentBoard.subtasksDefaultBoardId === null ||
      tpl.currentBoard.subtasksDefaultBoardId === undefined
    );
  },
  boards() {
    const ret = ReactiveCache.getBoards(
      {
        archived: false,
        'members.userId': Meteor.userId(),
      },
      {
        sort: { sort: 1 /* boards default sorting */ },
      },
    );
    return ret;
  },
  lists() {
    const tpl = Template.instance() as CurrentBoardPopupInstance;
    // The landing list belongs to the configured deposit board
    // (subtasksDefaultBoardId), which may differ from the current board
    // (#3414): when a different deposit board is chosen, show its lists.
    const depositBoardId =
      tpl.currentBoard.subtasksDefaultBoardId || tpl.currentBoard._id;
    return ReactiveCache.getLists(
      {
        boardId: depositBoardId,
        archived: false,
      },
      {
        sort: ['title'],
      },
    );
  },
  hasLists() {
    const tpl = Template.instance() as CurrentBoardPopupInstance;
    const depositBoardId =
      tpl.currentBoard.subtasksDefaultBoardId || tpl.currentBoard._id;
    const lists = ReactiveCache.getLists(
      {
        boardId: depositBoardId,
        archived: false,
      },
      {
        sort: ['title'],
      },
    );
    return lists.length > 0;
  },
  isListSelected() {
    // #3876 / #4947: the selected landing list must be compared against
    // subtasksDefaultListId (the stored list id), NOT subtasksDefaultBoardId.
    const tpl = Template.instance() as CurrentBoardPopupInstance;
    return tpl.currentBoard.subtasksDefaultListId === Template.currentData()._id;
  },
  presentParentTask() {
    // Get the current board reactively using board ID from Session
    const boardId = Session.get('currentBoard');
    const currentBoard = ReactiveCache.getBoard(boardId);

    let result = currentBoard ? currentBoard.presentParentTask : null;
    if (result === null || result === undefined) {
      result = 'no-parent';
    }
    return result;
  },
});

Template.boardSubtaskSettingsPopup.events({
  'click .js-field-has-subtasks'(evt: JQuery.TriggeredEvent, tpl: CurrentBoardPopupInstance) {
    evt.preventDefault();
    const newValue = !tpl.currentBoard.allowsSubtasks;
    Boards.update(tpl.currentBoard._id, { $set: { allowsSubtasks: newValue } });
    $('.js-field-deposit-board').prop(
      'disabled',
      !newValue,
    );
  },
  'change .js-field-deposit-board'(evt: JQuery.TriggeredEvent, tpl: CurrentBoardPopupInstance) {
    let value = (evt.target as HTMLSelectElement).value as any;
    if (value === 'null') {
      value = null;
    }
    // #4849: changing the deposit board makes any previously-stored landing
    // list (which belongs to the old board) stale and would otherwise
    // override the new board's setting. Reset it so the list dropdown for the
    // newly-selected board starts fresh.
    if (value !== tpl.currentBoard.subtasksDefaultBoardId) {
      tpl.currentBoard.setSubtasksDefaultListId(null);
    }
    tpl.currentBoard.setSubtasksDefaultBoardId(value);
    evt.preventDefault();
  },
  'change .js-field-deposit-list'(evt: JQuery.TriggeredEvent, tpl: CurrentBoardPopupInstance) {
    let value = (evt.target as HTMLSelectElement).value as any;
    if (value === 'null' || value === '') {
      value = null;
    }
    tpl.currentBoard.setSubtasksDefaultListId(value);
    evt.preventDefault();
  },
  'click .js-field-show-parent-in-minicard'(evt: JQuery.TriggeredEvent, tpl: CurrentBoardPopupInstance) {
    // Get the ID from the anchor element, not the span
    const anchorElement = $(evt.target).closest('.js-field-show-parent-in-minicard')[0];
    const value = anchorElement ? anchorElement.id : null;
    // value is the anchor element id used as the presentParentTask setting.

    if (value) {
      Boards.update(tpl.currentBoard._id, { $set: { presentParentTask: value } });
    }
    evt.preventDefault();
  },
});

Template.boardCardSettingsPopup.onCreated(function(this: CurrentBoardPopupInstance) {
  // Keep currentBoard reactive. The toggle handlers compute the new value from
  // tpl.currentBoard.allowsX, so a one-time snapshot went stale after the first
  // toggle: reversing a setting (e.g. "Mark as complete") recomputed !oldValue
  // and never switched back until the page was refreshed (#6385). Re-reading the
  // board in an autorun keeps it current, so every Card Settings toggle works
  // both ways without a refresh.
  this.autorun(() => {
    this.currentBoard = Utils.getCurrentBoard();
  });
});

Template.boardCardSettingsPopup.helpers({
  allowsReceivedDate() {
    const boardId = Session.get('currentBoard');
    const currentBoard = ReactiveCache.getBoard(boardId);
    return currentBoard ? currentBoard.allowsReceivedDate : false;
  },
  allowsDueComplete() {
    const boardId = Session.get('currentBoard');
    const currentBoard = ReactiveCache.getBoard(boardId);
    return currentBoard ? currentBoard.allowsDueComplete : false;
  },
  allowsDueCompleteOnMinicard() {
    const boardId = Session.get('currentBoard');
    const currentBoard = ReactiveCache.getBoard(boardId);
    return currentBoard ? currentBoard.allowsDueCompleteOnMinicard : false;
  },
  allowsReceivedDateOnMinicard() {
    const boardId = Session.get('currentBoard');
    const currentBoard = ReactiveCache.getBoard(boardId);
    return getMinicardSetting(currentBoard, 'allowsReceivedDateOnMinicard', 'allowsReceivedDate', true);
  },
  allowsStartDate() {
    const boardId = Session.get('currentBoard');
    const currentBoard = ReactiveCache.getBoard(boardId);
    return currentBoard ? currentBoard.allowsStartDate : false;
  },
  allowsStartDateOnMinicard() {
    const boardId = Session.get('currentBoard');
    const currentBoard = ReactiveCache.getBoard(boardId);
    return getMinicardSetting(currentBoard, 'allowsStartDateOnMinicard', 'allowsStartDate', true);
  },
  allowsDueDate() {
    const boardId = Session.get('currentBoard');
    const currentBoard = ReactiveCache.getBoard(boardId);
    return currentBoard ? currentBoard.allowsDueDate : false;
  },
  allowsDueDateOnMinicard() {
    const boardId = Session.get('currentBoard');
    const currentBoard = ReactiveCache.getBoard(boardId);
    return getMinicardSetting(currentBoard, 'allowsDueDateOnMinicard', 'allowsDueDate', true);
  },
  allowsEndDate() {
    const boardId = Session.get('currentBoard');
    const currentBoard = ReactiveCache.getBoard(boardId);
    return currentBoard ? currentBoard.allowsEndDate : false;
  },
  allowsEndDateOnMinicard() {
    const boardId = Session.get('currentBoard');
    const currentBoard = ReactiveCache.getBoard(boardId);
    return getMinicardSetting(currentBoard, 'allowsEndDateOnMinicard', 'allowsEndDate', true);
  },
  allowsSubtasks() {
    const boardId = Session.get('currentBoard');
    const currentBoard = ReactiveCache.getBoard(boardId);
    return currentBoard ? currentBoard.allowsSubtasks : false;
  },
  allowsSubtasksOnMinicard() {
    const boardId = Session.get('currentBoard');
    const currentBoard = ReactiveCache.getBoard(boardId);
    return getMinicardSetting(currentBoard, 'allowsSubtasksOnMinicard', 'allowsSubtasks', true);
  },
  allowsCreator() {
    const boardId = Session.get('currentBoard');
    const currentBoard = ReactiveCache.getBoard(boardId);
    return currentBoard ? (currentBoard.allowsCreator ?? false) : false;
  },
  allowsCreatorOnMinicard() {
    const boardId = Session.get('currentBoard');
    const currentBoard = ReactiveCache.getBoard(boardId);
    return getMinicardSetting(currentBoard, 'allowsCreatorOnMinicard', 'allowsCreator', false);
  },
  allowsMembers() {
    const boardId = Session.get('currentBoard');
    const currentBoard = ReactiveCache.getBoard(boardId);
    return currentBoard ? currentBoard.allowsMembers : false;
  },
  allowsMembersOnMinicard() {
    const boardId = Session.get('currentBoard');
    const currentBoard = ReactiveCache.getBoard(boardId);
    return getMinicardSetting(currentBoard, 'allowsMembersOnMinicard', 'allowsMembers', true);
  },
  allowsAssignee() {
    const boardId = Session.get('currentBoard');
    const currentBoard = ReactiveCache.getBoard(boardId);
    return currentBoard ? currentBoard.allowsAssignee : false;
  },
  allowsAssigneeOnMinicard() {
    const boardId = Session.get('currentBoard');
    const currentBoard = ReactiveCache.getBoard(boardId);
    return getMinicardSetting(currentBoard, 'allowsAssigneeOnMinicard', 'allowsAssignee', true);
  },
  allowsAssignedBy() {
    const boardId = Session.get('currentBoard');
    const currentBoard = ReactiveCache.getBoard(boardId);
    return currentBoard ? currentBoard.allowsAssignedBy : false;
  },
  allowsAssignedByOnMinicard() {
    const boardId = Session.get('currentBoard');
    const currentBoard = ReactiveCache.getBoard(boardId);
    return getMinicardSetting(currentBoard, 'allowsAssignedByOnMinicard', 'allowsAssignedBy', true);
  },
  allowsRequestedBy() {
    const boardId = Session.get('currentBoard');
    const currentBoard = ReactiveCache.getBoard(boardId);
    return currentBoard ? currentBoard.allowsRequestedBy : false;
  },
  allowsRequestedByOnMinicard() {
    const boardId = Session.get('currentBoard');
    const currentBoard = ReactiveCache.getBoard(boardId);
    return getMinicardSetting(currentBoard, 'allowsRequestedByOnMinicard', 'allowsRequestedBy', true);
  },
  allowsCardSortingByNumber() {
    const boardId = Session.get('currentBoard');
    const currentBoard = ReactiveCache.getBoard(boardId);
    return currentBoard ? currentBoard.allowsCardSortingByNumber : false;
  },
  allowsShowLists() {
    const boardId = Session.get('currentBoard');
    const currentBoard = ReactiveCache.getBoard(boardId);
    return currentBoard ? currentBoard.allowsShowLists : false;
  },
  allowsLabels() {
    const boardId = Session.get('currentBoard');
    const currentBoard = ReactiveCache.getBoard(boardId);
    return currentBoard ? currentBoard.allowsLabels : false;
  },
  allowsLabelsOnMinicard() {
    const boardId = Session.get('currentBoard');
    const currentBoard = ReactiveCache.getBoard(boardId);
    return getMinicardSetting(currentBoard, 'allowsLabelsOnMinicard', 'allowsLabels', true);
  },
  allowsShowListsOnMinicard() {
    const boardId = Session.get('currentBoard');
    const currentBoard = ReactiveCache.getBoard(boardId);
    return getMinicardSetting(currentBoard, 'allowsShowListsOnMinicard', 'allowsShowLists', false);
  },
  allowsChecklists() {
    const boardId = Session.get('currentBoard');
    const currentBoard = ReactiveCache.getBoard(boardId);
    return currentBoard ? currentBoard.allowsChecklists : false;
  },
  allowsChecklistsOnMinicard() {
    const boardId = Session.get('currentBoard');
    const currentBoard = ReactiveCache.getBoard(boardId);
    return getMinicardSetting(currentBoard, 'allowsChecklistsOnMinicard', 'allowsChecklists', true);
  },
  allowsAttachments() {
    const boardId = Session.get('currentBoard');
    const currentBoard = ReactiveCache.getBoard(boardId);
    return currentBoard ? currentBoard.allowsAttachments : false;
  },
  allowsAttachmentsOnMinicard() {
    const boardId = Session.get('currentBoard');
    const currentBoard = ReactiveCache.getBoard(boardId);
    return getMinicardSetting(currentBoard, 'allowsAttachmentsOnMinicard', 'allowsAttachments', true);
  },
  allowsComments() {
    const boardId = Session.get('currentBoard');
    const currentBoard = ReactiveCache.getBoard(boardId);
    return currentBoard ? currentBoard.allowsComments : false;
  },
  allowsCardNumber() {
    const boardId = Session.get('currentBoard');
    const currentBoard = ReactiveCache.getBoard(boardId);
    return currentBoard ? currentBoard.allowsCardNumber : false;
  },
  allowsCardNumberOnMinicard() {
    const boardId = Session.get('currentBoard');
    const currentBoard = ReactiveCache.getBoard(boardId);
    return getMinicardSetting(currentBoard, 'allowsCardNumberOnMinicard', 'allowsCardNumber', false);
  },
  allowsDescriptionTitle() {
    const boardId = Session.get('currentBoard');
    const currentBoard = ReactiveCache.getBoard(boardId);
    return currentBoard ? currentBoard.allowsDescriptionTitle : false;
  },
  allowsDescriptionTitleOnMinicard() {
    const boardId = Session.get('currentBoard');
    const currentBoard = ReactiveCache.getBoard(boardId);
    return getMinicardSetting(currentBoard, 'allowsDescriptionTitleOnMinicard', 'allowsDescriptionTitle', true);
  },
  allowsDescriptionText() {
    const boardId = Session.get('currentBoard');
    const currentBoard = ReactiveCache.getBoard(boardId);
    return currentBoard ? currentBoard.allowsDescriptionText : false;
  },
  isBoardSelected() {
    const boardId = Session.get('currentBoard');
    const currentBoard = ReactiveCache.getBoard(boardId);
    return currentBoard ? currentBoard.dateSettingsDefaultBoardId : false;
  },
  isNullBoardSelected() {
    const boardId = Session.get('currentBoard');
    const currentBoard = ReactiveCache.getBoard(boardId);
    return currentBoard ? (
      currentBoard.dateSettingsDefaultBoardId === null ||
      currentBoard.dateSettingsDefaultBoardId === undefined
    ) : true;
  },
  allowsDescriptionTextOnMinicard() {
    const boardId = Session.get('currentBoard');
    const currentBoard = ReactiveCache.getBoard(boardId);
    return getMinicardSetting(currentBoard, 'allowsDescriptionTextOnMinicard', 'allowsDescriptionText', false);
  },
  allowsCoverAttachmentOnMinicard() {
    const boardId = Session.get('currentBoard');
    const currentBoard = ReactiveCache.getBoard(boardId);
    return currentBoard ? currentBoard.allowsCoverAttachmentOnMinicard : false;
  },
  allowsBadgeAttachmentOnMinicard() {
    const boardId = Session.get('currentBoard');
    const currentBoard = ReactiveCache.getBoard(boardId);
    return currentBoard ? currentBoard.allowsBadgeAttachmentOnMinicard : false;
  },
  allowsCardSortingByNumberOnMinicard() {
    const boardId = Session.get('currentBoard');
    const currentBoard = ReactiveCache.getBoard(boardId);
    return getMinicardSetting(currentBoard, 'allowsCardSortingByNumberOnMinicard', 'allowsCardSortingByNumber', false);
  },
  boards() {
    const ret = ReactiveCache.getBoards(
      {
        archived: false,
        'members.userId': Meteor.userId(),
      },
      {
        sort: { sort: 1 /* boards default sorting */ },
      },
    );
    return ret;
  },
  lists() {
    const tpl = Template.instance() as CurrentBoardPopupInstance;
    return ReactiveCache.getLists(
      {
        boardId: tpl.currentBoard._id,
        archived: false,
      },
      {
        sort: ['title'],
      },
    );
  },
  hasLists() {
    const tpl = Template.instance() as CurrentBoardPopupInstance;
    const lists = ReactiveCache.getLists(
      {
        boardId: tpl.currentBoard._id,
        archived: false,
      },
      {
        sort: ['title'],
      },
    );
    return lists.length > 0;
  },
  isListSelected() {
    const tpl = Template.instance() as CurrentBoardPopupInstance;
    return (
      tpl.currentBoard.dateSettingsDefaultBoardId === Template.currentData()._id
    );
  },
});

Template.boardCardSettingsPopup.events({
  'click .js-field-has-receiveddate'(evt: JQuery.TriggeredEvent, tpl: CurrentBoardPopupInstance) {
    evt.preventDefault();
    const newValue = !tpl.currentBoard.allowsReceivedDate;
    Boards.update(tpl.currentBoard._id, { $set: { allowsReceivedDate: newValue } });
  },
  'click .js-field-has-duecomplete'(evt: JQuery.TriggeredEvent, tpl: CurrentBoardPopupInstance) {
    evt.preventDefault();
    const newValue = !tpl.currentBoard.allowsDueComplete;
    Boards.update(tpl.currentBoard._id, { $set: { allowsDueComplete: newValue } });
  },
  'click .js-field-has-duecomplete-on-minicard'(evt: JQuery.TriggeredEvent, tpl: CurrentBoardPopupInstance) {
    evt.preventDefault();
    const newValue = !tpl.currentBoard.allowsDueCompleteOnMinicard;
    Boards.update(tpl.currentBoard._id, { $set: { allowsDueCompleteOnMinicard: newValue } });
  },
  'click .js-field-has-receiveddate-on-minicard'(evt: JQuery.TriggeredEvent, tpl: CurrentBoardPopupInstance) {
    evt.preventDefault();
    const newValue = !tpl.currentBoard.allowsReceivedDateOnMinicard;
    Boards.update(tpl.currentBoard._id, { $set: { allowsReceivedDateOnMinicard: newValue } });
  },
  'click .js-field-has-startdate'(evt: JQuery.TriggeredEvent, tpl: CurrentBoardPopupInstance) {
    evt.preventDefault();
    const newValue = !tpl.currentBoard.allowsStartDate;
    Boards.update(tpl.currentBoard._id, { $set: { allowsStartDate: newValue } });
  },
  'click .js-field-has-startdate-on-minicard'(evt: JQuery.TriggeredEvent, tpl: CurrentBoardPopupInstance) {
    evt.preventDefault();
    const newValue = !tpl.currentBoard.allowsStartDateOnMinicard;
    Boards.update(tpl.currentBoard._id, { $set: { allowsStartDateOnMinicard: newValue } });
  },
  'click .js-field-has-enddate'(evt: JQuery.TriggeredEvent, tpl: CurrentBoardPopupInstance) {
    evt.preventDefault();
    const newValue = !tpl.currentBoard.allowsEndDate;
    Boards.update(tpl.currentBoard._id, { $set: { allowsEndDate: newValue } });
  },
  'click .js-field-has-enddate-on-minicard'(evt: JQuery.TriggeredEvent, tpl: CurrentBoardPopupInstance) {
    evt.preventDefault();
    const newValue = !tpl.currentBoard.allowsEndDateOnMinicard;
    Boards.update(tpl.currentBoard._id, { $set: { allowsEndDateOnMinicard: newValue } });
  },
  'click .js-field-has-duedate'(evt: JQuery.TriggeredEvent, tpl: CurrentBoardPopupInstance) {
    evt.preventDefault();
    const newValue = !tpl.currentBoard.allowsDueDate;
    Boards.update(tpl.currentBoard._id, { $set: { allowsDueDate: newValue } });
  },
  'click .js-field-has-duedate-on-minicard'(evt: JQuery.TriggeredEvent, tpl: CurrentBoardPopupInstance) {
    evt.preventDefault();
    const newValue = !tpl.currentBoard.allowsDueDateOnMinicard;
    Boards.update(tpl.currentBoard._id, { $set: { allowsDueDateOnMinicard: newValue } });
  },
  'click .js-field-has-subtasks'(evt: JQuery.TriggeredEvent, tpl: CurrentBoardPopupInstance) {
    evt.preventDefault();
    const newValue = !tpl.currentBoard.allowsSubtasks;
    Boards.update(tpl.currentBoard._id, { $set: { allowsSubtasks: newValue } });
  },
  'click .js-field-has-subtasks-on-minicard'(evt: JQuery.TriggeredEvent, tpl: CurrentBoardPopupInstance) {
    evt.preventDefault();
    const newValue = !tpl.currentBoard.allowsSubtasksOnMinicard;
    Boards.update(tpl.currentBoard._id, { $set: { allowsSubtasksOnMinicard: newValue } });
  },
  'click .js-field-has-creator'(evt: JQuery.TriggeredEvent, tpl: CurrentBoardPopupInstance) {
    evt.preventDefault();
    const newValue = !tpl.currentBoard.allowsCreator;
    Boards.update(tpl.currentBoard._id, { $set: { allowsCreator: newValue } });
  },
  'click .js-field-has-creator-on-minicard'(evt: JQuery.TriggeredEvent, tpl: CurrentBoardPopupInstance) {
    evt.preventDefault();
    const newValue = !tpl.currentBoard.allowsCreatorOnMinicard;
    Boards.update(tpl.currentBoard._id, { $set: { allowsCreatorOnMinicard: newValue } });
  },
  'click .js-field-has-members'(evt: JQuery.TriggeredEvent, tpl: CurrentBoardPopupInstance) {
    evt.preventDefault();
    const newValue = !tpl.currentBoard.allowsMembers;
    Boards.update(tpl.currentBoard._id, { $set: { allowsMembers: newValue } });
  },
  'click .js-field-has-members-on-minicard'(evt: JQuery.TriggeredEvent, tpl: CurrentBoardPopupInstance) {
    evt.preventDefault();
    const newValue = !tpl.currentBoard.allowsMembersOnMinicard;
    Boards.update(tpl.currentBoard._id, { $set: { allowsMembersOnMinicard: newValue } });
  },
  'click .js-field-has-assignee'(evt: JQuery.TriggeredEvent, tpl: CurrentBoardPopupInstance) {
    evt.preventDefault();
    const newValue = !tpl.currentBoard.allowsAssignee;
    Boards.update(tpl.currentBoard._id, { $set: { allowsAssignee: newValue } });
  },
  'click .js-field-has-assignee-on-minicard'(evt: JQuery.TriggeredEvent, tpl: CurrentBoardPopupInstance) {
    evt.preventDefault();
    const newValue = !tpl.currentBoard.allowsAssigneeOnMinicard;
    Boards.update(tpl.currentBoard._id, { $set: { allowsAssigneeOnMinicard: newValue } });
  },
  'click .js-field-has-assigned-by'(evt: JQuery.TriggeredEvent, tpl: CurrentBoardPopupInstance) {
    evt.preventDefault();
    const newValue = !tpl.currentBoard.allowsAssignedBy;
    Boards.update(tpl.currentBoard._id, { $set: { allowsAssignedBy: newValue } });
  },
  'click .js-field-has-assigned-by-on-minicard'(evt: JQuery.TriggeredEvent, tpl: CurrentBoardPopupInstance) {
    evt.preventDefault();
    const newValue = !tpl.currentBoard.allowsAssignedByOnMinicard;
    Boards.update(tpl.currentBoard._id, { $set: { allowsAssignedByOnMinicard: newValue } });
  },
  'click .js-field-has-requested-by'(evt: JQuery.TriggeredEvent, tpl: CurrentBoardPopupInstance) {
    evt.preventDefault();
    const newValue = !tpl.currentBoard.allowsRequestedBy;
    Boards.update(tpl.currentBoard._id, { $set: { allowsRequestedBy: newValue } });
  },
  'click .js-field-has-requested-by-on-minicard'(evt: JQuery.TriggeredEvent, tpl: CurrentBoardPopupInstance) {
    evt.preventDefault();
    const newValue = !tpl.currentBoard.allowsRequestedByOnMinicard;
    Boards.update(tpl.currentBoard._id, { $set: { allowsRequestedByOnMinicard: newValue } });
  },
  'click .js-field-has-card-sorting-by-number'(evt: JQuery.TriggeredEvent, tpl: CurrentBoardPopupInstance) {
    evt.preventDefault();
    const newValue = !tpl.currentBoard.allowsCardSortingByNumber;
    Boards.update(tpl.currentBoard._id, { $set: { allowsCardSortingByNumber: newValue } });
  },
  'click .js-field-has-card-show-lists'(evt: JQuery.TriggeredEvent, tpl: CurrentBoardPopupInstance) {
    evt.preventDefault();
    const newValue = !tpl.currentBoard.allowsShowLists;
    Boards.update(tpl.currentBoard._id, { $set: { allowsShowLists: newValue } });
  },
  'click .js-field-has-labels'(evt: JQuery.TriggeredEvent, tpl: CurrentBoardPopupInstance) {
    evt.preventDefault();
    const newValue = !tpl.currentBoard.allowsLabels;
    Boards.update(tpl.currentBoard._id, { $set: { allowsLabels: newValue } });
  },
  'click .js-field-has-labels-on-minicard'(evt: JQuery.TriggeredEvent, tpl: CurrentBoardPopupInstance) {
    evt.preventDefault();
    const newValue = !tpl.currentBoard.allowsLabelsOnMinicard;
    Boards.update(tpl.currentBoard._id, { $set: { allowsLabelsOnMinicard: newValue } });
  },
  'click .js-field-has-card-show-lists-on-minicard'(evt: JQuery.TriggeredEvent, tpl: CurrentBoardPopupInstance) {
    evt.preventDefault();
    const newValue = !tpl.currentBoard.allowsShowListsOnMinicard;
    Boards.update(tpl.currentBoard._id, { $set: { allowsShowListsOnMinicard: newValue } });
  },
  'click .js-field-has-description-title'(evt: JQuery.TriggeredEvent, tpl: CurrentBoardPopupInstance) {
    evt.preventDefault();
    const newValue = !tpl.currentBoard.allowsDescriptionTitle;
    Boards.update(tpl.currentBoard._id, { $set: { allowsDescriptionTitle: newValue } });
  },
  'click .js-field-has-description-title-on-minicard'(evt: JQuery.TriggeredEvent, tpl: CurrentBoardPopupInstance) {
    evt.preventDefault();
    const newValue = !tpl.currentBoard.allowsDescriptionTitleOnMinicard;
    Boards.update(tpl.currentBoard._id, { $set: { allowsDescriptionTitleOnMinicard: newValue } });
  },
  'click .js-field-has-card-number'(evt: JQuery.TriggeredEvent, tpl: CurrentBoardPopupInstance) {
    evt.preventDefault();
    const newValue = !tpl.currentBoard.allowsCardNumber;
    Boards.update(tpl.currentBoard._id, { $set: { allowsCardNumber: newValue } });
  },
  'click .js-field-has-card-number-on-minicard'(evt: JQuery.TriggeredEvent, tpl: CurrentBoardPopupInstance) {
    evt.preventDefault();
    const newValue = !tpl.currentBoard.allowsCardNumberOnMinicard;
    Boards.update(tpl.currentBoard._id, { $set: { allowsCardNumberOnMinicard: newValue } });
  },
  'click .js-field-has-description-text-on-minicard'(evt: JQuery.TriggeredEvent, tpl: CurrentBoardPopupInstance) {
    evt.preventDefault();
    const newValue = !tpl.currentBoard.allowsDescriptionTextOnMinicard;
    Boards.update(tpl.currentBoard._id, { $set: { allowsDescriptionTextOnMinicard: newValue } });
  },
  'click .js-field-has-description-text'(evt: JQuery.TriggeredEvent, tpl: CurrentBoardPopupInstance) {
    evt.preventDefault();
    const newValue = !tpl.currentBoard.allowsDescriptionText;
    Boards.update(tpl.currentBoard._id, { $set: { allowsDescriptionText: newValue } });
  },
  'click .js-field-has-checklists'(evt: JQuery.TriggeredEvent, tpl: CurrentBoardPopupInstance) {
    evt.preventDefault();
    const newValue = !tpl.currentBoard.allowsChecklists;
    Boards.update(tpl.currentBoard._id, { $set: { allowsChecklists: newValue } });
  },
  'click .js-field-has-checklists-on-minicard'(evt: JQuery.TriggeredEvent, tpl: CurrentBoardPopupInstance) {
    evt.preventDefault();
    const newValue = !tpl.currentBoard.allowsChecklistsOnMinicard;
    Boards.update(tpl.currentBoard._id, { $set: { allowsChecklistsOnMinicard: newValue } });
  },
  'click .js-field-has-attachments'(evt: JQuery.TriggeredEvent, tpl: CurrentBoardPopupInstance) {
    evt.preventDefault();
    const newValue = !tpl.currentBoard.allowsAttachments;
    Boards.update(tpl.currentBoard._id, { $set: { allowsAttachments: newValue } });
  },
  'click .js-field-has-attachments-on-minicard'(evt: JQuery.TriggeredEvent, tpl: CurrentBoardPopupInstance) {
    evt.preventDefault();
    const newValue = !tpl.currentBoard.allowsAttachmentsOnMinicard;
    Boards.update(tpl.currentBoard._id, { $set: { allowsAttachmentsOnMinicard: newValue } });
  },
  'click .js-field-has-comments'(evt: JQuery.TriggeredEvent, tpl: CurrentBoardPopupInstance) {
    evt.preventDefault();
    const newValue = !tpl.currentBoard.allowsComments;
    Boards.update(tpl.currentBoard._id, { $set: { allowsComments: newValue } });
  },
  'click .js-field-has-activities'(evt: JQuery.TriggeredEvent, tpl: CurrentBoardPopupInstance) {
    evt.preventDefault();
    const newValue = !tpl.currentBoard.allowsActivities;
    Boards.update(tpl.currentBoard._id, { $set: { allowsActivities: newValue } });
  },
  'click .js-field-has-cover-attachment-on-minicard'(evt: JQuery.TriggeredEvent, tpl: CurrentBoardPopupInstance) {
    evt.preventDefault();
    const newValue = !tpl.currentBoard.allowsCoverAttachmentOnMinicard;
    Boards.update(tpl.currentBoard._id, { $set: { allowsCoverAttachmentOnMinicard: newValue } });
  },
  'click .js-field-has-badge-attachment-on-minicard'(evt: JQuery.TriggeredEvent, tpl: CurrentBoardPopupInstance) {
    evt.preventDefault();
    const newValue = !tpl.currentBoard.allowsBadgeAttachmentOnMinicard;
    Boards.update(tpl.currentBoard._id, { $set: { allowsBadgeAttachmentOnMinicard: newValue } });
  },
  'click .js-field-has-card-sorting-by-number-on-minicard'(evt: JQuery.TriggeredEvent, tpl: CurrentBoardPopupInstance) {
    evt.preventDefault();
    const newValue = !tpl.currentBoard.allowsCardSortingByNumberOnMinicard;
    Boards.update(tpl.currentBoard._id, { $set: { allowsCardSortingByNumberOnMinicard: newValue } });
  },
});

// Use Session variables instead of global ReactiveVars
Session.setDefault('addMemberPopup.searchResults', []);
Session.setDefault('addMemberPopup.searching', false);
Session.setDefault('addMemberPopup.noResults', false);
Session.setDefault('addMemberPopup.loading', false);
Session.setDefault('addMemberPopup.error', '');


Template.addMemberPopup.onCreated(function(this: AddMemberPopupInstance) {
  // Use Session variables
  this.searchTimeout = null;
  Session.set('addMemberPopup.searchResults', []);
  Session.set('addMemberPopup.searching', false);
  Session.set('addMemberPopup.noResults', false);
  Session.set('addMemberPopup.loading', false);
  Session.set('addMemberPopup.error', '');

  this.setError = function(error: any) {
    Session.set('addMemberPopup.error', error);
  };

  this.setLoading = function(w: any) {
    Session.set('addMemberPopup.loading', w);
  };

  this.isLoading = function() {
    return Session.get('addMemberPopup.loading');
  };

  this.isValidEmail = function(email: any) {
    return /^[a-zA-Z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/.test(email);
  };

  this.performSearch = function(query: any) {
    if (!query || query.length < 2) {
      Session.set('addMemberPopup.searchResults', []);
      Session.set('addMemberPopup.noResults', false);
      return;
    }

    Session.set('addMemberPopup.searching', true);
    Session.set('addMemberPopup.noResults', false);

    const boardId = Session.get('currentBoard');
    // error/results: any — untyped Meteor method callback.
    Meteor.call('searchUsers', query, boardId, (error: any, results: any) => {
      Session.set('addMemberPopup.searching', false);
      if (error) {
        console.error('Search error:', error);
        Session.set('addMemberPopup.searchResults', []);
        Session.set('addMemberPopup.noResults', true);
      } else {
        Session.set('addMemberPopup.searchResults', results);
        if (results.length === 0) {
          Session.set('addMemberPopup.noResults', true);
        }
      }
    });
  };

  this.inviteUser = function(this: AddMemberPopupInstance, idNameEmail: any) {
    const boardId = Session.get('currentBoard');
    this.setLoading(true);
    const self = this;
    // err/ret: any — untyped Meteor method callback.
    Meteor.call('inviteUserToBoard', idNameEmail, boardId, (err: any, ret: any) => {
      self.setLoading(false);
      if (err) {
        self.setError(err.error);
      } else {
        Popup.back();
      }
    });
  };
});

Template.addMemberPopup.onDestroyed(function(this: AddMemberPopupInstance) {
  if (this.searchTimeout) {
    clearTimeout(this.searchTimeout);
  }
  Session.set('addMemberPopup.searching', false);
  Session.set('addMemberPopup.loading', false);
});

Template.addMemberPopup.onRendered(function(this: AddMemberPopupInstance) {
  (this.find('.js-search-member-input') as HTMLInputElement).focus();
  this.setLoading(false);
});

Template.addMemberPopup.events({
  'keyup .js-search-member-input'(event: JQuery.TriggeredEvent, tpl: AddMemberPopupInstance) {
    Session.set('addMemberPopup.error', '');
    const query = (event.target as HTMLInputElement).value.trim();

    // Clear previous timeout
    if (tpl.searchTimeout) {
      clearTimeout(tpl.searchTimeout);
    }

    // Debounce search
    tpl.searchTimeout = setTimeout(() => {
      tpl.performSearch(query);
    }, 300);
  },
  // this: any — the search-result data context exposes `_id`.
  'click .js-select-member'(this: any, event: JQuery.TriggeredEvent, tpl: AddMemberPopupInstance) {
    const userId = this._id;
    tpl.inviteUser(userId);
  },
  'click .js-email-invite'(event: JQuery.TriggeredEvent, tpl: AddMemberPopupInstance) {
    // idNameEmail: any — the raw input value from the search box.
    const idNameEmail: any = $('.js-search-member-input').val();
    if (idNameEmail.indexOf('@') < 0 || tpl.isValidEmail(idNameEmail)) {
      tpl.inviteUser(idNameEmail);
    } else Session.set('addMemberPopup.error', 'email-invalid');
  },
});

Template.addMemberPopup.helpers({
  searchResults() {
    const results = Session.get('addMemberPopup.searchResults');
    return results;
  },
  searching() {
    return Session.get('addMemberPopup.searching');
  },
  noResults() {
    return Session.get('addMemberPopup.noResults');
  },
  loading() {
    return { get() { return Session.get('addMemberPopup.loading'); } };
  },
  error() {
    return { get() { return Session.get('addMemberPopup.error'); } };
  },
  isBoardMember() {
    const userId = this._id;
    const boardId = Session.get('currentBoard');
    const board = ReactiveCache.getBoard(boardId);
    return board && board.hasMember(userId);
  }
})

Template.addMemberPopupTest.helpers({
  searchResults() {
    return Session.get('addMemberPopup.searchResults') || [];
  }
})

Template.addBoardOrgPopup.onCreated(function(this: OrgTeamPopupInstance) {
  this.error = new ReactiveVar('');
  this.loading = new ReactiveVar(false);
  this.findOrgsOptions = new ReactiveVar({});

  this.page = new ReactiveVar(1);
  this.autorun(() => {
    const limitOrgs = this.page.get() * Number.MAX_SAFE_INTEGER;
    this.subscribe('org', this.findOrgsOptions.get(), limitOrgs, () => {});
  });

  this.setError = function(this: OrgTeamPopupInstance, error: any) {
    this.error.set(error);
  };

  this.setLoading = function(this: OrgTeamPopupInstance, w: any) {
    this.loading.set(w);
  };

  this.isLoading = function(this: OrgTeamPopupInstance) {
    return this.loading.get();
  };
});

Template.addBoardOrgPopup.onRendered(function(this: OrgTeamPopupInstance) {
  this.setLoading(false);
});

Template.addBoardOrgPopup.helpers({
  orgsDatas() {
    let ret = ReactiveCache.getOrgs({}, {sort: { orgDisplayName: 1 }});
    return ret;
  },
});

Template.addBoardOrgPopup.events({
  'keyup input'(event: JQuery.TriggeredEvent, tpl: OrgTeamPopupInstance) {
    tpl.setError('');
  },
  'change #jsBoardOrgs'() {
    let currentBoard = Utils.getCurrentBoard();
    let selectElt = document.getElementById("jsBoardOrgs") as HTMLSelectElement;
    let selectedOrgId = selectElt.options[selectElt.selectedIndex].value;
    let selectedOrgDisplayName = selectElt.options[selectElt.selectedIndex].text;
    // boardOrganizations: any[] — the board's org membership records.
    let boardOrganizations: any[] = [];
    if(currentBoard.orgs !== undefined){
      for(let i = 0; i < currentBoard.orgs.length; i++){
        boardOrganizations.push(currentBoard.orgs[i]);
      }
    }

    if(!boardOrganizations.some((org: any) => org.orgDisplayName == selectedOrgDisplayName)){
      boardOrganizations.push({
        "orgId": selectedOrgId,
        "orgDisplayName": selectedOrgDisplayName,
        "isActive" : true,
      })

      if (selectedOrgId != "-1") {
        Meteor.call('setBoardOrgs', boardOrganizations, currentBoard._id);
      }
    }

    Popup.back();
  },
});

Template.removeBoardOrgPopup.onCreated(function(this: OrgTeamPopupInstance) {
  this.error = new ReactiveVar('');
  this.loading = new ReactiveVar(false);
  this.findOrgsOptions = new ReactiveVar({});

  this.page = new ReactiveVar(1);
  this.autorun(() => {
    const limitTeams = this.page.get() * Number.MAX_SAFE_INTEGER;
    this.subscribe('team', this.findOrgsOptions.get(), limitTeams, () => {});
  });

  this.findUsersOptions = new ReactiveVar({});
  this.userPage = new ReactiveVar(1);
  this.autorun(() => {
    const limitUsers = this.userPage.get() * Number.MAX_SAFE_INTEGER;
    this.subscribe('people', this.findUsersOptions.get(), limitUsers, () => {});
  });

  this.setError = function(this: OrgTeamPopupInstance, error: any) {
    this.error.set(error);
  };

  this.setLoading = function(this: OrgTeamPopupInstance, w: any) {
    this.loading.set(w);
  };

  this.isLoading = function(this: OrgTeamPopupInstance) {
    return this.loading.get();
  };
});

Template.removeBoardOrgPopup.onRendered(function(this: OrgTeamPopupInstance) {
  this.setLoading(false);
});

Template.removeBoardOrgPopup.helpers({
  org() {
    return ReactiveCache.getOrg(this.orgId);
  },
});

Template.removeBoardOrgPopup.events({
  'keyup input'(event: JQuery.TriggeredEvent, tpl: OrgTeamPopupInstance) {
    tpl.setError('');
  },
  'click #leaveBoardBtn'(){
    let stringOrgId = (document.getElementById('hideOrgId') as HTMLInputElement).value;
    let currentBoard = Utils.getCurrentBoard();
    // boardOrganizations: any[] — the board's org membership records.
    let boardOrganizations: any[] = [];
    if(currentBoard.orgs !== undefined){
      for(let i = 0; i < currentBoard.orgs.length; i++){
        if(currentBoard.orgs[i].orgId != stringOrgId){
          boardOrganizations.push(currentBoard.orgs[i]);
        }
      }
    }

    Meteor.call('setBoardOrgs', boardOrganizations, currentBoard._id);

    Popup.back();
  },
  'click #cancelLeaveBoardBtn'(){
    Popup.back();
  },
});

// #5850: free-form "share board with an email domain" popups. Unlike orgs/teams
// (which are a managed collection shown in a <select>), the owner simply types a
// domain such as example.com.
Template.addBoardDomainPopup.onCreated(function(this: OrgTeamPopupInstance) {
  this.error = new ReactiveVar('');

  this.setError = function(this: OrgTeamPopupInstance, error: any) {
    this.error.set(error);
  };
});

Template.addBoardDomainPopup.helpers({
  error() {
    return { get: () => (Template.instance() as OrgTeamPopupInstance).error.get() };
  },
});

Template.addBoardDomainPopup.events({
  'keyup input'(event: JQuery.TriggeredEvent, tpl: OrgTeamPopupInstance) {
    tpl.setError('');
  },
  'submit .js-add-board-domain'(event: JQuery.TriggeredEvent, tpl: OrgTeamPopupInstance) {
    event.preventDefault();
    const input = document.getElementById('jsBoardDomainInput') as HTMLInputElement | null;
    const domain = (input ? input.value : '').trim().toLowerCase();

    // Basic validation: must contain a '.', and no '@' or whitespace.
    if (
      domain.length === 0 ||
      domain.indexOf('.') < 0 ||
      domain.indexOf('@') >= 0 ||
      /\s/.test(domain)
    ) {
      tpl.setError('invalid-domain');
      return;
    }

    const currentBoard = Utils.getCurrentBoard();
    // boardDomains: any[] — the board's shared email-domain records.
    const boardDomains: any[] = [];
    if (currentBoard.domains !== undefined) {
      for (let i = 0; i < currentBoard.domains.length; i++) {
        boardDomains.push(currentBoard.domains[i]);
      }
    }

    if (!boardDomains.some((d: any) => d.domain === domain)) {
      boardDomains.push({
        domain,
        isActive: true,
      });
      Meteor.call('setBoardDomains', boardDomains, currentBoard._id);
    }

    Popup.back();
  },
});

Template.removeBoardDomainPopup.events({
  'keyup input'(event: JQuery.TriggeredEvent, tpl: OrgTeamPopupInstance) {
    // no-op, kept for parity with the org/team remove popups
  },
  'click #leaveBoardDomainBtn'(){
    const stringDomain = (document.getElementById('hideDomain') as HTMLInputElement).value;
    const currentBoard = Utils.getCurrentBoard();
    // boardDomains: any[] — the board's shared email-domain records.
    const boardDomains: any[] = [];
    if (currentBoard.domains !== undefined) {
      for (let i = 0; i < currentBoard.domains.length; i++) {
        if (currentBoard.domains[i].domain != stringDomain) {
          boardDomains.push(currentBoard.domains[i]);
        }
      }
    }

    Meteor.call('setBoardDomains', boardDomains, currentBoard._id);

    Popup.back();
  },
  'click #cancelLeaveBoardDomainBtn'(){
    Popup.back();
  },
});

Template.addBoardTeamPopup.onCreated(function(this: OrgTeamPopupInstance) {
  this.error = new ReactiveVar('');
  this.loading = new ReactiveVar(false);
  this.findOrgsOptions = new ReactiveVar({});

  this.page = new ReactiveVar(1);
  this.autorun(() => {
    const limitTeams = this.page.get() * Number.MAX_SAFE_INTEGER;
    this.subscribe('team', this.findOrgsOptions.get(), limitTeams, () => {});
  });

  this.findUsersOptions = new ReactiveVar({});
  this.userPage = new ReactiveVar(1);
  this.autorun(() => {
    const limitUsers = this.userPage.get() * Number.MAX_SAFE_INTEGER;
    this.subscribe('people', this.findUsersOptions.get(), limitUsers, () => {});
  });

  this.setError = function(this: OrgTeamPopupInstance, error: any) {
    this.error.set(error);
  };

  this.setLoading = function(this: OrgTeamPopupInstance, w: any) {
    this.loading.set(w);
  };

  this.isLoading = function(this: OrgTeamPopupInstance) {
    return this.loading.get();
  };
});

Template.addBoardTeamPopup.onRendered(function(this: OrgTeamPopupInstance) {
  this.setLoading(false);
});

Template.addBoardTeamPopup.helpers({
  teamsDatas() {
    let ret = ReactiveCache.getTeams({}, {sort: { teamDisplayName: 1 }});
    return ret;
  },
});

Template.addBoardTeamPopup.events({
  'keyup input'(event: JQuery.TriggeredEvent, tpl: OrgTeamPopupInstance) {
    tpl.setError('');
  },
  'change #jsBoardTeams'() {
    let currentBoard = Utils.getCurrentBoard();
    let selectElt = document.getElementById("jsBoardTeams") as HTMLSelectElement;
    let selectedTeamId = selectElt.options[selectElt.selectedIndex].value;
    let selectedTeamDisplayName = selectElt.options[selectElt.selectedIndex].text;
    // boardTeams: any[] — the board's team membership records.
    let boardTeams: any[] = [];
    if(currentBoard.teams !== undefined){
      for(let i = 0; i < currentBoard.teams.length; i++){
        boardTeams.push(currentBoard.teams[i]);
      }
    }

    if(!boardTeams.some((team: any) => team.teamDisplayName == selectedTeamDisplayName)){
      boardTeams.push({
        "teamId": selectedTeamId,
        "teamDisplayName": selectedTeamDisplayName,
        "isActive" : true,
      })

      if (selectedTeamId != "-1") {
        let members = currentBoard.members;

        let query = {
          "teams.teamId": { $in: boardTeams.map((t: any) => t.teamId) },
        };

        const boardTeamUsers = ReactiveCache.getUsers(query, {
          sort: { sort: 1 },
        });

        if(boardTeams !== undefined && boardTeams.length > 0){
          let index;
          if (boardTeamUsers && boardTeamUsers.length > 0) {
            boardTeamUsers.forEach((u: any) => {
              index = members.findIndex(function(m: any){ return m.userId == u._id});
              if(index == -1){
                members.push({
                  "isActive": true,
                  "isAdmin": false,
                  "isCommentOnly" : false,
                  "isNoComments" : false,
                  "userId": u._id,
                });
              }
            });
          }
        }

        Meteor.call('setBoardTeams', boardTeams, members, currentBoard._id);
      }
    }

    Popup.back();
  },
});

Template.removeBoardTeamPopup.onCreated(function(this: OrgTeamPopupInstance) {
  this.error = new ReactiveVar('');
  this.loading = new ReactiveVar(false);
  this.findOrgsOptions = new ReactiveVar({});

  this.page = new ReactiveVar(1);
  this.autorun(() => {
    const limitTeams = this.page.get() * Number.MAX_SAFE_INTEGER;
    this.subscribe('team', this.findOrgsOptions.get(), limitTeams, () => {});
  });

  this.findUsersOptions = new ReactiveVar({});
  this.userPage = new ReactiveVar(1);
  this.autorun(() => {
    const limitUsers = this.userPage.get() * Number.MAX_SAFE_INTEGER;
    this.subscribe('people', this.findUsersOptions.get(), limitUsers, () => {});
  });

  this.setError = function(this: OrgTeamPopupInstance, error: any) {
    this.error.set(error);
  };

  this.setLoading = function(this: OrgTeamPopupInstance, w: any) {
    this.loading.set(w);
  };

  this.isLoading = function(this: OrgTeamPopupInstance) {
    return this.loading.get();
  };
});

Template.removeBoardTeamPopup.onRendered(function(this: OrgTeamPopupInstance) {
  this.setLoading(false);
});

Template.removeBoardTeamPopup.helpers({
  team() {
    return ReactiveCache.getTeam(this.teamId);
  },
});

Template.removeBoardTeamPopup.events({
  'keyup input'(event: JQuery.TriggeredEvent, tpl: OrgTeamPopupInstance) {
    tpl.setError('');
  },
  'click #leaveBoardTeamBtn'(){
    let stringTeamId = (document.getElementById('hideTeamId') as HTMLInputElement).value;
    let currentBoard = Utils.getCurrentBoard();
    // boardTeams: any[] — the board's team membership records.
    let boardTeams: any[] = [];
    if(currentBoard.teams !== undefined){
      for(let i = 0; i < currentBoard.teams.length; i++){
        if(currentBoard.teams[i].teamId != stringTeamId){
          boardTeams.push(currentBoard.teams[i]);
        }
      }
    }

    let members = currentBoard.members;
    let query = {
      "teams.teamId": stringTeamId
    };

    const boardTeamUsers = ReactiveCache.getUsers(query, {
      sort: { sort: 1 },
    });

    if(currentBoard.teams !== undefined && currentBoard.teams.length > 0){
      let index;
      if (boardTeamUsers && boardTeamUsers.length > 0) {
        boardTeamUsers.forEach((u: any) => {
          index = members.findIndex(function(m: any){ return m.userId == u._id});
          if(index !== -1 && !members[index].isAdmin){
            members.splice(index, 1);
          }
        });
      }
    }

    Meteor.call('setBoardTeams', boardTeams, members, currentBoard._id);

    Popup.back();
  },
  'click #cancelLeaveBoardTeamBtn'(){
    Popup.back();
  },
});

Template.changePermissionsPopup.events({
  // this: any — the member data context exposes `userId`.
  async 'click .js-set-admin, click .js-set-normal, click .js-set-normal-assigned-only, click .js-set-no-comments, click .js-set-comment-only, click .js-set-comment-assigned-only, click .js-set-read-only, click .js-set-read-assigned-only, click .js-set-worker'(
    this: any,
    event: JQuery.TriggeredEvent,
  ) {
    const currentBoard = Utils.getCurrentBoard();
    const memberId = this.userId;
    const isAdmin = $(event.currentTarget).hasClass('js-set-admin');
    const isCommentOnly = $(event.currentTarget).hasClass(
      'js-set-comment-only',
    );
    const isNormalAssignedOnly = $(event.currentTarget).hasClass(
      'js-set-normal-assigned-only',
    );
    const isCommentAssignedOnly = $(event.currentTarget).hasClass(
      'js-set-comment-assigned-only',
    );
    const isReadOnly = $(event.currentTarget).hasClass('js-set-read-only');
    const isReadAssignedOnly = $(event.currentTarget).hasClass('js-set-read-assigned-only');
    const isNoComments = $(event.currentTarget).hasClass('js-set-no-comments');
    const isWorker = $(event.currentTarget).hasClass('js-set-worker');
    await currentBoard.setMemberPermission(
      memberId,
      isAdmin,
      isNoComments,
      isCommentOnly,
      isWorker,
      isNormalAssignedOnly,
      isCommentAssignedOnly,
      isReadOnly,
      isReadAssignedOnly,
    );
    Popup.back(1);
  },
});

Template.changePermissionsPopup.helpers({
  isAdmin() {
    const currentBoard = Utils.getCurrentBoard();
    return currentBoard.hasAdmin(this.userId);
  },

  isNormal() {
    const currentBoard = Utils.getCurrentBoard();
    return (
      !currentBoard.hasAdmin(this.userId) &&
      !currentBoard.hasNoComments(this.userId) &&
      !currentBoard.hasCommentOnly(this.userId) &&
      !currentBoard.hasNormalAssignedOnly(this.userId) &&
      !currentBoard.hasCommentAssignedOnly(this.userId) &&
      !currentBoard.hasReadOnly(this.userId) &&
      !currentBoard.hasReadAssignedOnly(this.userId) &&
      !currentBoard.hasWorker(this.userId)
    );
  },

  isNormalAssignedOnly() {
    const currentBoard = Utils.getCurrentBoard();
    return (
      !currentBoard.hasAdmin(this.userId) &&
      currentBoard.hasNormalAssignedOnly(this.userId)
    );
  },

  isNoComments() {
    const currentBoard = Utils.getCurrentBoard();
    return (
      !currentBoard.hasAdmin(this.userId) &&
      currentBoard.hasNoComments(this.userId)
    );
  },

  isCommentOnly() {
    const currentBoard = Utils.getCurrentBoard();
    return (
      !currentBoard.hasAdmin(this.userId) &&
      currentBoard.hasCommentOnly(this.userId)
    );
  },

  isCommentAssignedOnly() {
    const currentBoard = Utils.getCurrentBoard();
    return (
      !currentBoard.hasAdmin(this.userId) &&
      currentBoard.hasCommentAssignedOnly(this.userId)
    );
  },

  isReadOnly() {
    const currentBoard = Utils.getCurrentBoard();
    return (
      !currentBoard.hasAdmin(this.userId) &&
      currentBoard.hasReadOnly(this.userId)
    );
  },

  isReadAssignedOnly() {
    const currentBoard = Utils.getCurrentBoard();
    return (
      !currentBoard.hasAdmin(this.userId) &&
      currentBoard.hasReadAssignedOnly(this.userId)
    );
  },

  isWorker() {
    const currentBoard = Utils.getCurrentBoard();
    return (
      !currentBoard.hasAdmin(this.userId) && currentBoard.hasWorker(this.userId)
    );
  },

  isLastAdmin() {
    const currentBoard = Utils.getCurrentBoard();
    return (
      currentBoard.hasAdmin(this.userId) && currentBoard.activeAdmins() === 1
    );
  },
});

// The `sidebar` template instance and the programmatic API exposed via the
// `Sidebar` global. Most methods are attached in onCreated.
// A Blaze popup instance that snapshots the current Board document as
// `currentBoard` (see the board settings / info popups).
interface CurrentBoardPopupInstance extends Blaze.TemplateInstance {
  // currentBoard: any — a Board model document.
  currentBoard: any;
}

// boardMenuPopup instance: tracks whether the REST API is enabled.
interface BoardMenuPopupInstance extends Blaze.TemplateInstance {
  apiEnabled: ReactiveVar<any>;
}

// importDependenciesPopup instance: holds the pasted/loaded file text and the
// human-readable import result string.
interface ImportDependenciesPopupInstance extends Blaze.TemplateInstance {
  fileText: ReactiveVar<any>;
  importResult: ReactiveVar<any>;
}

// boardBackgroundsPopup instance: upload state and the target board id.
interface BoardBackgroundsPopupInstance extends Blaze.TemplateInstance {
  uploading: ReactiveVar<any>;
  error: ReactiveVar<any>;
  // boardId: any — the current board id (or falsy when none).
  boardId: any;
}

// Shared instance shape for the org/team/domain membership popups (and
// membersWidget). Each template assigns only the subset it uses.
interface OrgTeamPopupInstance extends Blaze.TemplateInstance {
  error: ReactiveVar<any>;
  loading: ReactiveVar<any>;
  findOrgsOptions: ReactiveVar<any>;
  findTeamsOptions: ReactiveVar<any>;
  findUsersOptions: ReactiveVar<any>;
  page: ReactiveVar<any>;
  teamPage: ReactiveVar<any>;
  userPage: ReactiveVar<any>;
  setError: (error: any) => void;
  setLoading: (w: any) => void;
  isLoading: () => any;
}

// addMemberPopup instance: debounced search + invite helpers.
interface AddMemberPopupInstance extends Blaze.TemplateInstance {
  // searchTimeout: any — a setTimeout handle (or null).
  searchTimeout: any;
  setError: (error: any) => void;
  setLoading: (w: any) => void;
  isLoading: () => any;
  isValidEmail: (email: any) => boolean;
  performSearch: (query: any) => void;
  inviteUser: (idNameEmail: any) => void;
}

interface SidebarInstance extends Blaze.TemplateInstance {
  _isOpen: ReactiveVar<boolean>;
  _view: ReactiveVar<string>;
  _hideCardCounterList: ReactiveVar<boolean>;
  _hideBoardMemberList: ReactiveVar<boolean>;
  // infiniteScrolling: an InfiniteScrolling instance; activitiesInstance: the
  // activities child template instance (or null).
  infiniteScrolling: any;
  activitiesInstance: any;
  isOpen: () => boolean;
  open: () => void;
  hide: () => void;
  toggle: () => void;
  calculateNextPeak: () => void;
  reachNextPeak: () => void;
  isTongueHidden: () => boolean;
  scrollTop: () => void;
  getView: () => string;
  setView: (view?: any) => void;
  isDefaultView: () => boolean;
  getViewTemplate: () => string;
  getViewTitle: () => string;
  showTongueTitle: () => string;
}
