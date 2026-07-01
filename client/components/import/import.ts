import { ReactiveCache } from '/imports/reactiveCache';
import { trelloGetMembersToMap } from './trelloMembersMapper';
import { FlowRouter } from 'meteor/ostrio:flow-router-extra';
import { wekanGetMembersToMap } from './wekanMembersMapper';
import { csvGetMembersToMap } from './csvMembersMapper';
import { jiraGetMembersToMap } from './jiraMembersMapper';
import { kanboardGetMembersToMap } from './kanboardMembersMapper';
import getSlug from 'limax';
import { UserSearchIndex } from '/models/users';
import { Utils } from '/client/lib/utils';
import { TAPi18n } from '/imports/i18n';
import TrelloImportJobs from '/models/trelloImportJobs';
import { Template } from 'meteor/templating';
import { Blaze } from 'meteor/blaze';
import { ReactiveVar } from 'meteor/reactive-var';
import { Tracker } from 'meteor/tracker';

// Papa: any — papaparse is imported via require and is untyped here.
const Papa: any = require('papaparse');

Template.importHeaderBar.helpers({
  title() {
    const sourceNameByKey: Record<string, string> = {
      trello: 'Trello',
      wekan: 'JSON',
      csv: 'CSV-TSV',
      excel: 'Excel',
      jira: 'Jira',
      kanboard: 'Kanboard',
      deck: 'NextCloud Deck',
      openproject: 'OpenProject',
      github: 'GitHub',
      gitlab: 'GitLab',
      gitea: 'Gitea',
      forgejo: 'Forgejo',
      asana: 'Asana',
      zenkit: 'Zenkit',
    };
    const sourceName = sourceNameByKey[Session.get('importSource')] || 'JSON';
    return `${TAPi18n.__('import')} / ${sourceName}`;
  },
});

// Helper to find the closest ancestor template instance by name
// Returns any — the parent instance exposes custom methods (importData, etc.).
function findParentTemplateInstance(childTemplateInstance: Blaze.TemplateInstance, parentTemplateName: string): any {
  // view: any — walk up the Blaze view chain (typed loosely by @types/meteor).
  let view: any = childTemplateInstance.view;
  while (view) {
    if (view.name === `Template.${parentTemplateName}` && view.templateInstance) {
      return view.templateInstance();
    }
    view = view.parentView;
  }
  return null;
}

function _prepareAdditionalData(dataObject: any) {
  const importSource = Session.get('importSource');
  // membersToMap: any — each mapper returns plain member records.
  let membersToMap: any;
  switch (importSource) {
    case 'trello':
      membersToMap = trelloGetMembersToMap(dataObject);
      break;
    case 'wekan':
      membersToMap = wekanGetMembersToMap(dataObject);
      break;
    case 'csv':
      membersToMap = csvGetMembersToMap(dataObject);
      break;
    case 'jira':
      membersToMap = jiraGetMembersToMap(dataObject);
      break;
    case 'kanboard':
      membersToMap = kanboardGetMembersToMap(dataObject);
      break;
    default:
      // NextCloud Deck / OpenProject / GitHub / GitLab / Gitea / Forgejo:
      // these are imported without member mapping (members can be mapped later).
      membersToMap = [];
      break;
  }
  return membersToMap;
}

// All Trello file/text imports are run on the server over HTTP instead of the
// DDP `importBoard` method. This matters for correctness, not just size: Meteor
// automatically re-sends an unacknowledged method call on every reconnect, so if
// an import is heavy (or the connection hiccups) the WebSocket can enter an
// endless drop/retry loop (the "Invalid frame header" flicker). An HTTP request
// is never auto-retried, and a .zip's attachment bytes never touch the realtime
// connection at all. The body is either a .zip File (application/zip) or a JSON
// string { board, membersMapping } (application/json).
async function postTrelloImport(body: any, contentType: string) {
  const token =
    (window.localStorage && window.localStorage.getItem('Meteor.loginToken')) || '';
  const resp = await fetch('/import-trello', {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'Content-Type': contentType,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body,
  });
  // result: any — shape depends on the /import-trello response body.
  let result: any = {};
  try {
    result = await resp.json();
  } catch (e) {
    result = {};
  }
  if (!resp.ok || result.error) {
    throw new Error(result.error || 'import-trello-failed');
  }
  return result;
}

// A safe URL slug for an imported board. Trello exports name the board `name`,
// WeKan exports use `title`; getSlug (limax) throws on undefined, so guard it.
function boardSlug(data: any) {
  const raw = (data && (data.title || data.name)) || '';
  return (raw && getSlug(raw)) || 'imported-board';
}

// A WeKan export produced by a buggy older version (the `meta.boardId` exporter
// regression) contains empty swimlanes/lists/cards arrays. Importing it can only
// produce an empty board with a single Default swimlane, so detect that case and
// warn instead of silently creating an empty board.
function wekanExportIsEmpty(board: any) {
  const count = (key: string) => (Array.isArray(board && board[key]) ? board[key].length : 0);
  return count('swimlanes') === 0 && count('lists') === 0 && count('cards') === 0;
}

