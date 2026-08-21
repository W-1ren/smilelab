"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CAMERA_CONFIG,
  DEFAULT_TUNING,
  FACE_TRACKING_CONFIG,
  PERFORMANCE_BUDGET,
  PREVIEW_CONFIG,
  TUNING_STORAGE_KEY,
  type EffectTuning,
} from "./config/effects";
import { TuningPanel } from "./components/TuningPanel";
import { EffectsEngine, type EffectStats } from "./lib/effects-engine";
import { MultiFaceExpressionGate, type ExpressionMode } from "./lib/expression";
import { FaceTracker } from "./lib/face-tracker";

type CameraStatus = "idle" | "requesting" | "ready" | "denied" | "unavailable";
type ModelStatus = "idle" | "loading" | "ready" | "error";

type ExpressionView = {
  mode: ExpressionMode;
  fireworkTriggered: boolean;
  faceCount: number;
  smilingFaces: number;
  laughingFaces: number;
};

const EMPTY_EXPRESSION: ExpressionView = {
  mode: "idle",
  fireworkTriggered: false,
  faceCount: 0,
  smilingFaces: 0,
  laughingFaces: 0,
};

function loadTuning() {
  if (typeof window === "undefined") return DEFAULT_TUNING;
  try {
    const stored = window.localStorage.getItem(TUNING_STORAGE_KEY);
    if (!stored) return DEFAULT_TUNING;
    const parsed = JSON.parse(stored) as Partial<EffectTuning>;
    const tuning = { ...DEFAULT_TUNING };
    for (const key of Object.keys(tuning) as Array<keyof EffectTuning>) {
      const value = parsed[key];
      if (typeof value === "number" && Number.isFinite(value)) {
        tuning[key] = value;
      }
    }
    return tuning;
  } catch {
    return DEFAULT_TUNING;
  }
}

function isCompactDevice() {
  return typeof window !== "undefined" && (
    window.matchMedia(`(max-width: ${PERFORMANCE_BUDGET.compactBreakpoint}px)`).matches ||
    (navigator.hardwareConcurrency ?? 8) <= PERFORMANCE_BUDGET.lowCoreThreshold
  );
}

function cameraMessage(status: CameraStatus, modelStatus: ModelStatus, faceCount: number) {
  if (status === "requesting") return "正在连接摄像头";
  if (status === "denied") return "摄像头权限被拒绝";
  if (status === "unavailable") return "当前设备无法打开摄像头";
  if (status === "ready" && modelStatus === "loading") return "正在加载表情模型";
  if (status === "ready" && modelStatus === "error") return "模型加载失败，可使用手动演示";
  if (status === "ready" && modelStatus === "ready") {
    return faceCount ? `实时识别中 · ${faceCount} 张脸` : "实时识别中 · 寻找人脸";
  }
  return "等待开始";
}

function expressionCopy(expression: ExpressionView) {
  switch (expression.mode) {
    case "laugh":
      return {
        label: expression.laughingFaces > 1 ? `${expression.laughingFaces} 人大笑！` : "大笑！",
        hint: expression.fireworkTriggered
          ? "三重烟花已触发"
          : "检测到大笑 · 当前烟花播放中",
        className: "laugh",
      };
    case "smile":
      return {
        label: expression.smilingFaces > 1 ? `${expression.smilingFaces} 人微笑中` : "微笑中",
        hint: `${expression.faceCount} 张脸已识别 · 保持笑容让雨继续`,
        className: "smile",
      };
    case "neutral":
      return {
        label: `已捕捉 ${expression.faceCount} 张脸`,
        hint: "任何人都可以微笑或张嘴大笑",
        className: "neutral",
      };
    default:
      return {
        label: "正在寻找人脸",
        hint: `请进入镜头，最多支持 ${FACE_TRACKING_CONFIG.maxFaces} 人`,
        className: "idle",
      };
  }
}

