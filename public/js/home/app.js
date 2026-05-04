/* PlayMatrix clean: real home orchestrator. Each imported module owns one UI responsibility; legacy runtime remains the compatibility layer until later phases remove the final monolith. */
import { reportHomeError } from "./dom-utils.js?v=pm21r2";
import { installHomeWidgetContract } from "./widget-contract.js?v=pm21r2";
import { installGameRouteNormalizer } from "./game-catalog.js?v=pm21r2";
import { installAuthModalGuards } from "./auth-modal.js?v=pm21r2";
import { installProfilePanelGuards } from "./profile-panel.js?v=pm21r2";
import { installLeaderboardGuards } from "./leaderboard.js?v=pm21r2";
import { installStatsGuards } from "./stats.js?v=pm21r2";
import { installSocialEntryGuards } from "./social-entry.js?v=pm21r2";
import { installHeroSliderGuards } from "./hero-slider.js?v=pm21r2";
import { installModalSafety } from "./modal.js?v=pm21r2";
import { installRewardUiGuards } from "./reward-ui.js?v=pm21r2";
import { installInviteUiGuards } from "./invite-ui.js?v=pm21r2";
import "./legacy-home.runtime.js?v=pm21r2";

let booted = false;

const MODULES = Object.freeze([
  ["widget-contract", installHomeWidgetContract],
  ["routes", installGameRouteNormalizer],
  ["modal", installModalSafety],
  ["auth", installAuthModalGuards],
  ["profile", installProfilePanelGuards],
  ["leaderboard", installLeaderboardGuards],
  ["stats", installStatsGuards],
  ["social", installSocialEntryGuards],
  ["hero", installHeroSliderGuards],
  ["reward", installRewardUiGuards],
  ["invite", installInviteUiGuards]
]);

function runModule(name, installer) {
  try {
    installer(document);
    return true;
  } catch (error) {
    console.error(`[PlayMatrix] home module failed: ${name}`, error);
    reportHomeError(`home.${name}`, error);
    return false;
  }
}

export async function bootHomeApplication() {
  if (booted) return true;
  booted = true;
  const results = MODULES.map(([name, installer]) => [name, runModule(name, installer)]);
  window.__PM_HOME_MODULES__ = Object.freeze(Object.fromEntries(results));
  return results.every(([, ok]) => ok);
}

export const homeModuleInfo = Object.freeze({ phase: 5, strategy: "static-esm-modules-plus-compat-runtime", cspSafe: true, fastBoot: true, modules: MODULES.map(([name]) => name) });
