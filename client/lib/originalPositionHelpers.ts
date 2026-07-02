import { Meteor } from 'meteor/meteor';
import { Template } from 'meteor/templating';
/**
 * Helper functions for integrating original position tracking into existing Wekan templates
 */

/**
 * Add original position tracking to swimlane templates
 */
export function addOriginalPositionToSwimlane(swimlaneId: string) {
  if (!swimlaneId) return;
  
  // Track original position when swimlane is created or first accessed
  Meteor.call('positionHistory.trackSwimlane', swimlaneId, (error?: Meteor.Error | Error) => {
    if (error) {
      console.warn('Failed to track original position for swimlane:', error);
    }
  });
}

/**
 * Add original position tracking to list templates
 */
export function addOriginalPositionToList(listId: string) {
  if (!listId) return;
  
  // Track original position when list is created or first accessed
  Meteor.call('positionHistory.trackList', listId, (error?: Meteor.Error | Error) => {
    if (error) {
      console.warn('Failed to track original position for list:', error);
    }
  });
}

/**
 * Add original position tracking to card templates
 */
export function addOriginalPositionToCard(cardId: string) {
  if (!cardId) return;
  
  // Track original position when card is created or first accessed
  Meteor.call('positionHistory.trackCard', cardId, (error?: Meteor.Error | Error) => {
    if (error) {
      console.warn('Failed to track original position for card:', error);
    }
  });
}

/**
 * Get original position description for display in templates
 */
export function getOriginalPositionDescription(entityId: string, entityType: string) {
  return new Promise((resolve, reject) => {
    const methodName = `positionHistory.get${entityType.charAt(0).toUpperCase() + entityType.slice(1)}Description`;
    
    // `result` is an untyped Meteor method return value, hence `any`.
    Meteor.call(methodName, entityId, (error?: Meteor.Error | Error, result?: any) => {
      if (error) {
        reject(error);
      } else {
        resolve(result);
      }
    });
  });
}

/**
 * Check if an entity has moved from its original position
 */
export function hasEntityMoved(entityId: string, entityType: string) {
  return new Promise((resolve, reject) => {
    const methodName = `positionHistory.has${entityType.charAt(0).toUpperCase() + entityType.slice(1)}Moved`;
    
    // `result` is an untyped Meteor method return value, hence `any`.
    Meteor.call(methodName, entityId, (error?: Meteor.Error | Error, result?: any) => {
      if (error) {
        reject(error);
      } else {
        resolve(result);
      }
    });
  });
}

/**
 * Template helper for displaying original position info
 */
Template.registerHelper('originalPositionInfo', function(entityId: string, entityType: string) {
  if (!entityId || !entityType) return null;
  
  const description = getOriginalPositionDescription(entityId, entityType);
  const hasMoved = hasEntityMoved(entityId, entityType);
  
  return {
    description: description,
    hasMoved: hasMoved,
    entityId: entityId,
    entityType: entityType
  };
});

/**
 * Template helper for checking if entity has moved
 */
Template.registerHelper('hasEntityMoved', function(entityId: string, entityType: string) {
  if (!entityId || !entityType) return false;
  
  return hasEntityMoved(entityId, entityType);
});

/**
 * Template helper for getting original position description
 */
Template.registerHelper('getOriginalPositionDescription', function(entityId: string, entityType: string) {
  if (!entityId || !entityType) return 'No original position data';
  
  return getOriginalPositionDescription(entityId, entityType);
});
