import { Template } from 'meteor/templating';
import { Blaze } from 'meteor/blaze';
import { ReactiveVar } from 'meteor/reactive-var';
import { ReactiveCache } from '/imports/reactiveCache';
import { TAPi18n } from '/imports/i18n';
import Papa from 'papaparse';
import Actions from '/models/actions';
import Rules from '/models/rules';
import Triggers from '/models/triggers';

const RULES_FORMAT = 'wekan-rules-1.0.0';
const STRIP_FIELDS = ['_id', 'boardId', 'createdAt', 'modifiedAt', 'updatedAt'];

function stripDoc(doc: Record<string, any>) {
  const out: Record<string, any> = {};
  Object.keys(doc || {}).forEach(key => {
    if (!STRIP_FIELDS.includes(key)) out[key] = doc[key];
  });
  return out;
}

// Build a portable, board-independent list of rules from the CURRENT board.
function collectBoardRules(boardId: string) {
  let rules = ReactiveCache.getRules({ boardId });
  const selected = Session.get('selectedRuleIds') || [];
  if (selected.length) {
    rules = rules.filter((r: { _id: string }) => selected.includes(r._id));
  }
  return rules
    .map((rule: { title: string; triggerId: string; actionId: string }) => {
      const trigger = ReactiveCache.getTrigger(rule.triggerId);
      const action = ReactiveCache.getAction(rule.actionId);
      if (!trigger || !action) return null;
      return { title: rule.title, trigger: stripDoc(trigger), action: stripDoc(action) };
    })
    .filter(Boolean) as RuleEntry[];
}

// Insert an array of {title, trigger, action} onto the given target board.
function importRules(rulesArray: RuleEntry[], boardId: string) {
  let count = 0;
  (rulesArray || []).forEach(entry => {
    if (!entry || !entry.trigger || !entry.action) return;
    const triggerId = Triggers.insert({ ...stripDoc(entry.trigger), boardId });
    const actionId = Actions.insert({ ...stripDoc(entry.action), boardId });
    Rules.insert({ title: entry.title || 'Imported rule', triggerId, actionId, boardId });
    count += 1;
  });
  return count;
}

