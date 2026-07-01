import { Template } from 'meteor/templating';
import { Blaze } from 'meteor/blaze';
import { Meteor } from 'meteor/meteor';
import { ReactiveVar } from 'meteor/reactive-var';
import { ReactiveCache } from '/imports/reactiveCache';
import { ObjectId } from 'bson';
import DOMPurify from 'dompurify';
import { sanitizeHTML, sanitizeText } from '/imports/lib/secureDOMPurify';
import uploadProgressManager from '../../lib/uploadProgressManager';
import { attachmentMigrationManager } from '/client/lib/attachmentMigrationManager';
import Attachments from '/models/attachments';
import { Utils } from '/client/lib/utils';
import { formatDateTime } from '/imports/lib/dateUtils';
import { EscapeActions } from '/client/lib/escapeActions';

const { filesize } = require('filesize');
import prettyMilliseconds from 'pretty-ms';

// We store current card ID and the ID of currently opened attachment in a
// global var. This is used so that we know what's the next attachment to open
// when the user clicks on the prev/next button in the attachment viewer.
let cardId: string | null | undefined = null;
let openAttachmentId: string | null | undefined = null;

// Used to store the start and end coordinates of a touch event for attachment swiping
let touchStartCoords: TouchCoords | null = null;
let touchEndCoords: TouchCoords | null = null;

// Stores link to the attachment for which attachment actions popup was opened
let attachmentActionsLink: string | null = null;

Template.attachmentGallery.events({
  'click .open-preview'(event: JQuery.TriggeredEvent) {

    openAttachmentId = $(event.currentTarget).attr("data-attachment-id");
    cardId = $(event.currentTarget).attr("data-card-id");

    openAttachmentViewer(openAttachmentId);
  },
  'click .js-add-attachment': Popup.open('cardAttachments'),
  // If we let this event bubble, FlowRouter will handle it and empty the page
  // content, see #101.
  'click .js-download'(event: JQuery.TriggeredEvent) {
    event.stopPropagation();
  },
  'click .js-open-attachment-menu': Popup.open('attachmentActions'),
  'mouseover .js-open-attachment-menu'(event: JQuery.TriggeredEvent) { // For some reason I cannot combine handlers for "click .js-open-attachment-menu" and "mouseover .js-open-attachment-menu" events so this is a quick workaround.
    attachmentActionsLink = event.currentTarget.getAttribute("data-attachment-link");
  },
  'click .js-rename': Popup.open('attachmentRename'),
  'click .js-confirm-delete': Popup.afterConfirm('attachmentDelete', async function(this: any) {
      const card = this.meta && this.meta.cardId ? ReactiveCache.getCard(this.meta.cardId) : null;
      if (card && card.coverId === this._id) {
        await card.unsetCover();
      }
      await Attachments.removeAsync(this._id);
      Popup.back();
  }),
});

function getNextAttachmentId(currentAttachmentId: any, offset = 0) {
    const attachments = ReactiveCache.getAttachments({'meta.cardId': cardId});

  let i = 0;
  for (; i < attachments.length; i++) {
    if (attachments[i]._id === currentAttachmentId) {
      break;
    }
  }
  return attachments[(i + offset + 1 + attachments.length) % attachments.length]._id;
}

function getPrevAttachmentId(currentAttachmentId: any, offset = 0) {
  const attachments = ReactiveCache.getAttachments({'meta.cardId': cardId});

  let i = 0;
  for (; i < attachments.length; i++) {
    if (attachments[i]._id === currentAttachmentId) {
      break;
    }
  }
  return attachments[(i + offset - 1 + attachments.length) % attachments.length]._id;
}

function attachmentCanBeOpened(attachment: any) {
  return (
    attachment.isImage ||
    attachment.isPDF ||
    attachment.isText ||
    attachment.isJSON ||
    attachment.isVideo ||
    attachment.isAudio
  );
}

function getAttachmentUrl(attachment: any) {
  return attachment && typeof attachment.link === 'function' ? attachment.link() : '';
}

