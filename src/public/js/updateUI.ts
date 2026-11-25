import type { UpdateStatus } from '../../shared/update.js';
import type { DesktopUpdateProgress, DesktopUpdateStatus } from './desktopHost.js';
import type { AppElements } from '/js/dom.js';
// The Updates drawer, topbar badge, and landing notification banner.
//
// Like `serverSettings.js`, all DOM lookups stay inside `createUpdateDrawer`
// so this module stays importable and unit-testable from Node without a browser.

import { installMethodLabel } from '../../shared/update.js';
import { desktopHost } from './desktopHost.js';
import {
  fetchUpdateStatus,
  restartOnboarderServer,
  streamSelfUpdate,
  updateServerSettings,
  waitForServerHealth,
} from './api.js';

function $(id: string) {
  return document.getElementById(id);
}

function isFocusedInside(el: HTMLElement) {
  return Boolean(document.activeElement && el.contains(document.activeElement));
}

export interface UpdateSummaryView {
  badgeText: string;
  badgeTone: 'ok' | 'available' | 'warn' | 'muted';
  buttonLabel: string;
  buttonTitle: string;
  dotClass: string;
  bannerVisible: boolean;
  bannerTitle: string;
  bannerText: string;
}

export function summarizeUpdateView(
  status: UpdateStatus | null,
  options?: { dismissedVersion?: string | null; busy?: boolean; updatedVersion?: string | null },
): UpdateSummaryView {
  const opts = options || {};
  if (opts.busy) {
    return {
      badgeText: 'Updating…',
      badgeTone: 'available',
      buttonLabel: 'Updating…',
      buttonTitle: 'Installing Onboarder update…',
      dotClass: 'update-dot is-checking',
      bannerVisible: false,
      bannerTitle: '',
      bannerText: '',
    };
  }
  if (opts.updatedVersion) {
    return {
      badgeText: `Updated to v${opts.updatedVersion}`,
      badgeTone: 'ok',
      buttonLabel: `Restart · v${opts.updatedVersion}`,
      buttonTitle: `Updated to v${opts.updatedVersion}. Restart the server to load it.`,
      dotClass: 'update-dot is-available',
      bannerVisible: false,
      bannerTitle: '',
      bannerText: '',
    };
  }
  if (!status) {
    return {
      badgeText: 'Not checked',
      badgeTone: 'muted',
      buttonLabel: 'Updates',
      buttonTitle: 'Check for Onboarder updates',
      dotClass: 'update-dot',
      bannerVisible: false,
      bannerTitle: '',
      bannerText: '',
    };
  }
  if (status.updateAvailable && status.latestVersion) {
    const dismissed = opts.dismissedVersion === status.latestVersion;
    return {
      badgeText: `v${status.latestVersion} available`,
      badgeTone: 'available',
      buttonLabel: `Update · v${status.latestVersion}`,
      buttonTitle: `Onboarder v${status.latestVersion} is available (installed: v${status.currentVersion})`,
      dotClass: 'update-dot is-available',
      bannerVisible: !dismissed,
      bannerTitle: `Onboarder v${status.latestVersion} is available`,
      bannerText: `You are running v${status.currentVersion}.`,
    };
  }
  if (status.error) {
    return {
      badgeText: 'Check failed',
      badgeTone: 'warn',
      buttonLabel: `v${status.currentVersion}`,
      buttonTitle: `Current version v${status.currentVersion} (${status.error})`,
      dotClass: 'update-dot is-error',
      bannerVisible: false,
      bannerTitle: '',
      bannerText: '',
    };
  }
  if (status.checkDisabled && !status.latestVersion) {
    return {
      badgeText: 'Auto-check off',
      badgeTone: 'muted',
      buttonLabel: `v${status.currentVersion}`,
      buttonTitle: `Onboarder v${status.currentVersion} — automatic checks are disabled`,
      dotClass: 'update-dot',
      bannerVisible: false,
      bannerTitle: '',
      bannerText: '',
    };
  }
  return {
    badgeText: 'Up to date',
    badgeTone: 'ok',
    buttonLabel: `v${status.currentVersion}`,
    buttonTitle: `Onboarder v${status.currentVersion} is up to date`,
    dotClass: 'update-dot is-current',
    bannerVisible: false,
    bannerTitle: '',
    bannerText: '',
  };
}

