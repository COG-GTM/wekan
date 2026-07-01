import { Meteor } from 'meteor/meteor';
import { check, Match } from 'meteor/check';
import { ReactiveCache } from '/imports/reactiveCache';
import Boards from '/models/boards';
import { allowIsBoardMember, allowIsBoardMemberWithWriteAccess, BoardAccess } from '/server/lib/utils';

Meteor.methods({
  async copySwimlane(swimlaneId: string, toBoardId: string, targetSwimlaneId: string | null | undefined = null, position: string = 'below', title: string | null | undefined = '') {
    check(swimlaneId, String);
    check(toBoardId, String);
    check(targetSwimlaneId, Match.OneOf(String, null, undefined));
    check(position, Match.OneOf('above', 'below'));
    check(title, Match.OneOf(String, null, undefined));

    if (!this.userId) throw new Meteor.Error('not-authorized');
    const swimlane = await ReactiveCache.getSwimlane(swimlaneId);
    if (!swimlane) throw new Meteor.Error('not-found');
    // Boards.findOneAsync returns a plain Mongo document; cast to the
    // BoardAccess shape (the model attaches the access-check methods at runtime).
    const sourceBoard = await Boards.findOneAsync(swimlane.boardId) as BoardAccess | undefined;
    if (!allowIsBoardMember(this.userId, sourceBoard))
      throw new Meteor.Error('not-authorized');
    const toBoard = await ReactiveCache.getBoard(toBoardId);
    if (!toBoard) throw new Meteor.Error('not-found');
    if (!allowIsBoardMemberWithWriteAccess(this.userId, toBoard))
      throw new Meteor.Error('not-authorized');

    await swimlane.copy(toBoardId, targetSwimlaneId, position, title);
    return true;
  },

  async moveSwimlane(swimlaneId: string, toBoardId: string, targetSwimlaneId: string | null | undefined = null, position: string = 'below', title: string | null | undefined = '') {
    check(swimlaneId, String);
    check(toBoardId, String);
    check(targetSwimlaneId, Match.OneOf(String, null, undefined));
    check(position, Match.OneOf('above', 'below'));
    check(title, Match.OneOf(String, null, undefined));

    if (!this.userId) throw new Meteor.Error('not-authorized');
    const swimlane = await ReactiveCache.getSwimlane(swimlaneId);
    if (!swimlane) throw new Meteor.Error('not-found');
    // Boards.findOneAsync returns a plain Mongo document; cast to the
    // BoardAccess shape (the model attaches the access-check methods at runtime).
    const sourceBoard = await Boards.findOneAsync(swimlane.boardId) as BoardAccess | undefined;
    if (!allowIsBoardMember(this.userId, sourceBoard))
      throw new Meteor.Error('not-authorized');
    const toBoard = await ReactiveCache.getBoard(toBoardId);
    if (!toBoard) throw new Meteor.Error('not-found');
    if (!allowIsBoardMemberWithWriteAccess(this.userId, toBoard))
      throw new Meteor.Error('not-authorized');

    await swimlane.move(toBoardId, targetSwimlaneId, position, title);
    return true;
  },
});
