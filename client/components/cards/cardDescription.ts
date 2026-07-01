import { Template } from 'meteor/templating';
import { Blaze } from 'meteor/blaze';
import { ReactiveVar } from 'meteor/reactive-var';

const descriptionFormIsOpen = new ReactiveVar(false);

Template.descriptionForm.onDestroyed(function () {
  descriptionFormIsOpen.set(false);
  $('.note-popover').hide();
});

Template.descriptionForm.helpers({
  descriptionFormIsOpen() {
    return descriptionFormIsOpen.get();
  },
});

Template.descriptionForm.events({
  // `this` is the card data context, which exposes setDescription().
  async 'submit .js-card-description'(this: any, event: JQuery.TriggeredEvent, tpl: DescriptionFormInstance) {
    event.preventDefault();
    const description = tpl.currentComponent ? tpl.currentComponent().getValue() : tpl.$('textarea').val();
    await this.setDescription(description);
  },
  // Pressing Ctrl+Enter should submit the form
  'keydown form textarea'(evt: JQuery.TriggeredEvent, tpl: Blaze.TemplateInstance) {
    if (evt.keyCode === 13 && (evt.metaKey || evt.ctrlKey)) {
      const submitButton = tpl.find('button[type=submit]') as HTMLElement | null;
      if (submitButton) {
        submitButton.click();
      }
    }
  },
});

// The description form instance may hold a rich-text editor component accessor
// (installed elsewhere) used to read the edited value.
interface DescriptionFormInstance extends Blaze.TemplateInstance {
  currentComponent?: () => { getValue(): string };
}
