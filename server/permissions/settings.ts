import { Meteor } from 'meteor/meteor';
import Settings from '/models/settings';

Settings.allow({
  async update(userId: string) {
    const user = await Meteor.users.findOneAsync(userId);
    return user && user.isAdmin;
  },
});
