import { Meteor } from 'meteor/meteor';
import { check, Match } from 'meteor/check';
import { ReactiveCache } from '/imports/reactiveCache';

Meteor.publish('org', async function(query: MongoQuery | null, limit: number, skip: number | null | undefined = 0) {
  check(query, Match.OneOf(Object, null));
  check(limit, Number);
  check(skip, Match.OneOf(Number, null, undefined));

  let ret = [];
  const user = await ReactiveCache.getCurrentUser();

  if (user && user.isAdmin) {
    ret = await ReactiveCache.getOrgs(query as MongoQuery,
      {
        limit,
        skip: skip || 0,
        sort: { createdAt: -1 },
        fields: {
          orgDisplayName: 1,
          orgDesc: 1,
          orgShortName: 1,
          orgAutoAddUsersWithDomainName: 1,
          orgWebsite: 1,
          orgTeams: 1,
          createdAt: 1,
          orgIsActive: 1,
          orgSharedTemplates: 1,
          orgPropagateMembersToBoards: 1,
          orgSyncMembersFromAuth: 1,
        }
      },
      true,
    );
  }

  return ret;
});
