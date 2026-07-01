/**
 * Delete Duplicate Empty Lists Migration
 *
 * Safely deletes empty duplicate lists from a board:
 * 1. First converts any shared lists to per-swimlane lists
 * 2. Only deletes per-swimlane lists that:
 *    - Have no cards
 *    - Have another list with the same title on the same board that DOES have cards
 * 3. This prevents deleting unique empty lists and only removes redundant duplicates
 */

import { Meteor } from 'meteor/meteor';
import { check } from 'meteor/check';
import { ReactiveCache } from '/imports/reactiveCache';
import Boards from '/models/boards';
import Lists from '/models/lists';
import Cards from '/models/cards';
import Swimlanes from '/models/swimlanes';

class DeleteDuplicateEmptyListsMigration {
  name: string;
  version: number;

  constructor() {
    this.name = 'deleteDuplicateEmptyLists';
    this.version = 1;
  }

  /**
   * Check if migration is needed for a board
   */
  async needsMigration(boardId: string) {
    try {
      const lists = await ReactiveCache.getLists({ boardId });
      const cards = await ReactiveCache.getCards({ boardId });

      // Check if there are any empty lists that have a duplicate with the same title containing cards
      for (const list of lists) {
        // Skip shared lists
        if (!list.swimlaneId || list.swimlaneId === '') {
          continue;
        }

        // Check if list is empty
        const listCards = cards.filter((card: WekanReactiveDocument) => card.listId === list._id);
        if (listCards.length === 0) {
          // Check if there's a duplicate list with the same title that has cards
          const duplicateListsWithSameTitle = lists.filter((l: WekanReactiveDocument) =>
            l._id !== list._id &&
            l.title === list.title &&
            l.boardId === boardId
          );

          for (const duplicateList of duplicateListsWithSameTitle) {
            const duplicateListCards = cards.filter((card: WekanReactiveDocument) => card.listId === duplicateList._id);
            if (duplicateListCards.length > 0) {
              return true; // Found an empty list with a duplicate that has cards
            }
          }
        }
      }

      return false;
    } catch (error) {
  console.error('Error checking if deleteDuplicateEmptyLists migration is needed:', error);
      return false;
    }
  }

