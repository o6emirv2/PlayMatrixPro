import { reportHomeError } from './dom-utils.js';
import { installHomeWidgetContract } from './widget-contract.js';
import { installGameRouteNormalizer } from './game-catalog.js';
import { installAuthModalGuards } from './auth-modal.js';
import { installProfilePanelGuards } from './profile-panel.js';
import { installLeaderboardGuards } from './leaderboard.js';
import { installStatsGuards } from './stats.js';
import { installSocialEntryGuards } from './social-entry.js';
import { installHeroSliderGuards } from './hero-slider.js';
import { installModalSafety } from './modal.js';
import { installRewardUiGuards } from './reward-ui.js';
import { installInviteUiGuards } from './invite-ui.js';
import './legacy-home.runtime.js';

const modules = Object.freeze([
  ['widget-contract', installHomeWidgetContract],
  ['routes', installGameRouteNormalizer],
  ['modal-safety', installModalSafety],
  ['auth', installAuthModalGuards],
  ['profile', installProfilePanelGuards],
  ['leaderboard', installLeaderboardGuards],
  ['stats', installStatsGuards],
  ['social', installSocialEntryGuards],
  ['hero', installHeroSliderGuards],
  ['reward', installRewardUiGuards],
  ['invite', installInviteUiGuards]
]);

let booted = false;

function runModule(name, installer) {
  try {
    installer(document);
    return true;
  } catch (error) {
    reportHomeError(`module.${name}`, error);
    return false;
  }
}

export function bootHomeApplication() {
  if (booted) return true;
  booted = true;
  const result = Object.fromEntries(modules.map(([name, installer]) => [name, runModule(name, installer)]));
  window.__PM_HOME_MODULES__ = Object.freeze(result);
  return Object.values(result).every(Boolean);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootHomeApplication, { once: true });
else bootHomeApplication();

export const homeModuleInfo = Object.freeze({ version: 'clean-55', strategy: 'premium-ui-with-legacy-compatible-bridges' });
