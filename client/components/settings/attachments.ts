import { Meteor } from 'meteor/meteor';
import { Template } from 'meteor/templating';
import { Blaze } from 'meteor/blaze';
import { ReactiveVar } from 'meteor/reactive-var';
import AttachmentBulkMoveStatus from '/models/attachmentBulkMoveStatus';
import { TAPi18n } from '/imports/i18n';

// DOM field ids per cloud provider, used to read the admin form on save/test.
const CLOUD_FIELD_IDS: Record<string, Record<string, string>> = {
  s3: {
    enabled: '#s3-enabled',
    read: '#s3-read',
    endpoint: '#s3-endpoint',
    region: '#s3-region',
    bucket: '#s3-bucket',
    accessKeyId: '#s3-access-key',
    secretAccessKey: '#s3-secret-key',
    forcePathStyle: '#s3-force-path-style',
  },
  azure: {
    enabled: '#azure-enabled',
    read: '#azure-read',
    accountName: '#azure-account-name',
    accountKey: '#azure-account-key',
    connectionString: '#azure-connection-string',
    bucket: '#azure-bucket',
  },
  gcs: {
    enabled: '#gcs-enabled',
    read: '#gcs-read',
    projectId: '#gcs-project-id',
    bucket: '#gcs-bucket',
    keyFilename: '#gcs-key-filename',
    credentials: '#gcs-credentials',
  },
};

const CLOUD_PROVIDERS = ['s3', 'azure', 'gcs'];

function gatherCloudConfig(tpl: AttachmentsInstance, provider: any) {
  const ids = CLOUD_FIELD_IDS[provider] || {};
  // cfg: any — dynamically-keyed provider config read from the form.
  const cfg: Record<string, any> = {};
  Object.keys(ids).forEach(field => {
    const el = tpl.$(ids[field]);
    if (!el || !el.length) return;
    if (el.attr('type') === 'checkbox') {
      cfg[field] = el.prop('checked');
    } else {
      // Trim so stray whitespace/newlines from copy-paste (e.g. an account name
      // or endpoint) do not produce an invalid URL in the storage adapter.
      const value = el.val();
      cfg[field] = typeof value === 'string' ? value.trim() : value;
    }
  });
  return cfg;
}

function cloudConfigFromSettings(tpl: AttachmentsInstance, provider: any) {
  const settings = tpl.attachmentStorageSettings.get();
  return (settings && settings.storageConfig && settings.storageConfig[provider]) || {};
}
const { filesize } = require('filesize');

const LIMIT_UNIT_FACTORS: Record<string, number> = {
  bytes: 1,
  mb: 1024 * 1024,
  gb: 1024 * 1024 * 1024,
};

const LIMIT_MODES = {
  UNLIMITED: 'unlimited',
  MAX_SIZE: 'max-size',
  BLOCKED: 'blocked',
};

const LIMIT_BLOCKED_FIELDS: Record<string, string> = {
  attachmentsUploadMaxBytes: 'attachmentsUploadBlocked',
  attachmentsDownloadMaxBytes: 'attachmentsDownloadBlocked',
  apiUploadMaxBytes: 'apiUploadBlocked',
  apiDownloadMaxBytes: 'apiDownloadBlocked',
};

const DEFAULT_LIMIT_SETTINGS = {
  attachmentsUploadMaxBytes: 0,
  attachmentsDownloadMaxBytes: 0,
  apiUploadMaxBytes: 0,
  apiDownloadMaxBytes: 0,
  avatarsUploadBlocked: false,
};

function toNonNegativeInteger(value: any, fallback = 0) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }
  return parsed;
}

function normalizeLimitSettings(settingsDoc: any): Record<string, any> {
  const fromDoc = settingsDoc?.limitSettings || {};
  const legacyUpload = settingsDoc?.uploadSettings?.maxFileSize;

  const attachmentsUploadMaxBytes = Number.isFinite(fromDoc.attachmentsUploadMaxBytes)
    ? toNonNegativeInteger(fromDoc.attachmentsUploadMaxBytes, DEFAULT_LIMIT_SETTINGS.attachmentsUploadMaxBytes)
    : (Number.isFinite(legacyUpload)
      ? toNonNegativeInteger(legacyUpload, DEFAULT_LIMIT_SETTINGS.attachmentsUploadMaxBytes)
      : DEFAULT_LIMIT_SETTINGS.attachmentsUploadMaxBytes);

  return {
    attachmentsUploadMaxBytes,
    attachmentsDownloadMaxBytes: Number.isFinite(fromDoc.attachmentsDownloadMaxBytes)
      ? toNonNegativeInteger(fromDoc.attachmentsDownloadMaxBytes, DEFAULT_LIMIT_SETTINGS.attachmentsDownloadMaxBytes)
      : DEFAULT_LIMIT_SETTINGS.attachmentsDownloadMaxBytes,
    apiUploadMaxBytes: Number.isFinite(fromDoc.apiUploadMaxBytes)
      ? toNonNegativeInteger(fromDoc.apiUploadMaxBytes, DEFAULT_LIMIT_SETTINGS.apiUploadMaxBytes)
      : DEFAULT_LIMIT_SETTINGS.apiUploadMaxBytes,
    apiDownloadMaxBytes: Number.isFinite(fromDoc.apiDownloadMaxBytes)
      ? toNonNegativeInteger(fromDoc.apiDownloadMaxBytes, DEFAULT_LIMIT_SETTINGS.apiDownloadMaxBytes)
      : DEFAULT_LIMIT_SETTINGS.apiDownloadMaxBytes,
    attachmentsUploadBlocked: fromDoc.attachmentsUploadBlocked === true,
    avatarsUploadBlocked: fromDoc.avatarsUploadBlocked === true,
    attachmentsDownloadBlocked: fromDoc.attachmentsDownloadBlocked === true,
    apiUploadBlocked: fromDoc.apiUploadBlocked === true,
    apiDownloadBlocked: fromDoc.apiDownloadBlocked === true,
  };
}