// Navigate to a freshly server-imported board. The HTTP import (unlike a DDP
// method) does not push the new board's documents to this client, so we first
// subscribe to the board and wait until its lists/swimlanes/cards are loaded
// into Minimongo — otherwise the board opens with an empty Swimlanes view until
// the page is reloaded. The subscription is left running so the data stays
// available when the board is reopened from All Boards in the same session. A
// timeout is the safety net in case the subscription never signals ready.
function goToImportedBoard(boardId: string, slug: string) {
  let navigated = false;
  const go = () => {
    if (navigated) return;
    navigated = true;
    FlowRouter.go('board', { id: boardId, slug });
  };
  Meteor.subscribe('board', boardId, false, { onReady: go });
  Meteor.setTimeout(go, 5000);
}

// Find a workspace node by name anywhere in the user's personal workspace tree.
function findWorkspaceByName(nodes: any, name: string): any {
  for (const node of nodes || []) {
    if (node.name === name) return node;
    if (node.children) {
      const found = findWorkspaceByName(node.children, name);
      if (found) return found;
    }
  }
  return null;
}

// Assign an imported board to a personal workspace named `wsName`, creating the
// workspace (under an optional parent) only if one with that name doesn't exist.
function assignBoardToNamedWorkspace(boardId: string, wsName: string, parentId: string | null = null) {
  const user = ReactiveCache.getCurrentUser();
  const tree = (user && user.profile && user.profile.boardWorkspacesTree) || [];
  const existing = findWorkspaceByName(tree, wsName);
  if (existing) {
    Meteor.call('assignBoardToWorkspace', boardId, existing.id);
    return;
  }
  // err/node: any — untyped Meteor method callback (Meteor.Error / return).
  Meteor.call('createWorkspace', { parentId, name: wsName }, (err: any, node: any) => {
    if (!err && node) {
      Meteor.call('assignBoardToWorkspace', boardId, node.id);
    }
  });
}

