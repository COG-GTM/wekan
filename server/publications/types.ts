// Shared types for the server publications layer.

// A fully-shaped board member entry (Boards.members[]). Beyond identity it
// carries the assigned-only permission flags consulted when deciding which
// cards/checklists a given member may receive.
export interface BoardMemberFull {
  userId: string;
  isActive?: boolean;
  isAdmin?: boolean;
  isNormalAssignedOnly?: boolean;
  isCommentAssignedOnly?: boolean;
  isReadAssignedOnly?: boolean;
}
