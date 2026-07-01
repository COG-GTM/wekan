import { Template } from 'meteor/templating';
import { ReactiveVar } from 'meteor/reactive-var';
import { Blaze } from 'meteor/blaze';
import { ReactiveCache } from '/imports/reactiveCache';
import { getCurrentCardFromContext } from '/client/lib/currentCard';
import { normalizeDigits } from '/imports/lib/dateUtils';

// Helper to check if a date is valid
function isValidDate(date: Date) {
  return date instanceof Date && !isNaN(date.getTime());
}

// Format date as YYYY-MM-DD
function formatDate(date: Date) {
  if (!isValidDate(date)) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Format time as HH:mm
function formatTime(date: Date) {
  if (!isValidDate(date)) return '';
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

/**
 * Sets up datepicker state on a template instance.
 * Call from onCreated. Stores state on tpl.datePicker.
 *
 * @param {TemplateInstance} tpl - The Blaze template instance
 * @param {Object} options
 * @param {string} [options.defaultTime='1970-01-01 08:00:00'] - Default time string
 * @param {Date} [options.initialDate] - Initial date to set (if valid)
 */
export function setupDatePicker(
  tpl: DatePickerInstance,
  { defaultTime = '1970-01-01 08:00:00', initialDate }: SetupDatePickerOptions = {},
) {
  const card = getCurrentCardFromContext() || Template.currentData();
  tpl.datePicker = {
    error: new ReactiveVar(''),
    card,
    date: new ReactiveVar(initialDate && isValidDate(new Date(initialDate)) ? new Date(initialDate) : new Date('invalid')),
    defaultTime,
  };
}

/**
 * onRendered logic for datepicker templates.
 * Sets initial input values from the datePicker state.
 *
 * @param {TemplateInstance} tpl - The Blaze template instance
 */
export function datePickerRendered(tpl: DatePickerInstance) {
  const dp = tpl.datePicker;
  if (isValidDate(dp.date.get())) {
    const dateInput = tpl.find('#date') as HTMLInputElement | null;
    const timeInput = tpl.find('#time') as HTMLInputElement | null;

    if (dateInput) {
      dateInput.value = formatDate(dp.date.get());
    }
    if (timeInput && !timeInput.value && dp.defaultTime) {
      const defaultDate = new Date(dp.defaultTime);
      timeInput.value = formatTime(defaultDate);
    } else if (timeInput && isValidDate(dp.date.get())) {
      timeInput.value = formatTime(dp.date.get());
    }
  }
}

/**
 * Returns helpers object for datepicker templates.
 * All helpers read from Template.instance().datePicker.
 */
export function datePickerHelpers() {
  return {
    error() {
      return (Template.instance() as DatePickerInstance).datePicker.error;
    },
    showDate() {
      const dp = (Template.instance() as DatePickerInstance).datePicker;
      if (isValidDate(dp.date.get())) return formatDate(dp.date.get());
      return '';
    },
    showTime() {
      const dp = (Template.instance() as DatePickerInstance).datePicker;
      if (isValidDate(dp.date.get())) return formatTime(dp.date.get());
      return '';
    },
    dateFormat() {
      return 'YYYY-MM-DD';
    },
    timeFormat() {
      return 'HH:mm';
    },
    startDayOfWeek() {
      const currentUser = ReactiveCache.getCurrentUser();
      if (currentUser) {
        return currentUser.getStartDayOfWeek();
      } else {
        return 1;
      }
    },
  };
}

/**
 * Returns events object for datepicker templates.
 *
 * @param {Object} callbacks
 * @param {Function} callbacks.storeDate - Called with (date) when form is submitted
 * @param {Function} callbacks.deleteDate - Called when delete button is clicked
 */
export function datePickerEvents({ storeDate, deleteDate }: DatePickerCallbacks) {
  return {
    'change .js-date-field'(evt: JQuery.TriggeredEvent, tpl: DatePickerInstance) {
      // Native HTML date input validation. Normalize any non-Latin digits
      // (e.g. Persian/Arabic-Indic) so parsing works in those locales (#5752).
      const dateValue = normalizeDigits((tpl.find('#date') as HTMLInputElement).value);
      if (dateValue) {
        // HTML date input format is always YYYY-MM-DD
        const dateObj = new Date(dateValue + 'T12:00:00');
        if (isValidDate(dateObj)) {
          tpl.datePicker.error.set('');
        } else {
          tpl.datePicker.error.set('invalid-date');
        }
      }
    },
    'change .js-time-field'(evt: JQuery.TriggeredEvent, tpl: DatePickerInstance) {
      // Native HTML time input validation. Normalize any non-Latin digits
      // (e.g. Persian/Arabic-Indic) so parsing works in those locales (#5752).
      const timeValue = normalizeDigits((tpl.find('#time') as HTMLInputElement).value);
      if (timeValue) {
        // HTML time input format is always HH:mm
        const timeObj = new Date(`1970-01-01T${timeValue}:00`);
        if (isValidDate(timeObj)) {
          tpl.datePicker.error.set('');
        } else {
          tpl.datePicker.error.set('invalid-time');
        }
      }
    },
    'submit .edit-date'(evt: JQuery.TriggeredEvent, tpl: DatePickerInstance) {
      evt.preventDefault();

      // The submitted form exposes its date/time inputs as named controls.
      const form = evt.target as HTMLFormElement & {
        date: HTMLInputElement;
        time: HTMLInputElement;
      };
      // Normalize any non-Latin digits (e.g. Persian/Arabic-Indic) before
      // parsing so due/start/end dates work in those locales (#5752).
      const dateValue = normalizeDigits(form.date.value);
      const timeValue = normalizeDigits(form.time.value) || '12:00'; // Default to 12:00 if no time given

      if (!dateValue) {
        tpl.datePicker.error.set('invalid-date');
        form.date.focus();
        return;
      }

      // Combine date and time: HTML date input is YYYY-MM-DD, time input is HH:mm
      const dateTimeString = `${dateValue}T${timeValue}:00`;
      const newCompleteDate = new Date(dateTimeString);

      if (!isValidDate(newCompleteDate)) {
        tpl.datePicker.error.set('invalid');
        return;
      }

      storeDate.call(tpl, newCompleteDate);
      Popup.back();
    },
    'click .js-delete-date'(evt: JQuery.TriggeredEvent, tpl: DatePickerInstance) {
      evt.preventDefault();
      deleteDate.call(tpl);
      Popup.back();
    },
  };
}

// Reactive datepicker state stored on the Blaze template instance.
interface DatePickerState {
  error: ReactiveVar<string>;
  // Current card (Blaze data context); dynamic shape, hence `any`.
  card: any;
  date: ReactiveVar<Date>;
  defaultTime: string;
}
interface DatePickerInstance extends Blaze.TemplateInstance {
  datePicker: DatePickerState;
}
interface SetupDatePickerOptions {
  defaultTime?: string;
  initialDate?: Date;
}
interface DatePickerCallbacks {
  storeDate: (date: Date) => void;
  deleteDate: () => void;
}