function getBlockedFieldName(fieldName: any) {
  return LIMIT_BLOCKED_FIELDS[fieldName] || null;
}

function pickModeForLimit(fieldName: any, normalizedLimits: any) {
  const blockedField = getBlockedFieldName(fieldName);
  if (blockedField && normalizedLimits[blockedField] === true) {
    return LIMIT_MODES.BLOCKED;
  }
  return normalizedLimits[fieldName] > 0 ? LIMIT_MODES.MAX_SIZE : LIMIT_MODES.UNLIMITED;
}

function pickUnitForBytes(bytes: any) {
  const safeBytes = toNonNegativeInteger(bytes, 0);
  if (safeBytes > 0 && safeBytes % LIMIT_UNIT_FACTORS.gb === 0) {
    return 'gb';
  }
  if (safeBytes > 0 && safeBytes % LIMIT_UNIT_FACTORS.mb === 0) {
    return 'mb';
  }
  return 'bytes';
}

function toDisplayValue(bytes: any, unit: any) {
  const safeBytes = toNonNegativeInteger(bytes, 0);
  const factor = LIMIT_UNIT_FACTORS[unit] || LIMIT_UNIT_FACTORS.bytes;
  return safeBytes / factor;
}

function toBytes(value: any, unit: any) {
  const numericValue = Number.parseFloat(value);
  if (!Number.isFinite(numericValue) || numericValue < 0) {
    return null;
  }
  const factor = LIMIT_UNIT_FACTORS[unit] || LIMIT_UNIT_FACTORS.bytes;
  return Math.round(numericValue * factor);
}

function getLimitUnitOptions(selectedUnit: any) {
  return [
    { value: 'gb', labelKey: 'attachment-limit-unit-gb', selected: selectedUnit === 'gb' },
    { value: 'mb', labelKey: 'attachment-limit-unit-mb', selected: selectedUnit === 'mb' },
    { value: 'bytes', labelKey: 'attachment-limit-unit-bytes', selected: selectedUnit === 'bytes' },
  ];
}

function getLimitModeOptions(selectedMode: any) {
  return [
    { value: LIMIT_MODES.UNLIMITED, labelKey: 'attachment-limit-mode-unlimited', selected: selectedMode === LIMIT_MODES.UNLIMITED },
    { value: LIMIT_MODES.MAX_SIZE, labelKey: 'attachment-limit-mode-max-size', selected: selectedMode === LIMIT_MODES.MAX_SIZE },
    { value: LIMIT_MODES.BLOCKED, labelKey: 'attachment-limit-mode-blocked', selected: selectedMode === LIMIT_MODES.BLOCKED },
  ];
}

function updateStorageConfigField(tpl: AttachmentsInstance, storageName: any, field: any, value: any, checkboxEl: any) {
  const currentSettings = tpl.attachmentStorageSettings.get();
  if (!currentSettings) return;
  const nextSettings = {
    ...currentSettings,
    storageConfig: {
      ...(currentSettings.storageConfig || {}),
      [storageName]: {
        ...(currentSettings.storageConfig?.[storageName] || {}),
        [field]: value,
      },
    },
  };
    // error: any — untyped Meteor method callback.
  Meteor.call('updateAttachmentStorageSettings', nextSettings, (error: any) => {
    if (error) {
      alert(`${TAPi18n.__('attachment-transfer-limits-save-failed')}: ${error.reason || error.message}`);
      if (checkboxEl) checkboxEl.checked = !value;
      return;
    }
    refreshAttachmentStorageSettings(tpl);
  });
}

function refreshAttachmentStorageSettings(tpl: AttachmentsInstance) {
  // error/settings: any — untyped Meteor method callback.
  Meteor.call('getAttachmentStorageSettings', (error: any, settings: any) => {
    if (error || !settings) {
      if (process.env.DEBUG === 'true') {
        console.warn('Failed to load attachment storage settings:', error);
      }
      return;
    }

    const normalizedLimits = normalizeLimitSettings(settings);
    tpl.attachmentStorageSettings.set({
      ...settings,
      limitSettings: normalizedLimits,
    });

    tpl.attachmentLimitUnits.set({
      attachmentsUploadMaxBytes: pickUnitForBytes(normalizedLimits.attachmentsUploadMaxBytes),
      attachmentsDownloadMaxBytes: pickUnitForBytes(normalizedLimits.attachmentsDownloadMaxBytes),
      apiUploadMaxBytes: pickUnitForBytes(normalizedLimits.apiUploadMaxBytes),
      apiDownloadMaxBytes: pickUnitForBytes(normalizedLimits.apiDownloadMaxBytes),
    });

    tpl.attachmentLimitModes.set({
      attachmentsUploadMaxBytes: pickModeForLimit('attachmentsUploadMaxBytes', normalizedLimits),
      attachmentsDownloadMaxBytes: pickModeForLimit('attachmentsDownloadMaxBytes', normalizedLimits),
      apiUploadMaxBytes: pickModeForLimit('apiUploadMaxBytes', normalizedLimits),
      apiDownloadMaxBytes: pickModeForLimit('apiDownloadMaxBytes', normalizedLimits),
    });
  });
}