function openAttachmentViewer(attachmentId: any) {
  const attachment = ReactiveCache.getAttachment(attachmentId);

  // Check if we can open the attachment (if we have a viewer for it) and exit if not
  if (!attachmentCanBeOpened(attachment)) {
    return;
  }

  /*
  Instructions for adding a new viewer:
    - add a new case to the switch statement below
    - implement cleanup in the closeAttachmentViewer() function, if necessary
    - mark attachment type as openable by adding a new condition to the attachmentCanBeOpened function
  */
  switch(true){
    case (attachment.isImage):
      $("#image-viewer").attr("src", getAttachmentUrl(attachment));
      $("#image-viewer").removeClass("hidden");
      break;
    case (attachment.isPDF):
      $("#pdf-viewer").attr("data", getAttachmentUrl(attachment));
      $("#pdf-viewer").removeClass("hidden");
      break;
    case (attachment.isVideo):
      // We have to create a new <source> DOM element and append it to the video
      // element, otherwise the video won't load
      let videoSource = document.createElement('source');
      videoSource.setAttribute('src', getAttachmentUrl(attachment));
      $("#video-viewer").append(videoSource);

      $("#video-viewer").removeClass("hidden");
      break;
    case (attachment.isAudio):
      // We have to create a new <source> DOM element and append it to the audio
      // element, otherwise the audio won't load
      let audioSource = document.createElement('source');
      audioSource.setAttribute('src', getAttachmentUrl(attachment));
      $("#audio-viewer").append(audioSource);

      $("#audio-viewer").removeClass("hidden");
      break;
    case (attachment.isText):
    case (attachment.isJSON):
      $("#txt-viewer").attr("data", getAttachmentUrl(attachment));
      $("#txt-viewer").removeClass("hidden");
      break;
  }

  $('#attachment-name').text(attachment.name);
  $('#viewer-overlay').removeClass('hidden');
}

function closeAttachmentViewer() {
  $("#viewer-overlay").addClass("hidden");

  // We need to reset the viewers to avoid showing previous attachments
  $("#image-viewer").attr("src", "");
  $("#image-viewer").addClass("hidden");

  $("#pdf-viewer").attr("data", "");
  $("#pdf-viewer").addClass("hidden");

  $("#txt-viewer").attr("data", "");
  $("#txt-viewer").addClass("hidden");

  ($("#video-viewer").get(0) as HTMLVideoElement).pause(); // Stop playback
  ($("#video-viewer").get(0) as HTMLVideoElement).currentTime = 0;
  $("#video-viewer").empty();
  $("#video-viewer").addClass("hidden");

  ($("#audio-viewer").get(0) as HTMLAudioElement).pause(); // Stop playback
  ($("#audio-viewer").get(0) as HTMLAudioElement).currentTime = 0;
  $("#audio-viewer").empty();
  $("#audio-viewer").addClass("hidden");
}

function openNextAttachment() {
  closeAttachmentViewer();

    let i = 0;
    // Find an attachment that can be opened
    while (true) {
      const id = getNextAttachmentId(openAttachmentId, i);
      const attachment = ReactiveCache.getAttachment(id);
      if (attachmentCanBeOpened(attachment)) {
        openAttachmentId = id;
        openAttachmentViewer(id);
        break;
      }
      i++;
    }
}

function openPrevAttachment() {
  closeAttachmentViewer();

    let i = 0;
    // Find an attachment that can be opened
    while (true) {
      const id = getPrevAttachmentId(openAttachmentId, i);
      const attachment = ReactiveCache.getAttachment(id);
      if (attachmentCanBeOpened(attachment)) {
        openAttachmentId = id;
        openAttachmentViewer(id);
        break;
      }
      i--;
    }
}

function processTouch(){

  const xDist = touchEndCoords!.x - touchStartCoords!.x;
  const yDist = touchEndCoords!.y - touchStartCoords!.y;

  // Left swipe
  if (Math.abs(xDist) > Math.abs(yDist) && xDist < 0) {
    openNextAttachment();
  }

  // Right swipe
  if (Math.abs(xDist) > Math.abs(yDist) && xDist > 0) {
    openPrevAttachment();
  }

  // Up swipe
  if (Math.abs(yDist) > Math.abs(xDist) && yDist < 0) {
    closeAttachmentViewer();
  }

}

Template.attachmentViewer.events({
  'touchstart #viewer-container'(event: JQuery.TriggeredEvent) {
    const touches = (event.originalEvent as TouchEvent).changedTouches;
    touchStartCoords = {
      x: touches[0].screenX,
      y: touches[0].screenY
    }
  },
  'touchend #viewer-container'(event: JQuery.TriggeredEvent) {
    const touches = (event.originalEvent as TouchEvent).changedTouches;
    touchEndCoords = {
      x: touches[0].screenX,
      y: touches[0].screenY
    }
    processTouch();
  },
  'click #viewer-container'(event: JQuery.TriggeredEvent) {

    // Make sure the click was on #viewer-container and not on any of its children
    if(event.target !== event.currentTarget) {
      event.stopPropagation();
      return;
    }

    closeAttachmentViewer();
  },
  'click #viewer-content'(event: JQuery.TriggeredEvent) {

    // Make sure the click was on #viewer-content and not on any of its children
    if(event.target !== event.currentTarget) {
      event.stopPropagation();
      return;
    }

    closeAttachmentViewer();
  },
  'click #viewer-close'() {
    closeAttachmentViewer();
  },
  'click #next-attachment'() {
    openNextAttachment();
  },
  'click #prev-attachment'() {
    openPrevAttachment();
  },
});

