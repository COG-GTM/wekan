import { Meteor } from 'meteor/meteor';
import { Template } from 'meteor/templating';
import { Blaze } from 'meteor/blaze';
import { ReactiveVar } from 'meteor/reactive-var';
import { ReactiveCache } from '/imports/reactiveCache';
import { InfiniteScrolling } from '/client/lib/infiniteScrolling';

const translationsPerPage = 25;

Template.translation.onCreated(function (this: TranslationInstance) {
  this.error = new ReactiveVar('');
  this.loading = new ReactiveVar(false);
  this.translationSetting = new ReactiveVar(true);
  this.findTranslationsOptions = new ReactiveVar({});
  this.numberTranslations = new ReactiveVar(0);

  this.page = new ReactiveVar(1);
  this.loadNextPageLocked = false;
  this.infiniteScrolling = new InfiniteScrolling();

  this.loadNextPage = () => {
    if (this.loadNextPageLocked === false) {
      this.page.set(this.page.get() + 1);
      this.loadNextPageLocked = true;
    }
  };

  this.calculateNextPeak = () => {
    const element = this.find('.main-body');
    if (element) {
      this.infiniteScrolling.setNextPeak(element.scrollHeight);
    }
  };

  this.autorun(() => {
    const limitTranslations = this.page.get() * translationsPerPage;

    this.subscribe('translation', this.findTranslationsOptions.get(), 0, () => {
      this.loadNextPageLocked = false;
      const nextPeakBefore = this.infiniteScrolling.getNextPeak();
      this.calculateNextPeak();
      const nextPeakAfter = this.infiniteScrolling.getNextPeak();
      if (nextPeakBefore === nextPeakAfter) {
        this.infiniteScrolling.resetNextPeak();
      }
    });
  });
});

Template.translation.helpers({
  loading() {
    return (Template.instance() as TranslationInstance).loading;
  },
  translationSetting() {
    return (Template.instance() as TranslationInstance).translationSetting;
  },
  translationList() {
    const tpl = Template.instance() as TranslationInstance;
    const translations = ReactiveCache.getTranslations(tpl.findTranslationsOptions.get(), {
      sort: { modifiedAt: 1 },
      fields: { _id: true },
    });
    tpl.numberTranslations.set(translations.length);
    return translations;
  },
  translationNumber() {
    return (Template.instance() as TranslationInstance).numberTranslations.get();
  },
  setError(error: any) {
    (Template.instance() as TranslationInstance).error.set(error);
  },
  setLoading(w: any) {
    (Template.instance() as TranslationInstance).loading.set(w);
  },
});

Template.translation.events({
  'click #searchTranslationButton'(event: JQuery.TriggeredEvent, tpl: TranslationInstance) {
    _filterTranslation(tpl);
  },
  'keydown #searchTranslationInput'(event: JQuery.TriggeredEvent, tpl: TranslationInstance) {
    if (event.keyCode === 13 && !event.shiftKey) {
      _filterTranslation(tpl);
    }
  },
  'click #newTranslationButton'() {
    Popup.open('newTranslation');
  },
  'click a.js-translation-menu'(event: JQuery.TriggeredEvent, tpl: TranslationInstance) {
    const target = $(event.target);
    if (!target.hasClass('active')) {
      $('.side-menu li.active').removeClass('active');
      target.parent().addClass('active');
      const targetID = target.data('id');
      tpl.translationSetting.set('translation-setting' === targetID);
    }
  },
  'scroll .main-body'(event: JQuery.TriggeredEvent, tpl: TranslationInstance) {
    tpl.infiniteScrolling.checkScrollPosition(event.currentTarget, () => {
      tpl.loadNextPage();
    });
  },
});

function _filterTranslation(tpl: TranslationInstance) {
  const value = $('#searchTranslationInput').first().val();
  if (value === '') {
    tpl.findTranslationsOptions.set({});
  } else {
    const regex = new RegExp(value as string, 'i');
    tpl.findTranslationsOptions.set({
      $or: [
        { language: regex },
        { text: regex },
        { translationText: regex },
      ],
    });
  }
}

