/**
 * Comprehensive Board Migration System
 *
 * This migration handles all database structure changes from previous Wekan versions
 * to the current per-swimlane lists structure. It ensures:
 *
 * 1. All cards are visible with proper swimlaneId and listId
 * 2. Lists are per-swimlane (no shared lists across swimlanes)
 * 3. No empty lists are created
 * 4. Handles various database structure versions from git history
 *
 * Supported versions and their database structures:
 * - v7.94 and earlier: Shared lists across all swimlanes
 * - v8.00-v8.02: Transition period with mixed structures
 * - v8.03+: Per-swimlane lists structure
 */

import { Meteor } from 'meteor/meteor';
import { check } from 'meteor/check';
import { ReactiveCache } from '/imports/reactiveCache';
import Boards from '/models/boards';
import Lists from '/models/lists';
import Cards from '/models/cards';
import Swimlanes from '/models/swimlanes';
import Users from '/models/users';
import Attachments from '/models/attachments';
import { generateUniversalAttachmentUrl, isUniversalFileUrl } from '/models/lib/universalUrlGenerator';

class ComprehensiveBoardMigration {
  name: string;
  version: number;
  migrationSteps: string[];

  constructor() {
    this.name = 'comprehensive-board-migration';
    this.version = 1;
    this.migrationSteps = [
      'analyze_board_structure',
      'fix_orphaned_cards',
      'convert_shared_lists',
      'ensure_per_swimlane_lists',
      'validate_migration'
    ];
  }

  /**
   * Check if migration is needed for a board
   */
  async needsMigration(boardId: string) {
    try {
      const board = await ReactiveCache.getBoard(boardId);
      if (!board) return false;

      // Check if board has already been processed
      if (board.comprehensiveMigrationCompleted) {
        return false;
      }

      // Check for various issues that need migration
      const issues = await this.detectMigrationIssues(boardId);
      return issues.length > 0;

    } catch (error) {
      console.error('Error checking if migration is needed:', error);
      return false;
    }
  }

  /**
   * Detect all migration issues in a board
   */
  async detectMigrationIssues(boardId: string) {
    const issues: MigrationIssue[] = [];

    try {
      const cards = await ReactiveCache.getCards({ boardId });
      const lists = await ReactiveCache.getLists({ boardId });
      const swimlanes = await ReactiveCache.getSwimlanes({ boardId });

      // Issue 1: Cards with missing swimlaneId
      const cardsWithoutSwimlane = cards.filter((card: any) => !card.swimlaneId);
      if (cardsWithoutSwimlane.length > 0) {
        issues.push({
          type: 'cards_without_swimlane',
          count: cardsWithoutSwimlane.length,
          description: `${cardsWithoutSwimlane.length} cards missing swimlaneId`
        });
      }

      // Issue 2: Cards with missing listId
      const cardsWithoutList = cards.filter((card: any) => !card.listId);
      if (cardsWithoutList.length > 0) {
        issues.push({
          type: 'cards_without_list',
          count: cardsWithoutList.length,
          description: `${cardsWithoutList.length} cards missing listId`
        });
      }

      // Issue 3: Lists without swimlaneId (shared lists)
      const sharedLists = lists.filter((list: any) => !list.swimlaneId || list.swimlaneId === '');
      if (sharedLists.length > 0) {
        issues.push({
          type: 'shared_lists',
          count: sharedLists.length,
          description: `${sharedLists.length} lists without swimlaneId (shared lists)`
        });
      }

      // Issue 4: Cards with mismatched listId/swimlaneId
      const listSwimlaneMap = new Map();
      lists.forEach((list: any) => {
        listSwimlaneMap.set(list._id, list.swimlaneId || '');
      });

      const mismatchedCards = cards.filter((card: any) => {
        if (!card.listId || !card.swimlaneId) return false;
        const listSwimlaneId = listSwimlaneMap.get(card.listId);
        return listSwimlaneId && listSwimlaneId !== card.swimlaneId;
      });

      if (mismatchedCards.length > 0) {
        issues.push({
          type: 'mismatched_cards',
          count: mismatchedCards.length,
          description: `${mismatchedCards.length} cards with mismatched listId/swimlaneId`
        });
      }

      // Issue 5: Empty lists (lists with no cards)
      const emptyLists = lists.filter((list: any) => {
        const listCards = cards.filter((card: any) => card.listId === list._id);
        return listCards.length === 0;
      });

      if (emptyLists.length > 0) {
        issues.push({
          type: 'empty_lists',
          count: emptyLists.length,
          description: `${emptyLists.length} empty lists (no cards)`
        });
      }

    } catch (error) {
      console.error('Error detecting migration issues:', error);
      issues.push({
        type: 'detection_error',
        count: 1,
        description: `Error detecting issues: ${error.message}`
      });
    }

    return issues;
  }

