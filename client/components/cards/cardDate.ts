import { Template } from 'meteor/templating';
import { Blaze } from 'meteor/blaze';
import { ReactiveVar } from 'meteor/reactive-var';
import { TAPi18n } from '/imports/i18n';
import { ReactiveCache } from '/imports/reactiveCache';
import {
  setupDatePicker,
  datePickerRendered,
  datePickerHelpers,
  datePickerEvents,
} from '/client/lib/datepicker';
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
import { dueDateClass } from '/client/lib/dueDateColor';

// --- DatePicker popups (edit date forms) ---

// editCardReceivedDatePopup
Template.editCardReceivedDatePopup.onCreated(function (this: EditCardDatePopupInstance) {
  const card = Template.currentData();
  setupDatePicker(this, {
    defaultTime: formatDateTime(now()),
    initialDate: card.getReceived() ? card.getReceived() : undefined,
  });
});

Template.editCardReceivedDatePopup.onRendered(function (this: EditCardDatePopupInstance) {
  datePickerRendered(this);
});

Template.editCardReceivedDatePopup.helpers(datePickerHelpers());

Template.editCardReceivedDatePopup.events(datePickerEvents({
  storeDate(this: any, date: Date) {
    this.datePicker.card.setReceived(date);
  },
  deleteDate(this: any) {
    this.datePicker.card.unsetReceived();
  },
}));

// editCardStartDatePopup
Template.editCardStartDatePopup.onCreated(function (this: EditCardDatePopupInstance) {
  const card = Template.currentData();
  setupDatePicker(this, {
    defaultTime: formatDateTime(now()),
    initialDate: card.getStart() ? card.getStart() : undefined,
  });
});

Template.editCardStartDatePopup.onRendered(function (this: EditCardDatePopupInstance) {
  datePickerRendered(this);
});

Template.editCardStartDatePopup.helpers(datePickerHelpers());

Template.editCardStartDatePopup.events(datePickerEvents({
  storeDate(this: any, date: Date) {
    this.datePicker.card.setStart(date);
  },
  deleteDate(this: any) {
    this.datePicker.card.unsetStart();
  },
}));

// editCardDueDatePopup
Template.editCardDueDatePopup.onCreated(function (this: EditCardDatePopupInstance) {
  const card = Template.currentData();
  setupDatePicker(this, {
    defaultTime: '1970-01-01 17:00:00',
    initialDate: card.getDue() ? card.getDue() : undefined,
  });
});

Template.editCardDueDatePopup.onRendered(function (this: EditCardDatePopupInstance) {
  datePickerRendered(this);
});

Template.editCardDueDatePopup.helpers(datePickerHelpers());

Template.editCardDueDatePopup.events(datePickerEvents({
  storeDate(this: any, date: Date) {
    this.datePicker.card.setDue(date);
  },
  deleteDate(this: any) {
    this.datePicker.card.unsetDue();
  },
}));

// editCardEndDatePopup
Template.editCardEndDatePopup.onCreated(function (this: EditCardDatePopupInstance) {
  const card = Template.currentData();
  setupDatePicker(this, {
    defaultTime: formatDateTime(now()),
    initialDate: card.getEnd() ? card.getEnd() : undefined,
  });
});

Template.editCardEndDatePopup.onRendered(function (this: EditCardDatePopupInstance) {
  datePickerRendered(this);
});

Template.editCardEndDatePopup.helpers(datePickerHelpers());

Template.editCardEndDatePopup.events(datePickerEvents({
  storeDate(this: any, date: Date) {
    this.datePicker.card.setEnd(date);
  },
  deleteDate(this: any) {
    this.datePicker.card.unsetEnd();
  },
}));

// --- Card date badge display helpers ---

// Shared onCreated logic for card date badge templates
function cardDateOnCreated(tpl: CardDateInstance) {
  tpl.date = new ReactiveVar<Date | undefined>(undefined);
  tpl.now = new ReactiveVar(now());
  window.setInterval(() => {
    tpl.now.set(now());
  }, 60000);
}

