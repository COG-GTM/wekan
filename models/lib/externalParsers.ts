// Parsers that normalize exports/API responses from other tools into the common
// "Kanboard shape" { board, columns, swimlanes, tasks } that KanboardCreator
// consumes. Each is best-effort and tolerant of missing fields.
//
// A normalized task: { title, description, column_name, swimlane_name,
//   date_due, owner_username, tags: [string] }.

function uniq<T>(arr: T[]) {
  return [...new Set(arr.filter(Boolean))];
}

// --- NextCloud Deck ---------------------------------------------------------
// Accepts a Deck board with stacks (each stack carries its cards), e.g. the
// shape returned by the Deck REST API (GET /boards/{id} + /stacks).
// `data` is a dynamic export/API response from an external tool, hence `any`.
export function parseNextcloudDeck(data: any) {
  const board = data.board || data;
  const stacks: any[] = board.stacks || data.stacks || [];
  const tasks: ParsedTask[] = [];
  stacks.forEach(stack => {
    (stack.cards || []).forEach((card: any) => {
      tasks.push({
        title: card.title || 'Imported card',
        description: card.description || '',
        column_name: stack.title,
        swimlane_name: 'Default',
        date_due: card.duedate || card.dueDate,
        owner_username:
          (card.assignedUsers &&
            card.assignedUsers[0] &&
            (card.assignedUsers[0].participant
              ? card.assignedUsers[0].participant.uid
              : card.assignedUsers[0].uid)) ||
          card.owner,
        tags: (card.labels || []).map((l: any) => (typeof l === 'string' ? l : l.title)),
      });
    });
  });
  return {
    board: { name: board.title || 'Imported NextCloud Deck board' },
    columns: stacks.map(s => ({ title: s.title })),
    swimlanes: [{ name: 'Default' }],
    tasks,
  };
}

// --- OpenProject ------------------------------------------------------------
// Accepts a work-packages collection (GET /api/v3/work_packages), i.e.
// { _embedded: { elements: [ { subject, description:{raw}, dueDate,
//   _links:{ status:{title}, assignee:{title}, type:{title} } } ] } }.
// `data` is a dynamic export/API response from an external tool, hence `any`.
export function parseOpenProject(data: any) {
  const elements: any[] =
    (data._embedded && data._embedded.elements) ||
    data.elements ||
    (Array.isArray(data) ? data : []);
  const tasks = elements.map(wp => {
    const links = wp._links || {};
    return {
      title: wp.subject || wp.name || 'Imported work package',
      description: (wp.description && (wp.description.raw || wp.description.html)) || '',
      column_name: (links.status && links.status.title) || wp.status || 'Imported',
      swimlane_name: 'Default',
      date_due: wp.dueDate || wp.due_date,
      owner_username: links.assignee && links.assignee.title,
      tags: [links.type && links.type.title].filter(Boolean),
    };
  });
  return {
    board: { name: (data._links && data._links.self && data._links.self.title) || 'Imported OpenProject' },
    columns: uniq(tasks.map(t => t.column_name)).map(title => ({ title })),
    swimlanes: [{ name: 'Default' }],
    tasks,
  };
}

// --- Shared issue-tracker mapping (GitHub / Gitea / Forgejo) -----------------
// Accepts an array of issues (GET /repos/{o}/{r}/issues). Pull requests are
// skipped. Issues are grouped into Open / Closed lists.
// `data` is a dynamic export/API response from an external tool, hence `any`.
function parseIssuesArray(data: any, system: string) {
  const issues: any[] = Array.isArray(data) ? data : data.issues || [];
  const tasks = issues
    .filter(issue => !issue.pull_request)
    .map(issue => ({
      title: issue.title || 'Imported issue',
      description: issue.body || issue.description || '',
      column_name: issue.state === 'closed' ? 'Closed' : 'Open',
      swimlane_name: 'Default',
      date_due: (issue.milestone && (issue.milestone.due_on || issue.milestone.due_date)) || issue.due_date,
      owner_username:
        (issue.assignee && (issue.assignee.login || issue.assignee.username)) || undefined,
      tags: (issue.labels || []).map((l: any) => (typeof l === 'string' ? l : l.name)),
    }));
  return {
    board: { name: `Imported ${system} issues` },
    columns: [{ title: 'Open' }, { title: 'Closed' }],
    swimlanes: [{ name: 'Default' }],
    tasks,
  };
}

// `data` is a dynamic export/API response from an external tool, hence `any`.
export function parseGithub(data: any) {
  return parseIssuesArray(data, 'GitHub');
}

