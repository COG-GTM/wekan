import { Meteor } from 'meteor/meteor';
import { Template } from 'meteor/templating';
import { ReactiveCache } from '/imports/reactiveCache';

Template.invitationCode.onRendered(function() {
  Meteor.subscribe('setting', {
    // this: any — the subscription handle passed as onReady's `this`.
    onReady(this: any) {
      const setting = ReactiveCache.getCurrentSetting();

      if (!setting || !setting.disableRegistration) {
        $('#invitationcode').hide();
      }

      return this.stop();
    },
  });
});