Template.attachments.onCreated(function (this: AttachmentsInstance) {
  this.activeSection = new ReactiveVar('move');
  this.storageSettingsSubscription = Meteor.subscribe('attachmentStorageSettings');
  this.attachmentStorageSettings = new ReactiveVar(null);
  this.attachmentLimitUnits = new ReactiveVar({
    attachmentsUploadMaxBytes: 'mb',
    attachmentsDownloadMaxBytes: 'mb',
    apiUploadMaxBytes: 'mb',
    apiDownloadMaxBytes: 'mb',
  });
  this.attachmentLimitModes = new ReactiveVar({
    attachmentsUploadMaxBytes: LIMIT_MODES.UNLIMITED,
    attachmentsDownloadMaxBytes: LIMIT_MODES.UNLIMITED,
    apiUploadMaxBytes: LIMIT_MODES.UNLIMITED,
    apiDownloadMaxBytes: LIMIT_MODES.UNLIMITED,
  });
  this.gridFsStats = new ReactiveVar(null);
  this.gridFsStatsLoading = new ReactiveVar(false);
  this.gridFsStatsError = new ReactiveVar('');
  this.filesystemStats = new ReactiveVar(null);
  this.filesystemStatsLoading = new ReactiveVar(false);
  this.filesystemStatsError = new ReactiveVar('');
  this.s3Stats = new ReactiveVar(null);
  this.s3StatsLoading = new ReactiveVar(false);
  this.s3StatsError = new ReactiveVar('');
  this.azureStats = new ReactiveVar(null);
  this.azureStatsLoading = new ReactiveVar(false);
  this.azureStatsError = new ReactiveVar('');
  this.gcsStats = new ReactiveVar(null);
  this.gcsStatsLoading = new ReactiveVar(false);
  this.gcsStatsError = new ReactiveVar('');
  this.compactLoading = new ReactiveVar(false);
  this.compactResult = new ReactiveVar(null);
  this.compactError = new ReactiveVar('');
  this.cloudTestResults = new ReactiveVar({});
  this.cloudTestErrors = new ReactiveVar({});
  this.loading = new ReactiveVar(false);

  this.autorun(() => {
    const ready = this.storageSettingsSubscription.ready();
    if (ready) {
      refreshAttachmentStorageSettings(this);
      this.loading.set(false);
    } else {
      this.loading.set(true);
    }
  });
});

