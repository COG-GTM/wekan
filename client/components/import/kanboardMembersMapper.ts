// Extract the distinct task owners from a Kanboard export so the import
// "map members" step can map each Kanboard user to a WeKan user.
// data: any — the raw Kanboard export (array of tasks or { tasks: [] }).
export function kanboardGetMembersToMap(data: any) {
  const tasks = Array.isArray(data) ? data : data.tasks || [];
  // byId: keyed by Kanboard owner id with plain member records.
  const byId: Record<string, any> = {};
  tasks.forEach((task: any) => {
    const id = task.owner_id || task.owner_username || task.owner_name;
    if (!id || byId[id]) return;
    byId[id] = {
      id: String(id),
      username: task.owner_username || task.owner_name || String(id),
      fullName: task.owner_name || task.owner_username || String(id),
      wekanId: null,
    };
  });
  return Object.values(byId);
}