export function summarizeDesktopUpdateView(
  status: DesktopUpdateStatus | null,
  options?: { busy?: boolean; progress?: DesktopUpdateProgress | null; dismissedVersion?: string | null },
): UpdateSummaryView {
  const opts = options || {};
  if (opts.busy) {
    const pct = opts.progress?.phase === 'downloading' && typeof opts.progress.percent === 'number'
      ? ` (${opts.progress.percent}%)`
      : '';
    return {
      badgeText: `Updating${pct}…`,
      badgeTone: 'available',
      buttonLabel: `Updating${pct}…`,
      buttonTitle: opts.progress?.message || 'Downloading and verifying Onboarder for Mac update…',
      dotClass: 'update-dot is-checking',
      bannerVisible: false,
      bannerTitle: '',
      bannerText: '',
    };
  }
  if (status?.updateReadyToRestart && status.pendingVersion) {
    return {
      badgeText: `Restart for v${status.pendingVersion}`,
      badgeTone: 'ok',
      buttonLabel: `Restart · v${status.pendingVersion}`,
      buttonTitle: `Onboarder v${status.pendingVersion} is installed. Restart to launch the new version.`,
      dotClass: 'update-dot is-available',
      bannerVisible: true,
      bannerTitle: `Onboarder v${status.pendingVersion} is ready`,
      bannerText: 'Restart Onboarder for Mac to finish applying the update.',
    };
  }
  if (!status) {
    return {
      badgeText: 'Not checked',
      badgeTone: 'muted',
      buttonLabel: 'Updates',
      buttonTitle: 'Check for Onboarder for Mac updates',
      dotClass: 'update-dot',
      bannerVisible: false,
      bannerTitle: '',
      bannerText: '',
    };
  }
  if (status.updateAvailable && status.latestVersion) {
    const dismissed = opts.dismissedVersion === status.latestVersion || status.dismissedVersion === status.latestVersion;
    const channelNote = status.channel === 'preview' ? ' (preview)' : '';
    return {
      badgeText: `v${status.latestVersion} available`,
      badgeTone: 'available',
      buttonLabel: `Update · v${status.latestVersion}`,
      buttonTitle: `Onboarder for Mac v${status.latestVersion}${channelNote} is available (installed: v${status.currentVersion})`,
      dotClass: 'update-dot is-available',
      bannerVisible: !dismissed,
      bannerTitle: `Onboarder for Mac v${status.latestVersion}${channelNote} is available`,
      bannerText: `Installed: v${status.currentVersion}${status.assetName ? ' · ' + status.assetName : ''}.`,
    };
  }
  if (status.error) {
    return {
      badgeText: 'Check failed',
      badgeTone: 'warn',
      buttonLabel: `v${status.currentVersion}`,
      buttonTitle: `Onboarder for Mac v${status.currentVersion} (${status.error})`,
      dotClass: 'update-dot is-error',
      bannerVisible: false,
      bannerTitle: '',
      bannerText: '',
    };
  }
  if (status.checkDisabled && !status.latestVersion) {
    return {
      badgeText: 'Auto-check off',
      badgeTone: 'muted',
      buttonLabel: `v${status.currentVersion}`,
      buttonTitle: `Onboarder for Mac v${status.currentVersion} — automatic checks are disabled`,
      dotClass: 'update-dot',
      bannerVisible: false,
      bannerTitle: '',
      bannerText: '',
    };
  }
  return {
    badgeText: 'Up to date',
    badgeTone: 'ok',
    buttonLabel: `Mac v${status.currentVersion}`,
    buttonTitle: `Onboarder for Mac v${status.currentVersion} is up to date`,
    dotClass: 'update-dot is-current',
    bannerVisible: false,
    bannerTitle: '',
    bannerText: '',
  };
}

