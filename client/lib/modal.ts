const closedValue = null;
import { Blaze } from 'meteor/blaze';
import { FlowRouter } from 'meteor/ostrio:flow-router-extra';
import { ReactiveVar } from 'meteor/reactive-var';
import { EscapeActions } from '/client/lib/escapeActions';

window.Modal = new (class {
  _currentModal: ReactiveVar<ModalState | null>;
  _onCloseGoTo: string;
  _isWideModal: boolean;
  constructor() {
    this._currentModal = new ReactiveVar<ModalState | null>(closedValue);
    this._onCloseGoTo = '';
    this._isWideModal = false;
  }

  getHeaderName() {
    const currentModal = this._currentModal.get();
    return currentModal && currentModal.header;
  }

  getTemplateName() {
    const currentModal = this._currentModal.get();
    return currentModal && currentModal.modalName;
  }

  isOpen() {
    return this.getTemplateName() !== closedValue;
  }

  isWide() {
    return this._isWideModal;
  }

  close() {
    this._currentModal.set(closedValue);
    if (this._onCloseGoTo) {
      FlowRouter.go(this._onCloseGoTo);
    }
  }

  openWide(modalName: string, { header = '', onCloseGoTo = '' }: ModalOpenOptions = {}) {
    this._currentModal.set({ header, modalName });
    this._onCloseGoTo = onCloseGoTo;
    this._isWideModal = true;
  }

  open(modalName: string, { header = '', onCloseGoTo = '' }: ModalOpenOptions = {}) {
    this._currentModal.set({ header, modalName });
    this._onCloseGoTo = onCloseGoTo;
  }
})();

Blaze.registerHelper('Modal', Modal);

EscapeActions.register(
  'modalWindow',
  () => Modal.close(),
  () => Modal.isOpen(),
  { noClickEscapeOn: '.modal-container,.model-content' },
);

// The currently-open modal's header and template name.
interface ModalState {
  header: string;
  modalName: string;
}