  /**
   * Execute the comprehensive migration for a board
   */
  async executeMigration(boardId: string, progressCallback: ExecuteProgressCallback | null = null) {
    try {
      if (process.env.DEBUG === 'true') {
        console.log(`Starting comprehensive board migration for board ${boardId}`);
      }

      const board = await ReactiveCache.getBoard(boardId);
      if (!board) {
        throw new Error(`Board ${boardId} not found`);
      }

      const results: ComprehensiveMigrationResults = {
        boardId,
        steps: {},
        totalCardsProcessed: 0,
        totalListsProcessed: 0,
        totalListsCreated: 0,
        errors: []
      };

      const totalSteps = this.migrationSteps.length;
      let currentStep = 0;

      // Helper function to update progress
      const updateProgress = (stepName: string, stepProgress: number, stepStatus: string, stepDetails: MigrationProgressStepDetails | null = null) => {
        currentStep++;
        const overallProgress = Math.round((currentStep / totalSteps) * 100);

        const progressData = {
          overallProgress,
          currentStep: currentStep,
          totalSteps,
          stepName,
          stepProgress,
          stepStatus,
          stepDetails,
          boardId
        };

        if (progressCallback) {
          progressCallback(progressData);
        }

        if (process.env.DEBUG === 'true') {
          console.log(`Migration Progress: ${stepName} - ${stepStatus} (${stepProgress}%)`);
        }
      };

      // Step 1: Analyze board structure
      updateProgress('analyze_board_structure', 0, 'Starting analysis...');
      results.steps.analyze = await this.analyzeBoardStructure(boardId);
      updateProgress('analyze_board_structure', 100, 'Analysis complete', {
        issuesFound: results.steps.analyze.issueCount,
        needsMigration: results.steps.analyze.needsMigration
      });

      // Step 2: Fix orphaned cards
      updateProgress('fix_orphaned_cards', 0, 'Fixing orphaned cards...');
      results.steps.fixOrphanedCards = await this.fixOrphanedCards(boardId, (progress, status) => {
        updateProgress('fix_orphaned_cards', progress, status);
      });
      results.totalCardsProcessed += results.steps.fixOrphanedCards.cardsFixed || 0;
      updateProgress('fix_orphaned_cards', 100, 'Orphaned cards fixed', {
        cardsFixed: results.steps.fixOrphanedCards.cardsFixed
      });

      // Step 3: Convert shared lists to per-swimlane lists
      updateProgress('convert_shared_lists', 0, 'Converting shared lists...');
      results.steps.convertSharedLists = await this.convertSharedListsToPerSwimlane(boardId, (progress, status) => {
        updateProgress('convert_shared_lists', progress, status);
      });
      results.totalListsProcessed += results.steps.convertSharedLists.listsProcessed || 0;
      results.totalListsCreated += results.steps.convertSharedLists.listsCreated || 0;
      updateProgress('convert_shared_lists', 100, 'Shared lists converted', {
        listsProcessed: results.steps.convertSharedLists.listsProcessed,
        listsCreated: results.steps.convertSharedLists.listsCreated
      });

      // Step 4: Ensure all lists are per-swimlane
      updateProgress('ensure_per_swimlane_lists', 0, 'Ensuring per-swimlane structure...');
      results.steps.ensurePerSwimlane = await this.ensurePerSwimlaneLists(boardId);
      results.totalListsProcessed += results.steps.ensurePerSwimlane.listsProcessed || 0;
      updateProgress('ensure_per_swimlane_lists', 100, 'Per-swimlane structure ensured', {
        listsProcessed: results.steps.ensurePerSwimlane.listsProcessed
      });

      // Step 5: Validate migration
      updateProgress('validate_migration', 0, 'Validating migration...');
      results.steps.validate = await this.validateMigration(boardId);
      updateProgress('validate_migration', 100, 'Migration validated', {
        migrationSuccessful: results.steps.validate.migrationSuccessful,
        totalCards: results.steps.validate.totalCards,
        totalLists: results.steps.validate.totalLists
      });

      // Step 6: Fix avatar URLs
      updateProgress('fix_avatar_urls', 0, 'Fixing avatar URLs...');
      results.steps.fixAvatarUrls = await this.fixAvatarUrls();
      updateProgress('fix_avatar_urls', 100, 'Avatar URLs fixed', {
        avatarsFixed: results.steps.fixAvatarUrls.avatarsFixed
      });

      // Step 8: Fix attachment URLs
      updateProgress('fix_attachment_urls', 0, 'Fixing attachment URLs...');
      results.steps.fixAttachmentUrls = await this.fixAttachmentUrls();
      updateProgress('fix_attachment_urls', 100, 'Attachment URLs fixed', {
        attachmentsFixed: results.steps.fixAttachmentUrls.attachmentsFixed
      });

      // Mark board as processed
      await Boards.updateAsync(boardId, {
        $set: {
          comprehensiveMigrationCompleted: true,
          comprehensiveMigrationCompletedAt: new Date(),
          comprehensiveMigrationResults: results
        }
      });

      if (process.env.DEBUG === 'true') {
        console.log(`Comprehensive board migration completed for board ${boardId}:`, results);
      }

      return {
        success: true,
        results
      };

    } catch (error) {
      console.error(`Error executing comprehensive migration for board ${boardId}:`, error);
      throw error;
    }
  }