  /**
   * Execute the migration
   */
  async executeMigration(boardId: string) {
    try {
      const results = {
        sharedListsConverted: 0,
        listsDeleted: 0,
        errors: []
      };

      // Step 1: Convert shared lists to per-swimlane lists first
      const conversionResult = await this.convertSharedListsToPerSwimlane(boardId);
      results.sharedListsConverted = conversionResult.listsConverted;

      // Step 2: Delete empty per-swimlane lists
      const deletionResult = await this.deleteEmptyPerSwimlaneLists(boardId);
      results.listsDeleted = deletionResult.listsDeleted;

      return {
        success: true,
        changes: [
          `Converted ${results.sharedListsConverted} shared lists to per-swimlane lists`,
          `Deleted ${results.listsDeleted} empty per-swimlane lists`
        ],
        results
      };
    } catch (error) {
  console.error('Error executing deleteDuplicateEmptyLists migration:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Convert shared lists (lists without swimlaneId) to per-swimlane lists
   */
  async convertSharedListsToPerSwimlane(boardId: string) {
    const lists = await ReactiveCache.getLists({ boardId });
    const swimlanes = await ReactiveCache.getSwimlanes({ boardId, archived: false });
    const cards = await ReactiveCache.getCards({ boardId });
    
    let listsConverted = 0;

    // Find shared lists (lists without swimlaneId)
    const sharedLists = lists.filter((list: WekanReactiveDocument) => !list.swimlaneId || list.swimlaneId === '');

    if (sharedLists.length === 0) {
      return { listsConverted: 0 };
    }

    for (const sharedList of sharedLists) {
      // Get cards in this shared list
      const listCards = cards.filter((card: WekanReactiveDocument) => card.listId === sharedList._id);

      // Group cards by swimlane. Cards come from the untyped ReactiveCache
      // interop layer, so they are grouped as dynamic per-swimlane buckets.
      const cardsBySwimlane: Record<string, any[]> = {};
      for (const card of listCards) {
        const swimlaneId = card.swimlaneId || 'default';
        if (!cardsBySwimlane[swimlaneId]) {
          cardsBySwimlane[swimlaneId] = [];
        }
        cardsBySwimlane[swimlaneId].push(card);
      }

      // Create per-swimlane lists for each swimlane that has cards
      for (const swimlane of swimlanes) {
        const swimlaneCards = cardsBySwimlane[swimlane._id] || [];

        if (swimlaneCards.length > 0) {
          // Check if per-swimlane list already exists
          const existingList = lists.find((l: WekanReactiveDocument) =>
            l.title === sharedList.title &&
            l.swimlaneId === swimlane._id &&
            l._id !== sharedList._id
          );

          if (!existingList) {
            // Create new per-swimlane list
            const newListId = await Lists.insertAsync({
              title: sharedList.title,
              boardId: boardId,
              swimlaneId: swimlane._id,
              sort: sharedList.sort,
              createdAt: new Date(),
              updatedAt: new Date(),
              archived: false
            } as Parameters<typeof Lists.insertAsync>[0]);

            // Move cards to the new list
            for (const card of swimlaneCards) {
              await Cards.updateAsync(card._id, {
                $set: {
                  listId: newListId,
                  swimlaneId: swimlane._id
                }
              });
            }

            if (process.env.DEBUG === 'true') {
              console.log(`Created per-swimlane list "${sharedList.title}" for swimlane ${swimlane.title || swimlane._id}`);
            }
          } else {
            // Move cards to existing per-swimlane list
            for (const card of swimlaneCards) {
              await Cards.updateAsync(card._id, {
                $set: {
                  listId: existingList._id,
                  swimlaneId: swimlane._id
                }
              });
            }

            if (process.env.DEBUG === 'true') {
              console.log(`Moved cards to existing per-swimlane list "${sharedList.title}" in swimlane ${swimlane.title || swimlane._id}`);
            }
          }
        }
      }

      // Remove the shared list (now that all cards are moved)
      await Lists.removeAsync(sharedList._id);
      listsConverted++;

      if (process.env.DEBUG === 'true') {
        console.log(`Removed shared list "${sharedList.title}"`);
      }
    }

    return { listsConverted };
  }

  /**
   * Delete empty per-swimlane lists
   * Only deletes lists that:
   * 1. Have a swimlaneId (are per-swimlane, not shared)
   * 2. Have no cards
   * 3. Have a duplicate list with the same title on the same board that contains cards
   */
  async deleteEmptyPerSwimlaneLists(boardId: string) {
    const lists = await ReactiveCache.getLists({ boardId });
    const cards = await ReactiveCache.getCards({ boardId });
    
    let listsDeleted = 0;

    for (const list of lists) {
      // Safety check 1: List must have a swimlaneId (must be per-swimlane, not shared)
      if (!list.swimlaneId || list.swimlaneId === '') {
        if (process.env.DEBUG === 'true') {
          console.log(`Skipping list "${list.title}" - no swimlaneId (shared list)`);
        }
        continue;
      }

      // Safety check 2: List must have no cards
      const listCards = cards.filter((card: WekanReactiveDocument) => card.listId === list._id);
      if (listCards.length > 0) {
        if (process.env.DEBUG === 'true') {
          console.log(`Skipping list "${list.title}" - has ${listCards.length} cards`);
        }
        continue;
      }

      // Safety check 3: There must be another list with the same title on the same board that has cards
      const duplicateListsWithSameTitle = lists.filter((l: WekanReactiveDocument) =>
        l._id !== list._id &&
        l.title === list.title &&
        l.boardId === boardId
      );

      let hasDuplicateWithCards = false;
      for (const duplicateList of duplicateListsWithSameTitle) {
        const duplicateListCards = cards.filter((card: WekanReactiveDocument) => card.listId === duplicateList._id);
        if (duplicateListCards.length > 0) {
          hasDuplicateWithCards = true;
          break;
        }
      }

      if (!hasDuplicateWithCards) {
        if (process.env.DEBUG === 'true') {
          console.log(`Skipping list "${list.title}" - no duplicate list with same title that has cards`);
        }
        continue;
      }

      // All safety checks passed - delete the empty per-swimlane list
      await Lists.removeAsync(list._id);
      listsDeleted++;

      if (process.env.DEBUG === 'true') {
        console.log(`Deleted empty per-swimlane list: "${list.title}" (swimlane: ${list.swimlaneId}) - duplicate with cards exists`);
      }
    }

    return { listsDeleted };
  }

  /**
   * Get detailed status of empty lists
   */
  async getStatus(boardId: string) {
    const lists = await ReactiveCache.getLists({ boardId });
    const cards = await ReactiveCache.getCards({ boardId });

    const sharedLists: SharedListStatus[] = [];
    const emptyPerSwimlaneLists: EmptyPerSwimlaneListStatus[] = [];
    const nonEmptyLists: NonEmptyListStatus[] = [];

    for (const list of lists) {
      const listCards = cards.filter((card: WekanReactiveDocument) => card.listId === list._id);
      const isShared = !list.swimlaneId || list.swimlaneId === '';
      const isEmpty = listCards.length === 0;

      if (isShared) {
        sharedLists.push({
          id: list._id,
          title: list.title,
          cardCount: listCards.length
        });
      } else if (isEmpty) {
        emptyPerSwimlaneLists.push({
          id: list._id,
          title: list.title,
          swimlaneId: list.swimlaneId
        });
      } else {
        nonEmptyLists.push({
          id: list._id,
          title: list.title,
          swimlaneId: list.swimlaneId,
          cardCount: listCards.length
        });
      }
    }

    return {
      sharedListsCount: sharedLists.length,
      emptyPerSwimlaneLists: emptyPerSwimlaneLists.length,
      totalLists: lists.length,
      details: {
        sharedLists,
        emptyPerSwimlaneLists,
        nonEmptyLists
      }
    };
  }
}

const deleteDuplicateEmptyListsMigration = new DeleteDuplicateEmptyListsMigration();

// Register Meteor methods
Meteor.methods({
  async 'deleteDuplicateEmptyLists.needsMigration'(boardId: string) {
    check(boardId, String);

    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'You must be logged in');
    }

    return await deleteDuplicateEmptyListsMigration.needsMigration(boardId);
  },

  async 'deleteDuplicateEmptyLists.execute'(boardId: string) {
    check(boardId, String);

    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'You must be logged in');
    }

    // Check if user is board admin
    const board = await ReactiveCache.getBoard(boardId);
    if (!board) {
      throw new Meteor.Error('board-not-found', 'Board not found');
    }

    const user = await ReactiveCache.getUser(this.userId);
    if (!user) {
      throw new Meteor.Error('user-not-found', 'User not found');
    }

    // Only board admins can run migrations
    const isBoardAdmin = board.members && board.members.some(
      (member: WekanReactiveDocument) => member.userId === this.userId && member.isAdmin
    );

    if (!isBoardAdmin && !user.isAdmin) {
      throw new Meteor.Error('not-authorized', 'Only board administrators can run migrations');
    }

    return await deleteDuplicateEmptyListsMigration.executeMigration(boardId);
  },

  async 'deleteDuplicateEmptyLists.getStatus'(boardId: string) {
    check(boardId, String);

    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'You must be logged in');
    }

    return await deleteDuplicateEmptyListsMigration.getStatus(boardId);
  }
});

export default deleteDuplicateEmptyListsMigration;

interface SharedListStatus {
  id: string;
  title: string;
  cardCount: number;
}

interface EmptyPerSwimlaneListStatus {
  id: string;
  title: string;
  swimlaneId: string;
}

interface NonEmptyListStatus {
  id: string;
  title: string;
  swimlaneId: string;
  cardCount: number;
}
