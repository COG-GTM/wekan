/* eslint-env mocha */
import { expect } from 'chai';
import { Random } from 'meteor/random';
import { canUpdateBoardSort } from '../utils';

// Unit tests for canUpdateBoardSort policy

describe('boards security', function() {
  describe(canUpdateBoardSort.name, function() {
    it('denies anonymous updates even if fieldNames include sort', function() {
      const userId = null;
      const board = {
        hasMember: (): boolean => true,
      } as Parameters<typeof canUpdateBoardSort>[1];
      const fieldNames = ['sort'];

      expect(canUpdateBoardSort(userId, board, fieldNames)).to.equal(false);
    });

    it('denies updates by non-members', function() {
      const userId = Random.id();
      const board = {
        hasMember: (id: string): boolean => id === 'someone-else',
      } as Parameters<typeof canUpdateBoardSort>[1];
      const fieldNames = ['sort'];

      expect(canUpdateBoardSort(userId, board, fieldNames)).to.equal(false);
    });

    it('allows updates when user is a member and updating sort', function() {
      const userId = Random.id();
      const board = {
        hasMember: (id: string) => id === userId,
      } as Parameters<typeof canUpdateBoardSort>[1];
      const fieldNames = ['sort'];

      expect(canUpdateBoardSort(userId, board, fieldNames)).to.equal(true);
    });

    it('denies updates when not updating sort', function() {
      const userId = Random.id();
      const board = {
        hasMember: (id: string) => id === userId,
      } as Parameters<typeof canUpdateBoardSort>[1];
      const fieldNames = ['title'];

      expect(canUpdateBoardSort(userId, board, fieldNames)).to.equal(false);
    });
  });
});
