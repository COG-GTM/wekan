import { Template } from 'meteor/templating';
import { Blaze } from 'meteor/blaze';
import { ReactiveVar } from 'meteor/reactive-var';
import {
  boardConverter,
  isConverting,
  conversionProgress,
  conversionStatus,
  conversionEstimatedTime
} from '/client/lib/boardConverter';

Template.boardConversionProgress.helpers({
  isConverting() {
    return isConverting.get();
  },

  conversionProgress() {
    return conversionProgress.get();
  },

  conversionStatus() {
    return conversionStatus.get();
  },

  conversionEstimatedTime() {
    return conversionEstimatedTime.get();
  }
});

Template.boardConversionProgress.onCreated(function(this: Blaze.TemplateInstance) {
  // Subscribe to conversion state changes
  this.autorun(() => {
    isConverting.get();
    conversionProgress.get();
    conversionStatus.get();
    conversionEstimatedTime.get();
  });
});
