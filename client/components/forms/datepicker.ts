import { Template } from 'meteor/templating';
import {
  setupDatePicker,
  datePickerRendered,
  datePickerHelpers,
  datePickerEvents,
  DatePickerInstance,
} from '/client/lib/datepicker';

Template.datepicker.onCreated(function (this: DatePickerInstance) {
  setupDatePicker(this);
});

Template.datepicker.onRendered(function (this: DatePickerInstance) {
  datePickerRendered(this);
});

Template.datepicker.helpers(datePickerHelpers());
