import { Blaze } from 'meteor/blaze';
import { ReactiveVar } from 'meteor/reactive-var';
import { InfiniteScrolling } from '/client/lib/infiniteScrolling';

// The board Sidebar Blaze template instance (client/components/sidebar/sidebar.ts).
// Its onCreated attaches the reactive state and the imperative methods below so
// other components (activities, boardHeader) can drive the sidebar via the
// shared service getter. Shared here because both the sidebar component and its
// consumers need this shape.
export interface SidebarTemplateInstance extends Blaze.TemplateInstance {
  _isOpen: ReactiveVar<boolean>;
  _view: ReactiveVar<string>;
  _hideCardCounterList: ReactiveVar<boolean>;
  _hideBoardMemberList: ReactiveVar<boolean>;
  infiniteScrolling: InfiniteScrolling;
  // The activities Blaze template instance registers itself here so the sidebar
  // can page it in on scroll; only loadNextPage is invoked on it.
  activitiesInstance: { loadNextPage?: () => void } | null;
  isOpen(): boolean;
  open(): void;
  hide(): void;
  toggle(): void;
  calculateNextPeak(): void;
  reachNextPeak(): void;
  isTongueHidden(): boolean;
  scrollTop(): void;
  getView(): string;
  setView(view?: string): void;
  isDefaultView(): boolean;
  getViewTemplate(): string;
  getViewTitle(): string;
  showTongueTitle(): string;
}