Template.translationRow.helpers({
  // this: any — the translation-row data context exposes `translationId`.
  translationData(this: any) {
    return ReactiveCache.getTranslation(this.translationId);
  },
});

Template.editTranslationPopup.helpers({
  // this: any — the popup data context exposes `translationId`.
  translation(this: any) {
    return ReactiveCache.getTranslation(this.translationId);
  },
  errorMessage() {
    return (Template.instance() as ErrorMessageInstance).errorMessage.get();
  },
});

Template.newTranslationPopup.onCreated(function (this: ErrorMessageInstance) {
  this.errorMessage = new ReactiveVar('');
});

Template.newTranslationPopup.helpers({
  // this: any — the popup data context exposes `translationId`.
  translation(this: any) {
    return ReactiveCache.getTranslation(this.translationId);
  },
  errorMessage() {
    return (Template.instance() as ErrorMessageInstance).errorMessage.get();
  },
});

Template.translationRow.helpers({
  // this: any — the translation-row data context exposes `translationId`.
  translation(this: any) {
    return ReactiveCache.getTranslation(this.translationId);
  },
});

Template.translationRow.events({
  'click a.edit-translation': Popup.open('editTranslation'),
  'click a.more-settings-translation': Popup.open('settingsTranslation'),
});

Template.newTranslationRow.events({
  'click a.new-translation': Popup.open('newTranslation'),
});

Template.editTranslationPopup.events({
  // this: any — the popup data context exposes `translationId`.
  submit(this: any, event: JQuery.TriggeredEvent, templateInstance: Blaze.TemplateInstance) {
    event.preventDefault();
    const translation = ReactiveCache.getTranslation(this.translationId);
    const translationText = (templateInstance.find('.js-translation-translation-text') as HTMLInputElement).value.trim();

    Meteor.call(
      'setTranslationText',
      translation,
      translationText
    );

    Popup.back();
  },
});

Template.newTranslationPopup.events({
  submit(event: JQuery.TriggeredEvent, templateInstance: Blaze.TemplateInstance) {
    event.preventDefault();
    const language = (templateInstance.find('.js-translation-language') as HTMLInputElement).value.trim();
    const text = (templateInstance.find('.js-translation-text') as HTMLInputElement).value.trim();
    const translationText = (templateInstance.find('.js-translation-translation-text') as HTMLInputElement).value.trim();

    Meteor.call(
      'setCreateTranslation',
      language,
      text,
      translationText,
      // error: any — untyped Meteor method callback.
      function(error: any) {
        const textMessageElement = templateInstance.$('.text-taken');
        if (error) {
          const errorElement = error.error;
          if (errorElement === 'text-already-taken') {
            textMessageElement.show();
          }
        } else {
          textMessageElement.hide();
          Popup.back();
        }
      },
    );
    Popup.back();
  },
});

Template.settingsTranslationPopup.events({
  // this: any — the popup data context exposes `translationId`.
  'click #deleteButton'(this: any, event: JQuery.TriggeredEvent) {
    event.preventDefault();
    Meteor.call('deleteTranslation', this.translationId);
    Popup.back();
  }
});

// translation instance: search/paging state and infinite-scrolling helper.
interface TranslationInstance extends Blaze.TemplateInstance {
  error: ReactiveVar<any>;
  loading: ReactiveVar<any>;
  translationSetting: ReactiveVar<any>;
  findTranslationsOptions: ReactiveVar<any>;
  numberTranslations: ReactiveVar<any>;
  page: ReactiveVar<any>;
  loadNextPageLocked: boolean;
  // infiniteScrolling: any — an InfiniteScrolling instance.
  infiniteScrolling: any;
  loadNextPage: () => void;
  calculateNextPeak: () => void;
}

// Popups that expose a reactive errorMessage var.
interface ErrorMessageInstance extends Blaze.TemplateInstance {
  errorMessage: ReactiveVar<any>;
}