  /**
   * Step 1: Analyze board structure
   */
  async analyzeBoardStructure(boardId: string) {
    const issues = await this.detectMigrationIssues(boardId);
    return {
      issues,
      issueCount: issues.length,
      needsMigration: issues.length > 0
    };
  }

  /**
   * Step 2: Fix orphaned cards (cards with missing swimlaneId or listId)
   */
  async fixOrphanedCards(boardId: string, progressCallback: StepProgressCallback | null = null) {
    const cards = await ReactiveCache.getCards({ boardId });
    const swimlanes = await ReactiveCache.getSwimlanes({ boardId });
    const lists = await ReactiveCache.getLists({ boardId });

    let cardsFixed = 0;
    const defaultSwimlane = swimlanes.find((s: any) => s.title === 'Default') || swimlanes[0];
    const totalCards = cards.length;

    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      let needsUpdate = false;
      const updates: OrphanedCardUpdates = {};

      // Fix missing swimlaneId
      if (!card.swimlaneId) {
        updates.swimlaneId = defaultSwimlane._id;
        needsUpdate = true;
      }

      // Fix missing listId
      if (!card.listId) {
        // Find or create a default list for this swimlane
        const swimlaneId = updates.swimlaneId || card.swimlaneId;
        let defaultList = lists.find((list: any) =>
          list.swimlaneId === swimlaneId && list.title === 'Default'
        );

        if (!defaultList) {
          // Create a default list for this swimlane
          const newListId = await Lists.insertAsync({
            title: 'Default',
            boardId: boardId,
            swimlaneId: swimlaneId,
            sort: 0,
            archived: false,
            createdAt: new Date(),
            modifiedAt: new Date(),
            type: 'list'
          });
          defaultList = { _id: newListId };
        }

        updates.listId = defaultList._id;
        needsUpdate = true;
      }

      if (needsUpdate) {
        await Cards.updateAsync(card._id, {
          $set: {
            ...updates,
            modifiedAt: new Date()
          }
        });
        cardsFixed++;
      }

      // Update progress
      if (progressCallback && (i % 10 === 0 || i === totalCards - 1)) {
        const progress = Math.round(((i + 1) / totalCards) * 100);
        progressCallback(progress, `Processing card ${i + 1} of ${totalCards}...`);
      }
    }