// Gitea and Forgejo share the same issue API shape.
// `data` is a dynamic export/API response from an external tool, hence `any`.
export function parseGitea(data: any) {
  return parseIssuesArray(data, 'Gitea/Forgejo');
}

// --- GitLab -----------------------------------------------------------------
// Accepts an array of issues (GET /projects/{id}/issues). GitLab uses
// state "opened"/"closed", string labels, and assignee.username.
// `data` is a dynamic export/API response from an external tool, hence `any`.
export function parseGitlab(data: any) {
  const issues: any[] = Array.isArray(data) ? data : data.issues || [];
  const tasks = issues.map(issue => ({
    title: issue.title || 'Imported issue',
    description: issue.description || '',
    column_name: issue.state === 'closed' ? 'Closed' : 'Open',
    swimlane_name: 'Default',
    date_due: issue.due_date || (issue.milestone && issue.milestone.due_date),
    owner_username: issue.assignee && issue.assignee.username,
    tags: (issue.labels || []).map((l: any) => (typeof l === 'string' ? l : l.name)),
  }));
  return {
    board: { name: 'Imported GitLab issues' },
    columns: [{ title: 'Open' }, { title: 'Closed' }],
    swimlanes: [{ name: 'Default' }],
    tasks,
  };
}

// --- Asana ----------------------------------------------------------------
// Accepts an Asana tasks export { data: [ { name, notes, completed, due_on,
//   memberships:[{section:{name}}], tags:[{name}], assignee:{name} } ] }.
// `data` is a dynamic export/API response from an external tool, hence `any`.
export function parseAsana(data: any) {
  const items: any[] = Array.isArray(data) ? data : (data.data || []);
  const tasks = items.map(t => {
    const section =
      (t.memberships && t.memberships[0] && t.memberships[0].section &&
        t.memberships[0].section.name) ||
      (t.completed ? 'Done' : 'In Progress');
    return {
      title: t.name || 'Imported task',
      description: t.notes || '',
      column_name: section,
      swimlane_name: 'Default',
      date_due: t.due_on || t.due_at,
      owner_username: t.assignee && (t.assignee.email || t.assignee.name),
      tags: (t.tags || []).map((tag: any) => (typeof tag === 'string' ? tag : tag.name)),
    };
  });
  return {
    board: { name: (data.project && data.project.name) || 'Imported Asana project' },
    columns: uniq(tasks.map(t => t.column_name)).map(title => ({ title })),
    swimlanes: [{ name: 'Default' }],
    tasks,
  };
}

// --- ZenKit ----------------------------------------------------------------
// Accepts a ZenKit-style export { title, stages:[{name}],
//   items:[{title, description, stage_name, due, tags:[string]}] }.
// `data` is a dynamic export/API response from an external tool, hence `any`.
export function parseZenkit(data: any) {
  const items: any[] = Array.isArray(data) ? data : (data.items || []);
  const stages: any[] = data.stages || [];
  const tasks = items.map(t => ({
    title: t.title || t.name || 'Imported item',
    description: t.description || t.notes || '',
    column_name: t.stage_name || t.stageName || t.list || 'Inbox',
    swimlane_name: 'Default',
    date_due: t.due || t.dueDate || t.due_date,
    owner_username: t.assignee && (t.assignee.email || t.assignee.name),
    tags: Array.isArray(t.tags) ? t.tags.map((tag: any) => (typeof tag === 'string' ? tag : tag.name)) : [],
  }));
  const derivedColumns = uniq(tasks.map(t => t.column_name)).map(title => ({ title }));
  return {
    board: { name: data.title || data.name || 'Imported ZenKit list' },
    columns: stages.length ? stages.map(s => ({ title: s.name || s.title })) : derivedColumns,
    swimlanes: [{ name: 'Default' }],
    tasks,
  };
}

// Map an import source name to its parser (forgejo reuses the Gitea parser).
export const EXTERNAL_PARSERS = {
  deck: parseNextcloudDeck,
  openproject: parseOpenProject,
  github: parseGithub,
  gitlab: parseGitlab,
  gitea: parseGitea,
  forgejo: parseGitea,
  asana: parseAsana,
  zenkit: parseZenkit,
};

// Normalized "Kanboard shape" task produced by every parser. Date/owner fields
// keep whatever string the source provided (formats vary per tool).
interface ParsedTask {
  title: string;
  description: string;
  column_name: string;
  swimlane_name: string;
  date_due?: string;
  owner_username?: string;
  tags: string[];
}
