import { ReactiveCache } from '/imports/reactiveCache';
import { TAPi18n } from '/imports/i18n';
import { FlowRouter } from 'meteor/ostrio:flow-router-extra';
import AccountSettings from '/models/accountSettings';
import Users from '/models/users';
import { Utils } from '/client/lib/utils';
import { Template } from 'meteor/templating';
import { Blaze } from 'meteor/blaze';

Template.headerUserBar.events({
  'click .js-open-header-member-menu': Popup.open('memberMenu'),
  'click .js-change-avatar': Popup.open('changeAvatar'),
});

Template.memberMenuPopup.onCreated(function () {
  Meteor.subscribe('setting');
});

Template.memberMenuPopup.helpers({
  isSupportPageEnabled() {
    const setting = ReactiveCache.getCurrentSetting();
    return setting && setting.supportPageEnabled;
  },
  isSameDomainNameSettingValue(){
    const currSett = ReactiveCache.getCurrentSetting();
    if(currSett && currSett != undefined && currSett.disableRegistration && currSett.mailDomainName !== undefined && currSett.mailDomainName != ""){
      const currentUser = ReactiveCache.getCurrentUser();
      if (currentUser) {
        let found = false;
        for(let i = 0; i < currentUser.emails.length; i++) {
          if(currentUser.emails[i].address.endsWith(currSett.mailDomainName)){
            found = true;
            break;
          }
        }
        return found;
      } else {
        return true;
      }
    }
    else
      return false;
  },
  isNotOAuth2AuthenticationMethod(){
    const currentUser = ReactiveCache.getCurrentUser();
    if (currentUser) {
      const method = (currentUser.authenticationMethod || '').toLowerCase();
      return method !== 'oauth2';
    } else {
      return true;
    }
  }
});

Template.memberMenuPopup.events({
  'click .js-open-bookmarks'(e: JQuery.TriggeredEvent) {
    e.preventDefault();
    if (Utils.isMiniScreen()) {
      FlowRouter.go('bookmarks');
      Popup.back();
    } else {
      Popup.open('bookmarks')(e);
    }
  },
  'click .js-my-cards'() {
    Popup.back();
  },
  'click .js-due-cards'() {
    Popup.back();
  },
  'click .js-open-archived-board'() {
    Modal.open('archivedBoards');
  },
  'click .js-invite-people': Popup.open('invitePeople'),
  'click .js-edit-profile': Popup.open('editProfile'),
  'click .js-change-settings': Popup.open('changeSettings'),
  'click .js-change-avatar': Popup.open('changeAvatar'),
  'click .js-change-password': Popup.open('changePassword'),
  'click .js-change-language': Popup.open('changeLanguage'),
  'click .js-support': Popup.open('support'),
  'click .js-notifications-drawer-toggle'() {
    Session.set('showNotificationsDrawer', !Session.get('showNotificationsDrawer'));
  },
  'click .js-toggle-grey-icons'(event: JQuery.TriggeredEvent) {
    event.preventDefault();
    const currentUser = ReactiveCache.getCurrentUser();
    if (!currentUser || !Meteor.userId()) return;
    const current = (currentUser.profile && currentUser.profile.GreyIcons) || false;
    // err: any — untyped Meteor.call rejection (Meteor.Error).
    Meteor.call('toggleGreyIcons', (err: any) => {
      if (err && process.env.DEBUG === 'true') console.error('toggleGreyIcons error', err);
    });
  },
  'click .js-logout'(event: JQuery.TriggeredEvent) {
    event.preventDefault();

    AccountsTemplates.logout();
  },
  'click .js-go-setting'() {
    Popup.back();
  },
});