// Shared helpers for card date badge templates
function cardDateHelpers(extraHelpers: Record<string, (...args: any[]) => any>) {
  const base = {
    showWeek() {
      return getISOWeek((Template.instance() as CardDateInstance).date.get()!).toString();
    },
    showWeekOfYear() {
      const user = ReactiveCache.getCurrentUser();
      if (!user) return window.localStorage.getItem('showWeekOfYear') === 'true';
      return user.isShowWeekOfYear();
    },
    showDate() {
      const currentUser = ReactiveCache.getCurrentUser();
      const dateFormat = currentUser ? currentUser.getDateFormat() : (window.localStorage.getItem('dateFormat') || 'YYYY-MM-DD');
      return formatDateByUserPreference((Template.instance() as CardDateInstance).date.get()!, dateFormat, true);
    },
    showISODate() {
      return (Template.instance() as CardDateInstance).date.get()!.toISOString();
    },
  };
  return Object.assign(base, extraHelpers);
}

// cardReceivedDate
Template.cardReceivedDate.onCreated(function (this: CardDateInstance) {
  cardDateOnCreated(this);
  const self = this;
  self.autorun(() => {
    self.date.set(new Date(Template.currentData().getReceived()));
  });
});

Template.cardReceivedDate.helpers(cardDateHelpers({
  classes() {
    const tpl = Template.instance() as CardDateInstance;
    let classes = 'received-date ';
    const data = Template.currentData();
    const dueAt = data.getDue();
    const endAt = data.getEnd();
    const startAt = data.getStart();
    const theDate = tpl.date.get()!;

    if (
      (startAt && isAfter(theDate, startAt)) ||
      (endAt && isAfter(theDate, endAt)) ||
      (dueAt && isAfter(theDate, dueAt))
    ) {
      classes += 'overdue';
    } else {
      classes += 'not-due';
    }
    return classes;
  },
  showTitle() {
    const tpl = Template.instance() as CardDateInstance;
    const currentUser = ReactiveCache.getCurrentUser();
    const dateFormat = currentUser ? currentUser.getDateFormat() : (window.localStorage.getItem('dateFormat') || 'YYYY-MM-DD');
    const formattedDate = formatDateByUserPreference(tpl.date.get()!, dateFormat, true);
    return `${TAPi18n.__('card-received-on')} ${formattedDate}`;
  },
}));

Template.cardReceivedDate.events({
  'click .js-edit-date': Popup.open('editCardReceivedDate'),
});

// cardStartDate
Template.cardStartDate.onCreated(function (this: CardDateInstance) {
  cardDateOnCreated(this);
  const self = this;
  self.autorun(() => {
    self.date.set(new Date(Template.currentData().getStart()));
  });
});

Template.cardStartDate.helpers(cardDateHelpers({
  classes() {
    const tpl = Template.instance() as CardDateInstance;
    let classes = 'start-date ';
    const data = Template.currentData();
    const dueAt = data.getDue();
    const endAt = data.getEnd();
    const theDate = tpl.date.get()!;
    const nowVal = tpl.now.get();

    if ((endAt && isAfter(theDate, endAt)) || (dueAt && isAfter(theDate, dueAt))) {
      classes += 'overdue';
    } else if (isAfter(theDate, nowVal)) {
      classes += 'not-due';
    } else {
      classes += 'current';
    }
    return classes;
  },
  showTitle() {
    const tpl = Template.instance() as CardDateInstance;
    const currentUser = ReactiveCache.getCurrentUser();
    const dateFormat = currentUser ? currentUser.getDateFormat() : (window.localStorage.getItem('dateFormat') || 'YYYY-MM-DD');
    const formattedDate = formatDateByUserPreference(tpl.date.get()!, dateFormat, true);
    return `${TAPi18n.__('card-start-on')} ${formattedDate}`;
  },
}));

Template.cardStartDate.events({
  'click .js-edit-date': Popup.open('editCardStartDate'),
});

// cardDueDate
Template.cardDueDate.onCreated(function (this: CardDateInstance) {
  cardDateOnCreated(this);
  const self = this;
  self.autorun(() => {
    self.date.set(new Date(Template.currentData().getDue()));
  });
});

Template.cardDueDate.helpers(cardDateHelpers({
  classes() {
    const tpl = Template.instance() as CardDateInstance;
    const data = Template.currentData();
    const endAt = data.getEnd();
    const theDate = tpl.date.get()!;
    const nowVal = tpl.now.get();

    return `due-date ${dueDateClass(theDate, nowVal, endAt)}`;
  },
  showTitle() {
    const tpl = Template.instance() as CardDateInstance;
    const currentUser = ReactiveCache.getCurrentUser();
    const dateFormat = currentUser ? currentUser.getDateFormat() : (window.localStorage.getItem('dateFormat') || 'YYYY-MM-DD');
    const formattedDate = formatDateByUserPreference(tpl.date.get()!, dateFormat, true);
    return `${TAPi18n.__('card-due-on')} ${formattedDate}`;
  },
}));

