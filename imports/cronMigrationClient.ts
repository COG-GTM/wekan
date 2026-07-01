import { Meteor } from 'meteor/meteor';
import { ReactiveVar } from 'meteor/reactive-var';
import { Tracker } from 'meteor/tracker';
import CronJobStatus from '/models/cronJobStatus';

export { CronJobStatus };

export const cronMigrationProgress = new ReactiveVar(0);
export const cronMigrationStatus = new ReactiveVar('');
export const cronMigrationCurrentStep = new ReactiveVar('');
export const cronMigrationSteps = new ReactiveVar<CronMigrationStep[]>([]);
export const cronIsMigrating = new ReactiveVar(false);
export const cronJobs = new ReactiveVar<CronJobDoc[]>([]);
export const cronMigrationCurrentStepNum = new ReactiveVar(0);
export const cronMigrationTotalSteps = new ReactiveVar(0);
export const cronMigrationCurrentAction = new ReactiveVar('');
export const cronMigrationJobProgress = new ReactiveVar(0);
export const cronMigrationJobStepNum = new ReactiveVar(0);
export const cronMigrationJobTotalSteps = new ReactiveVar(0);
export const cronMigrationEtaSeconds = new ReactiveVar<number | null>(null);
export const cronMigrationElapsedSeconds = new ReactiveVar<number | null>(null);
export const cronMigrationCurrentNumber = new ReactiveVar<number | null>(null);
export const cronMigrationCurrentName = new ReactiveVar('');

function fetchProgress() {
  Meteor.call('cron.getMigrationProgress', (err: Meteor.Error | undefined, res: CronMigrationProgress | undefined) => {
    if (err) return;
    if (!res) return;
    cronMigrationProgress.set(res.progress || 0);
    cronMigrationStatus.set(res.status || '');
    cronMigrationCurrentStep.set(res.currentStep || '');
    cronMigrationSteps.set(res.steps || []);
    cronIsMigrating.set(res.isMigrating || false);
    cronMigrationCurrentStepNum.set(res.currentStepNum || 0);
    cronMigrationTotalSteps.set(res.totalSteps || 0);
    cronMigrationCurrentAction.set(res.currentAction || '');
    cronMigrationJobProgress.set(res.jobProgress || 0);
    cronMigrationJobStepNum.set(res.jobStepNum || 0);
    cronMigrationJobTotalSteps.set(res.jobTotalSteps || 0);
    cronMigrationEtaSeconds.set(res.etaSeconds ?? null);
    cronMigrationElapsedSeconds.set(res.elapsedSeconds ?? null);
    cronMigrationCurrentNumber.set(res.migrationNumber ?? null);
    cronMigrationCurrentName.set(res.migrationName || '');

    if ((!res.steps || res.steps.length === 0) && !res.isMigrating) {
      const loaded = res.migrationStepsLoaded || 0;
      const total = res.migrationStepsTotal || 0;
      if (total > 0) {
        cronMigrationStatus.set(
          `Updating Select Migration dropdown menu (${loaded}/${total})`
        );
      } else {
        cronMigrationStatus.set('Updating Select Migration dropdown menu');
      }
    }
  });
}

if (Meteor.isClient) {
  // Subscribe to migration status updates (real-time pub/sub)
  Meteor.subscribe('cronMigrationStatus');

  // Subscribe to cron jobs list (replaces polling cron.getJobs)
  Meteor.subscribe('cronJobs');

  // Subscribe to detailed migration progress data
  Meteor.subscribe('migrationProgress');

  // Reactively update cron jobs from published collection
  Tracker.autorun(() => {
    const jobDocs = CronJobStatus.find({}).fetch();
    cronJobs.set(jobDocs);
  });

  // Reactively update status from published data
  Tracker.autorun(() => {
    const statusDoc = CronJobStatus.findOne({ jobId: 'migration' });
    if (statusDoc) {
      cronIsMigrating.set(statusDoc.status === 'running' || statusDoc.status === 'starting');

      // Update status text based on job status
      if (statusDoc.status === 'starting') {
        cronMigrationStatus.set(statusDoc.statusMessage || 'Starting migrations...');
      } else if (statusDoc.status === 'pausing') {
        cronMigrationStatus.set(statusDoc.statusMessage || 'Pausing migrations...');
      } else if (statusDoc.status === 'stopping') {
        cronMigrationStatus.set(statusDoc.statusMessage || 'Stopping migrations...');
      } else if (statusDoc.statusMessage) {
        cronMigrationStatus.set(statusDoc.statusMessage);
      }

      if (statusDoc.progress !== undefined) {
        cronMigrationJobProgress.set(statusDoc.progress);
      }
    }
  });

  // Reactively update job progress from migration details
  Tracker.autorun(() => {
    const runningJob = CronJobStatus.findOne(
      { status: 'running', jobType: 'migration' },
      { sort: { updatedAt: -1 } }
    );

    if (runningJob) {
      cronMigrationJobProgress.set(runningJob.progress || 0);

      // Get ETA information if available
      if (runningJob.startedAt && runningJob.progress > 0) {
        const elapsed = Math.round((Date.now() - runningJob.startedAt.getTime()) / 1000);
        const eta = Math.round((elapsed * (100 - runningJob.progress)) / runningJob.progress);
        cronMigrationEtaSeconds.set(eta);
        cronMigrationElapsedSeconds.set(elapsed);
      }
    }
  });

  // Initial fetch for migration steps and other data
  fetchProgress();

  // Poll periodically only for migration steps dropdown (non-reactive data)
  // Increased from 5000ms to 10000ms since most data is now reactive via pub/sub
  Meteor.setInterval(() => {
    fetchProgress();
  }, 10000);
}

// One migration/cron entry as returned in the progress payload's `steps` array.
interface CronMigrationStep {
  id: string;
  name: string;
  description?: string;
  weight?: number;
  completed?: boolean;
  progress?: number;
  cronName?: string;
  schedule?: string;
  status?: string;
}

// A CronJobStatus document as published to the client. The collection is an
// untyped legacy Meteor model, so its documents arrive as dynamic Mongo records.
interface CronJobDoc {
  _id?: string;
  [field: string]: any;
}

// Payload returned by the `cron.getMigrationProgress` method. Every field is
// optional because the client reads them defensively with `||`/`??` fallbacks.
interface CronMigrationProgress {
  progress?: number;
  status?: string;
  currentStep?: string;
  steps?: CronMigrationStep[];
  isMigrating?: boolean;
  currentStepNum?: number;
  totalSteps?: number;
  currentAction?: string;
  jobProgress?: number;
  jobStepNum?: number;
  jobTotalSteps?: number;
  etaSeconds?: number | null;
  elapsedSeconds?: number | null;
  migrationNumber?: number | null;
  migrationName?: string;
  migrationStepsLoaded?: number;
  migrationStepsTotal?: number;
}

export default {
  cronMigrationProgress,
  cronMigrationStatus,
  cronMigrationCurrentStep,
  cronMigrationSteps,
  cronIsMigrating,
  cronJobs,
  cronMigrationCurrentAction,
  cronMigrationJobProgress,
  cronMigrationJobStepNum,
  cronMigrationJobTotalSteps,
  cronMigrationEtaSeconds,
  cronMigrationElapsedSeconds,
  cronMigrationCurrentNumber,
  cronMigrationCurrentName,
};