Template.invitePeoplePopup.events({
  'click a.js-toggle-board-choose'(event: JQuery.TriggeredEvent){
    let target = $(event.target);
    if (!target.hasClass('js-toggle-board-choose')) {
      target = target.parent();
    }
    const checkboxId = target.attr('id');
    $(`#${checkboxId} .materialCheckBox`).toggleClass('is-checked');
    $(`#${checkboxId}`).toggleClass('is-checked');
  },
  'click button.js-email-invite'(event: JQuery.TriggeredEvent){
    const emails = ($('#email-to-invite')
      .val() as string)
      .toLowerCase()
      .trim()
      .split('\n')
      .join(',')
      .split(',');
    // boardsToInvite: any[] — jQuery .data('id') values are untyped.
    const boardsToInvite: any[] = [];
    $('.js-toggle-board-choose .materialCheckBox.is-checked').each(function() {
      boardsToInvite.push($(this).data('id'));
    });
    const validEmails: string[] = [];
    emails.forEach(email => {
      if (email && /^[a-zA-Z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/.test(email.trim())) {
        validEmails.push(email.trim());
      }
    });
    if (validEmails.length) {
      // _/rc: any — untyped Meteor method callback (Meteor.Error / return code).
      Meteor.call('sendInvitation', validEmails, boardsToInvite, (_: any, rc: any) => {
        if (rc == 0) {
          let divInfos = document.getElementById("invite-people-infos");
          if(divInfos && divInfos !== undefined){
            divInfos.innerHTML = "<span style='color: green'>" + TAPi18n.__('invite-people-success') + "</span>";
          }
        }
        else{
          let divInfos = document.getElementById("invite-people-infos");
          if(divInfos && divInfos !== undefined){
            divInfos.innerHTML = "<span style='color: red'>" + TAPi18n.__('invite-people-error') + "</span>";
          }
        }
        // Popup.close();
      });
    }
  },
});

Template.editProfilePopup.onCreated(function(this: Blaze.TemplateInstance) {
  Meteor.subscribe('setting');
  this.subscribe('accountSettings');
});

Template.editProfilePopup.helpers({
  allowEmailChange() {
    const setting = AccountSettings.findOne('accounts-allowEmailChange');
    return setting && setting.booleanValue;
  },
  allowUserNameChange() {
    const setting = AccountSettings.findOne('accounts-allowUserNameChange');
    return setting && setting.booleanValue;
  },
  allowUserDelete() {
    const setting = AccountSettings.findOne('accounts-allowUserDelete');
    return setting && setting.booleanValue;
  },
});

Template.editProfilePopup.events({
  submit(event: JQuery.TriggeredEvent, templateInstance: Blaze.TemplateInstance) {
    event.preventDefault();
    const fullname = (templateInstance.find('.js-profile-fullname') as HTMLInputElement).value.trim();
    const username = (templateInstance.find('.js-profile-username') as HTMLInputElement).value.trim();
    const initials = (templateInstance.find('.js-profile-initials') as HTMLInputElement).value.trim();
    const email = (templateInstance.find('.js-profile-email') as HTMLInputElement).value.trim();
    let isChangeUserName = false;
    let isChangeEmail = false;
    Users.update(Meteor.userId()!, {
      $set: {
        'profile.fullname': fullname,
        'profile.initials': initials,
      },
    });
    isChangeUserName = username !== ReactiveCache.getCurrentUser().username;
    isChangeEmail =
      email.toLowerCase() !== ReactiveCache.getCurrentUser().emails[0].address.toLowerCase();
    if (isChangeUserName && isChangeEmail) {
      Meteor.call(
        'setUsernameAndEmail',
        username,
        email.toLowerCase(),
        Meteor.userId(),
        // error: any — untyped Meteor.call rejection (Meteor.Error).
        function(error: any) {
          const usernameMessageElement = templateInstance.$('.username-taken');
          const emailMessageElement = templateInstance.$('.email-taken');
          if (error) {
            const errorElement = error.error;
            if (errorElement === 'username-already-taken') {
              usernameMessageElement.show();
              emailMessageElement.hide();
            } else if (errorElement === 'email-already-taken') {
              usernameMessageElement.hide();
              emailMessageElement.show();
            }
          } else {
            usernameMessageElement.hide();
            emailMessageElement.hide();
            Popup.back();
          }
        },
      );
    } else if (isChangeUserName) {
      // error: any — untyped Meteor.call rejection (Meteor.Error).
      Meteor.call('setUsername', username, Meteor.userId(), function(error: any) {
        const messageElement = templateInstance.$('.username-taken');
        if (error) {
          messageElement.show();
        } else {
          messageElement.hide();
          Popup.back();
        }
      });
    } else if (isChangeEmail) {
      // error: any — untyped Meteor.call rejection (Meteor.Error).
      Meteor.call('setEmail', email.toLowerCase(), Meteor.userId(), function(
        error: any,
      ) {
        const messageElement = templateInstance.$('.email-taken');
        if (error) {
          messageElement.show();
        } else {
          messageElement.hide();
          Popup.back();
        }
      });
    } else Popup.back();
  },
  'click #deleteButton': Popup.afterConfirm('userDelete', function() {
    Popup.back();

    // Use secure server method for self-deletion
    // error/result: any — untyped Meteor method callback (Meteor.Error / return).
    Meteor.call('removeUser', Meteor.userId(), (error: any, result: any) => {
      if (error) {
        if (process.env.DEBUG === 'true') {
          console.error('Error removing user:', error);
        }
        alert('Error deleting account: ' + error.reason);
      } else {
        if (process.env.DEBUG === 'true') {
          console.log('User deleted successfully:', result);
        }
        AccountsTemplates.logout();
      }
    });
  }),
});

// XXX For some reason the useraccounts autofocus isnt working in this case.
// See https://github.com/meteor-useraccounts/core/issues/384
Template.changePasswordPopup.onRendered(function(this: Blaze.TemplateInstance) {
  $('.at-pwd-form').show();
  this.find('#at-field-current_password').focus();
});

Template.changeLanguagePopup.helpers({
  languages() {
    return TAPi18n.getSupportedLanguages()
      .map(({ tag, name, rtl }) => ({ tag, name, rtl }))
      .sort((a, b) => {
        if (a.name === b.name) {
          return 0;
        } else {
          return a.name > b.name ? 1 : -1;
        }
      });
  },

  isCurrentLanguage(this: any) {
    return this.tag === TAPi18n.getLanguage();
  },

  languageFlag(this: any) {
    const flagMap: Record<string, string> = {
      'en': '🇺🇸', 'es': '🇪🇸', 'fr': '🇫🇷', 'de': '🇩🇪', 'it': '🇮🇹', 'pt': '🇵🇹', 'ru': '🇷🇺',
      'ja': '🇯🇵', 'ko': '🇰🇷', 'zh': '🇨🇳', 'ar': '🇸🇦', 'hi': '🇮🇳', 'th': '🇹🇭', 'vi': '🇻🇳',
      'tr': '🇹🇷', 'pl': '🇵🇱', 'nl': '🇳🇱', 'sv': '🇸🇪', 'da': '🇩🇰', 'no': '🇳🇴', 'fi': '🇫🇮',
      'cs': '🇨🇿', 'hu': '🇭🇺', 'ro': '🇷🇴', 'bg': '🇧🇬', 'hr': '🇭🇷', 'sk': '🇸🇰', 'sl': '🇸🇮',
      'et': '🇪🇪', 'lv': '🇱🇻', 'lt': '🇱🇹', 'el': '🇬🇷', 'he': '🇮🇱', 'uk': '🇺🇦', 'be': '🇧🇾',
      'ca': '🇪🇸', 'eu': '🇪🇸', 'gl': '🇪🇸', 'cy': '🇬🇧', 'ga': '🇮🇪', 'mt': '🇲🇹', 'is': '🇮🇸',
      'mk': '🇲🇰', 'sq': '🇦🇱', 'sr': '🇷🇸', 'bs': '🇧🇦', 'me': '🇲🇪', 'fa': '🇮🇷', 'ur': '🇵🇰',
      'bn': '🇧🇩', 'ta': '🇮🇳', 'te': '🇮🇳', 'ml': '🇮🇳', 'kn': '🇮🇳', 'gu': '🇮🇳', 'pa': '🇮🇳',
      'or': '🇮🇳', 'as': '🇮🇳', 'ne': '🇳🇵', 'si': '🇱🇰', 'my': '🇲🇲', 'km': '🇰🇭', 'lo': '🇱🇦',
      'ka': '🇬🇪', 'hy': '🇦🇲', 'az': '🇦🇿', 'kk': '🇰🇿', 'ky': '🇰🇬', 'uz': '🇺🇿', 'mn': '🇲🇳',
      'bo': '🇨🇳', 'dz': '🇧🇹', 'ug': '🇨🇳', 'ii': '🇨🇳', 'za': '🇨🇳', 'yue': '🇭🇰', 'zh-HK': '🇭🇰',
      'zh-TW': '🇹🇼', 'zh-CN': '🇨🇳', 'id': '🇮🇩', 'ms': '🇲🇾', 'tl': '🇵🇭', 'ceb': '🇵🇭',
      'haw': '🇺🇸', 'mi': '🇳🇿', 'sm': '🇼🇸', 'to': '🇹🇴', 'fj': '🇫🇯', 'ty': '🇵🇫', 'mg': '🇲🇬',
      'sw': '🇹🇿', 'am': '🇪🇹', 'om': '🇪🇹', 'so': '🇸🇴', 'ti': '🇪🇷', 'ha': '🇳🇬', 'yo': '🇳🇬',
      'ig': '🇳🇬', 'zu': '🇿🇦', 'xh': '🇿🇦', 'af': '🇿🇦', 'st': '🇿🇦', 'tn': '🇿🇦', 'ss': '🇿🇦',
      've': '🇿🇦', 'ts': '🇿🇦', 'nr': '🇿🇦', 'nso': '🇿🇦', 'wo': '🇸🇳', 'ff': '🇸🇳', 'dy': '🇲🇱',
      'bm': '🇲🇱', 'tw': '🇬🇭', 'ak': '🇬🇭', 'lg': '🇺🇬', 'rw': '🇷🇼', 'rn': '🇧🇮', 'ny': '🇲🇼',
      'sn': '🇿🇼', 'nd': '🇿🇼'
    };
    return flagMap[this.tag] || '🌐';
  },
});

Template.changeLanguagePopup.events({
  'click .js-set-language'(this: any, event: JQuery.TriggeredEvent) {
    Users.update(Meteor.userId()!, {
      $set: {
        'profile.language': this.tag,
      },
    });
    // setLanguage is async; surface a failed load instead of silently leaving
    // the UI in English (#5756).
    Promise.resolve(TAPi18n.setLanguage(this.tag)).catch((error: any) => {
      // eslint-disable-next-line no-console
      console.error(`Failed to switch language to ${this.tag}:`, error);
    });
    event.preventDefault();
  },
});

Template.changeSettingsPopup.helpers({
  rescueCardDescription() {
    const currentUser = ReactiveCache.getCurrentUser();
    if (currentUser) {
      return (currentUser.profile || {}).rescueCardDescription;
    } else if (window.localStorage.getItem('rescueCardDescription')) {
      return true;
    } else {
      return false;
    }
  },
  showCardsCountAt() {
    const currentUser = ReactiveCache.getCurrentUser();
    if (currentUser) {
      return currentUser.getLimitToShowCardsCount();
    } else {
      return window.localStorage.getItem('limitToShowCardsCount');
    }
  },
  weekDays(startDay: number) {
    return [
      TAPi18n.__('sunday'),
      TAPi18n.__('monday'),
      TAPi18n.__('tuesday'),
      TAPi18n.__('wednesday'),
      TAPi18n.__('thursday'),
      TAPi18n.__('friday'),
      TAPi18n.__('saturday'),
    ].map(function(day, index) {
      return { name: day, value: index, isSelected: index === startDay };
    });
  },
  startDayOfWeek() {
    const currentUser = ReactiveCache.getCurrentUser();
    if (currentUser) {
      return currentUser.getStartDayOfWeek();
    } else {
      return window.localStorage.getItem('startDayOfWeek');
    }
  },
});

Template.changeSettingsPopup.events({
  'keypress/paste #show-cards-count-at'(event: JQuery.TriggeredEvent) {
    let keyCode = event.keyCode;
    let charCode = String.fromCharCode(keyCode!);
    let regex = new RegExp('[-0-9]');
    let ret = regex.test(charCode);
    return ret;
  },
  'click .js-toggle-desktop-drag-handles'() {
    const currentUser = ReactiveCache.getCurrentUser();
    if (currentUser) {
      Meteor.call('toggleDesktopDragHandles');
    } else if (window.localStorage.getItem('showDesktopDragHandles')) {
      window.localStorage.removeItem('showDesktopDragHandles');
    } else {
      window.localStorage.setItem('showDesktopDragHandles', 'true');
    }
  },
  'click .js-rescue-card-description'() {
    Meteor.call('toggleRescueCardDescription')
    },
  'click .js-apply-user-settings'(event: JQuery.TriggeredEvent, templateInstance: Blaze.TemplateInstance) {
    event.preventDefault();
    let minLimit = parseInt(
      templateInstance.$('#show-cards-count-at').val() as string,
      10,
    );
    const startDay = parseInt(
      templateInstance.$('#start-day-of-week').val() as string,
      10,
    );
    const currentUser = ReactiveCache.getCurrentUser();
    if (isNaN(minLimit) || minLimit < -1) {
      minLimit = -1;
    }
    if (!isNaN(minLimit)) {
      if (currentUser) {
        Meteor.call('changeLimitToShowCardsCount', minLimit);
      } else {
        window.localStorage.setItem('limitToShowCardsCount', String(minLimit));
      }
    }
    if (!isNaN(startDay)) {
      if (currentUser) {
        Meteor.call('changeStartDayOfWeek', startDay);
      } else {
        window.localStorage.setItem('startDayOfWeek', String(startDay));
      }
    }
    Popup.back();
  },
});