Template.import.onCreated(function (this: ImportInstance) {
  this.error = new ReactiveVar('');
  this.steps = ['importTextarea', 'importMapMembers'];
  this._currentStepIndex = new ReactiveVar(0);
  this.importedData = new ReactiveVar<any>(undefined);
  this.membersToMap = new ReactiveVar([]);
  this.importSource = Session.get('importSource');
  // True while a Trello .zip package is being uploaded/imported server-side.
  this.zipImporting = new ReactiveVar(false);

  this.nextStep = () => {
    const nextStepIndex = this._currentStepIndex.get() + 1;
    if (nextStepIndex >= this.steps.length) {
      this.finishImport();
    } else {
      this._currentStepIndex.set(nextStepIndex);
    }
  };

  this.setError = (error: any) => {
    this.error.set(error);
  };

  // When skipMapping is true, the "map members" step is bypassed and the board
  // is imported immediately with whatever (possibly empty) mapping exists, so
  // members can be mapped later. This works for wekan, trello, csv and jira.
  this.importData = async (evt: any, dataSource: any, skipMapping = false) => {
    evt.preventDefault();
    const advance = async () => {
      if (skipMapping) {
        await this.finishImport();
      } else {
        this.nextStep();
      }
    };
    // Excel (.xlsx): the file is parsed on the server (with exceljs) into rows
    // and imported through the CSV creator. Member mapping is skipped (members
    // can be mapped later), so we read the file to base64 and import directly.
    if (dataSource === 'excel') {
      const el = this.find('.js-import-excel-file') as HTMLInputElement | null;
      if (!el || !el.files || !el.files[0]) {
        this.setError('error-json-malformed');
        return;
      }
      const buf = await el.files[0].arrayBuffer();
      const bytes = new Uint8Array(buf);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      this.importedData.set({ excelBase64: window.btoa(binary) });
      this.membersToMap.set([]);
      await this.finishImport();
      return;
    }
    if (dataSource === 'csv') {
      const input = (this.find('.js-import-json') as HTMLInputElement).value;
      const csv = input.indexOf('\t') > 0 ? input.replace(/(\t)/g, ',') : input;
      const ret = Papa.parse(csv);
      if (ret && ret.data && ret.data.length) this.importedData.set(ret.data);
      else throw new Meteor.Error('error-csv-schema');
      const membersToMap = _prepareAdditionalData(ret.data);
      this.membersToMap.set(membersToMap);
      await advance();
      return;
    }
    // Trello: a .zip package (one or more board .json files plus per-board
    // attachment subdirectories from the Trello Attachments Downloader) imports
    // all of its boards at once, through a separate field from the single .json.
    if (dataSource === 'trello') {
      const zipEl = this.find('.js-import-zip-file') as HTMLInputElement | null;
      if (zipEl && zipEl.files && zipEl.files[0]) {
        await this.importTrelloZip(zipEl.files[0]);
        return;
      }
    }
    try {
      // A single board: JSON may come from an uploaded .json file (large Trello
      // exports are awkward to paste) or from the textarea.
      let input = (this.find('.js-import-json') as HTMLInputElement).value;
      const jsonFileEl = this.find('.js-import-json-file') as HTMLInputElement | null;
      if (jsonFileEl && jsonFileEl.files && jsonFileEl.files[0]) {
        input = await jsonFileEl.files[0].text();
      }
      const dataObject = JSON.parse(input);
      // Guard against importing a broken/old WeKan export that has no board
      // content (see wekanExportIsEmpty): warn the user to re-export rather than
      // silently creating an empty board with only a Default swimlane.
      if (this.importSource === 'wekan' && wekanExportIsEmpty(dataObject)) {
        this.setError('error-import-empty-board');
        return;
      }
      this.setError('');

      // Trello: remember the target personal-workspace name for finishImport.
      this.workspaceName = '';
      if (dataSource === 'trello') {
        const wsEl = this.find('.js-import-workspace-name') as HTMLInputElement | null;
        this.workspaceName = wsEl && wsEl.value ? wsEl.value.trim() : '';
      }

      this.importedData.set(dataObject);
      const membersToMap = _prepareAdditionalData(dataObject);
      // store members data and mapping in Session
      // (we go deep and 2-way, so storing in data context is not a viable option)
      this.membersToMap.set(membersToMap);
      await advance();
    } catch (e) {
      this.setError('error-json-malformed');
    }
  };

  // Upload a Trello .zip package to the server, which extracts it (with
  // zip-bomb / path-traversal guards), imports every board and streams each
  // attachment to the Default storage, then go to All Boards.
  this.importTrelloZip = async (zipFile: any) => {
    this.setError('');
    const wsEl = this.find('.js-import-workspace-name') as HTMLInputElement | null;
    const workspaceName = wsEl && wsEl.value ? wsEl.value.trim() : '';

    this.zipImporting.set(true);
    // result: any — postTrelloImport response body.
    let result: any;
    try {
      result = await postTrelloImport(zipFile, 'application/zip');
    } catch (e: any) { // e: any — fetch/Meteor error with a message field.
      this.zipImporting.set(false);
      this.setError((e && e.message) || 'import-trello-failed');
      return;
    }
    this.zipImporting.set(false);

    (result.boardIds || []).forEach((boardId: any) => {
      if (workspaceName) {
        assignBoardToNamedWorkspace(boardId, workspaceName);
      }
    });
    Session.set('fromBoard', null);
    // Go to All Boards, where the newly imported boards appear.
    FlowRouter.go('home');
  };

  this.finishImport = async () => {
    const membersMapping = this.membersToMap.get();
    // mappingById: import-member id -> wekan user id.
    const mappingById: Record<string, any> = {};
    if (membersMapping) {
      membersMapping.forEach((member: any) => {
        if (member.wekanId) {
          mappingById[member.id] = member.wekanId;
        }
      });
    }
    const importedData = this.importedData.get();

    // Trello: import over HTTP (see postTrelloImport) so the realtime DDP
    // connection is never used for the board payload and can't enter the
    // drop/retry "Invalid frame header" flicker loop. Do NOT mutate the still-
    // mounted map-members template (e.g. clearing membersToMap) before
    // navigating away — that forces an empty re-render mid-teardown and can
    // throw "Can't select in removed DomRange". We navigate away, which
    // destroys the import templates.
    if (this.importSource === 'trello') {
      // result: any — postTrelloImport response body.
      let result: any;
      try {
        result = await postTrelloImport(
          JSON.stringify({ board: importedData, membersMapping: mappingById }),
          'application/json',
        );
      } catch (e: any) { // e: any — fetch/Meteor error with a message field.
        this.setError((e && e.message) || 'import-trello-failed');
        return;
      }
      const boardId = (result.boardIds || [])[0];
      if (!boardId) {
        this.setError('import-trello-failed');
        return;
      }
      Session.set('fromBoard', null);
      if (this.workspaceName) {
        assignBoardToNamedWorkspace(boardId, this.workspaceName);
      }
      goToImportedBoard(boardId, boardSlug(importedData));
      return;
    }

    // wekan / csv: unchanged DDP import.
    this.membersToMap.set([]);
    Meteor.call(
      'importBoard',
      importedData,
      { membersMapping: mappingById },
      this.importSource,
      Session.get('fromBoard'),
      // err/res: any — untyped Meteor method callback (Meteor.Error / return).
      (err: any, res: any) => {
        if (err) {
          this.setError(err.error);
        } else {
          Session.set('fromBoard', null);
            goToImportedBoard(res, boardSlug(importedData));
        }
      },
    );
  };
});

Template.import.helpers({
  error() {
    return (Template.instance() as ImportInstance).error;
  },
  currentTemplate() {
    const tpl = Template.instance() as ImportInstance;
    return tpl.steps[tpl._currentStepIndex.get()];
  },
  zipImporting() {
    return (Template.instance() as ImportInstance).zipImporting.get();
  },
});

