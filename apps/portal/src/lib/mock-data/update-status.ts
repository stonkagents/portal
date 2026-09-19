/**
 * Purpose: Mock update status data for USE_REAL_DAEMON=false mode and design system showcase
 */
import type { UpdateStatus } from '@/lib/api/hooks/use-update-status';

const mockUpdateIdle: UpdateStatus = {
  state: 'IDLE',
  currentVersion: '0.2.0',
  latestVersion: '0.2.0',
  releaseNotes: '',
  force: false,
  progress: 0,
  bytesDownloaded: 0,
  bytesTotal: 0,
  error: null,
  installerUrl: null,
  manualInstall: false,
};

const mockUpdateAvailable: UpdateStatus = {
  state: 'AVAILABLE',
  currentVersion: '0.2.0',
  latestVersion: '0.3.0',
  releaseNotes: 'Bug fixes and performance improvements',
  force: false,
  progress: 0,
  bytesDownloaded: 0,
  bytesTotal: 0,
  error: null,
  installerUrl: null,
  manualInstall: false,
};

const mockUpdateForce: UpdateStatus = {
  state: 'AVAILABLE',
  currentVersion: '0.1.0',
  latestVersion: '0.3.0',
  releaseNotes: 'Critical security update. This version is no longer supported',
  force: true,
  progress: 0,
  bytesDownloaded: 0,
  bytesTotal: 0,
  error: null,
  installerUrl: null,
  manualInstall: false,
};

const mockUpdateDownloading: UpdateStatus = {
  state: 'DOWNLOADING',
  currentVersion: '0.2.0',
  latestVersion: '0.3.0',
  releaseNotes: 'Bug fixes and performance improvements',
  force: false,
  progress: 45,
  bytesDownloaded: 9437184,
  bytesTotal: 20971520,
  error: null,
  installerUrl: null,
  manualInstall: false,
};

const mockUpdateVerifying: UpdateStatus = {
  state: 'VERIFYING',
  currentVersion: '0.2.0',
  latestVersion: '0.3.0',
  releaseNotes: '',
  force: false,
  progress: 100,
  bytesDownloaded: 0,
  bytesTotal: 0,
  error: null,
  installerUrl: null,
  manualInstall: false,
};

const mockUpdateInstalling: UpdateStatus = {
  state: 'INSTALLING',
  currentVersion: '0.2.0',
  latestVersion: '0.3.0',
  releaseNotes: '',
  force: false,
  progress: 100,
  bytesDownloaded: 0,
  bytesTotal: 0,
  error: null,
  installerUrl: null,
  manualInstall: false,
};

const mockUpdateRestarting: UpdateStatus = {
  state: 'RESTARTING',
  currentVersion: '0.2.0',
  latestVersion: '0.3.0',
  releaseNotes: '',
  force: false,
  progress: 100,
  bytesDownloaded: 0,
  bytesTotal: 0,
  error: null,
  installerUrl: null,
  manualInstall: false,
};

const mockUpdateComplete: UpdateStatus = {
  state: 'COMPLETE',
  currentVersion: '0.3.0',
  latestVersion: '0.3.0',
  releaseNotes: 'Bug fixes and performance improvements',
  force: false,
  progress: 100,
  bytesDownloaded: 0,
  bytesTotal: 0,
  error: null,
  installerUrl: null,
  manualInstall: false,
};

const mockUpdateFailed: UpdateStatus = {
  state: 'FAILED',
  currentVersion: '0.2.0',
  latestVersion: '0.3.0',
  releaseNotes: '',
  force: false,
  progress: 0,
  bytesDownloaded: 0,
  bytesTotal: 0,
  error: 'codesign verification failed: team ID mismatch',
  installerUrl: null,
  manualInstall: false,
};

const mockUpdateCancelled: UpdateStatus = {
  state: 'CANCELLED',
  currentVersion: '0.2.0',
  latestVersion: '0.3.0',
  releaseNotes: '',
  force: false,
  progress: 0,
  bytesDownloaded: 0,
  bytesTotal: 0,
  error: null,
  installerUrl: null,
  manualInstall: false,
};

/** All mock states for design system showcase */
export const allMockUpdateStates = [
  { label: 'Idle', data: mockUpdateIdle },
  { label: 'Available', data: mockUpdateAvailable },
  { label: 'Force Update', data: mockUpdateForce },
  { label: 'Downloading (45%)', data: mockUpdateDownloading },
  { label: 'Verifying', data: mockUpdateVerifying },
  { label: 'Installing', data: mockUpdateInstalling },
  { label: 'Restarting', data: mockUpdateRestarting },
  { label: 'Complete', data: mockUpdateComplete },
  { label: 'Failed', data: mockUpdateFailed },
  { label: 'Cancelled', data: mockUpdateCancelled },
];