Template.cardDueDate.events({
  'click .js-edit-date': Popup.open('editCardDueDate'),
});

// cardEndDate
Template.cardEndDate.onCreated(function (this: CardDateInstance) {
  cardDateOnCreated(this);
  const self = this;
  self.autorun(() => {
    self.date.set(new Date(Template.currentData().getEnd()));
  });
});

Template.cardEndDate.helpers(cardDateHelpers({
  classes() {
    const tpl = Template.instance() as CardDateInstance;
    let classes = 'end-date ';
    const data = Template.currentData();
    const dueAt = data.getDue();
    const theDate = tpl.date.get()!;

    if (!dueAt) {
      classes += 'completed';
    } else if (isBefore(theDate, dueAt)) {
      classes += 'completed-early';
    } else if (isAfter(theDate, dueAt)) {
      classes += 'completed-late';
    } else {
      classes += 'completed-on-time';
    }
    return classes;
  },
  showTitle() {
    const tpl = Template.instance() as CardDateInstance;
    return `${TAPi18n.__('card-end-on')} ${format(tpl.date.get()!, 'LLLL')}`;
  },
}));

Template.cardEndDate.events({
  'click .js-edit-date': Popup.open('editCardEndDate'),
});

// cardCustomFieldDate
Template.cardCustomFieldDate.onCreated(function (this: CardDateInstance) {
  cardDateOnCreated(this);
  const self = this;
  self.autorun(() => {
    self.date.set(new Date(Template.currentData().value));
  });
});

Template.cardCustomFieldDate.helpers(cardDateHelpers({
  showDate() {
    const tpl = Template.instance() as CardDateInstance;
    // this will start working once mquandalle:moment
    // is updated to at least moment.js 2.10.5
    // until then, the date is displayed in the "L" format
    // date.get() is a plain Date; .calendar() is the moment API expected here.
    return (tpl.date.get() as any).calendar(null, {
      sameElse: 'llll',
    });
  },
  showTitle() {
    const tpl = Template.instance() as CardDateInstance;
    const currentUser = ReactiveCache.getCurrentUser();
    const dateFormat = currentUser ? currentUser.getDateFormat() : (window.localStorage.getItem('dateFormat') || 'YYYY-MM-DD');
    const formattedDate = formatDateByUserPreference(tpl.date.get()!, dateFormat, true);
    return `${formattedDate}`;
  },
  classes() {
    return 'customfield-date';
  },
}));

// --- Minicard date templates ---

// minicardReceivedDate
Template.minicardReceivedDate.onCreated(function (this: CardDateInstance) {
  cardDateOnCreated(this);
  const self = this;
  self.autorun(() => {
    self.date.set(new Date(Template.currentData().getReceived()));
  });
});

Template.minicardReceivedDate.helpers(cardDateHelpers({
  classes() {
    const tpl = Template.instance() as CardDateInstance;
    let classes = 'received-date ';
    const data = Template.currentData();
    const dueAt = data.getDue();
    const endAt = data.getEnd();
    const startAt = data.getStart();
    const theDate = tpl.date.get()!;

    if (
      (startAt && isAfter(theDate, startAt)) ||
      (endAt && isAfter(theDate, endAt)) ||
      (dueAt && isAfter(theDate, dueAt))
    ) {
      classes += 'overdue';
    } else {
      classes += 'not-due';
    }
    return classes;
  },
  showTitle() {
    const tpl = Template.instance() as CardDateInstance;
    const currentUser = ReactiveCache.getCurrentUser();
    const dateFormat = currentUser ? currentUser.getDateFormat() : (window.localStorage.getItem('dateFormat') || 'YYYY-MM-DD');
    const formattedDate = formatDateByUserPreference(tpl.date.get()!, dateFormat, true);
    return `${TAPi18n.__('card-received-on')} ${formattedDate}`;
  },
  showDate() {
    const currentUser = ReactiveCache.getCurrentUser();
    const dateFormat = currentUser ? currentUser.getDateFormat() : (window.localStorage.getItem('dateFormat') || 'YYYY-MM-DD');
    return formatDateByUserPreference((Template.instance() as CardDateInstance).date.get()!, dateFormat, true);
  },
}));

