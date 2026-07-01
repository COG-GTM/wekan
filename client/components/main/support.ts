import { Meteor } from 'meteor/meteor';
import { Template } from 'meteor/templating';
import { ReactiveVar } from 'meteor/reactive-var';
import { ReactiveCache } from '/imports/reactiveCache';
import { TAPi18n } from '/imports/i18n';

// Shared helpers for both support templates
const supportHelpers = {
  supportTitle() {
    const setting = ReactiveCache.getCurrentSetting();
    return setting && setting.supportTitle ? setting.supportTitle : TAPi18n.__('support');
  },
  supportContent() {
    const setting = ReactiveCache.getCurrentSetting();
    return setting && setting.supportPageText ? setting.supportPageText : TAPi18n.__('support-info-not-added-yet');
  },
  isSupportEnabled() {
    const setting = ReactiveCache.getCurrentSetting();
    return setting && setting.supportPageEnabled;
  },
  isSupportPublic() {
    const setting = ReactiveCache.getCurrentSetting();
    return setting && setting.supportPagePublic;
  }
};

// Main support page component
// this: any — the error/loading reactive vars set here are only consumed by the
// .jade template, so no typed instance shape is needed.
Template.support.onCreated(function (this: any) {
  this.error = new ReactiveVar('');
  this.loading = new ReactiveVar(false);

  Meteor.subscribe('setting');
});

Template.support.helpers(supportHelpers);

// Header bar component
Template.supportHeaderBar.onCreated(function () {
  Meteor.subscribe('setting');
});

Template.supportHeaderBar.helpers(supportHelpers);
