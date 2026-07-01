/* eslint-env mocha */
import { Random } from 'meteor/random';
import { expect } from 'chai';
import sinon from 'sinon';
import Boards from '/models/boards';
import {
  allowIsBoardAdmin,
  allowIsBoardMember,
  allowIsAnyBoardMember,
  allowIsBoardMemberCommentOnly,
  allowIsBoardMemberNoComments,
  allowIsBoardMemberByCard,
} from '../utils';

describe('utils', function() {
  afterEach(function() {
    sinon.restore();
  });

  describe(allowIsBoardAdmin.name, function() {
    it('returns if a board has an admin', function() {
      const userId = Random.id();
      const board = {
        hasAdmin: (id: string) => {
          return id === userId;
        }
      };

      expect(allowIsBoardAdmin(userId, board)).to.equal(true);
      expect(allowIsBoardAdmin(Random.id(), board)).to.equal(false);
    });
  });

  describe(allowIsBoardMember.name, function() {
    it('returns if a board has a member', function() {
      const userId = Random.id();
      const board = {
        hasMember: (id: string) => {
          return id === userId;
        }
      };

      expect(allowIsBoardMember(userId, board)).to.equal(true);
      expect(allowIsBoardMember(Random.id(), board)).to.equal(false);
    });
  });

  describe(allowIsAnyBoardMember.name, function() {
    it('returns if any board has a member', function() {
      const userId = Random.id();
      const boardsExpectedTrue = [{
        hasMember: (id: string) => {
          return id === userId;
        }
      }];

      expect(allowIsAnyBoardMember(userId, boardsExpectedTrue)).to.equal(true);
      expect(allowIsAnyBoardMember(Random.id(), boardsExpectedTrue)).to.equal(false);

      const boardsExpectedFalse = [{
        hasMember: () => false
      }];

      expect(allowIsAnyBoardMember(userId, boardsExpectedFalse)).to.equal(false);
      expect(allowIsAnyBoardMember(Random.id(), boardsExpectedFalse)).to.equal(false);
    });
  });

  describe(allowIsBoardMemberCommentOnly.name, function() {
    it('returns if a board has a member that can post comments', function() {
      const userId = Random.id();
      const board = {
        hasMember: (id: string) => id === userId,
        hasReadOnly: () => false,
        hasReadAssignedOnly: () => false,
        hasNoComments: () => false,
      };

      expect(allowIsBoardMemberCommentOnly(userId, board)).to.equal(true);
      expect(allowIsBoardMemberCommentOnly(Random.id(), board)).to.equal(false);
    });
  });

  describe(allowIsBoardMemberNoComments.name, function() {
    it('returns if a board has a member that has comment any comments', function() {
      const userId = Random.id();
      const board = {
        hasMember: (id: string) => {
          return id === userId;
        },
        hasNoComments: (id: string) => {
          return id !== userId;
        }
      };

      expect(allowIsBoardMemberNoComments(userId, board)).to.equal(true);
      expect(allowIsBoardMemberNoComments(Random.id(), board)).to.equal(false);
    });
  });

  describe(allowIsBoardMemberByCard.name, function() {
    it('returns if the board for a given card has a member', async function() {
      const userId = Random.id();
      const board = {
        hasMember: (id: string) => id === userId,
      };
      const card = { boardId: 'board1' };
      // Minimal board stub: only hasMember is exercised, so it is asserted onto
      // the findOneAsync result type which the fake intentionally does not fill.
      sinon.stub(Boards, 'findOneAsync').resolves(board as never);

      expect(await allowIsBoardMemberByCard(userId, card)).to.equal(true);
      expect(await allowIsBoardMemberByCard(Random.id(), card)).to.equal(false);
    });
  });
});
