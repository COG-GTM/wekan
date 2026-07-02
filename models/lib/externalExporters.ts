import { ReactiveCache } from '/imports/reactiveCache';

// Generalized export: collect a WeKan board into a neutral intermediate, then a
// per-format formatter emits the target platform's JSON shape. This mirrors the
// generalized import (externalParsers.js): one collector + a map of formatters.

async function collect(boardId: string) {
  const board: ExportBoard = await ReactiveCache.getBoard(boardId);
  const lists: ExportList[] = await ReactiveCache.getLists({ boardId, archived: false }, { sort: { sort: 1 } });
  const swimlanes: ExportSwimlane[] = await ReactiveCache.getSwimlanes({ boardId, archived: false }, { sort: { sort: 1 } });
  const cards: any[] = await ReactiveCache.getCards({ boardId, archived: false }, { sort: { sort: 1 } });
  const listById: { [id: string]: string } = {};
  lists.forEach(l => { listById[l._id] = l.title; });
  const swById: { [id: string]: string } = {};
  swimlanes.forEach(s => { swById[s._id] = s.title; });
  const labelById: { [id: string]: string } = {};
  (board.labels || []).forEach(l => { labelById[l._id] = l.name; });
  const items = cards.map(c => ({
    cardId: c._id,
    listId: c.listId,
    title: c.title,
    description: c.description || '',
    listTitle: listById[c.listId] || '',
    swimlaneTitle: swById[c.swimlaneId] || 'Default',
    dueAt: c.dueAt ? new Date(c.dueAt).toISOString() : undefined,
    labelIds: c.labelIds || [],
    labels: (c.labelIds || []).map((id: string) => labelById[id]).filter(Boolean),
  }));
  return { board, lists, swimlanes, items };
}

// A WeKan list maps to a "closed" issue state when its name looks terminal.
function isClosed(listTitle?: string) {
  return /done|closed|complete|archiv|finished/i.test(listTitle || '');
}

const githubLike = ({ items }: ExportCollection) =>
  items.map(i => ({
    title: i.title,
    body: i.description,
    state: isClosed(i.listTitle) ? 'closed' : 'open',
    labels: i.labels.map(name => ({ name })),
    due_date: i.dueAt,
  }));

const formatters: { [format: string]: ExternalExportFormatter } = {
  // NextCloud Deck: board with stacks, each stack carrying its cards.
  deck: ({ board, lists, items }) => ({
    title: board.title,
    stacks: lists.map(l => ({
      title: l.title,
      cards: items
        .filter(i => i.listTitle === l.title)
        .map(i => ({
          title: i.title,
          description: i.description,
          duedate: i.dueAt,
          labels: i.labels.map(name => ({ title: name })),
        })),
    })),
  }),
  // OpenProject: a work-packages collection.
  openproject: ({ items }) => ({
    _embedded: {
      elements: items.map(i => ({
        subject: i.title,
        description: { raw: i.description },
        dueDate: i.dueAt,
        _links: { status: { title: i.listTitle } },
      })),
    },
  }),
  // GitHub / Gitea / Forgejo: an issues array.
  github: githubLike,
  gitea: githubLike,
  forgejo: githubLike,
  // GitLab: issues array (state "opened"/"closed", string labels).
  gitlab: ({ items }) =>
    items.map(i => ({
      title: i.title,
      description: i.description,
      state: isClosed(i.listTitle) ? 'closed' : 'opened',
      labels: i.labels,
      due_date: i.dueAt,
    })),
  // Trello board JSON (round-trips with WeKan's Trello import).
  trello: ({ board, lists, items }) => ({
    name: board.title,
    prefs: { background: 'blue', permissionLevel: 'private' },
    labels: (board.labels || []).map(l => ({ id: l._id, name: l.name, color: l.color })),
    lists: lists.map(l => ({ id: l._id, name: l.title, closed: false })),
    cards: items.map(i => ({
      id: i.cardId,
      name: i.title,
      desc: i.description,
      idList: i.listId,
      due: i.dueAt || null,
      closed: false,
      idLabels: i.labelIds,
      idMembers: [],
      idChecklists: [],
    })),
    checklists: [],
    actions: [],
  }),
  // Jira issues collection (round-trips with WeKan's Jira import).
  jira: ({ board, items }) => ({
    board: { name: board.title },
    issues: items.map((i, idx) => ({
      key: `WEKAN-${idx + 1}`,
      fields: {
        summary: i.title,
        description: i.description,
        status: { name: i.listTitle },
        labels: i.labels,
        duedate: i.dueAt,
      },
    })),
  }),
  // Asana tasks (sections become the board columns).
  asana: ({ items }) => ({
    data: items.map(i => ({
      name: i.title,
      notes: i.description,
      completed: isClosed(i.listTitle),
      due_on: i.dueAt,
      memberships: [{ section: { name: i.listTitle } }],
      tags: i.labels.map(name => ({ name })),
    })),
  }),
  // ZenKit-style export (stages + items).
  zenkit: ({ board, lists, items }) => ({
    title: board.title,
    stages: lists.map(l => ({ name: l.title })),
    items: items.map(i => ({
      title: i.title,
      description: i.description,
      stage_name: i.listTitle,
      due: i.dueAt,
      tags: i.labels,
    })),
  }),
};

export const EXTERNAL_EXPORT_FORMATS = Object.keys(formatters);

export async function buildExternalExport(boardId: string, format: string) {
  const formatter = formatters[format];
  if (!formatter) return null;
  return formatter(await collect(boardId));
}

// A board label as stored on the board document.
interface ExportLabel {
  _id: string;
  name: string;
  color?: string;
}

// Loosely-typed board/list/swimlane docs as returned by ReactiveCache; only the
// fields the exporters read are declared here.
interface ExportBoard {
  title: string;
  labels?: ExportLabel[];
}

interface ExportList {
  _id: string;
  title: string;
}

interface ExportSwimlane {
  _id: string;
  title: string;
}

// Neutral intermediate a formatter turns into a target platform's JSON shape.
interface ExportItem {
  cardId: string;
  listId: string;
  title: string;
  description: string;
  listTitle: string;
  swimlaneTitle: string;
  dueAt?: string;
  labelIds: string[];
  labels: string[];
}

interface ExportCollection {
  board: ExportBoard;
  lists: ExportList[];
  swimlanes: ExportSwimlane[];
  items: ExportItem[];
}

type ExternalExportFormatter = (data: ExportCollection) => object;