export function SmileExperience() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const rainGlassCanvasRef = useRef<HTMLCanvasElement>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<EffectsEngine | null>(null);
  const trackerRef = useRef<FaceTracker | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectionFrameRef = useRef(0);
  const rainPreviewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rainPreviewUntilRef = useRef(0);
  const inferenceStartedAtRef = useRef(0);
  const inferenceMsRef = useRef(0);
  const lastUiUpdateAtRef = useRef(0);
  const gateRef = useRef(new MultiFaceExpressionGate());
  const [cameraStatus, setCameraStatus] = useState<CameraStatus>("idle");
  const [modelStatus, setModelStatus] = useState<ModelStatus>("idle");
  const [expression, setExpression] = useState<ExpressionView>(EMPTY_EXPRESSION);
  const [tuning, setTuning] = useState<EffectTuning>(loadTuning);
  const initialTuningRef = useRef(tuning);
  const [tuningOpen, setTuningOpen] = useState(false);
  const [stats, setStats] = useState<EffectStats & { inferenceMs: number }>({ fps: 0, particles: 0, inferenceMs: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    const rainGlassCanvas = rainGlassCanvasRef.current;
    const maskCanvas = maskCanvasRef.current;
    if (!canvas || !rainGlassCanvas || !maskCanvas) return;
    const engine = new EffectsEngine(
      canvas,
      maskCanvas,
      rainGlassCanvas,
      initialTuningRef.current,
    );
    engine.attachVideo(videoRef.current);
    engine.start((nextStats) => {
      setStats({ ...nextStats, inferenceMs: Math.round(inferenceMsRef.current) });
    });
    engineRef.current = engine;

    const resize = () => engine.resize();
    window.addEventListener("resize", resize, { passive: true });
    return () => {
      window.removeEventListener("resize", resize);
      engine.stop();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    engineRef.current?.setTuning(tuning);
    const timer = window.setTimeout(() => {
      try {
        window.localStorage.setItem(TUNING_STORAGE_KEY, JSON.stringify(tuning));
      } catch {
        // Local preferences are optional.
      }
    }, 150);
    return () => window.clearTimeout(timer);
  }, [tuning]);

  const stopCamera = useCallback(() => {
    cancelAnimationFrame(detectionFrameRef.current);
    trackerRef.current?.close();
    trackerRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    gateRef.current.reset();
    if (rainPreviewTimerRef.current) clearTimeout(rainPreviewTimerRef.current);
    rainPreviewTimerRef.current = null;
    rainPreviewUntilRef.current = 0;
    engineRef.current?.setRaining(false);
    engineRef.current?.clearHeads();
    lastUiUpdateAtRef.current = 0;
    setCameraStatus("idle");
    setModelStatus("idle");
    setExpression(EMPTY_EXPRESSION);
  }, []);

  useEffect(() => stopCamera, [stopCamera]);

  const runDetectionLoop = useCallback(() => {
    let lastInferenceAt = 0;
    const compactDevice = isCompactDevice();
    const inferenceFps = compactDevice
      ? PERFORMANCE_BUDGET.mobileInferenceFps
      : PERFORMANCE_BUDGET.inferenceFps;
    const minInferenceFps = compactDevice
      ? PERFORMANCE_BUDGET.mobileMinInferenceFps
      : PERFORMANCE_BUDGET.minInferenceFps;

    const detect = (now: number) => {
      detectionFrameRef.current = requestAnimationFrame(detect);
      const interval = Math.max(
        1000 / inferenceFps,
        Math.min(
          1000 / minInferenceFps,
          inferenceMsRef.current * PERFORMANCE_BUDGET.inferenceCostMultiplier,
        ),
      );
      if (document.hidden || now - lastInferenceAt < interval) return;
      const video = videoRef.current;
      const tracker = trackerRef.current;
      if (!video || !tracker || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
      lastInferenceAt = now;
      inferenceStartedAtRef.current = performance.now();

      try {
        const frame = tracker.detect(video, now);
        const result = gateRef.current.update(
          frame.faces.map((face) => ({
            id: face.id,
            smile: face.smile,
            jawOpen: face.jawOpen,
            faceVisible: true,
          })),
          now,
        );
        const elapsed = performance.now() - inferenceStartedAtRef.current;
        inferenceMsRef.current = inferenceMsRef.current
          ? inferenceMsRef.current * 0.82 + elapsed * 0.18
          : elapsed;

        engineRef.current?.setHeadsFromLandmarks(
          frame.faces.map((face) => ({ id: face.id, landmarks: face.landmarks })),
          video.videoWidth,
          video.videoHeight,
          now,
        );
        engineRef.current?.setRaining(result.raining || now < rainPreviewUntilRef.current);
        const fireworkTriggered = result.laughFaceIds.length > 0
          ? engineRef.current?.burstForFaces(result.laughFaceIds) ?? false
          : false;
        if (
          result.laughFaceIds.length ||
          now - lastUiUpdateAtRef.current >= PERFORMANCE_BUDGET.uiExpressionIntervalMs
        ) {
          lastUiUpdateAtRef.current = now;
          setExpression({
            mode: result.mode,
            fireworkTriggered,
            faceCount: result.faceCount,
            smilingFaces: result.smilingFaces,
            laughingFaces: result.laughFaceIds.length,
          });
        }
      } catch {
        setModelStatus("error");
        cancelAnimationFrame(detectionFrameRef.current);
      }
    };

    detectionFrameRef.current = requestAnimationFrame(detect);
  }, []);

  const startCamera = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraStatus("unavailable");
      return;
    }

    setCameraStatus("requesting");
    setModelStatus("loading");
    try {
      const compactDevice = isCompactDevice();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: CAMERA_CONFIG.facingMode,
          width: {
            ideal: compactDevice ? CAMERA_CONFIG.mobileIdealWidth : CAMERA_CONFIG.idealWidth,
            max: compactDevice ? CAMERA_CONFIG.mobileMaxWidth : CAMERA_CONFIG.maxWidth,
          },
          height: {
            ideal: compactDevice ? CAMERA_CONFIG.mobileIdealHeight : CAMERA_CONFIG.idealHeight,
            max: compactDevice ? CAMERA_CONFIG.mobileMaxHeight : CAMERA_CONFIG.maxHeight,
          },
          frameRate: {
            ideal: compactDevice ? CAMERA_CONFIG.mobileIdealFps : CAMERA_CONFIG.idealFps,
            max: compactDevice ? CAMERA_CONFIG.mobileMaxFps : CAMERA_CONFIG.maxFps,
          },
        },
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) throw new Error("Video surface unavailable");
      video.srcObject = stream;
      await video.play();
      setCameraStatus("ready");

      const tracker = new FaceTracker();
      trackerRef.current = tracker;
      const modelUrl = new URL("./models/face_landmarker.task", document.baseURI).href;
      await tracker.load(modelUrl);
      setModelStatus("ready");
      runDetectionLoop();
    } catch (error) {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setModelStatus("error");
      if (error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "SecurityError")) {
        setCameraStatus("denied");
      } else {
        setCameraStatus("unavailable");
      }
    }
  }, [runDetectionLoop]);

  const previewRain = useCallback(() => {
    if (rainPreviewTimerRef.current) clearTimeout(rainPreviewTimerRef.current);
    rainPreviewUntilRef.current = performance.now() + PREVIEW_CONFIG.rainDurationMs;
    engineRef.current?.setRaining(true);
    setExpression((current) => ({
      ...current,
      mode: "smile",
      fireworkTriggered: false,
      smilingFaces: Math.max(current.smilingFaces, 1),
    }));
    rainPreviewTimerRef.current = setTimeout(() => {
      rainPreviewUntilRef.current = 0;
      rainPreviewTimerRef.current = null;
      engineRef.current?.setRaining(false);
      if (cameraStatus !== "ready") {
        setExpression(EMPTY_EXPRESSION);
      }
    }, PREVIEW_CONFIG.rainDurationMs);
  }, [cameraStatus]);

  const previewFirework = useCallback(() => {
    if (!engineRef.current?.burst()) return;
    setExpression((current) => ({
      ...current,
      mode: "laugh",
      fireworkTriggered: true,
      laughingFaces: 1,
    }));
    window.setTimeout(() => {
      if (cameraStatus !== "ready") setExpression(EMPTY_EXPRESSION);
    }, PREVIEW_CONFIG.laughBadgeDurationMs);
  }, [cameraStatus]);

  const copy = expressionCopy(expression);
  const activeCamera = cameraStatus === "ready";

  return (
    <main className="experience">
      <video ref={videoRef} className={`camera-feed ${activeCamera ? "is-visible" : ""}`} muted playsInline aria-label="前置摄像头实时画面" />
      <canvas ref={rainGlassCanvasRef} className="rain-glass-canvas" aria-hidden="true" />
      <canvas ref={maskCanvasRef} className="background-mask-canvas" aria-hidden="true" />
      <div className="ambient-backdrop" aria-hidden="true">
        <div className="ambient-orb ambient-orb-one" />
        <div className="ambient-orb ambient-orb-two" />
        <div className="face-guide" />
      </div>
      <canvas ref={canvasRef} className="effects-canvas" aria-hidden="true" />
      <div className="scene-vignette" aria-hidden="true" />

      <header className="topbar">
        <a className="brand" href="#experience" aria-label="Smile Interaction 首页">
          <span className="brand-mark">S</span>
          <span>SMILE / LAB</span>
        </a>
        <div className="topbar-actions">
          <div className={`system-status status-${cameraStatus}`} role="status">
            <span className="status-dot" />
            {cameraMessage(cameraStatus, modelStatus, expression.faceCount)}
          </div>
          <button className="settings-button" type="button" onClick={() => setTuningOpen(true)}>
            <span aria-hidden="true">⌁</span>
            效果样式
          </button>
        </div>
      </header>

      <section id="experience" className="interaction-stage" aria-live="polite">
        {!activeCamera && (
          <div className="welcome-card">
            <p className="eyebrow"><span /> BROWSER AR EXPERIENCE</p>
            <h1 className="brand-headline">Smile Lab</h1>
            <div className="welcome-actions">
              <button className="primary-button" type="button" onClick={startCamera} disabled={cameraStatus === "requesting"}>
                <span className="camera-symbol" aria-hidden="true">●</span>
                {cameraStatus === "requesting" ? "正在连接…" : "打开摄像头"}
              </button>
              <button className="text-button" type="button" onClick={previewFirework}>先看效果 <span>↗</span></button>
            </div>
            {(cameraStatus === "denied" || cameraStatus === "unavailable") && (
              <p className="error-message">请确认浏览器摄像头权限，并通过 HTTPS 或 localhost 打开。你也可以先使用下方手动演示。</p>
            )}
            <p className="privacy-note"><span>✓</span> 视频不会上传或保存</p>
          </div>
        )}

      </section>

      <div className="performance-meter" aria-label="性能状态">
        <span>{stats.fps || "—"} FPS</span>
        <span>{stats.inferenceMs || "—"} ms AI</span>
        <span>{stats.particles} 粒子</span>
        <span>{expression.faceCount} 人脸</span>
      </div>

      <section className="control-dock" aria-label="互动控制">
        <div className="gesture-help">
          <span className="help-number">01</span>
          <div><strong>轻轻微笑</strong><small>持续触发降雨</small></div>
        </div>
        <button className="demo-control demo-smile" type="button" onClick={previewRain}>
          <span aria-hidden="true">☂</span>
          模拟微笑
        </button>
        <div className="gesture-help">
          <span className="help-number">02</span>
          <div><strong>张嘴大笑</strong><small>爆发烟花并碰撞头部</small></div>
        </div>
        <button className="demo-control demo-laugh" type="button" onClick={previewFirework}>
          <span aria-hidden="true">✦</span>
          模拟大笑
        </button>
        {activeCamera && (
          <button className="stop-camera" type="button" onClick={stopCamera} aria-label="关闭摄像头">关闭镜头</button>
        )}
      </section>

      <button className="mobile-tuning-button" type="button" onClick={() => setTuningOpen(true)}>⌁ 样式</button>
      {tuningOpen && <button className="panel-scrim" type="button" onClick={() => setTuningOpen(false)} aria-label="关闭调参面板" />}
      {tuningOpen && (
        <TuningPanel
          open
          tuning={tuning}
          onChange={setTuning}
          onClose={() => setTuningOpen(false)}
          onReset={() => setTuning(DEFAULT_TUNING)}
          onPreviewRain={previewRain}
          onPreviewFirework={previewFirework}
        />
      )}
    </main>
  );
}
