import { Meteor } from 'meteor/meteor';
import AccessibilitySettings from '/models/accessibilitySettings';

Meteor.publish('accessibilitySettings', function() {
  return AccessibilitySettings.find({});
});
