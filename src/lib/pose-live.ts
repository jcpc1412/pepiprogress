import type { CanonicalPose } from '@/lib/photo-pose';

/**
 * Live pose detection during capture (W6-26.5) — the pure decision layer for
 * the hybrid approach:
 *
 *  - FACE session: the on-device face detector streams a yaw angle per frame;
 *    `nextFacePose` maps it to front_face / side_profile with hysteresis so the
 *    ghost overlay doesn't flap at the boundary angle.
 *  - BODY session: no on-device body-pose model (the vision-camera v5 ecosystem
 *    has no compatible one yet), so the camera silently samples a low-res frame
 *    every few seconds through the cheap classify_pose vision call. This module
 *    owns the sampling schedule (throttle, cap, stop-when-stable) and the
 *    stability rule (two consecutive agreeing reads), keeping the network layer
 *    dumb and the logic deterministic + testable.
 *
 * Offline / AI-unconfigured: the samplers simply never stabilize and the UI
 * keeps its manual chips + last ghost — the layer is a pure enhancement.
 */

// ── Face: yaw → pose with hysteresis ─────────────────────────────────────────

/** Yaw magnitude (deg) at which a front face becomes a side profile… */
export const SIDE_ENTER_DEG = 30;
/** …and back below this to return to front. The gap prevents flapping. */
export const SIDE_EXIT_DEG = 20;

export type FacePose = 'front_face' | 'side_profile';

/** Next face pose given the previous one and the current yaw angle (deg). */
export function nextFacePose(prev: FacePose, yawDeg: number): FacePose {
  const a = Math.abs(yawDeg);
  if (prev === 'front_face') return a >= SIDE_ENTER_DEG ? 'side_profile' : 'front_face';
  return a <= SIDE_EXIT_DEG ? 'front_face' : 'side_profile';
}

// ── Body: sampled classification schedule + stability ────────────────────────

/** Min gap between samples: keeps the session under ~a dozen cheap calls. */
export const SAMPLE_INTERVAL_MS = 2500;
/** Hard cap per camera session — cost ceiling even if never stable. */
export const MAX_SAMPLES = 10;
/** Classifier reads below this confidence don't count toward stability. */
export const MIN_SAMPLE_CONFIDENCE = 0.5;

export type SampleState = {
  samples: number;
  lastAt: number; // epoch ms of the last sample taken (0 = never)
  /** Last confident pose seen, awaiting confirmation. */
  candidate?: CanonicalPose;
  /** Set once two consecutive confident reads agree; sampling then stops. */
  stable?: CanonicalPose;
};

export function initialSampleState(): SampleState {
  return { samples: 0, lastAt: 0 };
}

/** Whether the capture screen should take a sampling frame now. */
export function shouldSample(s: SampleState, nowMs: number): boolean {
  if (s.stable) return false;
  if (s.samples >= MAX_SAMPLES) return false;
  return nowMs - s.lastAt >= SAMPLE_INTERVAL_MS;
}

/**
 * Fold a classifier read into the state. Stability = two consecutive confident
 * reads of the same pose; a low-confidence read resets the candidate (the scene
 * is ambiguous, don't lock onto it).
 */
export function recordSample(
  s: SampleState,
  pose: CanonicalPose,
  confidence: number,
  nowMs: number,
): SampleState {
  const next: SampleState = { ...s, samples: s.samples + 1, lastAt: nowMs };
  if (confidence < MIN_SAMPLE_CONFIDENCE) {
    next.candidate = undefined;
    return next;
  }
  if (s.candidate === pose) {
    next.stable = pose;
  } else {
    next.candidate = pose;
  }
  return next;
}