Template.attachments.helpers({
  loading() {
    return (Template.instance() as AttachmentsInstance).loading;
  },
  isLimitsActive() {
    return (Template.instance() as AttachmentsInstance).activeSection.get() === 'limits';
  },
  isMoveActive() {
    return (Template.instance() as AttachmentsInstance).activeSection.get() === 'move';
  },
  isDefaultStorageActive() {
    return (Template.instance() as AttachmentsInstance).activeSection.get() === 'default-save-storage';
  },
  isAzureActive() {
    return (Template.instance() as AttachmentsInstance).activeSection.get() === 'azure';
  },
  isGcsActive() {
    return (Template.instance() as AttachmentsInstance).activeSection.get() === 'gcs';
  },
  avatarsUploadBlocked() {
    const settings = (Template.instance() as AttachmentsInstance).attachmentStorageSettings.get();
    return settings?.limitSettings?.avatarsUploadBlocked === true;
  },
  defaultStorageOptions() {
    const settings = (Template.instance() as AttachmentsInstance).attachmentStorageSettings.get();
    const selected = settings?.defaultStorage || 'fs';
    const sc = settings?.storageConfig || {};
    const options = [
      { value: 'fs', labelKey: 'move-storage-fs' },
      { value: 'gridfs', labelKey: 'move-storage-gridfs' },
    ];
    // Only offer a cloud backend as a save target once it is enabled.
    if (sc.s3?.enabled) options.push({ value: 's3', labelKey: 'move-storage-s3' });
    if (sc.azure?.enabled) options.push({ value: 'azure', labelKey: 'move-storage-azure' });
    if (sc.gcs?.enabled) options.push({ value: 'gcs', labelKey: 'move-storage-gcs' });
    return options.map(option => ({
      ...option,
      selected: option.value === selected,
    }));
  },
  cloudEnabled() {
    const tpl = Template.instance() as AttachmentsInstance;
    const out: Record<string, any> = {};
    CLOUD_PROVIDERS.forEach(p => { out[p] = cloudConfigFromSettings(tpl, p).enabled === true; });
    return out;
  },
  cloudRead() {
    const tpl = Template.instance() as AttachmentsInstance;
    const out: Record<string, any> = {};
    CLOUD_PROVIDERS.forEach(p => { out[p] = cloudConfigFromSettings(tpl, p).read !== false; });
    return out;
  },
  cloudValue() {
    const tpl = Template.instance() as AttachmentsInstance;
    const s3 = cloudConfigFromSettings(tpl, 's3');
    const azure = cloudConfigFromSettings(tpl, 'azure');
    const gcs = cloudConfigFromSettings(tpl, 'gcs');
    return {
      s3: {
        endpoint: s3.endpoint || '',
        region: s3.region || '',
        bucket: s3.bucket || '',
        accessKeyId: s3.accessKeyId || '',
        forcePathStyle: s3.forcePathStyle !== false,
      },
      azure: {
        accountName: azure.accountName || '',
        bucket: azure.bucket || '',
      },
      gcs: {
        projectId: gcs.projectId || '',
        bucket: gcs.bucket || '',
        keyFilename: gcs.keyFilename || '',
      },
    };
  },
  cloudSecretPlaceholder() {
    const tpl = Template.instance() as AttachmentsInstance;
    const ph = (cfg: any, field: any) => (cfg[`${field}Set`]
      ? TAPi18n.__('cloud-secret-set')
      : TAPi18n.__('cloud-secret-none'));
    const s3 = cloudConfigFromSettings(tpl, 's3');
    const azure = cloudConfigFromSettings(tpl, 'azure');
    const gcs = cloudConfigFromSettings(tpl, 'gcs');
    return {
      s3: { secretAccessKey: ph(s3, 'secretAccessKey') },
      azure: { accountKey: ph(azure, 'accountKey'), connectionString: ph(azure, 'connectionString') },
      gcs: { credentials: ph(gcs, 'credentials') },
    };
  },
  cloudTestResult() {
    return (Template.instance() as AttachmentsInstance).cloudTestResults.get();
  },
  cloudTestError() {
    return (Template.instance() as AttachmentsInstance).cloudTestErrors.get();
  },
  isGridFsActive() {
    return (Template.instance() as AttachmentsInstance).activeSection.get() === 'gridfs';
  },
  isFilesystemActive() {
    return (Template.instance() as AttachmentsInstance).activeSection.get() === 'filesystem';
  },
  isS3Active() {
    return (Template.instance() as AttachmentsInstance).activeSection.get() === 's3';
  },
  filesystemPath() {
    return process.env.WRITABLE_PATH || '/data';
  },
  attachmentsPath() {
    const writablePath = process.env.WRITABLE_PATH || '/data';
    return `${writablePath}/attachments`;
  },
  avatarsPath() {
    const writablePath = process.env.WRITABLE_PATH || '/data';
    return `${writablePath}/avatars`;
  },
  filesystemEnabled() {
    const tpl = Template.instance() as AttachmentsInstance;
    const settings = tpl.attachmentStorageSettings.get();
    if (settings?.storageConfig?.filesystem) {
      return settings.storageConfig.filesystem.enabled !== false;
    }
    return true;
  },
  filesystemRead() {
    const settings = (Template.instance() as AttachmentsInstance).attachmentStorageSettings.get();
    return settings?.storageConfig?.filesystem?.read !== false;
  },
  gridfsEnabled() {
    const tpl = Template.instance() as AttachmentsInstance;
    const settings = tpl.attachmentStorageSettings.get();
    if (settings?.storageConfig?.gridfs) {
      return settings.storageConfig.gridfs.enabled !== false;
    }
    return process.env.GRIDFS_ENABLED === 'true';
  },
  gridfsRead() {
    const settings = (Template.instance() as AttachmentsInstance).attachmentStorageSettings.get();
    return settings?.storageConfig?.gridfs?.read !== false;
  },
  s3Read() {
    return process.env.S3_ENABLED === 'true';
  },
  compactLoading() {
    return (Template.instance() as AttachmentsInstance).compactLoading.get();
  },
  compactResult() {
    return (Template.instance() as AttachmentsInstance).compactResult.get();
  },
  compactError() {
    return (Template.instance() as AttachmentsInstance).compactError.get();
  },
  compactResultItems() {
    const result = (Template.instance() as AttachmentsInstance).compactResult.get();
    if (!result) return [];
    // items: any[] — flattened { name, status } rows for display.
    const items: any[] = [];
    for (const [node, nodeData] of Object.entries(result)) {
      if (nodeData && typeof nodeData === 'object') {
        for (const [collName, status] of Object.entries(nodeData)) {
          items.push({ name: `[${node}] ${collName}`, status });
        }
      } else {
        items.push({ name: node, status: String(nodeData) });
      }
    }
    return items;
  },
  hasGridFsStats() {
    return !!(Template.instance() as AttachmentsInstance).gridFsStats.get();
  },
  gridFsStats() {
    return (Template.instance() as AttachmentsInstance).gridFsStats.get();
  },
  gridFsStatsLoading() {
    return (Template.instance() as AttachmentsInstance).gridFsStatsLoading.get();
  },
  gridFsStatsError() {
    return (Template.instance() as AttachmentsInstance).gridFsStatsError.get();
  },
  hasFilesystemStats() {
    return !!(Template.instance() as AttachmentsInstance).filesystemStats.get();
  },
  filesystemStats() {
    return (Template.instance() as AttachmentsInstance).filesystemStats.get();
  },
  filesystemStatsLoading() {
    return (Template.instance() as AttachmentsInstance).filesystemStatsLoading.get();
  },
  filesystemStatsError() {
    return (Template.instance() as AttachmentsInstance).filesystemStatsError.get();
  },
  hasS3Stats() {
    return !!(Template.instance() as AttachmentsInstance).s3Stats.get();
  },
  s3Stats() {
    return (Template.instance() as AttachmentsInstance).s3Stats.get();
  },
  s3StatsLoading() {
    return (Template.instance() as AttachmentsInstance).s3StatsLoading.get();
  },
  s3StatsError() {
    return (Template.instance() as AttachmentsInstance).s3StatsError.get();
  },
  hasAzureStats() {
    return !!(Template.instance() as AttachmentsInstance).azureStats.get();
  },
  azureStats() {
    return (Template.instance() as AttachmentsInstance).azureStats.get();
  },
  azureStatsLoading() {
    return (Template.instance() as AttachmentsInstance).azureStatsLoading.get();
  },
  azureStatsError() {
    return (Template.instance() as AttachmentsInstance).azureStatsError.get();
  },
  hasGcsStats() {
    return !!(Template.instance() as AttachmentsInstance).gcsStats.get();
  },
  gcsStats() {
    return (Template.instance() as AttachmentsInstance).gcsStats.get();
  },
  gcsStatsLoading() {
    return (Template.instance() as AttachmentsInstance).gcsStatsLoading.get();
  },
  gcsStatsError() {
    return (Template.instance() as AttachmentsInstance).gcsStatsError.get();
  },
  s3Enabled() {
    return process.env.S3_ENABLED === 'true';
  },
  s3Endpoint() {
    return process.env.S3_ENDPOINT || '';
  },
  s3Bucket() {
    return process.env.S3_BUCKET || '';
  },
  s3Region() {
    return process.env.S3_REGION || '';
  },
  s3SslEnabled() {
    return process.env.S3_SSL_ENABLED === 'true';
  },
  s3Port() {
    return process.env.S3_PORT || 443;
  },
  attachmentTransferLimitValue(fieldName: any) {
    const tpl = Template.instance() as AttachmentsInstance;
    const settingsDoc = tpl.attachmentStorageSettings.get();
    const units = tpl.attachmentLimitUnits.get() || {};
    const limits = normalizeLimitSettings(settingsDoc);
    const unit = units[fieldName] || 'bytes';
    return toDisplayValue(limits[fieldName], unit);
  },
  attachmentTransferLimitUnitOptions(fieldName: any) {
    const tpl = Template.instance() as AttachmentsInstance;
    const units = tpl.attachmentLimitUnits.get() || {};
    const selectedUnit = units[fieldName] || 'bytes';
    return getLimitUnitOptions(selectedUnit);
  },
  attachmentTransferLimitModeOptions(fieldName: any) {
    const tpl = Template.instance() as AttachmentsInstance;
    const modeMap = tpl.attachmentLimitModes.get() || {};
    return getLimitModeOptions(modeMap[fieldName] || LIMIT_MODES.UNLIMITED);
  },
  isAttachmentLimitMode(fieldName: any, expectedMode: any) {
    const tpl = Template.instance() as AttachmentsInstance;
    const modeMap = tpl.attachmentLimitModes.get() || {};
    return modeMap[fieldName] === expectedMode;
  },
});