    return { cardsFixed };
  }

  /**
   * Step 3: Convert shared lists to per-swimlane lists
   */
  async convertSharedListsToPerSwimlane(boardId: string, progressCallback: StepProgressCallback | null = null) {
    const cards = await ReactiveCache.getCards({ boardId });
    const lists = await ReactiveCache.getLists({ boardId });
    const swimlanes = await ReactiveCache.getSwimlanes({ boardId });

    let listsProcessed = 0;
    let listsCreated = 0;

    // Group cards by swimlaneId
    const cardsBySwimlane = new Map();
    cards.forEach((card: any) => {
      if (!cardsBySwimlane.has(card.swimlaneId)) {
        cardsBySwimlane.set(card.swimlaneId, []);
      }
      cardsBySwimlane.get(card.swimlaneId).push(card);
    });

    const swimlaneEntries = Array.from(cardsBySwimlane.entries());
    const totalSwimlanes = swimlaneEntries.length;

    // Process each swimlane
    for (let i = 0; i < swimlaneEntries.length; i++) {
      const [swimlaneId, swimlaneCards] = swimlaneEntries[i];
      if (!swimlaneId) continue;

      if (progressCallback) {
        const progress = Math.round(((i + 1) / totalSwimlanes) * 100);
        progressCallback(progress, `Processing swimlane ${i + 1} of ${totalSwimlanes}...`);
      }

      // Get existing lists for this swimlane
      const existingLists = lists.filter((list: any) => list.swimlaneId === swimlaneId);
      const existingListTitles = new Set(existingLists.map((list: any) => list.title));

      // Group cards by their current listId
      const cardsByListId = new Map();
      swimlaneCards.forEach((card: any) => {
        if (!cardsByListId.has(card.listId)) {
          cardsByListId.set(card.listId, []);
        }
        cardsByListId.get(card.listId).push(card);
      });

      // For each listId used by cards in this swimlane
      for (const [listId, cardsInList] of cardsByListId) {
        const originalList = lists.find((l: any) => l._id === listId);
        if (!originalList) continue;

        // Check if this list's swimlaneId matches the card's swimlaneId
        if (originalList.swimlaneId === swimlaneId) {
          // List is already correctly assigned to this swimlane
          listsProcessed++;
          continue;
        }

        // Check if we already have a list with the same title in this swimlane
        let targetList = existingLists.find((list: any) => list.title === originalList.title);

        if (!targetList) {
          // Create a new list for this swimlane
          const newListData: PerSwimlaneListData = {
            title: originalList.title,
            boardId: boardId,
            swimlaneId: swimlaneId,
            sort: originalList.sort || 0,
            archived: originalList.archived || false,
            createdAt: new Date(),
            modifiedAt: new Date(),
            type: originalList.type || 'list'
          };

          // Copy other properties if they exist
          if (originalList.color) newListData.color = originalList.color;
          if (originalList.wipLimit) newListData.wipLimit = originalList.wipLimit;
          if (originalList.wipLimitEnabled) newListData.wipLimitEnabled = originalList.wipLimitEnabled;
          if (originalList.wipLimitSoft) newListData.wipLimitSoft = originalList.wipLimitSoft;
          if (originalList.starred) newListData.starred = originalList.starred;
          if (originalList.collapsed) newListData.collapsed = originalList.collapsed;

          // Insert the new list
          const newListId = await Lists.insertAsync(newListData);
          targetList = { _id: newListId, ...newListData };
          listsCreated++;
        }

        // Update all cards in this group to use the correct listId
        for (const card of cardsInList) {
          await Cards.updateAsync(card._id, {
            $set: {
              listId: targetList._id,
              modifiedAt: new Date()
            }
          });
        }

        listsProcessed++;
      }
    }

    return { listsProcessed, listsCreated };
  }

  /**
   * Step 4: Ensure all lists are per-swimlane
   */
  async ensurePerSwimlaneLists(boardId: string) {
    const lists = await ReactiveCache.getLists({ boardId });
    const swimlanes = await ReactiveCache.getSwimlanes({ boardId });
    const defaultSwimlane = swimlanes.find((s: any) => s.title === 'Default') || swimlanes[0];

    let listsProcessed = 0;

    for (const list of lists) {
      if (!list.swimlaneId || list.swimlaneId === '') {
        // Assign to default swimlane
        await Lists.updateAsync(list._id, {
          $set: {
            swimlaneId: defaultSwimlane._id,
            modifiedAt: new Date()
          }
        });
        listsProcessed++;
      }
    }

    return { listsProcessed };
  }

  /**
   * Step 5: Cleanup empty lists (lists with no cards)
   */
  async cleanupEmptyLists(boardId: string) {
    const lists = await ReactiveCache.getLists({ boardId });
    const cards = await ReactiveCache.getCards({ boardId });

    let listsRemoved = 0;

    for (const list of lists) {
      const listCards = cards.filter((card: any) => card.listId === list._id);

      if (listCards.length === 0) {
        // Remove empty list
        await Lists.removeAsync(list._id);
        listsRemoved++;

        if (process.env.DEBUG === 'true') {
          console.log(`Removed empty list: ${list.title} (${list._id})`);
        }
      }
    }

    return { listsRemoved };
  }

  /**
   * Step 6: Validate migration
   */
  async validateMigration(boardId: string) {
    const issues = await this.detectMigrationIssues(boardId);
    const cards = await ReactiveCache.getCards({ boardId });
    const lists = await ReactiveCache.getLists({ boardId });

    // Check that all cards have valid swimlaneId and listId
    const validCards = cards.filter((card: any) => card.swimlaneId && card.listId);
    const invalidCards = cards.length - validCards.length;

    // Check that all lists have swimlaneId
    const validLists = lists.filter((list: any) => list.swimlaneId && list.swimlaneId !== '');
    const invalidLists = lists.length - validLists.length;

    return {
      issuesRemaining: issues.length,
      totalCards: cards.length,
      validCards,
      invalidCards,
      totalLists: lists.length,
      validLists,
      invalidLists,
      migrationSuccessful: issues.length === 0 && invalidCards === 0 && invalidLists === 0
    };
  }

  /**
   * Step 7: Fix avatar URLs (remove problematic auth parameters and fix URL formats)
   */
  async fixAvatarUrls() {
    const users = await ReactiveCache.getUsers({});
    let avatarsFixed = 0;

    for (const user of users) {
      if (user.profile && user.profile.avatarUrl) {
        const avatarUrl = user.profile.avatarUrl;
        let needsUpdate = false;
        let cleanUrl = avatarUrl;

        // Check if URL has problematic parameters
        if (avatarUrl.includes('auth=false') || avatarUrl.includes('brokenIsFine=true')) {
          // Remove problematic parameters
          cleanUrl = cleanUrl.replace(/[?&]auth=false/g, '');
          cleanUrl = cleanUrl.replace(/[?&]brokenIsFine=true/g, '');
          cleanUrl = cleanUrl.replace(/\?&/g, '?');
          cleanUrl = cleanUrl.replace(/\?$/g, '');
          needsUpdate = true;
        }

        // Check if URL is using old CollectionFS format
        if (avatarUrl.includes('/cfs/files/avatars/')) {
          cleanUrl = cleanUrl.replace('/cfs/files/avatars/', '/cdn/storage/avatars/');
          needsUpdate = true;
        }

        // Check if URL is missing the /cdn/storage/avatars/ prefix
        if (avatarUrl.includes('avatars/') && !avatarUrl.includes('/cdn/storage/avatars/') && !avatarUrl.includes('/cfs/files/avatars/')) {
          // This might be a relative URL, make it absolute
          if (!avatarUrl.startsWith('http') && !avatarUrl.startsWith('/')) {
            cleanUrl = `/cdn/storage/avatars/${avatarUrl}`;
            needsUpdate = true;
          }
        }

        if (needsUpdate) {
          // Update user's avatar URL
          await Users.updateAsync(user._id, {
            $set: {
              'profile.avatarUrl': cleanUrl,
              modifiedAt: new Date()
            }
          });

          avatarsFixed++;
        }
      }
    }

    return { avatarsFixed };
  }

  /**
   * Step 8: Fix attachment URLs (remove problematic auth parameters and fix URL formats)
   */
  async fixAttachmentUrls() {
    const attachments = await ReactiveCache.getAttachments({});
    let attachmentsFixed = 0;

    for (const attachment of attachments) {
      // Check if attachment has URL field that needs fixing
      if (attachment.url) {
        const attachmentUrl = attachment.url;
        let needsUpdate = false;
        let cleanUrl = attachmentUrl;

        // Check if URL has problematic parameters
        if (attachmentUrl.includes('auth=false') || attachmentUrl.includes('brokenIsFine=true')) {
          // Remove problematic parameters
          cleanUrl = cleanUrl.replace(/[?&]auth=false/g, '');
          cleanUrl = cleanUrl.replace(/[?&]brokenIsFine=true/g, '');
          cleanUrl = cleanUrl.replace(/\?&/g, '?');
          cleanUrl = cleanUrl.replace(/\?$/g, '');
          needsUpdate = true;
        }

        // Check if URL is using old CollectionFS format
        if (attachmentUrl.includes('/cfs/files/attachments/')) {
          cleanUrl = cleanUrl.replace('/cfs/files/attachments/', '/cdn/storage/attachments/');
          needsUpdate = true;
        }

        // Check if URL has /original/ path that should be removed
        if (attachmentUrl.includes('/original/')) {
          cleanUrl = cleanUrl.replace(/\/original\/[^\/\?#]+/, '');
          needsUpdate = true;
        }

        // If we have a file ID, generate a universal URL
        const fileId = attachment._id;
        if (fileId && !isUniversalFileUrl(cleanUrl, 'attachment')) {
          cleanUrl = generateUniversalAttachmentUrl(fileId);
          needsUpdate = true;
        }

        if (needsUpdate) {
          // Update attachment URL
          await Attachments.updateAsync(attachment._id, {
            $set: {
              url: cleanUrl,
              modifiedAt: new Date()
            }
          });

          attachmentsFixed++;
        }
      }
    }

    return { attachmentsFixed };
  }

  /**
   * Get migration status for a board
   */
  async getMigrationStatus(boardId: string) {
    try {
      const board = await ReactiveCache.getBoard(boardId);
      if (!board) {
        return { status: 'board_not_found' };
      }

      if (board.comprehensiveMigrationCompleted) {
        return {
          status: 'completed',
          completedAt: board.comprehensiveMigrationCompletedAt,
          results: board.comprehensiveMigrationResults
        };
      }

      const needsMigration = await this.needsMigration(boardId);
      const issues = await this.detectMigrationIssues(boardId);

      return {
        status: needsMigration ? 'needed' : 'not_needed',
        issues,
        issueCount: issues.length
      };

    } catch (error) {
      console.error('Error getting migration status:', error);
      return { status: 'error', error: error.message };
    }
  }
}

// Export singleton instance
export const comprehensiveBoardMigration = new ComprehensiveBoardMigration();

// Meteor methods
Meteor.methods({
  async 'comprehensiveBoardMigration.check'(boardId: string) {
    check(boardId, String);

    if (!this.userId) {
      throw new Meteor.Error('not-authorized');
    }

    return await comprehensiveBoardMigration.getMigrationStatus(boardId);
  },

  async 'comprehensiveBoardMigration.execute'(boardId: string) {
    check(boardId, String);

    if (!this.userId) {
      throw new Meteor.Error('not-authorized');
    }

    const user = await ReactiveCache.getUser(this.userId);
    const board = await ReactiveCache.getBoard(boardId);
    if (!board) {
      throw new Meteor.Error('board-not-found');
    }

    const isBoardAdmin = board.hasAdmin(this.userId);
    const isInstanceAdmin = user && user.isAdmin;

    if (!isBoardAdmin && !isInstanceAdmin) {
      throw new Meteor.Error('not-authorized', 'You must be a board admin or instance admin to perform this action.');
    }

    return await comprehensiveBoardMigration.executeMigration(boardId);
  },

  async 'comprehensiveBoardMigration.needsMigration'(boardId: string) {
    check(boardId, String);

    if (!this.userId) {
      throw new Meteor.Error('not-authorized');
    }

    return await comprehensiveBoardMigration.needsMigration(boardId);
  },

  async 'comprehensiveBoardMigration.detectIssues'(boardId: string) {
    check(boardId, String);

    if (!this.userId) {
      throw new Meteor.Error('not-authorized');
    }

    return await comprehensiveBoardMigration.detectMigrationIssues(boardId);
  },

  async 'comprehensiveBoardMigration.fixAvatarUrls'() {
    if (!this.userId) {
      throw new Meteor.Error('not-authorized');
    }

    const user = await ReactiveCache.getUser(this.userId);
    if (!user || !user.isAdmin) {
      throw new Meteor.Error('not-authorized', 'Only instance admins can perform this action.');
    }

    return await comprehensiveBoardMigration.fixAvatarUrls();
  },

  async 'comprehensiveBoardMigration.fixAttachmentUrls'() {
    if (!this.userId) {
      throw new Meteor.Error('not-authorized');
    }

    const user = await ReactiveCache.getUser(this.userId);
    if (!user || !user.isAdmin) {
      throw new Meteor.Error('not-authorized', 'Only instance admins can perform this action.');
    }

    return await comprehensiveBoardMigration.fixAttachmentUrls();
  }
});

interface MigrationIssue {
  type: string;
  count: number;
  description: string;
}

type ExecuteProgressCallback = (progress: MigrationProgressData) => void;
type StepProgressCallback = (progress: number, status: string) => void;

interface MigrationProgressStepDetails {
  issuesFound?: number;
  needsMigration?: boolean;
  cardsFixed?: number;
  listsProcessed?: number;
  listsCreated?: number;
  migrationSuccessful?: boolean;
  totalCards?: number;
  totalLists?: number;
  avatarsFixed?: number;
  attachmentsFixed?: number;
}

interface MigrationProgressData {
  overallProgress: number;
  currentStep: number;
  totalSteps: number;
  stepName: string;
  stepProgress: number;
  stepStatus: string;
  stepDetails: MigrationProgressStepDetails | null;
  boardId: string;
}

interface OrphanedCardUpdates {
  swimlaneId?: string;
  listId?: string;
}

interface PerSwimlaneListData {
  title: string;
  boardId: string;
  swimlaneId: string;
  sort: number;
  archived: boolean;
  createdAt: Date;
  modifiedAt: Date;
  type: string;
  color?: string;
  wipLimit?: number;
  wipLimitEnabled?: boolean;
  wipLimitSoft?: boolean;
  starred?: boolean;
  collapsed?: boolean;
}

interface ComprehensiveMigrationSteps {
  analyze?: Awaited<ReturnType<ComprehensiveBoardMigration['analyzeBoardStructure']>>;
  fixOrphanedCards?: Awaited<ReturnType<ComprehensiveBoardMigration['fixOrphanedCards']>>;
  convertSharedLists?: Awaited<ReturnType<ComprehensiveBoardMigration['convertSharedListsToPerSwimlane']>>;
  ensurePerSwimlane?: Awaited<ReturnType<ComprehensiveBoardMigration['ensurePerSwimlaneLists']>>;
  validate?: Awaited<ReturnType<ComprehensiveBoardMigration['validateMigration']>>;
  fixAvatarUrls?: Awaited<ReturnType<ComprehensiveBoardMigration['fixAvatarUrls']>>;
  fixAttachmentUrls?: Awaited<ReturnType<ComprehensiveBoardMigration['fixAttachmentUrls']>>;
}

interface ComprehensiveMigrationResults {
  boardId: string;
  steps: ComprehensiveMigrationSteps;
  totalCardsProcessed: number;
  totalListsProcessed: number;
  totalListsCreated: number;
  errors: string[];
}
