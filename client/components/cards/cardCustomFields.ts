import { Template } from 'meteor/templating';
import { Blaze } from 'meteor/blaze';
import { ReactiveVar } from 'meteor/reactive-var';
import { Tracker } from 'meteor/tracker';
import { TAPi18n } from '/imports/i18n';
import {
  setupDatePicker,
  datePickerRendered,
  datePickerHelpers,
  datePickerEvents,
} from '/client/lib/datepicker';
import { ReactiveCache } from '/imports/reactiveCache';
import {
  formatDateTime,
  formatDate,
  formatDateByUserPreference,
  formatTime,
  getISOWeek,
  isValidDate,
  isBefore,
  isAfter,
  isSame,
  add,
  subtract,
  startOf,
  endOf,
  format,
  parseDate,
  now,
  createDate,
  fromNow,
  calendar
} from '/imports/lib/dateUtils';
import { CustomFieldStringTemplate } from '/client/lib/customFields'
import { getCurrentCardFromContext } from '/client/lib/currentCard';
import { formatNumberValue } from '/imports/lib/customNumberFormat';
import { EscapeActions } from '/client/lib/escapeActions';
import { getSidebarInstance } from '/client/features/sidebar/service';

Template.cardCustomFieldsPopup.helpers({
  hasCustomField(this: any) {
    const card = getCurrentCardFromContext();
    if (!card) return false;
    const customFieldId = this._id;
    return card.customFieldIndex(customFieldId) > -1;
  },
});

Template.cardCustomFieldsPopup.events({
  'click .js-select-field'(this: any, event: JQuery.TriggeredEvent) {
    const card = getCurrentCardFromContext();
    if (!card) return;
    const customFieldId = this._id;
    card.toggleCustomField(customFieldId);
    event.preventDefault();
  },
  'click .js-settings'(event: JQuery.TriggeredEvent) {
    EscapeActions.executeUpTo('detailsPane');
    const sidebar = getSidebarInstance();
    if (sidebar) {
      sidebar.setView('customFields');
    }
    event.preventDefault();
  },
});

// cardCustomField
Template.cardCustomField.helpers({
  getTemplate(this: any) {
    return `cardCustomField-${this.definition.type}`;
  },
});

Template.cardCustomField.onCreated(function (this: CardCustomFieldInstance) {
  this.card = getCurrentCardFromContext();
  this.customFieldId = Template.currentData()._id;
});

// cardCustomField-text
Template['cardCustomField-text'].onCreated(function (this: CardCustomFieldTextInstance) {
  this.card = getCurrentCardFromContext();
  this.customFieldId = Template.currentData()._id;
});

Template['cardCustomField-text'].events({
  'submit .js-card-customfield-text'(event: JQuery.TriggeredEvent, tpl: CardCustomFieldTextInstance) {
    event.preventDefault();
    const value = tpl.currentComponent ? tpl.currentComponent().getValue() : tpl.$('textarea').val();
    tpl.card.setCustomField(tpl.customFieldId, value);
  },
});

// cardCustomField-number
Template['cardCustomField-number'].onCreated(function (this: CardCustomFieldInstance) {
  this.card = getCurrentCardFromContext();
  this.customFieldId = Template.currentData()._id;
});

Template['cardCustomField-number'].helpers({
  // Render blank / cleared / non-numeric values as empty instead of "NaN" (#2091).
  formattedValue(this: any) {
    return formatNumberValue(this.value);
  },
});

Template['cardCustomField-number'].events({
  'submit .js-card-customfield-number'(event: JQuery.TriggeredEvent, tpl: CardCustomFieldInstance) {
    event.preventDefault();
    const rawValue = (tpl.find('input') as HTMLInputElement).value;
    // A cleared/blank input parses to NaN; store '' instead so it renders empty
    // rather than as "NaN" (#2091).
    const parsed = parseInt(rawValue, 10);
    const value = Number.isNaN(parsed) ? '' : parsed;
    tpl.card.setCustomField(tpl.customFieldId, value);
  },
});

// cardCustomField-checkbox
Template['cardCustomField-checkbox'].onCreated(function (this: CardCustomFieldInstance) {
  this.card = getCurrentCardFromContext();
  this.customFieldId = Template.currentData()._id;
});

Template['cardCustomField-checkbox'].events({
  'click .js-checklist-item .check-box-container'(event: JQuery.TriggeredEvent, tpl: CardCustomFieldInstance) {
    tpl.card.setCustomField(tpl.customFieldId, !Template.currentData().value);
  },
});

// cardCustomField-currency
Template['cardCustomField-currency'].onCreated(function (this: CardCustomFieldCurrencyInstance) {
  this.card = getCurrentCardFromContext();
  this.customFieldId = Template.currentData()._id;
  this.currencyCode = Template.currentData().definition.settings.currencyCode;
});

