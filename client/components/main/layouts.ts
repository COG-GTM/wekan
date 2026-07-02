import { Meteor } from 'meteor/meteor';
import { Template } from 'meteor/templating';
import { Blaze } from 'meteor/blaze';
import { ReactiveVar } from 'meteor/reactive-var';
import { ReactiveCache } from '/imports/reactiveCache';
import { TAPi18n } from '/imports/i18n';
import { FlowRouter } from 'meteor/ostrio:flow-router-extra';
import Users from '/models/users';
import { EscapeActions } from '/client/lib/escapeActions';
import { enablePageDragscroll, disablePageDragscroll } from '/client/lib/pageDragscroll';

// Pre-existing references to undefined globals in this file: `options` is
// assigned inside the OIDC redirect callback, and `currentSetting` is read by
// the afterBodyStart/beforeBodyEnd helpers. These are declared ambiently so the
// (unchanged) runtime behaviour is preserved without introducing new names.
declare let options: { loginStyle?: string };
declare const currentSetting: any;

let alreadyCheck = 1;
let isCheckDone = false;
let counter = 0;
const validator: ProxyHandler<any> = {
  set(obj: any, prop: string, value: any) {
    if (prop === 'state' && value !== 'signIn') {
      $('.at-form-authentication').hide();
    } else if (prop === 'state' && value === 'signIn') {
      $('.at-form-authentication').show();
    }
    // The default behavior to store the value
    obj[prop] = value;
    // Indicate success
    return true;
  },
};

Template.userFormsLayout.onCreated(function (this: UserFormsLayoutInstance) {
  const templateInstance = this;
  templateInstance.currentSetting = new ReactiveVar(undefined);
  templateInstance.isLoading = new ReactiveVar(false);

  if (!ReactiveCache.getCurrentUser()?.profile) {
    Meteor.call('isOidcRedirectionEnabled', (_: any, result: any) => {
      if (result) {
        AccountsTemplates.options.socialLoginStyle = 'redirect';
        options = {
          loginStyle: AccountsTemplates.options.socialLoginStyle,
        };
        Meteor.loginWithOidc(options);
      }
    });

    Meteor.subscribe('setting', {
      // this: any — inside the subscription's onReady, `this` is the handle.
      onReady(this: any) {
        templateInstance.currentSetting.set(ReactiveCache.getCurrentSetting());
        return this.stop();
      },
    });
  }
});