Template.importTextarea.helpers({
  instruction() {
    const importSource = Session.get('importSource');
    const issueSourceConfig: Record<string, { sourceName: string; endpoint: string }> = {
      github: {
        sourceName: 'GitHub',
        endpoint: 'GET /repos/OWNER/REPO/issues',
      },
      gitlab: {
        sourceName: 'GitLab',
        endpoint: 'GET /projects/ID/issues',
      },
      gitea: {
        sourceName: 'Gitea',
        endpoint: 'GET /repos/OWNER/REPO/issues',
      },
      forgejo: {
        sourceName: 'Forgejo',
        endpoint: 'GET /repos/OWNER/REPO/issues',
      },
    };

    if (issueSourceConfig[importSource]) {
      const { sourceName, endpoint } = issueSourceConfig[importSource];
      return TAPi18n.__('import-board-instruction-issues', {
        sourceName,
        endpoint,
      });
    }

    return TAPi18n.__(`import-board-instruction-${importSource}`);
  },
  importPlaceHolder() {
    const importSource = Session.get('importSource');
    if (importSource === 'csv') {
      return 'import-csv-placeholder';
    } else {
      return 'import-json-placeholder';
    }
  },
  isTrelloImport() {
    return Session.get('importSource') === 'trello';
  },
  isExcelImport() {
    return Session.get('importSource') === 'excel';
  },
});

Template.importTextarea.events({
  submit(evt: JQuery.TriggeredEvent, tpl: Blaze.TemplateInstance) {
    const importTpl = findParentTemplateInstance(tpl, 'import');
    if (importTpl) {
      return importTpl.importData(evt, Session.get('importSource'));
    }
  },
  // Import immediately, skipping the "map members" step (members can be mapped
  // later). Works for wekan, trello and jira (and csv).
  'click .js-import-without-mapping'(evt: JQuery.TriggeredEvent, tpl: Blaze.TemplateInstance) {
    const importTpl = findParentTemplateInstance(tpl, 'import');
    if (importTpl) {
      return importTpl.importData(evt, Session.get('importSource'), true);
    }
  },
});

// Module-level reference so popup children can access importMapMembers methods
// _importMapMembersTpl: any — holds the ImportMapMembers instance (or null).
let _importMapMembersTpl: any = null;

Template.importMapMembers.onCreated(function (this: ImportMapMembersInstance) {
  _importMapMembersTpl = this;
  this.usersLoaded = new ReactiveVar(false);

  this.members = () => {
    const importTpl = findParentTemplateInstance(this, 'import');
    return importTpl ? importTpl.membersToMap.get() : [];
  };

  this._refreshMembers = (listOfMembers: any) => {
    const importTpl = findParentTemplateInstance(this, 'import');
    if (importTpl) {
      importTpl.membersToMap.set(listOfMembers);
    }
  };

  this._setPropertyForMember = (property: string, value: any, memberId: any, unset = false) => {
    const listOfMembers = this.members();
    // finder: any — a predicate over member records, chosen below.
    let finder: any = null;
    if (memberId) {
      finder = (member: any) => member.id === memberId;
    } else {
      finder = (member: any) => member.selected;
    }
    listOfMembers.forEach((member: any) => {
      if (finder(member)) {
        if (value !== null) {
          member[property] = value;
        } else {
          delete member[property];
        }
        if (!unset) {
          // we shortcut if we don't care about unsetting the others
          return false;
        }
      } else if (unset) {
        delete member[property];
      }
      return true;
    });
    // Session.get gives us a copy, we have to set it back so it sticks
    this._refreshMembers(listOfMembers);
  };

  this.setSelectedMember = (memberId: any) => {
    return this._setPropertyForMember('selected', true, memberId, true);
  };

  this.getMember = (memberId: any = null) => {
    const allMembers = this.members();
    // finder: any — a predicate over member records, chosen below.
    let finder: any = null;
    if (memberId) {
      finder = (user: any) => user.id === memberId;
    } else {
      finder = (user: any) => user.selected;
    }
    return allMembers.find(finder);
  };

  this.mapSelectedMember = (wekanId: any) => {
    return this._setPropertyForMember('wekanId', wekanId, null);
  };

  this.unmapMember = (memberId: any) => {
    return this._setPropertyForMember('wekanId', null, memberId);
  };

  this.autorun(() => {
    const handle = this.subscribe(
      'user-miniprofile',
      this.members().map((member: any) => {
        return member.username;
      }),
    );
    Tracker.nonreactive(() => {
      Tracker.autorun(() => {
        if (
          handle.ready() &&
          !this.usersLoaded.get() &&
          this.members().length
        ) {
          this._refreshMembers(
            this.members().map((member: any) => {
              if (!member.wekanId) {
                let user = ReactiveCache.getUser({ username: member.username });
                if (!user) {
                  user = ReactiveCache.getUser({ importUsernames: member.username });
                }
                if (user) {
                  member.wekanId = user._id;
                }
              }
              return member;
            }),
          );
        }
        this.usersLoaded.set(handle.ready());
      });
    });
  });
});