function formatBytes(bytes: number | null | undefined) {
  if (!bytes || bytes <= 0) return '';
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

export function createUpdateDrawer(options?: Record<string, any>) {
  const opts = options || {};
  const toast = typeof opts.toast === 'function' ? opts.toast : (..._args: unknown[]) => {};
  const onOpenOther = typeof opts.onBeforeOpen === 'function' ? opts.onBeforeOpen : () => {};
  const host = desktopHost();

  const dom: Partial<AppElements> = {};
  [
    'updateBtn', 'updateDot', 'updateBtnLabel',
    'updateDrawer', 'updateScrim', 'updateClose', 'updateDrawerNote',
    'updateBadge', 'updateCheckedAt', 'updateCurrentVer', 'updateLatestVer',
    'updateMethod', 'updateMethodLabel', 'updateNodeInfo', 'updateRuntimeLabel',
    'updateProgress', 'updateNotice',
    'updateCheckBtn', 'updateInstallBtn', 'updateRestartBtn',
    'updateManualBox', 'updateManualCmd', 'updateManualLabel', 'updateCopyCmd',
    'updateConsoleWrap', 'updateConsole', 'updateConsoleVerdict',
    'updateLinks', 'updateReleaseLink', 'updateNpmLink',
    'updateNotesWrap', 'updateNotesBody', 'updateAutoCheck', 'updatePrivacyNote',
    'landingUpdateBanner', 'landingUpdateTitle', 'landingUpdateText',
    'landingUpdateAction', 'landingUpdateDetails', 'landingUpdateDismiss',
  ].forEach((id) => (dom[id] = $(id)));

  let current: UpdateStatus | null = null;
  let desktopStatus: DesktopUpdateStatus | null = null;
  let desktopProgress: DesktopUpdateProgress | null = null;
  let lastLoggedPhase = '';
  let lastLoggedQuarter = -1;
  let busy = false;
  let restarting = false;
  let updatedVersion: string | null = null;
  let canRestartNow = false;
  let dismissedVersion: string | null = null;
  try {
    dismissedVersion = sessionStorage.getItem('onboarder.dismissedUpdate');
  } catch { /* sessionStorage may be unavailable */ }

  if (host) {
    dom.updateDrawerNote.textContent = 'Check GitHub Releases for new Onboarder for Mac versions, verify checksums and code signatures, and install updates in place.';
    dom.updateMethodLabel.textContent = 'Distribution';
    dom.updateRuntimeLabel.textContent = 'Platform';
    dom.updatePrivacyNote.textContent = 'Only reads public release metadata from github.com. Downloads are SHA-256 and code-signature verified before installation.';
  }

  function setNotice(text: string, cls = '') {
    dom.updateNotice.className = 'drawer-status' + (cls ? ' ' + cls : '');
    dom.updateNotice.textContent = text;
  }

  function appendLog(line: string) {
    dom.updateConsoleWrap.hidden = false;
    dom.updateConsole.textContent = dom.updateConsole.textContent
      ? `${dom.updateConsole.textContent}\n${line}`
      : line;
    dom.updateConsole.scrollTop = dom.updateConsole.scrollHeight;
  }

  function renderDesktop() {
    const view = summarizeDesktopUpdateView(desktopStatus, {
      busy: busy || restarting,
      progress: desktopProgress,
      dismissedVersion,
    });
    dom.updateDot.className = view.dotClass;
    dom.updateBtnLabel.textContent = view.buttonLabel;
    dom.updateBtn.title = view.buttonTitle;
    dom.updateBtn.classList.toggle('is-available', Boolean(desktopStatus?.updateAvailable || desktopStatus?.updateReadyToRestart));

    dom.updateBadge.textContent = view.badgeText;
    dom.updateBadge.className = `update-status-pill is-${view.badgeTone}`;

    dom.landingUpdateBanner.hidden = !view.bannerVisible;
    if (view.bannerVisible && desktopStatus) {
      dom.landingUpdateTitle.textContent = view.bannerTitle;
      dom.landingUpdateText.textContent = view.bannerText;
      if (desktopStatus.updateReadyToRestart) {
        dom.landingUpdateAction.hidden = false;
        dom.landingUpdateAction.disabled = restarting;
        dom.landingUpdateAction.textContent = 'Restart Onboarder';
        dom.landingUpdateDismiss.hidden = true;
      } else {
        dom.landingUpdateDismiss.hidden = false;
        const actionable = Boolean(desktopStatus.canAutoUpdate || desktopStatus.canDownloadInstaller);
        dom.landingUpdateAction.hidden = !actionable;
        dom.landingUpdateAction.disabled = busy;
        dom.landingUpdateAction.textContent = desktopStatus.canAutoUpdate
          ? `Update to v${desktopStatus.latestVersion}`
          : `Download v${desktopStatus.latestVersion}`;
      }
    }

    if (desktopProgress && busy) {
      dom.updateProgress.hidden = false;
      if (typeof desktopProgress.percent === 'number') {
        dom.updateProgress.max = 100;
        dom.updateProgress.value = desktopProgress.percent;
      } else {
        dom.updateProgress.removeAttribute('value');
      }
    } else {
      dom.updateProgress.hidden = true;
    }

    if (!desktopStatus) return;

    dom.updateCurrentVer.textContent = `Mac v${desktopStatus.currentVersion}`;
    dom.updateLatestVer.textContent = desktopStatus.latestVersion ? `v${desktopStatus.latestVersion}` : 'unavailable';
    const buildKind = desktopStatus.signedForDistribution ? 'Signed .app' : 'Preview build';
    const sizeText = formatBytes(desktopStatus.assetSize);
    dom.updateMethod.textContent = sizeText ? `${buildKind} · ${sizeText}` : buildKind;
    dom.updateNodeInfo.textContent = `${desktopStatus.arch} · core v${desktopStatus.coreVersion}`;
    dom.updateCheckedAt.textContent = desktopStatus.checkedAt
      ? `${desktopStatus.fromCache ? 'Cached · ' : ''}${new Date(desktopStatus.checkedAt).toLocaleString()}`
      : '';
    dom.updateAutoCheck.checked = desktopStatus.autoCheckEnabled && !desktopStatus.optedOutByEnv;
    dom.updateAutoCheck.disabled = desktopStatus.optedOutByEnv;

    dom.updateCheckBtn.disabled = busy || restarting;
    const canInstallOrDownload = Boolean(
      desktopStatus.updateAvailable
      && !desktopStatus.updateReadyToRestart
      && (desktopStatus.canAutoUpdate || desktopStatus.canDownloadInstaller),
    );
    dom.updateInstallBtn.hidden = !canInstallOrDownload;
    dom.updateInstallBtn.disabled = busy || restarting;
    if (desktopStatus.latestVersion) {
      dom.updateInstallBtn.textContent = desktopStatus.canAutoUpdate
        ? `Download & update to v${desktopStatus.latestVersion}`
        : `Download v${desktopStatus.latestVersion} installer`;
    }

    dom.updateRestartBtn.hidden = !desktopStatus.updateReadyToRestart;
    dom.updateRestartBtn.disabled = restarting;
    dom.updateRestartBtn.textContent = 'Restart Onboarder';

    dom.updateManualBox.hidden = true;

    dom.updateLinks.hidden = !desktopStatus.releaseUrl;
    if (desktopStatus.releaseUrl) {
      dom.updateReleaseLink.href = desktopStatus.releaseUrl;
      dom.updateReleaseLink.textContent = 'Release notes on GitHub ↗';
      dom.updateReleaseLink.hidden = false;
    }
    dom.updateNpmLink.hidden = true;

    dom.updateNotesWrap.hidden = !desktopStatus.releaseNotes;
    if (desktopStatus.releaseNotes) dom.updateNotesBody.textContent = desktopStatus.releaseNotes;

    if (!busy && !restarting) {
      if (desktopStatus.error) {
        setNotice(desktopStatus.error, 'err');
      } else if (desktopStatus.updateReadyToRestart) {
        setNotice(`Onboarder v${desktopStatus.pendingVersion} is verified and installed. Restart Onboarder to load it.`, 'ok');
      } else if (desktopStatus.downloadedInstallerPath) {
        setNotice(`Verified installer saved to ${desktopStatus.downloadedInstallerPath}.`, 'ok');
      } else if (desktopStatus.updateAvailable && !desktopStatus.canAutoUpdate && desktopStatus.installReason) {
        setNotice(desktopStatus.installReason, '');
      } else if (desktopStatus.updateAvailable) {
        setNotice(`Ready to update from v${desktopStatus.currentVersion} to v${desktopStatus.latestVersion}.`, 'ok');
      } else if (desktopStatus.optedOutByEnv) {
        setNotice('Update checks are disabled via ONBOARDER_NO_UPDATE_CHECK. Click "Check now" to check manually.', '');
      } else if (desktopStatus.checkDisabled && !desktopStatus.latestVersion) {
        setNotice('Automatic update checks are disabled. Click "Check now" to check on demand.', '');
      } else {
        setNotice('');
      }
    }
  }

  function renderWeb() {
    const view = summarizeUpdateView(current, { dismissedVersion, busy: busy || restarting, updatedVersion });
    dom.updateDot.className = view.dotClass;
    dom.updateBtnLabel.textContent = view.buttonLabel;
    dom.updateBtn.title = view.buttonTitle;
    dom.updateBtn.classList.toggle('is-available', Boolean(current?.updateAvailable || updatedVersion));

    dom.updateBadge.textContent = view.badgeText;
    dom.updateBadge.className = `update-status-pill is-${view.badgeTone}`;

    dom.landingUpdateBanner.hidden = !view.bannerVisible;
    if (view.bannerVisible && current?.latestVersion) {
      dom.landingUpdateTitle.textContent = view.bannerTitle;
      dom.landingUpdateText.textContent = view.bannerText;
      dom.landingUpdateAction.hidden = !current.canAutoUpdate;
      dom.landingUpdateAction.disabled = busy;
      dom.landingUpdateAction.textContent = `Update to v${current.latestVersion}`;
    }

    if (!current) return;

    dom.updateCurrentVer.textContent = `v${current.currentVersion}`;
    dom.updateLatestVer.textContent = current.latestVersion ? `v${current.latestVersion}` : 'unavailable';
    dom.updateMethod.textContent = installMethodLabel(current.installMethod);
    dom.updateNodeInfo.textContent = current.nodeCompatible
      ? 'Compatible'
      : `Needs ${current.requiredNode || 'newer Node.js'}`;
    dom.updateCheckedAt.textContent = current.checkedAt
      ? `${current.fromCache ? 'Cached · ' : ''}${new Date(current.checkedAt).toLocaleString()}`
      : '';
    dom.updateAutoCheck.checked = !current.checkDisabled;

    dom.updateCheckBtn.disabled = busy || restarting;
    const showInstall = Boolean(current.updateAvailable && current.canAutoUpdate && !updatedVersion);
    dom.updateInstallBtn.hidden = !showInstall;
    dom.updateInstallBtn.disabled = busy || restarting;
    if (current.latestVersion) {
      dom.updateInstallBtn.textContent = `Update to v${current.latestVersion}`;
    }

    dom.updateRestartBtn.hidden = !(updatedVersion && canRestartNow);
    dom.updateRestartBtn.disabled = restarting;

    const showManual = Boolean(current.manualCommand && (current.updateAvailable || !current.canAutoUpdate));
    dom.updateManualBox.hidden = !showManual;
    if (showManual) dom.updateManualCmd.value = current.manualCommand;

    const hasLinks = Boolean(current.releaseUrl || current.npmUrl);
    dom.updateLinks.hidden = !hasLinks;
    if (current.releaseUrl) {
      dom.updateReleaseLink.href = current.releaseUrl;
      dom.updateReleaseLink.hidden = false;
    } else {
      dom.updateReleaseLink.hidden = true;
    }
    if (current.npmUrl) {
      dom.updateNpmLink.href = current.npmUrl;
      dom.updateNpmLink.hidden = false;
    } else {
      dom.updateNpmLink.hidden = true;
    }

    dom.updateNotesWrap.hidden = !current.releaseNotes;
    if (current.releaseNotes) dom.updateNotesBody.textContent = current.releaseNotes;

    if (!busy && !restarting && !updatedVersion) {
      if (current.error) setNotice(current.error, 'err');
      else if (current.updateAvailable && !current.canAutoUpdate && current.reason) {
        setNotice(`${current.reason} Use the manual command below.`, 'err');
      } else if (current.updateAvailable) {
        setNotice(`Ready to update from v${current.currentVersion} to v${current.latestVersion}.`, 'ok');
      } else if (current.checkDisabled && !current.latestVersion) {
        setNotice('Automatic update checks are disabled. Click "Check now" to check on demand.', '');
      } else {
        setNotice('');
      }
    }
  }

  function render() {
    if (host) renderDesktop();
    else renderWeb();
  }

  if (host) {
    host.subscribe((event) => {
      if (event.type === 'update-status' && event.status) {
        desktopStatus = event.status as DesktopUpdateStatus;
        if (desktopStatus.dismissedVersion) dismissedVersion = desktopStatus.dismissedVersion;
        if (!['downloading', 'verifying', 'installing'].includes(desktopStatus.state)) {
          busy = false;
        }
        render();
      }
      if (event.type === 'update-progress' && event.progress) {
        const p = event.progress as DesktopUpdateProgress;
        desktopProgress = p;
        if (['downloading', 'verifying', 'extracting', 'replacing'].includes(p.phase)) {
          busy = true;
          setNotice(p.message);
          if (p.phase !== lastLoggedPhase) {
            lastLoggedPhase = p.phase;
            lastLoggedQuarter = -1;
            appendLog(p.message);
          } else if (p.phase === 'downloading' && typeof p.percent === 'number') {
            const quarter = Math.floor(p.percent / 25);
            if (quarter > lastLoggedQuarter && quarter > 0 && quarter < 4) {
              lastLoggedQuarter = quarter;
              appendLog(`${p.message} ${p.percent}%`);
            }
          }
        } else if (p.phase === 'complete') {
          busy = false;
          dom.updateConsoleVerdict.className = 'analysis-console-verdict is-ok';
          dom.updateConsoleVerdict.textContent = p.message;
          appendLog(p.message);
          setNotice(p.message, 'ok');
          toast(p.message);
        } else if (p.phase === 'error') {
          busy = false;
          dom.updateConsoleVerdict.className = 'analysis-console-verdict is-err';
          dom.updateConsoleVerdict.textContent = p.message;
          appendLog(p.message);
          setNotice(p.message, 'err');
        }
        render();
      }
    });
  }

  async function check(checkOpts?: { refresh?: boolean; silent?: boolean }) {
    const o = checkOpts || {};
    if (busy || restarting) return host ? desktopStatus : current;
    if (!o.silent) {
      dom.updateCheckBtn.disabled = true;
      dom.updateBadge.textContent = 'Checking…';
      setNotice(host ? 'Checking GitHub Releases for macOS builds…' : 'Checking npm registry…');
    }
    try {
      if (host) {
        const status = await host.update(o.refresh ? 'check' : 'status', { force: Boolean(o.refresh) });
        desktopStatus = status;
        if (status.dismissedVersion) dismissedVersion = status.dismissedVersion;
        if (status.updateAvailable && status.latestVersion && dismissedVersion && dismissedVersion !== status.latestVersion) {
          dismissedVersion = null;
        }
        render();
        return status;
      }
      const status = await fetchUpdateStatus({ refresh: Boolean(o.refresh), notes: Boolean(o.refresh) });
      current = status;
      if (status.updateAvailable && status.latestVersion && dismissedVersion && dismissedVersion !== status.latestVersion) {
        dismissedVersion = null;
      }
      render();
      return status;
    } catch (err) {
      if (!o.silent) setNotice(err instanceof Error ? err.message : String(err), 'err');
      return null;
    } finally {
      dom.updateCheckBtn.disabled = busy || restarting;
    }
  }

  async function install() {
    if (busy || restarting) return;
    busy = true;
    desktopProgress = null;
    lastLoggedPhase = '';
    lastLoggedQuarter = -1;
    updatedVersion = null;
    canRestartNow = false;
    dom.updateConsole.textContent = '';
    dom.updateConsoleVerdict.textContent = '';
    dom.updateConsoleVerdict.className = 'analysis-console-verdict';
    dom.updateConsoleWrap.hidden = false;

    if (host) {
      setNotice('Preparing Onboarder for Mac update…');
      render();
      try {
        const mode = desktopStatus?.canAutoUpdate ? 'auto' : 'dmg';
        const status = await host.update('install', { mode });
        desktopStatus = status;
        if (status.error) {
          dom.updateConsoleVerdict.className = 'analysis-console-verdict is-err';
          dom.updateConsoleVerdict.textContent = status.error;
          setNotice(status.error, 'err');
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        dom.updateConsoleVerdict.className = 'analysis-console-verdict is-err';
        dom.updateConsoleVerdict.textContent = message;
        setNotice(message, 'err');
      } finally {
        busy = false;
        render();
      }
      return;
    }

    setNotice('Downloading and installing update…');
    render();

    try {
      const done = await streamSelfUpdate(
        { version: current?.latestVersion || undefined },
        (event) => {
          if (event.type === 'status') {
            setNotice(event.message);
          } else if (event.type === 'log') {
            appendLog(event.line);
          }
        },
      );

      if (done?.ok) {
        updatedVersion = done.updatedTo || done.currentVersion;
        canRestartNow = Boolean(done.canRestart);
        if (current) {
          current = {
            ...current,
            currentVersion: updatedVersion,
            updateAvailable: false,
            upToDate: true,
            canRestart: canRestartNow,
          };
        }
        dom.updateConsoleVerdict.className = 'analysis-console-verdict is-ok';
        dom.updateConsoleVerdict.textContent = canRestartNow
          ? `Updated to v${updatedVersion}. Click "Restart & reload" to start the new version.`
          : `Updated to v${updatedVersion}. Restart Onboarder in your terminal (\`onboarder restart\`) to load the new version.`;
        setNotice(dom.updateConsoleVerdict.textContent, 'ok');
        toast(`Updated Onboarder to v${updatedVersion}`);
      } else {
        const message = done?.error || 'Update failed.';
        dom.updateConsoleVerdict.className = 'analysis-console-verdict is-err';
        dom.updateConsoleVerdict.textContent = message;
        setNotice(message, 'err');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      dom.updateConsoleVerdict.className = 'analysis-console-verdict is-err';
      dom.updateConsoleVerdict.textContent = message;
      setNotice(message, 'err');
    } finally {
      busy = false;
      render();
    }
  }

  async function restart() {
    if (restarting || busy) return;
    if (host) {
      restarting = true;
      setNotice('Restarting Onboarder…');
      render();
      try {
        await host.update('restart');
      } catch (err) {
        restarting = false;
        setNotice(err instanceof Error ? err.message : String(err), 'err');
        render();
      }
      return;
    }
    restarting = true;
    setNotice('Restarting Onboarder server…');
    render();
    try {
      await restartOnboarderServer();
      const ready = await waitForServerHealth(20000);
      if (ready) {
        location.reload();
        return;
      }
      setNotice('Server restart timed out. Run `onboarder status` in your terminal and reload this page.', 'err');
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err), 'err');
    } finally {
      restarting = false;
      render();
    }
  }

  async function open(openOpts?: { refresh?: boolean }) {
    const o = openOpts || {};
    onOpenOther();
    dom.updateDrawer.hidden = false;
    dom.updateScrim.hidden = false;
    dom.updateClose.focus();
    render();
    if (host ? (!desktopStatus || (o.refresh && !desktopStatus.updateReadyToRestart && !busy)) : (!current || o.refresh)) {
      await check({ refresh: Boolean(o.refresh), silent: false });
    }
  }

  function close() {
    const returnFocus = !dom.updateDrawer.hidden && isFocusedInside(dom.updateDrawer);
    dom.updateDrawer.hidden = true;
    dom.updateScrim.hidden = true;
    if (returnFocus) dom.updateBtn.focus();
  }

  function syncAutoCheckPreference(enabled: boolean) {
    if (current) current = { ...current, checkDisabled: !enabled };
    if (dom.updateAutoCheck) dom.updateAutoCheck.checked = Boolean(enabled);
    render();
  }

  document.addEventListener('workspace-open-updates', ((event: CustomEvent<{ refresh?: boolean }>) => {
    void open({ refresh: Boolean(event.detail?.refresh) });
  }) as EventListener);

  dom.updateClose.addEventListener('click', close);
  dom.updateScrim.addEventListener('click', close);
  dom.updateCheckBtn.addEventListener('click', () => { void check({ refresh: true, silent: false }); });
  dom.updateInstallBtn.addEventListener('click', () => { void install(); });
  dom.updateRestartBtn.addEventListener('click', () => { void restart(); });

  dom.updateCopyCmd.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(dom.updateManualCmd.value);
      toast('Command copied');
    } catch {
      dom.updateManualCmd.select();
    }
  });

  dom.updateAutoCheck.addEventListener('change', async () => {
    const enabled = dom.updateAutoCheck.checked;
    try {
      if (host) {
        desktopStatus = await host.update('set-auto-check', { autoCheck: enabled });
        toast(enabled ? 'Automatic update checks enabled' : 'Automatic update checks paused');
        render();
        return;
      }
      await updateServerSettings({ updateCheck: enabled });
      if (current) current = { ...current, checkDisabled: !enabled };
      toast(enabled ? 'Automatic update checks enabled' : 'Automatic update checks paused');
      render();
    } catch (err) {
      dom.updateAutoCheck.checked = !enabled;
      setNotice(err instanceof Error ? err.message : String(err), 'err');
    }
  });

  dom.landingUpdateDetails.addEventListener('click', () => { void open({ refresh: false }); });
  dom.landingUpdateAction.addEventListener('click', async () => {
    if (host && desktopStatus?.updateReadyToRestart) {
      await restart();
      return;
    }
    await open({ refresh: false });
    if (host ? (desktopStatus?.updateAvailable && (desktopStatus.canAutoUpdate || desktopStatus.canDownloadInstaller)) : (current?.updateAvailable && current.canAutoUpdate)) {
      await install();
    }
  });
  dom.landingUpdateDismiss.addEventListener('click', () => {
    dismissedVersion = (host ? desktopStatus?.latestVersion : current?.latestVersion) || null;
    if (host && dismissedVersion) {
      void host.update('dismiss', { version: dismissedVersion }).then(s => { desktopStatus = s; render(); }).catch(() => {});
    }
    try {
      if (dismissedVersion) sessionStorage.setItem('onboarder.dismissedUpdate', dismissedVersion);
    } catch { /* ignore */ }
    render();
  });

  return {
    open,
    close,
    check,
    syncAutoCheckPreference,
    isOpen: () => !dom.updateDrawer.hidden,
  };
}
