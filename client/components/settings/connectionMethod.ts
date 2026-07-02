import { Meteor } from 'meteor/meteor';
import { Template } from 'meteor/templating';
import { Blaze } from 'meteor/blaze';
import { ReactiveVar } from 'meteor/reactive-var';

Template.connectionMethod.onCreated(function(this: ConnectionMethodInstance) {
  this.authenticationMethods = new ReactiveVar([]);

  // _/result: any — untyped Meteor method callback; result maps method -> enabled.
  Meteor.call('getAuthenticationsEnabled', (_: any, result: any) => {
    if (result) {
      // Only enabled auth methods without OAuth2/OpenID which is a separate button
      const tmp = Object.keys(result).filter((k) => result[k]).filter((k) => k !== 'oauth2');

      // TODO : add a management of different languages
      // (ex {value: ldap, text: TAPi18n.__('ldap', {}, T9n.getLanguage() || 'en')})
      this.authenticationMethods.set([{ value: 'password' }].concat(tmp.map((k) => { return { value: k }; })));
    }

    // If only the default authentication available, hides the select boxe
    const content = $('.at-form-authentication');

    if (this.authenticationMethods.get().length > 1) {
      content.show();
    } else {
      content.hide();
    }
  });
});

Template.connectionMethod.onRendered(() => {
  // Moves the select boxe in the first place of the at-pwd-form div
  $('.at-form-authentication')
    .detach()
    .prependTo('.at-pwd-form');
});

Template.connectionMethod.helpers({
  authentications() {
    return (Template.instance() as ConnectionMethodInstance).authenticationMethods.get();
  },
  isSelected(match: any) {
    // data: any — the template data context carries authenticationMethod.
    return (Template.instance().data as any).authenticationMethod === match;
  },
});

// connectionMethod instance: the list of enabled authentication methods.
interface ConnectionMethodInstance extends Blaze.TemplateInstance {
  authenticationMethods: ReactiveVar<any>;
}