Template.importMapMembers.onDestroyed(function (this: Blaze.TemplateInstance) {
  if (_importMapMembersTpl === this) {
    _importMapMembersTpl = null;
  }
});

Template.importMapMembers.helpers({
  usersLoaded() {
    return (Template.instance() as ImportMapMembersInstance).usersLoaded;
  },
  members() {
    return (Template.instance() as ImportMapMembersInstance).members();
  },
});

Template.importMapMembers.events({
  submit(evt: JQuery.TriggeredEvent, tpl: Blaze.TemplateInstance) {
    evt.preventDefault();
    const importTpl = findParentTemplateInstance(tpl, 'import');
    if (importTpl) {
      importTpl.nextStep();
    }
  },
  // Import now without finishing member mapping; only members already mapped
  // (if any) are applied, the rest can be mapped later.
  'click .js-import-skip-mapping'(evt: JQuery.TriggeredEvent, tpl: Blaze.TemplateInstance) {
    evt.preventDefault();
    const importTpl = findParentTemplateInstance(tpl, 'import');
    if (importTpl) {
      importTpl.finishImport();
    }
  },
  'click .js-select-member'(evt: JQuery.TriggeredEvent, tpl: ImportMapMembersInstance) {
    const memberToMap = Template.currentData();
    if (memberToMap.wekan) {
      // todo xxx ask for confirmation?
      tpl.unmapMember(memberToMap.id);
    } else {
      tpl.setSelectedMember(memberToMap.id);
      Popup.open('importMapMembersAdd')(evt);
    }
  },
});

// Global reactive variables for import member popup
const importMemberPopupState = {
  searching: new ReactiveVar(false),
  searchResults: new ReactiveVar<any[]>([]),
  noResults: new ReactiveVar(false),
  searchTimeout: null,
};

Template.importMapMembersAddPopup.onCreated(function (this: ImportMapMembersAddInstance) {
  this.searching = importMemberPopupState.searching;
  this.searchResults = importMemberPopupState.searchResults;
  this.noResults = importMemberPopupState.noResults;
  this.searchTimeout = null;

  this.searching.set(false);
  this.searchResults.set([]);
  this.noResults.set(false);
});

Template.importMapMembersAddPopup.onRendered(function (this: ImportMapMembersAddInstance) {
  // Guard against the DOM range being gone (e.g. the popup was closed during a
  // re-render) — calling find/$ then throws "Can't select in removed DomRange".
  // this.view.isDestroyed: Blaze view is typed loosely by @types/meteor.
  if (this.view && (this.view as any).isDestroyed) return;
  const input = this.find('.js-search-member-input');
  if (input) input.focus();
});

Template.importMapMembersAddPopup.onDestroyed(function (this: ImportMapMembersAddInstance) {
  if (this.searchTimeout) {
    clearTimeout(this.searchTimeout);
  }
  this.searching.set(false);
});

function importPerformSearch(tpl: ImportMapMembersAddInstance, query: string) {
  if (!query || query.length < 2) {
    tpl.searchResults.set([]);
    tpl.noResults.set(false);
    return;
  }

  tpl.searching.set(true);
  tpl.noResults.set(false);

  const results = UserSearchIndex.search(query, { limit: 20 }).fetch();
  tpl.searchResults.set(results);
  tpl.searching.set(false);

  if (results.length === 0) {
    tpl.noResults.set(true);
  }
}

Template.importMapMembersAddPopup.events({
  'click .js-select-import'(event: JQuery.TriggeredEvent, tpl: ImportMapMembersAddInstance) {
    if (_importMapMembersTpl) {
      _importMapMembersTpl.mapSelectedMember(Template.currentData().__originalId);
    }
    Popup.back();
  },
  'keyup .js-search-member-input'(event: JQuery.TriggeredEvent, tpl: ImportMapMembersAddInstance) {
    const query = (event.target as HTMLInputElement).value.trim();

    if (tpl.searchTimeout) {
      clearTimeout(tpl.searchTimeout);
    }

    tpl.searchTimeout = setTimeout(() => {
      importPerformSearch(tpl, query);
    }, 300);
  },
});

Template.importMapMembersAddPopup.helpers({
  searchResults() {
    return importMemberPopupState.searchResults.get();
  },
  searching() {
    return importMemberPopupState.searching;
  },
  noResults() {
    return importMemberPopupState.noResults;
  },
});

// ---------------------------------------------------------------------------
// Live Trello API import: key/token -> list workspaces & boards -> import
// selected boards (with attachments) server-side, placing each under a
// personal workspace named after its Trello workspace.
// ---------------------------------------------------------------------------

function flattenWorkspaceTree(nodes: any, depth = 0, acc: any[] = []) {
  (nodes || []).forEach((node: any) => {
    acc.push({ id: node.id, label: `${'— '.repeat(depth)}${node.name}` });
    if (node.children && node.children.length) {
      flattenWorkspaceTree(node.children, depth + 1, acc);
    }
  });
  return acc;
}

