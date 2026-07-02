import { Meteor } from 'meteor/meteor';

Meteor.startup(() => {
  if (process.env.SAML_PROVIDER !== '') {
    Meteor.settings.public.SAML_PROVIDER = process.env.SAML_PROVIDER;
  }
});