Template.attachmentGallery.helpers({
  attachments() {
    const card = Template.currentData();
    if (!card) return [];
    const cardId = typeof card.getRealId === 'function' ? card.getRealId() : card._id;
    if (!cardId) return [];
    // ostrio:files find() returns a dynamic FilesCursor exposing .cursor/.each.
    const filesCursor: any = Attachments.find(
      { 'meta.cardId': cardId },
      { sort: { uploadedAt: -1 } },
    );
    // Call fetch() on the underlying Mongo cursor to establish a reactive
    // dependency directly inside this Blaze computation. Without this,
    // .each() (which calls cursor.map()) would not register reactivity and
    // newly-uploaded attachments would not appear until a page reload.
    if (filesCursor && filesCursor.cursor) {
      filesCursor.cursor.fetch();
    }
    return filesCursor.each();
  },
  isBoardAdmin() {
    return ReactiveCache.getCurrentUser()?.isBoardAdmin();
  },
  fileSize(size: any) {
    const ret = filesize(size);
    return ret;
  },
  sanitize(value: any) {
    return sanitizeHTML(value);
  },
  uploaderName(this: any) {
    const uploaderId = this.userId;
    if (!uploaderId) return '';
    const uploader = ReactiveCache.getUser(uploaderId);
    if (!uploader) return '';
    return uploader.profile && uploader.profile.fullname
      ? uploader.profile.fullname
      : uploader.username || '';
  },
  uploadedAt(this: any) {
    if (this.uploadedAtOstrio) {
      return formatDateTime(this.uploadedAtOstrio);
    }
    // Fall back to ObjectId timestamp (first 4 bytes = Unix seconds)
    try {
      const ts = parseInt(this._id.substring(0, 8), 16) * 1000;
      if (!isNaN(ts)) return formatDateTime(new Date(ts));
    } catch (_) {}
    return '';
  },
});

Template.cardAttachmentsPopup.onCreated(function(this: CardAttachmentsPopupInstance) {
  this.uploads = new ReactiveVar<any[]>([]);
});

Template.cardAttachmentsPopup.helpers({
  getEstimateTime(upload: any) {
    const ret = prettyMilliseconds(upload.estimateTime.get());
    return ret;
  },
  getEstimateSpeed(upload: any) {
    const ret = filesize(upload.estimateSpeed.get(), {round: 0}) + "/s";
    return ret;
  },
  uploads() {
    return (Template.instance() as CardAttachmentsPopupInstance).uploads.get();
  }
});

Template.cardAttachmentsPopup.events({
  async 'change .js-attach-file'(this: any, event: JQuery.TriggeredEvent, templateInstance: CardAttachmentsPopupInstance) {
    event.stopPropagation();
    const card = this;
    const files = (event.currentTarget as HTMLInputElement).files;
    if (files) {
      let uploads: any[] = [];
      const uploaders = await handleFileUpload(card, files);

      uploaders.forEach((uploader: any) => {
        uploader.on('start', function(this: any) {
          uploads.push(this);
          templateInstance.uploads.set(uploads);
        });
        uploader.on('end', (error: any, fileRef: any) => {
          uploads = uploads.filter(_upload => _upload.config.fileId != fileRef._id);
          templateInstance.uploads.set(uploads);
          if (uploads.length == 0 ) {
            Popup.back();
          }
        });
      });
    }
  },
  'click .js-computer-upload'(event: JQuery.TriggeredEvent, templateInstance: Blaze.TemplateInstance) {
    // Prevent the click fired when the OS file-picker dialog closes from
    // triggering EscapeActions and closing the popup before the upload starts.
    // Same pattern as swimlanes.js after drag operations.
    EscapeActions.preventNextClick();
    (templateInstance.find('.js-attach-file') as HTMLElement).click();
    event.preventDefault();
  },
  'click .js-upload-clipboard-image': Popup.open('previewClipboardImage'),
});