Template['cardCustomField-currency'].helpers({
  formattedValue(this: any) {
    const locale = TAPi18n.getLanguage();
    const tpl = Template.instance() as CardCustomFieldCurrencyInstance;
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: tpl.currencyCode,
    }).format(this.value);
  },
});

Template['cardCustomField-currency'].events({
  'submit .js-card-customfield-currency'(event: JQuery.TriggeredEvent, tpl: CardCustomFieldCurrencyInstance) {
    event.preventDefault();
    // To allow input separated by comma, the comma is replaced by a period.
    const value = Number((tpl.find('input') as HTMLInputElement).value.replace(/,/i, '.'));
    tpl.card.setCustomField(tpl.customFieldId, value);
  },
});

// cardCustomField-date
Template['cardCustomField-date'].onCreated(function (this: CardCustomFieldDateInstance) {
  this.card = getCurrentCardFromContext();
  this.customFieldId = Template.currentData()._id;
  const self = this;
  self.date = new ReactiveVar<Date | undefined>(undefined);
  self.now = new ReactiveVar(now());
  window.setInterval(() => {
    self.now.set(now());
  }, 60000);

  self.autorun(() => {
    self.date.set(new Date(Template.currentData().value));
  });
});

Template['cardCustomField-date'].helpers({
  showWeek() {
    return getISOWeek((Template.instance() as CardCustomFieldDateInstance).date.get()!).toString();
  },
  showWeekOfYear() {
    const user = ReactiveCache.getCurrentUser();
    if (!user) {
      return false;
    }
    return user.isShowWeekOfYear();
  },
  showDate() {
    const currentUser = ReactiveCache.getCurrentUser();
    const dateFormat = currentUser ? currentUser.getDateFormat() : (window.localStorage.getItem('dateFormat') || 'YYYY-MM-DD');
    return formatDateByUserPreference((Template.instance() as CardCustomFieldDateInstance).date.get()!, dateFormat, true);
  },
  showISODate() {
    return (Template.instance() as CardCustomFieldDateInstance).date.get()!.toISOString();
  },
  classes(this: any) {
    const tpl = Template.instance() as CardCustomFieldDateInstance;
    if (
      isBefore(tpl.date.get()!, tpl.now.get(), 'minute') &&
      isBefore(tpl.now.get(), this.value, 'minute')
    ) {
      return 'current';
    }
    return '';
  },
  showTitle() {
    return `${TAPi18n.__('card-start-on')} ${(Template.instance() as CardCustomFieldDateInstance).date.get()!.toLocaleString()}`;
  },
});

Template['cardCustomField-date'].events({
  'click .js-edit-date': Popup.open('cardCustomField-date'),
});

// cardCustomField-datePopup
Template['cardCustomField-datePopup'].onCreated(function (this: CardCustomFieldDatePopupInstance) {
  const data = Template.currentData();
  setupDatePicker(this, {
    initialDate: data.value ? data.value : undefined,
  });
  // Override card and store customFieldId for store/delete callbacks
  this.datePicker.card = getCurrentCardFromContext();
  this.customFieldId = data._id;
});

Template['cardCustomField-datePopup'].onRendered(function (this: CardCustomFieldDatePopupInstance) {
  datePickerRendered(this);
});

Template['cardCustomField-datePopup'].helpers(datePickerHelpers());

Template['cardCustomField-datePopup'].events(datePickerEvents({
  storeDate(this: CardCustomFieldDatePopupInstance, date: Date) {
    this.datePicker.card.setCustomField(this.customFieldId, date);
  },
  deleteDate(this: CardCustomFieldDatePopupInstance) {
    this.datePicker.card.setCustomField(this.customFieldId, '');
  },
}));

// cardCustomField-dropdown
Template['cardCustomField-dropdown'].onCreated(function (this: CardCustomFieldDropdownInstance) {
  this.card = getCurrentCardFromContext();
  this.customFieldId = Template.currentData()._id;
  this._items = Template.currentData().definition.settings.dropdownItems;
  this.items = this._items.slice(0);
  this.items.unshift({
    _id: '',
    name: TAPi18n.__('custom-field-dropdown-none'),
  });
});

Template['cardCustomField-dropdown'].helpers({
  items() {
    return (Template.instance() as CardCustomFieldDropdownInstance).items;
  },
  selectedItem(this: any) {
    const tpl = Template.instance() as CardCustomFieldDropdownInstance;
    const selected = tpl._items.find(item => {
      return item._id === this.value;
    });
    return selected
      ? selected.name
      : TAPi18n.__('custom-field-dropdown-unknown');
  },
});

Template['cardCustomField-dropdown'].events({
  'submit .js-card-customfield-dropdown'(event: JQuery.TriggeredEvent, tpl: CardCustomFieldDropdownInstance) {
    event.preventDefault();
    const value = (tpl.find('select') as HTMLSelectElement).value;
    tpl.card.setCustomField(tpl.customFieldId, value);
  },
});

