// A inlined form is used to provide a quick edition of single field for a given
// document. Clicking on a edit button should display the form to edit the field
// value. The form can then be submited, or just closed.
//
// When the form is closed we save non-submitted values in memory to avoid any
// data loss.
//
// Usage:
//
//   +inlineForm
//     // the content when the form is open
//   else
//     // the content when the form is close (optional)

import { Template } from 'meteor/templating';
import { ReactiveVar } from 'meteor/reactive-var';
import { Tracker } from 'meteor/tracker';
import { Blaze } from 'meteor/blaze';
import { EscapeActions } from '/client/lib/escapeActions';

// We can only have one inlined form element opened at a time
const currentlyOpenedForm = new ReactiveVar<InlinedFormInstance | null>(null);

Template.inlinedForm.onCreated(function (this: InlinedFormInstance) {
  this.isOpen = new ReactiveVar(false);
});

Template.inlinedForm.onRendered(function (this: InlinedFormInstance) {
  const tpl = this;
  tpl.autorun(() => {
    if (tpl.isOpen.get()) {
      Tracker.afterFlush(() => {
        const input = tpl.find('textarea,input[type=text]') as
          | HTMLInputElement
          | HTMLTextAreaElement
          | null;
        if (input && typeof input.focus === 'function') {
          setTimeout(() => {
            input.focus();
            if (input.value && input.select) {
              input.select();
            }
          }, 50);
        }
      });
    }
  });
});

Template.inlinedForm.onDestroyed(function () {
  currentlyOpenedForm.set(null);
});

Template.inlinedForm.helpers({
  isOpen() {
    return (Template.instance() as InlinedFormInstance).isOpen;
  },
});

Template.inlinedForm.events({
  'click .js-close-inlined-form'(evt: JQuery.TriggeredEvent, tpl: InlinedFormInstance) {
    tpl.isOpen.set(false);
    currentlyOpenedForm.set(null);
  },
  'click .js-open-inlined-form'(evt: JQuery.TriggeredEvent, tpl: InlinedFormInstance) {
    evt.preventDefault();
    EscapeActions.clickExecute(evt.target, 'inlinedForm');
    tpl.isOpen.set(true);
    currentlyOpenedForm.set(tpl);
  },
  'keydown form textarea'(evt: JQuery.TriggeredEvent, tpl: InlinedFormInstance) {
    if (evt.keyCode === 13 && (evt.metaKey || evt.ctrlKey)) {
      tpl.find('button[type=submit]').click();
    }
  },
  submit(evt: JQuery.TriggeredEvent, tpl: InlinedFormInstance) {
    const data = Template.currentData();
    if (data.autoclose !== false) {
      Tracker.afterFlush(() => {
        tpl.isOpen.set(false);
        currentlyOpenedForm.set(null);
      });
    }
  },
});

// Press escape to close the currently opened inlinedForm
EscapeActions.register(
  'inlinedForm',
  () => {
    const form = currentlyOpenedForm.get();
    if (form) {
      if (form.isOpen) {
        form.isOpen.set(false);
        currentlyOpenedForm.set(null);
      }
    }
  },
  () => {
    return currentlyOpenedForm.get() !== null;
  },
  {
    enabledOnClick: false,
  },
);

// The inlinedForm Blaze template instance carries an `isOpen` reactive flag.
interface InlinedFormInstance extends Blaze.TemplateInstance {
  isOpen: ReactiveVar<boolean>;
}