const MAX_IMAGE_PIXEL = Utils.MAX_IMAGE_PIXEL;
// Utils exposes COMPRESS_RATIO, not IMAGE_COMPRESS_RATIO; kept as-is to preserve
// the original (undefined) runtime value.
const COMPRESS_RATIO = (Utils as any).IMAGE_COMPRESS_RATIO;
// Holds the most recent pasted/dropped clipboard image result (dynamic shape).
let pastedResults: any = null;

// Shared upload logic for drag-and-drop functionality
export async function handleFileUpload(card: any, files: any) {
  if (!files || files.length === 0) {
    return [];
  }

  // Check if board allows attachments
  const board = card.board();
  if (!board || !board.allowsAttachments) {
    if (process.env.DEBUG === 'true') {
      console.warn('Attachments not allowed on this board');
    }
    return [];
  }

  // Check if user can modify the card
  if (!Utils.canModifyCard()) {
    if (process.env.DEBUG === 'true') {
      console.warn('User does not have permission to modify this card');
    }
    return [];
  }

  const uploads: any[] = [];

  for (const file of files) {
    // Basic file validation
    if (!file || !file.name) {
      if (process.env.DEBUG === 'true') {
        console.warn('Invalid file object');
      }
      continue;
    }

    const fileId = new ObjectId().toString();
    let fileName = sanitizeText(file.name);

    // If sanitized filename is not same as original filename,
    // it could be XSS that is already fixed with sanitize,
    // or just normal mistake, so it is not a problem.
    // That is why here is no warning.
    if (fileName !== file.name) {
      // If filename is empty, only in that case add some filename
      if (fileName.length === 0) {
        fileName = 'Empty-filename-after-sanitize.txt';
      }
    }

    const config: AttachmentUploadConfig = {
      file: file,
      fileId: fileId,
      fileName: fileName,
      meta: Utils.getCommonAttachmentMetaFrom(card),
      chunkSize: 'dynamic',
      // Use HTTP transport instead of DDP so file chunks go over a dedicated
      // fetch POST rather than flooding the WebSocket/DDP channel.  DDP
      // upload causes repeated DDP reconnects in Safari, showing the
      // "Loading, please wait" offline banner and stalling progress at ~95%.
      transport: 'http',
    };
    config.meta.fileId = fileId;

    try {
      const uploader = await Attachments.insertAsync(
        config,
        false,
      );

      // Add to progress manager for tracking
      const uploadId = uploadProgressManager.addUpload(card._id, uploader, file);

      uploader.on('uploaded', (error: any, fileRef: any) => {
        if (!error) {
          if (fileRef.isImage) {
            card.setCover(fileRef._id);
            if (process.env.DEBUG === 'true') {
              console.log(`Set cover image for card ${card._id}: ${fileRef.name}`);
            }
          }
        } else {
          if (process.env.DEBUG === 'true') {
            console.error('Upload error:', error);
          }
        }
      });

      uploader.on('error', (error: any) => {
        if (process.env.DEBUG === 'true') {
          console.error('Upload error:', error);
        }
      });

      uploads.push(uploader);
      uploader.start();
    } catch (error) {
      if (process.env.DEBUG === 'true') {
        console.error('Failed to create uploader:', error);
      }
    }
  }

  return uploads;
}

Template.previewClipboardImagePopup.onRendered(() => {
  // we can paste image from clipboard
  const handle = (results: any) => {
    if (results.dataURL.startsWith('data:image/')) {
      const direct = (results: any) => {
        $('img.preview-clipboard-image').attr('src', results.dataURL);
        pastedResults = results;
      };
      if (MAX_IMAGE_PIXEL) {
        // if has size limitation on image we shrink it before uploading
        Utils.shrinkImage({
          dataurl: results.dataURL,
          maxSize: MAX_IMAGE_PIXEL,
          ratio: COMPRESS_RATIO,
          callback(changed: any) {
            if (changed !== false && !!changed) {
              results.dataURL = changed;
            }
            direct(results);
          },
        });
      } else {
        direct(results);
      }
    }
  };

  $(document.body).pasteImageReader(handle);

  // we can also drag & drop image file to it
  $(document.body).dropImageReader(handle);
});