// cardCustomField-stringtemplate
Template['cardCustomField-stringtemplate'].onCreated(function (this: CardCustomFieldStringtemplateInstance) {
  this.card = getCurrentCardFromContext();
  this.customFieldId = Template.currentData()._id;
  this.customField = new CustomFieldStringTemplate(Template.currentData().definition);
  this.stringtemplateItems = new ReactiveVar<string[]>(Template.currentData().value ?? []);
});

Template['cardCustomField-stringtemplate'].helpers({
  formattedValue(this: any) {
    const tpl = Template.instance() as CardCustomFieldStringtemplateInstance;
    const ret = tpl.customField.getFormattedValue(this.value);
    return ret;
  },
  stringtemplateItems() {
    return (Template.instance() as CardCustomFieldStringtemplateInstance).stringtemplateItems.get();
  },
});

Template['cardCustomField-stringtemplate'].events({
  'submit .js-card-customfield-stringtemplate'(event: JQuery.TriggeredEvent, tpl: CardCustomFieldStringtemplateInstance) {
    event.preventDefault();
    const items = tpl.stringtemplateItems.get();
    tpl.card.setCustomField(tpl.customFieldId, items);
  },

  'keydown .js-card-customfield-stringtemplate-item'(event: JQuery.TriggeredEvent, tpl: CardCustomFieldStringtemplateInstance) {
    if (event.keyCode === 13) {
      event.preventDefault();

      const target = event.target as HTMLInputElement;
      if (target.value.trim() || event.metaKey || event.ctrlKey) {
        const inputLast = tpl.find('input.last') as HTMLInputElement;

        let items = Array.from(tpl.findAll('input'))
          .map(input => (input as HTMLInputElement).value)
          .filter(value => !!value.trim());

        if (target === inputLast) {
          inputLast.value = '';
        } else if (target.nextSibling === inputLast) {
          inputLast.focus();
        } else {
          target.blur();

          const idx = Array.from(tpl.findAll('input')).indexOf(
            target,
          );
          items.splice(idx + 1, 0, '');

          Tracker.afterFlush(() => {
            const element = tpl.findAll('input')[idx + 1] as HTMLInputElement;
            element.focus();
            element.value = '';
          });
        }

        tpl.stringtemplateItems.set(items);
      }
      if (event.metaKey || event.ctrlKey) {
        (tpl.find('button[type=submit]') as HTMLElement).click();
      }
    }
  },

  'blur .js-card-customfield-stringtemplate-item'(event: JQuery.TriggeredEvent, tpl: CardCustomFieldStringtemplateInstance) {
    const target = event.target as HTMLInputElement;
    if (
      !target.value.trim() ||
      target === tpl.find('input.last')
    ) {
      const items = Array.from(tpl.findAll('input'))
        .map(input => (input as HTMLInputElement).value)
        .filter(value => !!value.trim());
      tpl.stringtemplateItems.set(items);
      (tpl.find('input.last') as HTMLInputElement).value = '';
    }
  },

  'click .js-close-inlined-form'(event: JQuery.TriggeredEvent, tpl: CardCustomFieldStringtemplateInstance) {
    tpl.stringtemplateItems.set(Template.currentData().value ?? []);
  },
});

// Shared state for the per-type cardCustomField templates: the card being
// edited and the id of the custom field. `card` is the (possibly null) card
// model instance; typed `any` because these handlers only run when a card is
// present and call its dynamic setCustomField/toggleCustomField helpers.
interface CardCustomFieldInstance extends Blaze.TemplateInstance {
  card: any;
  customFieldId: string;
}

// The text field instance may expose a rich-text editor component accessor.
interface CardCustomFieldTextInstance extends CardCustomFieldInstance {
  currentComponent?: () => { getValue(): string };
}

interface CardCustomFieldCurrencyInstance extends CardCustomFieldInstance {
  currencyCode: string;
}

interface CardCustomFieldDateInstance extends CardCustomFieldInstance {
  date: ReactiveVar<Date | undefined>;
  now: ReactiveVar<Date>;
}

// The date popup builds on the shared datepicker instance state; `datePicker`
// holds the picker's own reactive state plus the overridden card accessor.
interface CardCustomFieldDatePopupInstance extends Blaze.TemplateInstance {
  datePicker: any;
  customFieldId: string;
}

interface CardCustomFieldDropdownInstance extends CardCustomFieldInstance {
  _items: DropdownItem[];
  items: DropdownItem[];
}

interface CardCustomFieldStringtemplateInstance extends CardCustomFieldInstance {
  customField: CustomFieldStringTemplate;
  stringtemplateItems: ReactiveVar<string[]>;
}

// An option of a dropdown custom field.
interface DropdownItem {
  _id: string;
  name: string;
}