Template.minicardReceivedDate.events({
  'click .js-edit-date': Popup.open('editCardReceivedDate'),
});

// minicardStartDate
Template.minicardStartDate.onCreated(function (this: CardDateInstance) {
  cardDateOnCreated(this);
  const self = this;
  self.autorun(() => {
    self.date.set(new Date(Template.currentData().getStart()));
  });
});

Template.minicardStartDate.helpers(cardDateHelpers({
  classes() {
    const tpl = Template.instance() as CardDateInstance;
    let classes = 'start-date ';
    const data = Template.currentData();
    const dueAt = data.getDue();
    const endAt = data.getEnd();
    const theDate = tpl.date.get()!;
    const nowVal = tpl.now.get();

    if ((endAt && isAfter(theDate, endAt)) || (dueAt && isAfter(theDate, dueAt))) {
      classes += 'overdue';
    } else if (isAfter(theDate, nowVal)) {
      classes += 'not-due';
    } else {
      classes += 'current';
    }
    return classes;
  },
  showTitle() {
    const tpl = Template.instance() as CardDateInstance;
    const currentUser = ReactiveCache.getCurrentUser();
    const dateFormat = currentUser ? currentUser.getDateFormat() : (window.localStorage.getItem('dateFormat') || 'YYYY-MM-DD');
    const formattedDate = formatDateByUserPreference(tpl.date.get()!, dateFormat, true);
    return `${TAPi18n.__('card-start-on')} ${formattedDate}`;
  },
  showDate() {
    const currentUser = ReactiveCache.getCurrentUser();
    const dateFormat = currentUser ? currentUser.getDateFormat() : (window.localStorage.getItem('dateFormat') || 'YYYY-MM-DD');
    return formatDateByUserPreference((Template.instance() as CardDateInstance).date.get()!, dateFormat, true);
  },
}));

Template.minicardStartDate.events({
  'click .js-edit-date': Popup.open('editCardStartDate'),
});

// minicardDueDate
Template.minicardDueDate.onCreated(function (this: CardDateInstance) {
  cardDateOnCreated(this);
  const self = this;
  self.autorun(() => {
    self.date.set(new Date(Template.currentData().getDue()));
  });
});

Template.minicardDueDate.helpers(cardDateHelpers({
  classes() {
    const tpl = Template.instance() as CardDateInstance;
    const data = Template.currentData();
    const endAt = data.getEnd();
    const theDate = tpl.date.get()!;
    const nowVal = tpl.now.get();

    return `due-date ${dueDateClass(theDate, nowVal, endAt)}`;
  },
  showTitle() {
    const tpl = Template.instance() as CardDateInstance;
    const currentUser = ReactiveCache.getCurrentUser();
    const dateFormat = currentUser ? currentUser.getDateFormat() : (window.localStorage.getItem('dateFormat') || 'YYYY-MM-DD');
    const formattedDate = formatDateByUserPreference(tpl.date.get()!, dateFormat, true);
    return `${TAPi18n.__('card-due-on')} ${formattedDate}`;
  },
  showDate() {
    const currentUser = ReactiveCache.getCurrentUser();
    const dateFormat = currentUser ? currentUser.getDateFormat() : (window.localStorage.getItem('dateFormat') || 'YYYY-MM-DD');
    return formatDateByUserPreference((Template.instance() as CardDateInstance).date.get()!, dateFormat, true);
  },
}));

Template.minicardDueDate.events({
  'click .js-edit-date': Popup.open('editCardDueDate'),
});

// minicardEndDate
Template.minicardEndDate.onCreated(function (this: CardDateInstance) {
  cardDateOnCreated(this);
  const self = this;
  self.autorun(() => {
    self.date.set(new Date(Template.currentData().getEnd()));
  });
});

Template.minicardEndDate.helpers(cardDateHelpers({
  classes() {
    const tpl = Template.instance() as CardDateInstance;
    let classes = 'end-date ';
    const data = Template.currentData();
    const dueAt = data.getDue();
    const theDate = tpl.date.get()!;

    if (!dueAt) {
      classes += 'completed';
    } else if (isBefore(theDate, dueAt)) {
      classes += 'completed-early';
    } else if (isAfter(theDate, dueAt)) {
      classes += 'completed-late';
    } else {
      classes += 'completed-on-time';
    }
    return classes;
  },
  showTitle() {
    const tpl = Template.instance() as CardDateInstance;
    return `${TAPi18n.__('card-end-on')} ${format(tpl.date.get()!, 'LLLL')}`;
  },
  showDate() {
    const currentUser = ReactiveCache.getCurrentUser();
    const dateFormat = currentUser ? currentUser.getDateFormat() : (window.localStorage.getItem('dateFormat') || 'YYYY-MM-DD');
    return formatDateByUserPreference((Template.instance() as CardDateInstance).date.get()!, dateFormat, true);
  },
}));

