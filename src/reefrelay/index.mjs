// Stable ReefRelay API surface.
//
// Public callers should import from `reefnexus` or `reefnexus/reefrelay` instead of
// reaching into scripts/*.mjs. The scripts remain CLI-compatible wrappers and
// deterministic implementation modules for now.

export { route as routeRequest } from '../../scripts/reefrelay-auto-router.mjs';

export {
  parseLiteCommand,
  compileLiteRun,
} from '../../scripts/reefrelay-lite-stub.mjs';

export {
  dispatchLiteRun,
  runLiteCommand,
} from '../../scripts/reefrelay-lite-runtime.mjs';

export {
  parseFullCommand,
  fullCommandRouting,
  compileFullCommand,
  runFullCommandPipeline,
} from '../../scripts/reefrelay-full-command.mjs';

export { generateFullBrief } from '../../scripts/reefrelay-full-run-generator.mjs';
export { compile as compileFullRun } from '../../scripts/reefrelay-taskflow-stub.mjs';
export { dispatchFullRun } from '../../scripts/reefrelay-full-dispatcher.mjs';

export {
  reviewFindings,
  enforceGates,
  createFinalSynthesis,
  finalizeFullRun,
} from '../../scripts/reefrelay-full-finalizer.mjs';

export { runFullPipeline } from '../../scripts/reefrelay-full-pipeline.mjs';

export {
  dispatchLiveRun,
  loadLiveAdapter,
} from '../../scripts/reefrelay-live-dispatcher.mjs';

export {
  collectRunMetrics,
  annotateRunMetrics,
} from '../../scripts/reefrelay-metrics.mjs';

export {
  generateFeedbackFromRun,
  generateFeedbackFromCoordinationCases,
  feedbackArtifact,
} from '../../scripts/reefrelay-feedback.mjs';