// Build the copy-paste-friendly error text for a job: the error log plus a
// summary line per failed board.
function jobErrorText(job: any) {
  if (!job) return '';
  const lines: string[] = [];
  (job.errorLog || []).forEach((line: any) => lines.push(line));
  return lines.join('\n');
}

Template.importTrelloApi.onCreated(function (this: ImportTrelloApiInstance) {
  this.error = new ReactiveVar('');
  this.loading = new ReactiveVar(false);
  this.workspaces = new ReactiveVar([]);
  this.copied = new ReactiveVar(false);
  // Board selection state: map of trelloBoardId -> true. Tracked here (rather
  // than via DOM checkboxes) because the UI uses animated .materialCheckBox
  // elements, not native inputs.
  this.selectedBoards = new ReactiveVar({});
  // The import itself runs server-side as a persisted job; watch it reactively
  // so progress survives navigating away and back.
  this.subscribe('trelloImportJobs');
});

// Collect every board id across all listed workspaces.
function allBoardIds(workspaces: any) {
  const ids: Record<string, boolean> = {};
  (workspaces || []).forEach((ws: any) => {
    (ws.boards || []).forEach((b: any) => {
      ids[b.id] = true;
    });
  });
  return ids;
}

Template.importTrelloApi.helpers({
  error() {
    return (Template.instance() as ImportTrelloApiInstance).error;
  },
  loading() {
    return (Template.instance() as ImportTrelloApiInstance).loading;
  },
  copied() {
    return (Template.instance() as ImportTrelloApiInstance).copied;
  },
  hasWorkspaces() {
    return (Template.instance() as ImportTrelloApiInstance).workspaces.get().length > 0;
  },
  workspaceList() {
    return (Template.instance() as ImportTrelloApiInstance).workspaces.get();
  },
  // this: any — the per-board Blaze data context.
  boardSelected(this: any) {
    return !!(Template.instance() as ImportTrelloApiInstance).selectedBoards.get()[this.id];
  },
  // this: any — the per-workspace Blaze data context.
  workspaceSelected(this: any) {
    const sel = (Template.instance() as ImportTrelloApiInstance).selectedBoards.get();
    const boards = this.boards || [];
    return boards.length > 0 && boards.every((b: any) => sel[b.id]);
  },
  flatWorkspaceNodes() {
    const user = ReactiveCache.getCurrentUser();
    const tree = (user && user.profile && user.profile.boardWorkspacesTree) || [];
    return flattenWorkspaceTree(tree);
  },
  credsSaved() {
    const user = ReactiveCache.getCurrentUser();
    return !!(user && user.profile && user.profile.trelloApiSaved);
  },

  // --- current background job ---
  currentJob() {
    return TrelloImportJobs.findOne({}, { sort: { createdAt: -1 } });
  },
  jobIsRunning() {
    // job: any — the trello_import_jobs doc has no attached schema/type.
    const job: any = TrelloImportJobs.findOne({}, { sort: { createdAt: -1 } });
    return job && job.status === 'running';
  },
  jobCanResume() {
    const job: any = TrelloImportJobs.findOne({}, { sort: { createdAt: -1 } });
    return job && (job.status === 'paused' || job.status === 'error');
  },
  jobIsFinished() {
    const job: any = TrelloImportJobs.findOne({}, { sort: { createdAt: -1 } });
    return job && (job.status === 'done' || job.status === 'cancelled');
  },
  canStartImport() {
    // Don't start a second import while one is active (running/paused/error),
    // which would create a hidden concurrent job.
    const job: any = TrelloImportJobs.findOne({}, { sort: { createdAt: -1 } });
    return !job || job.status === 'done' || job.status === 'cancelled';
  },
  jobProgressText() {
    const job: any = TrelloImportJobs.findOne({}, { sort: { createdAt: -1 } });
    if (!job) return '';
    return `${job.currentIndex} / ${job.total}`;
  },
  jobProgressPercent() {
    const job: any = TrelloImportJobs.findOne({}, { sort: { createdAt: -1 } });
    if (!job || !job.total) return 0;
    return Math.round((job.currentIndex / job.total) * 100);
  },
  jobResults() {
    const job: any = TrelloImportJobs.findOne({}, { sort: { createdAt: -1 } });
    return (job && job.results) || [];
  },
  jobHasErrors() {
    const job: any = TrelloImportJobs.findOne({}, { sort: { createdAt: -1 } });
    return !!(job && job.errorLog && job.errorLog.length);
  },
  jobErrorText() {
    return jobErrorText(TrelloImportJobs.findOne({}, { sort: { createdAt: -1 } }));
  },
});

