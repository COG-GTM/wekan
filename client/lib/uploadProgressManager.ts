import { ReactiveVar } from 'meteor/reactive-var';
import { Tracker } from 'meteor/tracker';

/**
 * Global upload progress manager for drag-and-drop file uploads
 * Tracks upload progress across all cards and provides reactive data
 */
class UploadProgressManager {
  cardUploads: ReactiveVar<Map<string, Upload[]>>;
  uploadMap: ReactiveVar<Map<string, Upload>>;
  constructor() {
    // Map of cardId -> array of upload objects
    this.cardUploads = new ReactiveVar(new Map<string, Upload[]>());

    // Map of uploadId -> upload object for easy lookup
    this.uploadMap = new ReactiveVar(new Map<string, Upload>());
  }

  /**
   * Add a new upload to track
   * @param {string} cardId - The card ID
   * @param {Object} uploader - The uploader object from Attachments.insert
   * @param {File} file - The file being uploaded
   * @returns {string} uploadId - Unique identifier for this upload
   */
  // `uploader` is a Meteor-Files uploader instance which is untyped, hence `any`.
  addUpload(cardId: string, uploader: any, file: File) {
    const uploadId = `upload_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const upload: Upload = {
      id: uploadId,
      cardId: cardId,
      file: file,
      uploader: uploader,
      progress: new ReactiveVar(0),
      status: new ReactiveVar('uploading'), // 'uploading', 'completed', 'error'
      error: new ReactiveVar<any>(null),
      startTime: Date.now(),
      endTime: null
    };

    // Update card uploads
    const currentCardUploads = this.cardUploads.get();
    const cardUploads = currentCardUploads.get(cardId) || [];
    cardUploads.push(upload);
    currentCardUploads.set(cardId, cardUploads);
    this.cardUploads.set(currentCardUploads);

    // Update upload map
    const currentUploadMap = this.uploadMap.get();
    currentUploadMap.set(uploadId, upload);
    this.uploadMap.set(currentUploadMap);

    // Set up uploader event listeners
    uploader.on('progress', (progress: number) => {
      upload.progress.set(progress);
    });

    // `error`/`fileRef` come from the untyped Meteor-Files uploader, hence `any`.
    uploader.on('uploaded', (error: any, fileRef: any) => {
      upload.status.set(error ? 'error' : 'completed');
      upload.endTime = Date.now();
      upload.error.set(error);

      if (process.env.DEBUG === 'true') {
        console.log(`Upload ${uploadId} completed:`, error ? 'error' : 'success');
      }

      // Remove from tracking after a delay to show completion
      setTimeout(() => {
        this.removeUpload(uploadId);
      }, 2000);
    });

    // `error` comes from the untyped Meteor-Files uploader, hence `any`.
    uploader.on('error', (error: any) => {
      upload.status.set('error');
      upload.endTime = Date.now();
      upload.error.set(error);

      if (process.env.DEBUG === 'true') {
        console.log(`Upload ${uploadId} failed:`, error);
      }

      // Remove from tracking after a delay to show error
      setTimeout(() => {
        this.removeUpload(uploadId);
      }, 3000);
    });

    if (process.env.DEBUG === 'true') {
      console.log(`Added upload ${uploadId} for card ${cardId}: ${file.name}`);
    }

    return uploadId;
  }

  /**
   * Remove an upload from tracking
   * @param {string} uploadId - The upload ID to remove
   */
  removeUpload(uploadId: string) {
    const upload = this.uploadMap.get().get(uploadId);
    if (!upload) return;

    const cardId = upload.cardId;

    // Remove from card uploads
    const currentCardUploads = this.cardUploads.get();
    const cardUploads = currentCardUploads.get(cardId) || [];
    const filteredCardUploads = cardUploads.filter(u => u.id !== uploadId);

    if (filteredCardUploads.length === 0) {
      currentCardUploads.delete(cardId);
    } else {
      currentCardUploads.set(cardId, filteredCardUploads);
    }
    this.cardUploads.set(currentCardUploads);

    // Remove from upload map
    const currentUploadMap = this.uploadMap.get();
    currentUploadMap.delete(uploadId);
    this.uploadMap.set(currentUploadMap);

    if (process.env.DEBUG === 'true') {
      console.log(`Removed upload ${uploadId} from tracking`);
    }
  }

  /**
   * Get all uploads for a specific card
   * @param {string} cardId - The card ID
   * @returns {Array} Array of upload objects
   */
  getUploadsForCard(cardId: string) {
    return this.cardUploads.get().get(cardId) || [];
  }

  /**
   * Get upload count for a specific card
   * @param {string} cardId - The card ID
   * @returns {number} Number of active uploads
   */
  getUploadCountForCard(cardId: string) {
    return this.getUploadsForCard(cardId).length;
  }

  /**
   * Check if a card has any active uploads
   * @param {string} cardId - The card ID
   * @returns {boolean} True if card has active uploads
   */
  hasActiveUploads(cardId: string) {
    return this.getUploadCountForCard(cardId) > 0;
  }

  /**
   * Get all uploads across all cards
   * @returns {Array} Array of all upload objects
   */
  getAllUploads() {
    const allUploads: Upload[] = [];
    this.cardUploads.get().forEach(cardUploads => {
      allUploads.push(...cardUploads);
    });
    return allUploads;
  }

  /**
   * Clear all uploads (useful for cleanup)
   */
  clearAllUploads() {
    this.cardUploads.set(new Map());
    this.uploadMap.set(new Map());
  }
}

// A single tracked drag-and-drop file upload.
interface Upload {
  id: string;
  cardId: string;
  file: File;
  // Meteor-Files uploader instance, untyped, hence `any`.
  uploader: any;
  progress: ReactiveVar<number>;
  status: ReactiveVar<string>;
  // Upload error object from the uploader, untyped, hence `any`.
  error: ReactiveVar<any>;
  startTime: number;
  endTime: number | null;
}

// Create global instance
const uploadProgressManager = new UploadProgressManager();

export default uploadProgressManager;

