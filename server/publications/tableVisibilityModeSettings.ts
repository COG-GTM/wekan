import { Meteor } from 'meteor/meteor';
import Settings from '../../models/settings';
import TableVisibilityModeSettings from '/models/tableVisibilityModeSettings';

Meteor.publish('tableVisibilityModeSettings', function() {
  const ret = TableVisibilityModeSettings.find();
  return ret;
});