Template.importTrelloApi.events({
  'click .js-trello-save-creds'(evt: JQuery.TriggeredEvent, tpl: ImportTrelloApiInstance) {
    evt.preventDefault();
    const key = (tpl.find('.js-trello-key') as HTMLInputElement).value.trim();
    const token = (tpl.find('.js-trello-token') as HTMLInputElement).value.trim();
    if (!key || !token) {
      tpl.error.set('trello-api-credentials-required');
      return;
    }
    tpl.error.set('');
    // err: any — untyped Meteor method callback (Meteor.Error).
    Meteor.call('saveTrelloCredentials', key, token, (err: any) => {
      if (err) {
        tpl.error.set(err.reason || err.error || 'trello-api-error');
        return;
      }
      // Don't keep the token sitting in the browser; it now lives server-side.
      (tpl.find('.js-trello-key') as HTMLInputElement).value = '';
      (tpl.find('.js-trello-token') as HTMLInputElement).value = '';
    });
  },
  'click .js-trello-delete-creds'(evt: JQuery.TriggeredEvent, tpl: ImportTrelloApiInstance) {
    evt.preventDefault();
    tpl.error.set('');
    // err: any — untyped Meteor method callback (Meteor.Error).
    Meteor.call('deleteTrelloCredentials', (err: any) => {
      if (err) tpl.error.set(err.reason || err.error || 'trello-api-error');
    });
    (tpl.find('.js-trello-key') as HTMLInputElement).value = '';
    (tpl.find('.js-trello-token') as HTMLInputElement).value = '';
  },
  'click .js-trello-list-workspaces'(evt: JQuery.TriggeredEvent, tpl: ImportTrelloApiInstance) {
    evt.preventDefault();
    // key/token may be empty when saved credentials exist; the server falls
    // back to the saved ones and returns an error if neither is available.
    const key = (tpl.find('.js-trello-key') as HTMLInputElement).value.trim();
    const token = (tpl.find('.js-trello-token') as HTMLInputElement).value.trim();
    tpl.error.set('');
    tpl.loading.set(true);
    // err/res: any — untyped Meteor method callback.
    Meteor.call('trelloListWorkspaces', key, token, (err: any, res: any) => {
      tpl.loading.set(false);
      if (err) {
        tpl.error.set(err.reason || err.error || 'trello-api-error');
        tpl.workspaces.set([]);
        tpl.selectedBoards.set({});
      } else {
        const workspaces = res || [];
        tpl.workspaces.set(workspaces);
        // Preselect all boards by default.
        tpl.selectedBoards.set(allBoardIds(workspaces));
      }
    });
  },
  // Toggle a single board's animated checkbox.
  // this: any — the per-board Blaze data context.
  'click .js-toggle-board'(this: any, evt: JQuery.TriggeredEvent, tpl: ImportTrelloApiInstance) {
    evt.preventDefault();
    const id = this.id;
    const sel = { ...tpl.selectedBoards.get() };
    if (sel[id]) {
      delete sel[id];
    } else {
      sel[id] = true;
    }
    tpl.selectedBoards.set(sel);
  },
  // Toggle all boards in a workspace: if all are selected, clear them; else
  // select them all.
  // this: any — the per-workspace Blaze data context.
  'click .js-toggle-workspace'(this: any, evt: JQuery.TriggeredEvent, tpl: ImportTrelloApiInstance) {
    evt.preventDefault();
    const boards = this.boards || [];
    const sel = { ...tpl.selectedBoards.get() };
    const allSelected = boards.length > 0 && boards.every((b: any) => sel[b.id]);
    boards.forEach((b: any) => {
      if (allSelected) {
        delete sel[b.id];
      } else {
        sel[b.id] = true;
      }
    });
    tpl.selectedBoards.set(sel);
  },
  'click .js-trello-select-all'(evt: JQuery.TriggeredEvent, tpl: ImportTrelloApiInstance) {
    evt.preventDefault();
    tpl.selectedBoards.set(allBoardIds(tpl.workspaces.get()));
  },
  'click .js-trello-unselect-all'(evt: JQuery.TriggeredEvent, tpl: ImportTrelloApiInstance) {
    evt.preventDefault();
    tpl.selectedBoards.set({});
  },
  'click .js-trello-import-selected'(evt: JQuery.TriggeredEvent, tpl: ImportTrelloApiInstance) {
    evt.preventDefault();
    const key = (tpl.find('.js-trello-key') as HTMLInputElement).value.trim();
    const token = (tpl.find('.js-trello-token') as HTMLInputElement).value.trim();
    const sel = tpl.selectedBoards.get();
    const boardIds = Object.keys(sel).filter(id => sel[id]);
    if (!boardIds.length) {
      tpl.error.set('trello-select-boards');
      return;
    }
    const parentEl = tpl.find('.js-trello-parent-workspace') as HTMLInputElement | null;
    const parentId = parentEl && parentEl.value ? parentEl.value : null;

    tpl.error.set('');
    // Start the server-side job; progress shows up via the subscription. The
    // user is free to navigate away and come back.
    // err: any — untyped Meteor method callback (Meteor.Error).
    Meteor.call('trelloStartImport', key, token, boardIds, parentId, (err: any) => {
      if (err) {
        tpl.error.set(err.reason || err.error || 'trello-api-error');
      }
    });
  },
  'click .js-trello-resume'(evt: JQuery.TriggeredEvent, tpl: ImportTrelloApiInstance) {
    evt.preventDefault();
    const job = TrelloImportJobs.findOne({}, { sort: { createdAt: -1 } });
    if (!job) return;
    const key = (tpl.find('.js-trello-key') as HTMLInputElement).value.trim();
    const token = (tpl.find('.js-trello-token') as HTMLInputElement).value.trim();
    if (!key || !token) {
      tpl.error.set('trello-api-credentials-required');
      return;
    }
    tpl.error.set('');
    // err: any — untyped Meteor method callback (Meteor.Error).
    Meteor.call('trelloResumeImport', job._id, key, token, (err: any) => {
      if (err) tpl.error.set(err.reason || err.error || 'trello-api-error');
    });
  },
  'click .js-trello-cancel'(evt: JQuery.TriggeredEvent, tpl: ImportTrelloApiInstance) {
    evt.preventDefault();
    const job = TrelloImportJobs.findOne({}, { sort: { createdAt: -1 } });
    if (!job) return;
    Meteor.call('trelloCancelImport', job._id, false);
  },
  'click .js-trello-cancel-delete'(evt: JQuery.TriggeredEvent, tpl: ImportTrelloApiInstance) {
    evt.preventDefault();
    const job = TrelloImportJobs.findOne({}, { sort: { createdAt: -1 } });
    if (!job) return;
    // eslint-disable-next-line no-alert
    if (!window.confirm(TAPi18n.__('trello-cancel-delete-confirm'))) return;
    Meteor.call('trelloCancelImport', job._id, true);
  },
  'click .js-trello-clear'(evt: JQuery.TriggeredEvent, tpl: ImportTrelloApiInstance) {
    evt.preventDefault();
    const job = TrelloImportJobs.findOne({}, { sort: { createdAt: -1 } });
    if (!job) return;
    Meteor.call('trelloClearImportJob', job._id, false);
  },
  'click .js-trello-copy-errors'(evt: JQuery.TriggeredEvent, tpl: ImportTrelloApiInstance) {
    evt.preventDefault();
    const job = TrelloImportJobs.findOne({}, { sort: { createdAt: -1 } });
    const text = jobErrorText(job);
    if (!text) return;
    const done = () => {
      tpl.copied.set(true);
      setTimeout(() => tpl.copied.set(false), 2000);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, () => {
        // Fall back to selecting the textarea so the user can copy manually.
        const ta = tpl.find('.js-trello-errors-text') as HTMLTextAreaElement | null;
        if (ta) {
          ta.focus();
          ta.select();
        }
      });
    } else {
      const ta = tpl.find('.js-trello-errors-text') as HTMLTextAreaElement | null;
      if (ta) {
        ta.focus();
        ta.select();
        try {
          document.execCommand('copy');
          done();
        } catch (e) {
          // user can copy manually from the selected textarea
        }
      }
    }
  },
});