Template.attachments.events({
  'click a.js-attachments-menu'(event: JQuery.TriggeredEvent, tpl: AttachmentsInstance) {
    event.preventDefault();
    const target = $(event.currentTarget);
    const targetID = target.data('id');
    if (!targetID) {
      return;
    }

    tpl.activeSection.set(targetID);
  },
  'change select.js-attachment-limit-unit'(event: JQuery.TriggeredEvent, tpl: AttachmentsInstance) {
    const currentTarget = event.currentTarget as HTMLSelectElement;
    const fieldName = currentTarget.dataset.field;
    const selectedUnit = currentTarget.value;
    if (!fieldName || !selectedUnit) {
      return;
    }

    const current = tpl.attachmentLimitUnits.get() || {};
    tpl.attachmentLimitUnits.set({
      ...current,
      [fieldName]: selectedUnit,
    });
  },
  'change select.js-attachment-limit-mode'(event: JQuery.TriggeredEvent, tpl: AttachmentsInstance) {
    const currentTarget = event.currentTarget as HTMLSelectElement;
    const fieldName = currentTarget.dataset.field;
    const selectedMode = currentTarget.value;
    if (!fieldName) {
      return;
    }

    const current = tpl.attachmentLimitModes.get() || {};
    tpl.attachmentLimitModes.set({
      ...current,
      [fieldName]: selectedMode,
    });
  },
  'click button.js-save-attachment-transfer-limits'(event: JQuery.TriggeredEvent, tpl: AttachmentsInstance) {
    event.preventDefault();

    const currentSettings = tpl.attachmentStorageSettings.get();
    if (!currentSettings) {
      alert(TAPi18n.__('attachment-transfer-limits-save-failed'));
      return;
    }

    const currentUnits = tpl.attachmentLimitUnits.get() || {};
    const modeMap = tpl.attachmentLimitModes.get() || {};
    const fieldConfig = [
      { fieldName: 'attachmentsUploadMaxBytes', inputId: '#attachments-upload-limit-value' },
      { fieldName: 'attachmentsDownloadMaxBytes', inputId: '#attachments-download-limit-value' },
      { fieldName: 'apiUploadMaxBytes', inputId: '#api-upload-limit-value' },
      { fieldName: 'apiDownloadMaxBytes', inputId: '#api-download-limit-value' },
    ];

    // nextLimitSettings: any — dynamically-keyed byte limits + blocked flags.
    const nextLimitSettings: Record<string, any> = {};
    for (const field of fieldConfig) {
      const selectedMode = modeMap[field.fieldName] || LIMIT_MODES.UNLIMITED;
      const blockedFieldName = getBlockedFieldName(field.fieldName);

      if (selectedMode === LIMIT_MODES.BLOCKED) {
        if (blockedFieldName) {
          nextLimitSettings[blockedFieldName] = true;
        }
        nextLimitSettings[field.fieldName] = 0;
        continue;
      }

      if (blockedFieldName) {
        nextLimitSettings[blockedFieldName] = false;
      }

      if (selectedMode === LIMIT_MODES.UNLIMITED) {
        nextLimitSettings[field.fieldName] = 0;
        continue;
      }

      const unit = currentUnits[field.fieldName] || 'bytes';
      const value = $(field.inputId).val();
      const bytesValue = toBytes(value, unit);
      if (bytesValue === null || bytesValue <= 0) {
        alert(TAPi18n.__('attachment-transfer-limits-invalid-value'));
        return;
      }
      nextLimitSettings[field.fieldName] = bytesValue;
    }

    // Avatar uploads are a simple on/off block (no size mode). Default off so
    // avatars stay enabled unless an admin explicitly blocks them.
    nextLimitSettings.avatarsUploadBlocked = tpl.$('.js-avatars-upload-blocked').is(':checked');

    const nextSettings = {
      ...currentSettings,
      uploadSettings: {
        ...(currentSettings.uploadSettings || {}),
        maxFileSize: nextLimitSettings.attachmentsUploadMaxBytes,
      },
      limitSettings: {
        ...(currentSettings.limitSettings || {}),
        ...nextLimitSettings,
      },
    };

    // error: any — untyped Meteor method callback.
    Meteor.call('updateAttachmentStorageSettings', nextSettings, (error: any) => {
      if (error) {
        alert(`${TAPi18n.__('attachment-transfer-limits-save-failed')}: ${error.reason || error.message}`);
        return;
      }

      alert(TAPi18n.__('attachment-transfer-limits-saved'));
      refreshAttachmentStorageSettings(tpl);
    });
  },
  'change input.js-toggle-filesystem-read'(event: JQuery.TriggeredEvent, tpl: AttachmentsInstance) {
    const currentTarget = event.currentTarget as HTMLInputElement;
    updateStorageConfigField(tpl, 'filesystem', 'read', currentTarget.checked, currentTarget);
  },
  'change input.js-toggle-gridfs-read'(event: JQuery.TriggeredEvent, tpl: AttachmentsInstance) {
    const currentTarget = event.currentTarget as HTMLInputElement;
    updateStorageConfigField(tpl, 'gridfs', 'read', currentTarget.checked, currentTarget);
  },
  'click button.js-save-default-storage'(event: JQuery.TriggeredEvent, tpl: AttachmentsInstance) {
    event.preventDefault();
    const storageName = tpl.$('.js-default-save-storage').val();
    if (!storageName) return;
    // error: any — untyped Meteor method callback.
    Meteor.call('setDefaultAttachmentStorage', storageName, (error: any) => {
      if (error) {
        alert(`${TAPi18n.__('default-save-storage-save-failed')}: ${error.reason || error.message}`);
        return;
      }
      alert(TAPi18n.__('default-save-storage-saved'));
      refreshAttachmentStorageSettings(tpl);
    });
  },
  'click button.js-save-cloud-settings'(event: JQuery.TriggeredEvent, tpl: AttachmentsInstance) {
    event.preventDefault();
    const provider = (event.currentTarget as HTMLElement).dataset.provider;
    if (!provider) return;
    const cfg = gatherCloudConfig(tpl, provider);
    // Send only this provider's config; the server merges it over the stored
    // settings and preserves secrets left blank as well as the other providers.
    const nextSettings = { storageConfig: { [provider]: cfg } };
    // error: any — untyped Meteor method callback.
    Meteor.call('updateAttachmentStorageSettings', nextSettings, (error: any) => {
      if (error) {
        alert(`${TAPi18n.__('cloud-settings-save-failed')}: ${error.reason || error.message}`);
        return;
      }
      alert(TAPi18n.__('cloud-settings-saved'));
      refreshAttachmentStorageSettings(tpl);
    });
  },
  'click button.js-test-cloud-connection'(event: JQuery.TriggeredEvent, tpl: AttachmentsInstance) {
    event.preventDefault();
    const provider = (event.currentTarget as HTMLElement).dataset.provider;
    if (!provider) return;
    const cfg = gatherCloudConfig(tpl, provider);
    // error/result: any — untyped Meteor method callback.
    Meteor.call('testAttachmentCloudConnection', provider, cfg, (error: any, result: any) => {
      const results = { ...tpl.cloudTestResults.get() };
      const errors = { ...tpl.cloudTestErrors.get() };
      if (error) {
        results[provider] = false;
        errors[provider] = error.reason || error.message;
      } else if (result && result.ok) {
        results[provider] = true;
        errors[provider] = '';
      } else {
        results[provider] = false;
        errors[provider] = (result && result.error) || 'failed';
      }
      tpl.cloudTestResults.set(results);
      tpl.cloudTestErrors.set(errors);
    });
  },
  'click button.js-calculate-gridfs-stats'(event: JQuery.TriggeredEvent, tpl: AttachmentsInstance) {
    event.preventDefault();
    tpl.gridFsStatsLoading.set(true);
    tpl.gridFsStatsError.set('');
    Meteor.call('getGridFsStorageStats', (error: any, result: any) => {
      tpl.gridFsStatsLoading.set(false);
      if (error) {
        tpl.gridFsStats.set(null);
        tpl.gridFsStatsError.set(error.reason || error.message || 'Failed to calculate counts');
        return;
      }
      tpl.gridFsStats.set(result || null);
    });
  },
  'click button.js-calculate-filesystem-stats'(event: JQuery.TriggeredEvent, tpl: AttachmentsInstance) {
    event.preventDefault();
    tpl.filesystemStatsLoading.set(true);
    tpl.filesystemStatsError.set('');
    Meteor.call('getFilesystemStorageStats', (error: any, result: any) => {
      tpl.filesystemStatsLoading.set(false);
      if (error) {
        tpl.filesystemStats.set(null);
        tpl.filesystemStatsError.set(error.reason || error.message || 'Failed to calculate counts');
        return;
      }
      tpl.filesystemStats.set(result || null);
    });
  },
  'click button.js-calculate-s3-stats'(event: JQuery.TriggeredEvent, tpl: AttachmentsInstance) {
    event.preventDefault();
    tpl.s3StatsLoading.set(true);
    tpl.s3StatsError.set('');
    Meteor.call('getS3StorageStats', (error: any, result: any) => {
      tpl.s3StatsLoading.set(false);
      if (error) {
        tpl.s3Stats.set(null);
        tpl.s3StatsError.set(error.reason || error.message || 'Failed to calculate counts');
        return;
      }
      tpl.s3Stats.set(result || null);
    });
  },
  'click button.js-calculate-azure-stats'(event: JQuery.TriggeredEvent, tpl: AttachmentsInstance) {
    event.preventDefault();
    tpl.azureStatsLoading.set(true);
    tpl.azureStatsError.set('');
    Meteor.call('getAzureStorageStats', (error: any, result: any) => {
      tpl.azureStatsLoading.set(false);
      if (error) {
        tpl.azureStats.set(null);
        tpl.azureStatsError.set(error.reason || error.message || 'Failed to calculate counts');
        return;
      }
      tpl.azureStats.set(result || null);
    });
  },
  'click button.js-calculate-gcs-stats'(event: JQuery.TriggeredEvent, tpl: AttachmentsInstance) {
    event.preventDefault();
    tpl.gcsStatsLoading.set(true);
    tpl.gcsStatsError.set('');
    Meteor.call('getGcsStorageStats', (error: any, result: any) => {
      tpl.gcsStatsLoading.set(false);
      if (error) {
        tpl.gcsStats.set(null);
        tpl.gcsStatsError.set(error.reason || error.message || 'Failed to calculate counts');
        return;
      }
      tpl.gcsStats.set(result || null);
    });
  },
  'click button.js-compact-mongodb-gridfs'(event: JQuery.TriggeredEvent, tpl: AttachmentsInstance) {
    event.preventDefault();
    runCompact(tpl.compactLoading, tpl.compactResult, tpl.compactError);
  },
});