Template.userFormsLayout.onRendered(() => {
  // Login / register pages scroll on <body>; enable drag-to-scroll there so the
  // gesture works the same as on the board swimlanes view.
  enablePageDragscroll();

  // Mark the auth pages so CSS can let <body> scroll as a normal document.
  // body.mobile-mode locks <body> to position:fixed/100vh (an iOS board-view
  // anti-bounce fix); without an inner #content scroller that traps these pages
  // at viewport height, hiding the sign-up link / language selector below the
  // form (and they sit behind the on-screen keyboard). See userForm.css.
  document.body.classList.add('userform-layout');

  Meteor.call('getAuthenticationsEnabled', (_: any, result: any) => {
    let enabledAuthenticationMethods = ['password']; // we show/hide this based on isPasswordLoginEnabled

    if (result) {
      Object.keys(result).forEach((m) => {
        if (result[m]) enabledAuthenticationMethods.push(m);
      });
    }

    Meteor.call('isPasswordLoginEnabled', (_: any, result: any) => {
      // Issue #6380: the password form (.at-pwd-form) is hidden by default in CSS
      // and only revealed here. If this method call errors / returns late, or the
      // accounts-templates form has not rendered its fields yet when this runs,
      // the login page is left without username and password fields. Treat
      // password login as enabled unless it is explicitly disabled
      // (result === false), and wait for the form element to appear before
      // showing it (same pattern as the OAuth button above).
      if (result === false) return;
      (function showPwdFormWhenReady() {
        if (!$('.at-pwd-form')[0]) return setTimeout(showPwdFormWhenReady, 100);
        $('.at-pwd-form').show();
      })();
    });

    Meteor.call('isDisableRegistration', (_: any, result: any) => {
      if (result) {
        $('.at-signup-link').hide();
      }
    });

    Meteor.call('isDisableForgotPassword', (_: any, result: any) => {
      if (result) {
        $('.at-pwd-link').hide();
      }
    });

    if (enabledAuthenticationMethods.indexOf('oauth2') !== -1) {
      // TODO find better way to run this code once the oauth2 UI is injected in the DOM
      (function waitForElementAndShow() {
        if (!$('.at-oauth')[0]) return setTimeout(waitForElementAndShow, 100);
        $('.at-oauth').show();
      })();
    }

    AccountsTemplates.state.form.keys = new Proxy(
      AccountsTemplates.state.form.keys,
      validator,
    );
    EscapeActions.executeAll();

    // Set up MutationObserver for OIDC button instead of deprecated DOMSubtreeModified
    const oidcButton = document.getElementById('at-oidc');
    if (oidcButton) {
      const observer = new MutationObserver((mutations: MutationRecord[]) => {
        if (alreadyCheck <= 2) {
          let currSetting = ReactiveCache.getCurrentSetting();
          let oidcBtnElt = $('#at-oidc');
          if (
            currSetting &&
            currSetting !== undefined &&
            currSetting.oidcBtnText !== undefined &&
            oidcBtnElt != null &&
            oidcBtnElt != undefined
          ) {
            let htmlvalue = "<i class='fa fa-oidc'></i>" + currSetting.oidcBtnText;
            if (alreadyCheck == 1) {
              alreadyCheck++;
              oidcBtnElt.html('');
            } else {
              alreadyCheck++;
              oidcBtnElt.html(htmlvalue);
            }
          }
        } else {
          alreadyCheck = 1;
        }
      });
      observer.observe(oidcButton, { childList: true, subtree: true });
    }

    // Set up MutationObserver for .at-form instead of deprecated DOMSubtreeModified
    const atForm = document.querySelector('.at-form');
    if (atForm) {
      const formObserver = new MutationObserver((mutations: MutationRecord[]) => {
        if (alreadyCheck <= 2 && !isCheckDone) {
          if (document.getElementById('at-oidc') != null) {
            let currSetting = ReactiveCache.getCurrentSetting();
            let oidcBtnElt = $('#at-oidc');
            if (
              currSetting &&
              currSetting !== undefined &&
              currSetting.oidcBtnText !== undefined &&
              oidcBtnElt != null &&
              oidcBtnElt != undefined
            ) {
              let htmlvalue =
                "<i class='fa fa-oidc'></i>" + currSetting.oidcBtnText;
              if (alreadyCheck == 1) {
                alreadyCheck++;
                oidcBtnElt.html('');
              } else {
                alreadyCheck++;
                isCheckDone = true;
                oidcBtnElt.html(htmlvalue);
              }
            }
          }
        } else {
          alreadyCheck = 1;
        }
      });
      formObserver.observe(atForm, { childList: true, subtree: true });
    }

    // Add autocomplete attribute to login input for WCAG compliance
    const loginInput = document.querySelector<HTMLInputElement>(
      'input[type="text"], input[type="email"]',
    );
    if (
      loginInput &&
      loginInput.name &&
      (loginInput.name.toLowerCase().includes('user') ||
        loginInput.name.toLowerCase().includes('email'))
    ) {
      loginInput.setAttribute('autocomplete', 'username email');
    }

    // Add autocomplete attributes to password fields for WCAG compliance
    const passwordInputs = document.querySelectorAll<HTMLInputElement>('input[type="password"]');
    passwordInputs.forEach((input) => {
      if (input.name && input.name.includes('password')) {
        if (
          input.name.includes('password_again') ||
          input.name.includes('new_password')
        ) {
          input.setAttribute('autocomplete', 'new-password');
        } else {
          input.setAttribute('autocomplete', 'current-password');
        }
      }
    });
  });
});

Template.userFormsLayout.onDestroyed(() => {
  // Stop drag-scrolling <body> after leaving login / register (e.g. once logged
  // in) so other layouts keep their normal behaviour.
  disablePageDragscroll();
  document.body.classList.remove('userform-layout');
});

Template.userFormsLayout.helpers({
  isLegalNoticeLinkExist() {
    const currSet = (Template.instance() as UserFormsLayoutInstance).currentSetting.get();
    if (currSet && currSet !== undefined && currSet != null) {
      return (
        currSet.legalNotice !== undefined && currSet.legalNotice.trim() != ''
      );
    } else return false;
  },

  getLegalNoticeWithWritTraduction() {
    let spanLegalNoticeElt = $('#legalNoticeSpan');
    if (spanLegalNoticeElt != null && spanLegalNoticeElt != undefined) {
      spanLegalNoticeElt.html(TAPi18n.__('acceptance_of_our_legalNotice', {}));
    }
    let atLinkLegalNoticeElt = $('#legalNoticeAtLink');
    if (atLinkLegalNoticeElt != null && atLinkLegalNoticeElt != undefined) {
      atLinkLegalNoticeElt.html(TAPi18n.__('legalNotice', {}));
    }
    return true;
  },

  isLoading() {
    return (Template.instance() as UserFormsLayoutInstance).isLoading.get();
  },

  afterBodyStart() {
    return currentSetting.customHTMLafterBodyStart;
  },

  beforeBodyEnd() {
    return currentSetting.customHTMLbeforeBodyEnd;
  },

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

  isCurrentLanguage(this: { tag: string }) {
    const curLang = TAPi18n.getLanguage();
    return this.tag === curLang;
  },
});

Template.main.helpers({
  htmlLang() {
    return TAPi18n.getLanguage() || 'en';
  },

  htmlDir() {
    return TAPi18n.getLanguageDirection() || 'ltr';
  },
});