// The `import` template instance and its custom step/import methods.
interface ImportInstance extends Blaze.TemplateInstance {
  error: ReactiveVar<string>;
  steps: string[];
  _currentStepIndex: ReactiveVar<number>;
  importedData: ReactiveVar<any>;
  membersToMap: ReactiveVar<any[]>;
  // importSource: any — the Session-stored import source key.
  importSource: any;
  zipImporting: ReactiveVar<boolean>;
  workspaceName?: string;
  nextStep: () => void;
  setError: (error: any) => void;
  importData: (evt: any, dataSource: any, skipMapping?: boolean) => Promise<void>;
  importTrelloZip: (zipFile: any) => Promise<void>;
  finishImport: () => Promise<void>;
}

// The `importMapMembers` template instance and its member-mapping helpers.
interface ImportMapMembersInstance extends Blaze.TemplateInstance {
  usersLoaded: ReactiveVar<boolean>;
  members: () => any[];
  _refreshMembers: (listOfMembers: any) => void;
  _setPropertyForMember: (property: string, value: any, memberId: any, unset?: boolean) => void;
  setSelectedMember: (memberId: any) => void;
  getMember: (memberId?: any) => any;
  mapSelectedMember: (wekanId: any) => void;
  unmapMember: (memberId: any) => void;
}

// The `importMapMembersAddPopup` template instance (member search popup).
interface ImportMapMembersAddInstance extends Blaze.TemplateInstance {
  searching: ReactiveVar<boolean>;
  searchResults: ReactiveVar<any[]>;
  noResults: ReactiveVar<boolean>;
  // searchTimeout: any — a setTimeout handle (or null).
  searchTimeout: any;
}

// The `importTrelloApi` template instance (live Trello API import).
interface ImportTrelloApiInstance extends Blaze.TemplateInstance {
  error: ReactiveVar<string>;
  loading: ReactiveVar<boolean>;
  workspaces: ReactiveVar<any[]>;
  copied: ReactiveVar<boolean>;
  // selectedBoards: any — a map of trelloBoardId -> true.
  selectedBoards: ReactiveVar<any>;
}