Template.minicardEndDate.events({
  'click .js-edit-date': Popup.open('editCardEndDate'),
});

// minicardCustomFieldDate
Template.minicardCustomFieldDate.onCreated(function (this: CardDateInstance) {
  cardDateOnCreated(this);
  const self = this;
  self.autorun(() => {
    self.date.set(new Date(Template.currentData().value));
  });
});

Template.minicardCustomFieldDate.helpers(cardDateHelpers({
  showDate() {
    const currentUser = ReactiveCache.getCurrentUser();
    const dateFormat = currentUser ? currentUser.getDateFormat() : (window.localStorage.getItem('dateFormat') || 'YYYY-MM-DD');
    return formatDateByUserPreference((Template.instance() as CardDateInstance).date.get()!, dateFormat, true);
  },
  showTitle() {
    const tpl = Template.instance() as CardDateInstance;
    const currentUser = ReactiveCache.getCurrentUser();
    const dateFormat = currentUser ? currentUser.getDateFormat() : (window.localStorage.getItem('dateFormat') || 'YYYY-MM-DD');
    const formattedDate = formatDateByUserPreference(tpl.date.get()!, dateFormat, true);
    return `${formattedDate}`;
  },
  classes() {
    return 'customfield-date';
  },
}));

// --- Vote and Poker end date badge templates ---

// voteEndDate
Template.voteEndDate.onCreated(function (this: CardDateInstance) {
  cardDateOnCreated(this);
  const self = this;
  self.autorun(() => {
    self.date.set(new Date(Template.currentData().getVoteEnd()));
  });
});

Template.voteEndDate.helpers(cardDateHelpers({
  classes() {
    return 'end-date ';
  },
  showDate() {
    const currentUser = ReactiveCache.getCurrentUser();
    const dateFormat = currentUser ? currentUser.getDateFormat() : (window.localStorage.getItem('dateFormat') || 'YYYY-MM-DD');
    return formatDateByUserPreference((Template.instance() as CardDateInstance).date.get()!, dateFormat, true);
  },
  showTitle() {
    const tpl = Template.instance() as CardDateInstance;
    return `${TAPi18n.__('card-end-on')} ${tpl.date.get()!.toLocaleString()}`;
  },
}));

Template.voteEndDate.events({
  'click .js-edit-date': Popup.open('editVoteEndDate'),
});

// pokerEndDate
Template.pokerEndDate.onCreated(function (this: CardDateInstance) {
  cardDateOnCreated(this);
  const self = this;
  self.autorun(() => {
    self.date.set(new Date(Template.currentData().getPokerEnd()));
  });
});

Template.pokerEndDate.helpers(cardDateHelpers({
  classes() {
    return 'end-date ';
  },
  showDate() {
    const currentUser = ReactiveCache.getCurrentUser();
    const dateFormat = currentUser ? currentUser.getDateFormat() : (window.localStorage.getItem('dateFormat') || 'YYYY-MM-DD');
    return formatDateByUserPreference((Template.instance() as CardDateInstance).date.get()!, dateFormat, true);
  },
  showTitle() {
    const tpl = Template.instance() as CardDateInstance;
    return `${TAPi18n.__('card-end-on')} ${format(tpl.date.get()!, 'LLLL')}`;
  },
}));

Template.pokerEndDate.events({
  'click .js-edit-date': Popup.open('editPokerEndDate'),
});

// Card date badge templates cache the displayed date and a ticking "now" in
// reactive vars (see cardDateOnCreated). `date` is undefined until the autorun
// first resolves the card's stored date.
interface CardDateInstance extends Blaze.TemplateInstance {
  date: ReactiveVar<Date | undefined>;
  now: ReactiveVar<Date>;
}

// The edit-date popups delegate their reactive state to the shared datepicker
// (see setupDatePicker); `datePicker` holds the picker state plus the card.
interface EditCardDatePopupInstance extends Blaze.TemplateInstance {
  datePicker: any;
}