Template.moveAttachments.onCreated(function (this: MoveAttachmentsInstance) {
  // The bulk move runs as a server-side background job; subscribe to its
  // persisted progress so it keeps running (and stays visible) even if the
  // admin navigates away from or closes this page.
  this.bulkMoveSubscription = Meteor.subscribe('attachmentBulkMoveStatus');
  this.repairLoading = new ReactiveVar(false);
  this.repairResult = new ReactiveVar(null);
  this.repairError = new ReactiveVar('');
});

function getBulkMoveProgress() {
  const doc = AttachmentBulkMoveStatus.findOne('bulk');
  return doc && doc.running ? doc : null;
}

function getLastMove() {
  const doc = AttachmentBulkMoveStatus.findOne('bulk');
  // Don't show the "last move" line while a move is actively running.
  if (!doc || doc.running || !doc.lastMove) return null;
  return doc.lastMove;
}

function storageLabel(value: any) {
  return value ? TAPi18n.__(`move-storage-${value}`) : '';
}

function scopeLabel(value: any) {
  return value ? TAPi18n.__(`move-scope-${value}`) : '';
}

// Format a Date (or value) as YYYY-MM-DD HH:MM:SS in local time.
function formatDateTime(value: any) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (isNaN(date.getTime())) return '';
  const p = (n: any) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())} ` +
    `${p(date.getHours())}:${p(date.getMinutes())}:${p(date.getSeconds())}`;
}

Template.moveAttachments.helpers({
  moveProgress() {
    return getBulkMoveProgress();
  },
  moveProgressPaused() {
    return getBulkMoveProgress()?.paused === true;
  },
  moveProgressBarStyle() {
    const p = getBulkMoveProgress();
    const pct = p && p.total ? Math.round((p.done / p.total) * 100) : 0;
    return `width: ${pct}%`;
  },
  moveProgressSize() {
    const p = getBulkMoveProgress();
    return p?.size ? filesize(p.size) : '';
  },
  lastMove() {
    return getLastMove();
  },
  lastMoveText() {
    const lm = getLastMove();
    if (!lm) return '';
    const cancelled = lm.cancelled ? ` (${TAPi18n.__('move-progress-cancel')})` : '';
    return `${storageLabel(lm.source)} → ${storageLabel(lm.dest)} ` +
      `(${scopeLabel(lm.scope)}) ${formatDateTime(lm.at)}${cancelled}`;
  },
  repairLoading() {
    return (Template.instance() as MoveAttachmentsInstance).repairLoading.get();
  },
  repairResult() {
    return (Template.instance() as MoveAttachmentsInstance).repairResult.get();
  },
  repairError() {
    return (Template.instance() as MoveAttachmentsInstance).repairError.get();
  },
});

function runCompact(loadingVar: any, resultVar: any, errorVar: any) {
  loadingVar.set(true);
  resultVar.set(null);
  errorVar.set('');
  // error/result: any — untyped Meteor method callback.
  Meteor.call('compactMongoGridFs', (error: any, result: any) => {
    loadingVar.set(false);
    if (error) {
      errorVar.set(error.reason || error.message || 'Compact failed');
      return;
    }
    resultVar.set(result || {});
  });
}

Template.moveAttachments.events({
  'click button.js-move-all-attachments'(event: JQuery.TriggeredEvent, tpl: MoveAttachmentsInstance) {
    if (getBulkMoveProgress()) return;
    const scope = tpl.$('.js-move-scope').val() || 'attachments';
    const source = tpl.$('.js-move-source-storage').val();
    const dest = tpl.$('.js-move-dest-storage').val();
    // 'all' reads from every Read-enabled storage, so it may equal nothing; only
    // a specific source must differ from the destination.
    if (!source || !dest || (source !== 'all' && source === dest)) return;
    // Hand the whole job to the server so the transfer keeps running as a
    // background process even if this page is left or closed.
    Meteor.call('startBulkAttachmentMove', source, dest, scope, (error: any, result: any) => {
      if (error) {
        if (error.error !== 'bulk-move-already-running') {
          alert(error.reason || error.message);
        }
        return;
      }
      // No progress bar appears when nothing matches the source, so tell the
      // admin instead of silently doing nothing.
      if (result && result.total === 0) {
        alert(TAPi18n.__('move-attachments-none-found'));
      }
    });
  },
  'click button.js-repair-attachment-locations'(event: JQuery.TriggeredEvent, tpl: MoveAttachmentsInstance) {
    if (tpl.repairLoading.get()) return;
    tpl.repairLoading.set(true);
    tpl.repairResult.set(null);
    tpl.repairError.set('');
    Meteor.call('repairAttachmentStorageLocations', (error: any, result: any) => {
      tpl.repairLoading.set(false);
      if (error) {
        tpl.repairError.set(error.reason || error.message || 'Repair failed');
        return;
      }
      tpl.repairResult.set(result || {});
    });
  },
  'click button.js-pause-move'() {
    Meteor.call('pauseBulkAttachmentMove');
  },
  'click button.js-resume-move'() {
    Meteor.call('resumeBulkAttachmentMove');
  },
  'click button.js-cancel-move'() {
    Meteor.call('cancelBulkAttachmentMove');
  },
});

// attachments admin panel instance: active section plus per-storage reactive
// state (settings, limits, per-provider stats and test results).
interface AttachmentsInstance extends Blaze.TemplateInstance {
  activeSection: ReactiveVar<any>;
  // storageSettingsSubscription: any — Meteor subscription handle.
  storageSettingsSubscription: any;
  attachmentStorageSettings: ReactiveVar<any>;
  attachmentLimitUnits: ReactiveVar<any>;
  attachmentLimitModes: ReactiveVar<any>;
  gridFsStats: ReactiveVar<any>;
  gridFsStatsLoading: ReactiveVar<any>;
  gridFsStatsError: ReactiveVar<any>;
  filesystemStats: ReactiveVar<any>;
  filesystemStatsLoading: ReactiveVar<any>;
  filesystemStatsError: ReactiveVar<any>;
  s3Stats: ReactiveVar<any>;
  s3StatsLoading: ReactiveVar<any>;
  s3StatsError: ReactiveVar<any>;
  azureStats: ReactiveVar<any>;
  azureStatsLoading: ReactiveVar<any>;
  azureStatsError: ReactiveVar<any>;
  gcsStats: ReactiveVar<any>;
  gcsStatsLoading: ReactiveVar<any>;
  gcsStatsError: ReactiveVar<any>;
  compactLoading: ReactiveVar<any>;
  compactResult: ReactiveVar<any>;
  compactError: ReactiveVar<any>;
  cloudTestResults: ReactiveVar<any>;
  cloudTestErrors: ReactiveVar<any>;
  loading: ReactiveVar<any>;
}

// moveAttachments panel instance: bulk-move subscription plus repair state.
interface MoveAttachmentsInstance extends Blaze.TemplateInstance {
  // bulkMoveSubscription: any — Meteor subscription handle.
  bulkMoveSubscription: any;
  repairLoading: ReactiveVar<any>;
  repairResult: ReactiveVar<any>;
  repairError: ReactiveVar<any>;
}