function download(filename: string, text: string, mime: string) {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// --- CSV (round-trippable) --------------------------------------------------
function rulesToCsv(rulesArray: RuleEntry[]) {
  const rows = rulesArray.map(entry => {
    const { activityType, ...triggerFields } = entry.trigger || {};
    const { actionType, ...actionFields } = entry.action || {};
    return {
      title: entry.title || '',
      triggerType: activityType || '',
      triggerFields: JSON.stringify(triggerFields),
      actionType: actionType || '',
      actionFields: JSON.stringify(actionFields),
    };
  });
  return Papa.unparse(rows, {
    columns: ['title', 'triggerType', 'triggerFields', 'actionType', 'actionFields'],
  });
}

function csvToRules(text: string) {
  const parsed = Papa.parse(text.trim(), { header: true, skipEmptyLines: true });
  return (parsed.data || [])
    .map((row: CsvRow) => {
      let triggerFields = {};
      let actionFields = {};
      try { triggerFields = row.triggerFields ? JSON.parse(row.triggerFields) : {}; } catch (e) { triggerFields = {}; }
      try { actionFields = row.actionFields ? JSON.parse(row.actionFields) : {}; } catch (e) { actionFields = {}; }
      if (!row.triggerType || !row.actionType) return null;
      return {
        title: row.title,
        trigger: { activityType: row.triggerType, ...triggerFields },
        action: { actionType: row.actionType, ...actionFields },
      };
    })
    .filter(Boolean) as RuleEntry[];
}

// --- Best-effort Trello Butler parser ---------------------------------------
export function parseTrelloButler(text: string) {
  const rules: RuleEntry[] = [];
  const unmapped: string[] = [];
  (text || '').split('\n').map(l => l.trim()).filter(Boolean).forEach(line => {
    const added = line.toLowerCase().match(/when a card is added to list ["“](.+?)["”].*move the card to the (top|bottom)/);
    if (added) {
      rules.push({
        title: line,
        trigger: { activityType: 'createCard', listName: added[1], swimlaneName: '*', cardTitle: '*', userId: '*' },
        action: { actionType: added[2] === 'top' ? 'moveCardToTop' : 'moveCardToBottom', listName: '*', swimlaneName: '*' },
      });
      return;
    }
    unmapped.push(line);
  });
  return { rules, unmapped };
}

// --- Best-effort visual-workflow parsers (n8n, Node-RED) --------------------
// These map a workflow graph's trigger→action edges to WeKan rules by keyword.
// n8n and Node-RED nodes are arbitrary integrations, so only recognized
// trigger/action node types are mapped; unmapped edges are reported.
function mapTriggerType(type = '', name = '') {
  const s = `${type} ${name}`.toLowerCase();
  if (/schedule|cron|interval|inject/.test(s)) {
    return { activityType: 'scheduledTrigger', scheduleKind: 'calendar', scheduleType: 'daily', atTime: '09:00', listName: '*', swimlaneName: '*' };
  }
  if (/trigger|webhook|http in|http-in|start/.test(s)) {
    return { activityType: 'createCard', listName: '*', swimlaneName: '*', cardTitle: '*', userId: '*' };
  }
  return null;
}

function mapActionType(type = '', name = '') {
  const s = `${type} ${name}`.toLowerCase();
  if (/archive/.test(s)) return { actionType: 'archive' };
  if (/move.*top|to top/.test(s)) return { actionType: 'moveCardToTop', listName: '*', swimlaneName: '*' };
  if (/move.*bottom/.test(s)) return { actionType: 'moveCardToBottom', listName: '*', swimlaneName: '*' };
  if (/complete|done/.test(s)) return { actionType: 'markCardComplete' };
  if (/email|mail|smtp|gmail/.test(s)) return { actionType: 'sendEmail', emailTo: '', emailSubject: 'Imported workflow', emailMsg: '' };
  if (/create.*card|wekan|card/.test(s)) return { actionType: 'createCard', cardName: name || 'Imported card', listName: '*', swimlaneName: '*' };
  return null;
}

// `data` is an arbitrary n8n workflow export (nodes + connections graph).
export function parseN8n(data: any) {
  const nodes = data.nodes || [];
  const byName: Record<string, any> = {};
  nodes.forEach((n: any) => { byName[n.name] = n; });
  const rules: RuleEntry[] = [];
  const unmapped: string[] = [];
  const conns = data.connections || {};
  Object.keys(conns).forEach(srcName => {
    const src = byName[srcName];
    if (!src) return;
    const trig = mapTriggerType(src.type, srcName);
    const outs = (conns[srcName].main || []).flat();
    outs.forEach((o: any) => {
      const tgt = o && byName[o.node];
      if (!tgt) return;
      const act = mapActionType(tgt.type, tgt.name);
      if (trig && act) {
        rules.push({ title: `${srcName} → ${tgt.name || o.node}`, trigger: trig, action: act });
      } else {
        unmapped.push(`${srcName} → ${o.node}`);
      }
    });
  });
  return { rules, unmapped };
}

// `data` is an arbitrary Node-RED flow export (array of nodes, or {flows}).
export function parseNodeRed(data: any) {
  const nodes = Array.isArray(data) ? data : (data.flows || []);
  const byId: Record<string, any> = {};
  nodes.forEach((n: any) => { byId[n.id] = n; });
  const rules: RuleEntry[] = [];
  const unmapped: string[] = [];
  nodes.forEach((n: any) => {
    const trig = mapTriggerType(n.type, n.name);
    if (!trig) return;
    ((n.wires || []).flat()).forEach((tid: string) => {
      const tgt = byId[tid];
      if (!tgt) return;
      const act = mapActionType(tgt.type, tgt.name);
      const label = `${n.name || n.type} → ${tgt.name || tgt.type}`;
      if (act) rules.push({ title: label, trigger: trig, action: act });
      else unmapped.push(label);
    });
  });
  return { rules, unmapped };
}

function parseWorkflow(text: string, format: string): { rules: RuleEntry[]; unmapped: string[]; error?: string } {
  let data;
  try { data = JSON.parse(text); } catch (e) { return { rules: [], unmapped: [], error: 'invalid JSON' }; }
  let fmt = format;
  if (!fmt || fmt === 'auto') {
    if (data && data.nodes && data.connections) fmt = 'n8n';
    else if (Array.isArray(data) || data.flows) fmt = 'nodered';
  }
  if (fmt === 'n8n') return parseN8n(data);
  if (fmt === 'nodered') return parseNodeRed(data);
  return { rules: [], unmapped: [], error: 'unknown format' };
}

// --- Workspace + board selection helpers ------------------------------------
function flattenWorkspaces(nodes: WorkspaceNode[], depth: number, out: WorkspaceOption[]) {
  (nodes || []).forEach(node => {
    out.push({ id: node.id, label: `${'  '.repeat(depth)}${node.name}` });
    if (node.children && node.children.length) flattenWorkspaces(node.children, depth + 1, out);
  });
  return out;
}

Template.rulesImportExportPopup.onCreated(function (this: RulesImportExportInstance) {
  this.message = new ReactiveVar('');
  this.selectedWorkspace = new ReactiveVar('');
  this.selectedBoard = new ReactiveVar<string>(Session.get('currentBoard'));
  this.subscribe('boards'); // the user's boards (also subscribed globally)
});

Template.rulesImportExportPopup.helpers({
  message() {
    return (Template.instance() as RulesImportExportInstance).message;
  },
  workspaces() {
    const user = ReactiveCache.getCurrentUser();
    const tree = (user && user.profile && user.profile.boardWorkspacesTree) || [];
    return flattenWorkspaces(tree, 0, []);
  },
  boardsForImport() {
    const tpl = Template.instance() as RulesImportExportInstance;
    const userId = Meteor.userId();
    const ws = tpl.selectedWorkspace.get();
    const user = ReactiveCache.getCurrentUser();
    const assignments = (user && user.profile && user.profile.boardWorkspaceAssignments) || {};
    let boards = ReactiveCache.getBoards(
      { archived: false, 'members.userId': userId },
      { sort: { title: 1 } },
    );
    if (ws) boards = boards.filter((b: { _id: string }) => assignments[b._id] === ws);
    const selectedBoard = tpl.selectedBoard.get();
    return boards.map((b: { _id: string; title: string }) => ({ _id: b._id, title: b.title, selected: b._id === selectedBoard }));
  },
});

function targetBoardId(tpl: RulesImportExportInstance) {
  return tpl.selectedBoard.get() || Session.get('currentBoard');
}

function reportImport(tpl: RulesImportExportInstance, count: number, unmapped?: string[]) {
  let msg = TAPi18n.__('r-import-done', { count });
  if (unmapped && unmapped.length) {
    msg += ` — ${TAPi18n.__('r-import-unmapped', { count: unmapped.length })}`;
  }
  tpl.message.set(msg);
}

Template.rulesImportExportPopup.events({
  'change .js-import-workspace'(event: JQuery.TriggeredEvent, tpl: RulesImportExportInstance) {
    tpl.selectedWorkspace.set(event.currentTarget.value);
  },
  'change .js-import-board'(event: JQuery.TriggeredEvent, tpl: RulesImportExportInstance) {
    tpl.selectedBoard.set(event.currentTarget.value);
  },
  'click .js-rules-export-json'() {
    const boardId = Session.get('currentBoard');
    const data = { _format: RULES_FORMAT, boardId, rules: collectBoardRules(boardId) };
    download('wekan-rules.json', JSON.stringify(data, null, 2), 'application/json');
  },
  'click .js-rules-export-csv'() {
    const boardId = Session.get('currentBoard');
    download('wekan-rules.csv', rulesToCsv(collectBoardRules(boardId)), 'text/csv');
  },
  'click .js-rules-import-json'(event: JQuery.TriggeredEvent, tpl: RulesImportExportInstance) {
    const text = (tpl.find('.js-rules-import-text') as HTMLTextAreaElement).value;
    try {
      const parsed = JSON.parse(text);
      const rulesArray = Array.isArray(parsed) ? parsed : parsed.rules;
      reportImport(tpl, importRules(rulesArray, targetBoardId(tpl)));
    } catch (e) {
      tpl.message.set(String(e.message || e));
    }
  },
  'click .js-rules-import-csv'(event: JQuery.TriggeredEvent, tpl: RulesImportExportInstance) {
    const text = (tpl.find('.js-rules-import-text') as HTMLTextAreaElement).value;
    try {
      reportImport(tpl, importRules(csvToRules(text), targetBoardId(tpl)));
    } catch (e) {
      tpl.message.set(String(e.message || e));
    }
  },
  'click .js-rules-import-trello'(event: JQuery.TriggeredEvent, tpl: RulesImportExportInstance) {
    const { rules, unmapped } = parseTrelloButler((tpl.find('.js-rules-import-text') as HTMLTextAreaElement).value);
    reportImport(tpl, importRules(rules, targetBoardId(tpl)), unmapped);
  },
  'click .js-rules-import-workflow'(event: JQuery.TriggeredEvent, tpl: RulesImportExportInstance) {
    const format = (tpl.find('.js-workflow-format') as HTMLSelectElement).value;
    const { rules, unmapped, error } = parseWorkflow((tpl.find('.js-rules-import-text') as HTMLTextAreaElement).value, format);
    if (error) {
      tpl.message.set(error);
      return;
    }
    reportImport(tpl, importRules(rules, targetBoardId(tpl)), unmapped);
  },
});

// A portable, board-independent rule: a title plus the trigger/action documents
// with board-specific fields stripped. The trigger/action shapes vary by
// activityType/actionType, so they are keyed dynamically.
interface RuleEntry {
  title?: string;
  trigger: Record<string, any>;
  action: Record<string, any>;
}

// One parsed CSV row of the round-trippable export format.
interface CsvRow {
  title?: string;
  triggerType?: string;
  triggerFields?: string;
  actionType?: string;
  actionFields?: string;
}

// A node in the user's board-workspaces tree (from user.profile).
interface WorkspaceNode {
  id: string;
  name: string;
  children?: WorkspaceNode[];
}

// A flattened workspace entry for the import target dropdown.
interface WorkspaceOption {
  id: string;
  label: string;
}

// The rulesImportExport popup instance: the status message plus the currently
// selected import-target workspace and board.
interface RulesImportExportInstance extends Blaze.TemplateInstance {
  message: ReactiveVar<string>;
  selectedWorkspace: ReactiveVar<string>;
  selectedBoard: ReactiveVar<string>;
}
