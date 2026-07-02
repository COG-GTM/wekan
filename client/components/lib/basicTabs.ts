import { Template } from 'meteor/templating';
import { Blaze } from 'meteor/blaze';
import { ReactiveVar } from 'meteor/reactive-var';

// Creation-time stack tracking which basicTabs is currently being rendered.
// Blaze creates parent views before children, so when tabContent.onCreated fires,
// its parent basicTabs instance is on top of this stack.
// This is necessary because Blaze content blocks render with parentView pointing
// back to the calling context (e.g. membersWidget), not the basicTabs template —
// so walking the view tree cannot find the basicTabs instance.
const _creatingStack: BasicTabsInstance[] = [];

Template.basicTabs.onCreated(function (this: BasicTabsInstance) {
  const activeTab = this.data.activeTab
    ? { slug: this.data.activeTab }
    : this.data.tabs[0];
  this._activeTab = new ReactiveVar(activeTab);

  this.isActiveSlug = (slug: string) => {
    const current = this._activeTab.get();
    return current && current.slug === slug;
  };

  _creatingStack.push(this);
});

Template.basicTabs.onRendered(function (this: BasicTabsInstance) {
  const idx = _creatingStack.lastIndexOf(this);
  if (idx !== -1) _creatingStack.splice(idx, 1);
});

Template.basicTabs.helpers({
  isActiveTab(slug: string) {
    if ((Template.instance() as BasicTabsInstance).isActiveSlug(slug)) {
      return 'active';
    }
  },
});

Template.basicTabs.events({
  // this: any — the click handler's data context is the tab object.
  'click .tab-item'(this: any, e: JQuery.TriggeredEvent, t: BasicTabsInstance) {
    t._activeTab.set(this);
  },
});

Template.tabContent.onCreated(function (this: TabContentInstance) {
  // Capture the parent basicTabs instance at creation time via the stack.
  // isActiveSlug reads a ReactiveVar on the basicTabs instance, so the
  // isActiveTab helper below will re-run reactively when the tab changes.
  this._basicTabsInst = _creatingStack[_creatingStack.length - 1] || null;
});

Template.tabContent.helpers({
  isActiveTab(slug: string) {
    const inst = (Template.instance() as TabContentInstance)._basicTabsInst;
    if (inst && inst.isActiveSlug(slug)) return 'active';
  },
});

interface BasicTabsInstance extends Blaze.TemplateInstance {
  _activeTab: ReactiveVar<any>;
  isActiveSlug: (slug: string) => boolean;
}

interface TabContentInstance extends Blaze.TemplateInstance {
  _basicTabsInst: BasicTabsInstance | null;
}
