import {
  EXPRESSION_SMOOTHING_CONFIG,
  EXPRESSION_THRESHOLDS,
  FACE_TRACKING_CONFIG,
} from "../config/effects";

export type ExpressionMode = "idle" | "neutral" | "smile" | "laugh";

export type ExpressionSample = {
  smile: number;
  jawOpen: number;
  faceVisible: boolean;
};

export type TrackedExpressionSample = ExpressionSample & {
  id: number;
};

export type FaceExpressionResult = {
  id: number;
  mode: ExpressionMode;
  smile: number;
  jawOpen: number;
  raining: boolean;
  laughTriggered: boolean;
};

export type MultiFaceExpressionResult = {
  mode: ExpressionMode;
  raining: boolean;
  faceCount: number;
  smilingFaces: number;
  laughFaceIds: number[];
};

export class ExpressionGate {
  private smoothSmile = 0;
  private smoothJaw = 0;
  private mode: ExpressionMode = "idle";
  private lastFaceAt = 0;
  private lastLaughAt = -Infinity;

  update(sample: ExpressionSample, now: number) {
    const smoothing = sample.faceVisible
      ? EXPRESSION_SMOOTHING_CONFIG.visibleFactor
      : EXPRESSION_SMOOTHING_CONFIG.missingFactor;
    this.smoothSmile += (sample.smile - this.smoothSmile) * smoothing;
    this.smoothJaw += (sample.jawOpen - this.smoothJaw) * smoothing;

    if (sample.faceVisible) this.lastFaceAt = now;
    const faceVisible = now - this.lastFaceAt < EXPRESSION_THRESHOLDS.missingFaceGraceMs;

    if (!faceVisible) {
      this.mode = "idle";
      return this.snapshot(false, false);
    }

    const laughReady =
      this.smoothSmile >= EXPRESSION_THRESHOLDS.laughSmile &&
      this.smoothJaw >= EXPRESSION_THRESHOLDS.laughJawOpen &&
      now - this.lastLaughAt >= EXPRESSION_THRESHOLDS.laughCooldownMs;

    if (laughReady) {
      this.lastLaughAt = now;
      this.mode = "laugh";
      return this.snapshot(true, true);
    }

    const wasSmiling = this.mode === "smile" || this.mode === "laugh";
    const smileThreshold = wasSmiling
      ? EXPRESSION_THRESHOLDS.smileOff
      : EXPRESSION_THRESHOLDS.smileOn;
    const raining = this.smoothSmile >= smileThreshold;
    this.mode = raining ? "smile" : "neutral";

    return this.snapshot(raining, false);
  }

  reset() {
    this.smoothSmile = 0;
    this.smoothJaw = 0;
    this.mode = "idle";
    this.lastFaceAt = 0;
    this.lastLaughAt = -Infinity;
  }

  private snapshot(raining: boolean, laughTriggered: boolean) {
    return {
      mode: this.mode,
      smile: this.smoothSmile,
      jawOpen: this.smoothJaw,
      raining,
      laughTriggered,
    };
  }
}

/**
 * 每张脸持有独立 ExpressionGate，因此不同人物不会共享平滑值或大笑冷却。
 * 面向界面的 mode 是所有人状态的汇总，物理效果仍使用 faces/laughFaceIds 精确定位。
 */
export class MultiFaceExpressionGate {
  private gates = new Map<number, { gate: ExpressionGate; lastSeenAt: number }>();

  update(samples: TrackedExpressionSample[], now: number): MultiFaceExpressionResult {
    const visibleIds = new Set(samples.map((sample) => sample.id));
    const visibleResults: FaceExpressionResult[] = [];
    const graceResults: FaceExpressionResult[] = [];

    for (const sample of samples) {
      let entry = this.gates.get(sample.id);
      if (!entry) {
        entry = { gate: new ExpressionGate(), lastSeenAt: now };
        this.gates.set(sample.id, entry);
      }
      entry.lastSeenAt = now;
      visibleResults.push({ id: sample.id, ...entry.gate.update(sample, now) });
    }

    for (const [id, entry] of this.gates) {
      if (visibleIds.has(id)) continue;
      const result = entry.gate.update(
        { smile: 0, jawOpen: 0, faceVisible: false },
        now,
      );
      graceResults.push({ id, ...result });
      if (now - entry.lastSeenAt > FACE_TRACKING_CONFIG.idRetentionMs) {
        this.gates.delete(id);
      }
    }

    const allResults = [...visibleResults, ...graceResults];
    const laughFaceIds = visibleResults
      .filter((result) => result.laughTriggered)
      .map((result) => result.id);
    const raining = allResults.some((result) => result.raining);
    const smilingFaces = visibleResults.filter((result) => result.raining).length;
    const mode: ExpressionMode = laughFaceIds.length
      ? "laugh"
      : raining
        ? "smile"
        : samples.length
          ? "neutral"
          : "idle";

    return {
      mode,
      raining,
      faceCount: samples.length,
      smilingFaces,
      laughFaceIds,
    };
  }

  reset() {
    for (const { gate } of this.gates.values()) gate.reset();
    this.gates.clear();
  }
}