Template.previewClipboardImagePopup.events({
  async 'click .js-upload-pasted-image'(this: any) {
    const card = this;
    if (pastedResults && pastedResults.file) {
      const file = pastedResults.file;
      // window.oPasted is an ad-hoc debug global not present on the Window type.
      (window as any).oPasted = pastedResults;
      const fileId = new ObjectId().toString();
      const config: AttachmentUploadConfig = {
        file,
        fileId: fileId,
        meta: Utils.getCommonAttachmentMetaFrom(card),
        fileName: file.name || file.type.replace('image/', 'clipboard.'),
        chunkSize: 'dynamic',
        transport: 'http',
      };
      config.meta.fileId = fileId;
      const uploader = await Attachments.insertAsync(
        config,
        false,
      );
      uploader.on('uploaded', (error: any, fileRef: any) => {
        if (!error) {
          if (fileRef.isImage) {
            card.setCover(fileRef._id);
          }
        }
      });
      uploader.on('end', (error: any, fileRef: any) => {
        pastedResults = null;
        $(document.body).pasteImageReader(() => {});
        Popup.back();
      });
      uploader.start();
    }
  },
});

Template.attachmentActionsPopup.helpers({
  isCover(this: any) {
    const ret = ReactiveCache.getCard(this.meta.cardId).coverId == this._id;
    return ret;
  },
  isBackgroundImage() {
    //const currentBoard = Utils.getCurrentBoard();
    //return currentBoard.backgroundImageURL === $(".attachment-thumbnail-img").attr("src");
    return false;
  },
});

Template.attachmentActionsPopup.events({
  'click .js-add-cover'(this: any) {
    ReactiveCache.getCard(this.meta.cardId).setCover(this._id);
    Popup.back();
  },
  'click .js-remove-cover'(this: any) {
    ReactiveCache.getCard(this.meta.cardId).unsetCover();
    Popup.back();
  },
  'click .js-add-background-image'(event: JQuery.TriggeredEvent) {
    const currentBoard = Utils.getCurrentBoard();
    currentBoard.setBackgroundImageURL(attachmentActionsLink as string);
    Utils.setBackgroundImage(attachmentActionsLink as string);
    Popup.back();
    event.preventDefault();
  },
  'click .js-remove-background-image'(event: JQuery.TriggeredEvent) {
    const currentBoard = Utils.getCurrentBoard();
    currentBoard.setBackgroundImageURL("");
    Utils.setBackgroundImage("");
    Popup.back();
    Utils.reload();
    event.preventDefault();
  },
});

Template.attachmentRenamePopup.helpers({
  getNameWithoutExtension(this: any) {
    const ret = this.name.replace(new RegExp("\\." + this.extension + "$"), "");
    return ret;
  },
});

Template.attachmentRenamePopup.events({
  'keydown input.js-edit-attachment-name'(evt: JQuery.TriggeredEvent, tpl: Blaze.TemplateInstance) {
    // enter = save
    if (evt.keyCode === 13) {
      (tpl.find('button[type=submit]') as HTMLElement).click();
    }
  },
  'click button.js-submit-edit-attachment-name'(this: any, event: JQuery.TriggeredEvent, tpl: Blaze.TemplateInstance) {
    // save button pressed
    event.preventDefault();
    const name = (tpl.$('.js-edit-attachment-name')[0] as HTMLInputElement)
      .value
      .trim() + this.extensionWithDot;
    if (name === sanitizeText(name)) {
      Meteor.call('renameAttachment', this._id, name);
    }
    Popup.back();
  },
});

// Template helpers for attachment migration status
Template.registerHelper('attachmentMigrationStatus', function(attachmentId: any) {
  return attachmentMigrationManager.getAttachmentMigrationStatus(attachmentId);
});

Template.registerHelper('isAttachmentMigrating', function(attachmentId: any) {
  return attachmentMigrationManager.isAttachmentBeingMigrated(attachmentId);
});

Template.registerHelper('attachmentMigrationProgress', function() {
  // attachmentMigration{Progress,Status} are module-level reactive vars, not
  // members of the manager instance; accessed via the manager here to preserve
  // the pre-existing runtime behavior.
  return (attachmentMigrationManager as any).attachmentMigrationProgress.get();
});

Template.registerHelper('attachmentMigrationStatusText', function() {
  return (attachmentMigrationManager as any).attachmentMigrationStatus.get();
});

// Start/end coordinates of a touch used to detect attachment swipe gestures.
interface TouchCoords {
  x: number;
  y: number;
}

// The card attachments popup tracks in-progress uploads in a reactive var.
interface CardAttachmentsPopupInstance extends Blaze.TemplateInstance {
  uploads: ReactiveVar<any[]>;
}

// ostrio:files upload config. `meta` is the dynamic per-file metadata built by
// Utils.getCommonAttachmentMetaFrom (fileId is added after construction).
interface AttachmentUploadConfig {
  file: any;
  fileId: string;
  fileName: string;
  meta: any;
  chunkSize: string;
  transport: string;
}