Template.userFormsLayout.events({
  'change .js-userform-set-language'(event: JQuery.TriggeredEvent) {
    const tag = $(event.currentTarget).val() as string;
    // setLanguage is async; surface a failed load instead of silently leaving
    // the UI in English (#5756).
    Promise.resolve(TAPi18n.setLanguage(tag)).catch(error => {
      // eslint-disable-next-line no-console
      console.error(`Failed to switch language to ${tag}:`, error);
    });
    event.preventDefault();
  },
  'click #at-btn'(event: JQuery.TriggeredEvent, templateInstance: UserFormsLayoutInstance) {
    if (FlowRouter.getRouteName() === 'atSignIn') {
      templateInstance.isLoading.set(true);
      authentication(event, templateInstance).then(() => {
        templateInstance.isLoading.set(false);
      });
    }
    isCheckDone = false;
  },
});

Template.defaultLayout.events({
  'click .js-close-modal': () => {
    Modal.close();
  },
});

// Accessibility (WCAG 2.4.3 Focus Order): when a modal dialog opens, move
// keyboard focus into it so screen-reader and keyboard users land inside the
// dialog instead of being left behind in the page. When it closes, restore
// focus to whatever element was focused before it opened.
Template.defaultLayout.onRendered(function (this: Blaze.TemplateInstance) {
  let lastFocused: HTMLElement | null = null;
  this.autorun(() => {
    const isOpen = Modal.isOpen();
    Tracker.afterFlush(() => {
      if (isOpen) {
        lastFocused = document.activeElement as HTMLElement | null;
        const modal = document.getElementById('modal');
        if (modal) {
          const focusTarget = (modal.querySelector('.modal-close-btn') || modal) as HTMLElement;
          focusTarget.focus();
        }
      } else if (lastFocused && typeof lastFocused.focus === 'function') {
        lastFocused.focus();
        lastFocused = null;
      }
    });
  });

  // Drag-to-scroll for every whole-page layout rendered inside defaultLayout
  // (All Boards, My Cards, Due Cards, Global Search, Public, Bookmarks, Broken
  // Cards, Settings, People, Admin, Import, board Rules, …). These pages scroll
  // <body> on desktop and #content in mobile mode (where <body> is
  // position:fixed), so enablePageDragscroll() tags whichever element actually
  // scrolls. The board-canvas pages are the exception: their own
  // `.board-canvas.dragscroll` handles dragging, and the canvas does its own
  // vertical/horizontal scroll, so page-level tagging is turned off there to
  // avoid scrolling #content and the canvas at the same time. defaultLayout is
  // persistent (only its `content` swaps), so this single autorun covers every
  // route without per-template wiring. Login / Register use userFormsLayout and
  // keep their own enable/disable. Works the same in mobile and desktop mode.
  const boardCanvasRoutes = ['board', 'board-short', 'card'];
  this.autorun(() => {
    FlowRouter.watchPathChange();
    const onBoardCanvas = boardCanvasRoutes.includes(FlowRouter.getRouteName());
    Tracker.afterFlush(() => {
      if (onBoardCanvas) {
        disablePageDragscroll();
      } else {
        enablePageDragscroll();
      }
    });
  });
});

async function authentication(event: JQuery.TriggeredEvent, templateInstance: UserFormsLayoutInstance) {
  const match = $('#at-field-username_and_email').val() as string;
  const password = $('#at-field-password').val() as string;

  if (!match || !password) return undefined;

  const result = await getAuthenticationMethod(
    templateInstance.currentSetting.get(),
    match,
  );

  if (result === 'password') return undefined;

  // Stop submit #at-pwd-form
  event.preventDefault();
  event.stopImmediatePropagation();

  switch (result) {
    case 'ldap':
      return new Promise((resolve) => {
        Meteor.loginWithLDAP(match, password, function () {
          resolve(FlowRouter.go('/'));
        });
      });

    case 'saml':
      return new Promise((resolve) => {
        const provider = Meteor.settings.public.SAML_PROVIDER;
        Meteor.loginWithSaml(
          {
            provider,
          },
          function () {
            resolve(FlowRouter.go('/'));
          },
        );
      });

    case 'cas':
      return new Promise((resolve) => {
        Meteor.loginWithCas(match, password, function () {
          resolve(FlowRouter.go('/'));
        });
      });

    default:
      return undefined;
  }
}

function getAuthenticationMethod(
  settings: any,
  match: any,
) {
  if (!settings) {
    return getUserAuthenticationMethod(undefined, match);
  }

  const { displayAuthenticationMethod, defaultAuthenticationMethod } = settings;

  if (displayAuthenticationMethod) {
    return $('.select-authentication').val();
  }
  return getUserAuthenticationMethod(defaultAuthenticationMethod, match);
}

function getUserAuthenticationMethod(defaultAuthenticationMethod: any, match: any) {
  return new Promise((resolve) => {
    try {
      Meteor.subscribe('user-authenticationMethod', match, {
        onReady() {
          const user = Users.findOne();
          const authenticationMethod = user
            ? user.authenticationMethod
            : defaultAuthenticationMethod;

          resolve(authenticationMethod);
        },
      });
    } catch (error) {
      resolve(defaultAuthenticationMethod);
    }
  });
}

interface UserFormsLayoutInstance extends Blaze.TemplateInstance {
  currentSetting: ReactiveVar<any>;
  isLoading: ReactiveVar<boolean>;
}
