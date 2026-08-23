import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import { RainGlassEngine } from "./rain-glass-engine";
import {
  BACKGROUND_MASK_CONFIG,
  FINE_RENDER_CONFIG,
  FIREWORK_PHYSICS_CONFIG,
  FOREGROUND_PEOPLE_CONFIG,
  HEAD_COLLISION_CONFIG,
  PERFORMANCE_BUDGET,
  RAIN_PHYSICS_CONFIG,
  RAIN_STYLE,
  SIMULATOR_FIREWORK_CONFIG,
  SPLENDID_RENDER_CONFIG,
  SPLENDID_SEQUENCE_CONFIG,
  TRIPLE_FIREWORK_CONFIG,
  TRIPLE_FIREWORK_LAYERS,
  type EffectTuning,
  type FireworkLayerDefinition,
  type TripleFireworkKind,
} from "../config/effects";

type RainDrop = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  length: number;
  opacity: number;
  /** 出生时固定的横向尺寸倍率，避免逐帧随机造成轮廓闪烁。 */
  widthScale: number;
};

type RainPathTarget = {
  moveTo: (x: number, y: number) => void;
  quadraticCurveTo: (cpx: number, cpy: number, x: number, y: number) => void;
  closePath: () => void;
};

type Spark = {
  x: number;
  y: number;
  previousX: number;
  previousY: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  radius: number;
  color: string;
  glowColor: string;
  gravityScale: number;
  trailScale: number;
  kind: TripleFireworkKind;
  coreColor: string;
  headScale: number;
  haloScale: number;
  dottedTrail: boolean;
  historyX: Float32Array | null;
  historyY: Float32Array | null;
  historyCursor: number;
  historyCount: number;
  historySampleMs: number;
  historyElapsedMs: number;
  twinklePhase: number;
  /** 是否把这一颗物理粒子绘制成带左右子轨迹的复合光束。 */
  compoundTrail: boolean;
  /** 固定的轨迹变化种子，避免逐帧随机导致画面抖动。 */
  compoundTrailSeed: number;
  /** 创建时按 headCollisionScatterChance 掷骰决定的“是否参与头部碰撞”：true 碰到头就反弹散开，false 永远直接穿过。 */
  scatterOnHead: boolean;
  /** 主爆炸的展开保护时间结束后变为 true。 */
  collisionArmed: boolean;
  /** 允许解锁碰撞检测的最早粒子年龄，单位秒。 */
  collisionArmAtAge: number;
  canTriggerImpactFlash: boolean;
  impactFlashHandled: boolean;
  /** 大于 0 时表示粒子已撞头，正在等待上升结束后二次闪爆。 */
  impactFlightDuration: number;
  impactFlightElapsed: number;
  /** 上飞阶段横向摆动的随机相位。 */
  impactFlightWobblePhase: number;
  /** 上飞阶段横向摆动的随机频率。 */
  impactFlightWobbleFreq: number;
  /** 仿真烟花的闪烁壳型会间歇隐藏主星，其他样式恒为 false。 */
  simulatorStrobe: boolean;
};

type SimulatorShellVariant = "chrysanthemum" | "ring" | "palm" | "strobe";

type FireworkTarget = {
  x: number;
  y: number;
};

type Rocket = {
  x: number;
  y: number;
  previousX: number;
  previousY: number;
  targetX: number;
  targetY: number;
  speed: number;
  launchDelayMs: number;
  color: string;
  glowColor: string;
  coreColor: string;
  kind: TripleFireworkKind;
  particleAmount: number;
  explosionScale: number;
  /** 仅仿真烟花使用；其他烟花为 null。 */
  simulatorVariant: SimulatorShellVariant | null;
  /** 圆环/分支的整体旋转角与压扁比例。 */
  simulatorRotation: number;
  simulatorSquash: number;
};

type ImpactFlashParticle = {
  /** 粒子速度，单位像素/秒。 */
  vx: number;
  vy: number;
  /** 粒子半径，用于丝束线宽与头部亮点。 */
  radius: number;
  /** 闪烁相位偏移。 */
  twinklePhase: number;
};

type ImpactFlash = {
  x: number;
  y: number;
  age: number;
  life: number;
  color: string;
  glowColor: string;
  coreColor: string;
  /** 从碰撞点四散飞出的发光粒子。 */
  particles: ImpactFlashParticle[];
};

type BurstBloom = {
  x: number;
  y: number;
  age: number;
  life: number;
  radius: number;
  color: string;
  coreColor: string;
};

type ScreenDroplet = {
  x: number;
  y: number;
  radius: number;
  age: number;
  life: number;
  vx: number;
  vy: number;
  opacity: number;
  /** 玻璃水珠向下拖出的短痕长度。 */
  trailLength: number;
  /** 水珠的轻微横向压扁比例。 */
  flatten: number;
};

type HeadCollider = {
  id: number;
  x: number;
  y: number;
  radiusX: number;
  radiusY: number;
  lastSeenAt: number;
};

export type TrackedHeadLandmarks = {
  id: number;
  landmarks: NormalizedLandmark[];
};

export type EffectStats = {
  fps: number;
  particles: number;
};

const TWO_PI = Math.PI * 2;

function randomBetween(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/** 原地压缩高频粒子数组，避免每个动画帧由 Array.filter 产生新数组。 */
function retainInPlace<T>(items: T[], keep: (item: T) => boolean) {
  let writeIndex = 0;
  for (let readIndex = 0; readIndex < items.length; readIndex += 1) {
    const item = items[readIndex];
    if (!keep(item)) continue;
    items[writeIndex] = item;
    writeIndex += 1;
  }
  items.length = writeIndex;
}

export class EffectsEngine {
  private readonly context: CanvasRenderingContext2D;
  private readonly maskContext: CanvasRenderingContext2D | null;
  /** 实时摄像头画面；用于把人物主体抠出并绘制在烟花之上，实现烟花在人物背后绽放。 */
  private videoSource: HTMLVideoElement | null = null;
  /** 离屏 canvas：每帧生成“人物主体 + 视频画面”的遮挡层。 */
  private foregroundCanvas: HTMLCanvasElement | null = null;
  private foregroundContext: CanvasRenderingContext2D | null = null;
  /** 人物柔边遮罩仅在人脸位置变化时重建，避免烟花期间每帧创建渐变。 */
  private foregroundMaskCanvas: HTMLCanvasElement | null = null;
  private foregroundMaskContext: CanvasRenderingContext2D | null = null;
  private foregroundMaskDirty = true;
  private lastForegroundUpdateAt = 0;
  private lastForegroundVideoTime = -1;
  private rain: RainDrop[] = [];
  private sparks: Spark[] = [];
  private rockets: Rocket[] = [];
  private impactFlashes: ImpactFlash[] = [];
  private burstBlooms: BurstBloom[] = [];
  private screenDroplets: ScreenDroplet[] = [];
  private heads = new Map<number, HeadCollider>();
  private frameId = 0;
  private lastFrame = 0;
  private rainAccumulator = 0;
  private screenDropletSpawnTimer = 1.2;
  private raining = false;
  private tuning: EffectTuning;
  private width = 1;
  private height = 1;
  private frameCount = 0;
  private statsStartedAt = performance.now();
  private statsCallback: ((stats: EffectStats) => void) | null = null;
  private maxParticles: number = PERFORMANCE_BUDGET.maxParticlesDesktop;
  private maxRainDrops: number = PERFORMANCE_BUDGET.maxRainDesktop;
  private reservedSparkCount = 0;
  private readonly compactDevice: boolean;
  private reducedMotion = false;
  private maskDirty = true;
  private readonly rainGlass: RainGlassEngine;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly maskCanvas: HTMLCanvasElement,
    glassCanvas: HTMLCanvasElement,
    tuning: EffectTuning,
  ) {
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) throw new Error("Canvas 2D is not available");
    this.context = context;
    this.maskContext = maskCanvas.getContext("2d", { alpha: true });
    this.tuning = tuning;

    this.compactDevice =
      window.matchMedia(`(max-width: ${PERFORMANCE_BUDGET.compactBreakpoint}px)`).matches ||
      (navigator.hardwareConcurrency ?? 8) <= PERFORMANCE_BUDGET.lowCoreThreshold;
    this.rainGlass = new RainGlassEngine(glassCanvas, this.compactDevice);
    this.maxParticles = this.compactDevice
      ? PERFORMANCE_BUDGET.maxParticlesMobile
      : PERFORMANCE_BUDGET.maxParticlesDesktop;
    this.maxRainDrops = this.compactDevice
      ? PERFORMANCE_BUDGET.maxRainMobile
      : PERFORMANCE_BUDGET.maxRainDesktop;
    this.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (this.reducedMotion) {
      this.maxParticles = Math.max(
        PERFORMANCE_BUDGET.reducedMotionMinimumParticles,
        Math.round(
          this.maxParticles * PERFORMANCE_BUDGET.reducedMotionParticleScale,
        ),
      );
      this.maxRainDrops = Math.min(
        this.maxRainDrops,
        Math.max(32, this.maxParticles - 150),
      );
    }
  }

  /** 绑定实时摄像头画面，用于人物遮挡层（烟花在人物背后绽放）。传 null 可解除。 */
  attachVideo(video: HTMLVideoElement | null) {
    this.videoSource = video;
    this.lastForegroundVideoTime = -1;
    this.rainGlass.attachVideo(video);
    this.applyGlassBlur(false);
  }

  start(onStats: (stats: EffectStats) => void) {
    this.statsCallback = onStats;
    this.resize();
    this.lastFrame = performance.now();
    this.frameId = requestAnimationFrame(this.tick);
  }

  stop() {
    cancelAnimationFrame(this.frameId);
    this.rain.length = 0;
    this.sparks.length = 0;
    this.rockets.length = 0;
    this.impactFlashes.length = 0;
    this.burstBlooms.length = 0;
    this.reservedSparkCount = 0;
    this.screenDroplets.length = 0;
    this.screenDropletSpawnTimer = 1.2;
    this.applyGlassBlur(false);
    this.rainGlass.destroy();
    this.heads.clear();
    this.context.clearRect(0, 0, this.width, this.height);
    this.maskContext?.clearRect(0, 0, this.width, this.height);
    this.foregroundContext?.clearRect(0, 0, this.width, this.height);
    this.foregroundMaskContext?.clearRect(0, 0, this.width, this.height);
  }

  resize() {
    const bounds = this.canvas.getBoundingClientRect();
    const dprCap = this.compactDevice
      ? PERFORMANCE_BUDGET.mobileDevicePixelRatioCap
      : PERFORMANCE_BUDGET.devicePixelRatioCap;
    const dpr = Math.min(
      window.devicePixelRatio || 1,
      dprCap,
    );
    this.width = Math.max(1, bounds.width);
    this.height = Math.max(1, bounds.height);
    this.resizeCanvas(this.canvas, this.context, dpr);
    if (this.maskContext) this.resizeCanvas(this.maskCanvas, this.maskContext, dpr);
    if (!this.foregroundCanvas) {
      this.foregroundCanvas = document.createElement("canvas");
      this.foregroundContext = this.foregroundCanvas.getContext("2d", {
        alpha: true,
      });
      this.foregroundMaskCanvas = document.createElement("canvas");
      this.foregroundMaskContext = this.foregroundMaskCanvas.getContext("2d", {
        alpha: true,
      });
    }
    if (this.foregroundCanvas && this.foregroundContext) {
      const foregroundDpr = this.compactDevice
        ? PERFORMANCE_BUDGET.foregroundResolutionScaleMobile
        : Math.min(PERFORMANCE_BUDGET.foregroundResolutionScaleDesktop, dpr);
      this.resizeCanvas(this.foregroundCanvas, this.foregroundContext, foregroundDpr);
      if (this.foregroundMaskCanvas && this.foregroundMaskContext) {
        this.resizeCanvas(
          this.foregroundMaskCanvas,
          this.foregroundMaskContext,
          foregroundDpr,
        );
      }
    }
    this.rainGlass.resize(this.width, this.height);
    this.maskDirty = true;
    this.foregroundMaskDirty = true;
  }

  setTuning(tuning: EffectTuning) {
    this.tuning = tuning;
  }

  setRaining(raining: boolean) {
    if (this.raining === raining) return;
    this.raining = raining;
    this.rainGlass.setEnabled(raining);
    this.applyGlassBlur(raining);
  }

  private applyGlassBlur(enabled: boolean) {
    this.videoSource?.style.setProperty(
      "--rain-glass-blur",
      enabled && !this.rainGlass.available
        ? `${RAIN_PHYSICS_CONFIG.glassBlurPx}px`
        : "0px",
    );
  }

  setHeadsFromLandmarks(
    faces: TrackedHeadLandmarks[],
    videoWidth: number,
    videoHeight: number,
    now: number,
  ) {
    if (!videoWidth || !videoHeight) {
      this.clearHeads();
      return;
    }

    const visibleIds = new Set<number>();
    for (const face of faces) {
      if (!face.landmarks.length) continue;
      visibleIds.add(face.id);
      const target = this.colliderFromLandmarks(
        face.id,
        face.landmarks,
        videoWidth,
        videoHeight,
        now,
      );
      const current = this.heads.get(face.id);
      if (!current) {
        this.heads.set(face.id, target);
        continue;
      }

      const lerp = HEAD_COLLISION_CONFIG.positionLerp;
      current.x += (target.x - current.x) * lerp;
      current.y += (target.y - current.y) * lerp;
      current.radiusX += (target.radiusX - current.radiusX) * lerp;
      current.radiusY += (target.radiusY - current.radiusY) * lerp;
      current.lastSeenAt = now;
    }

    for (const [id, head] of this.heads) {
      if (
        !visibleIds.has(id) &&
        now - head.lastSeenAt > HEAD_COLLISION_CONFIG.colliderGraceMs
      ) {
        this.heads.delete(id);
      }
    }
    this.maskDirty = true;
    this.foregroundMaskDirty = true;
  }

  clearHeads() {
    if (!this.heads.size) return;
    this.heads.clear();
    this.maskDirty = true;
    this.foregroundMaskDirty = true;
  }

  /** 手动演示或无指定人物时触发烟花。 */
  burst() {
    if (this.fireworksActive) return false;
    let available = Math.max(0, this.maxParticles - this.particleCount);
    // 移动端粒子池小，持续下雨会占满额度导致烟花被拒绝。
    // 烟花优先：预算不足时先移除部分雨滴让位，爆炸后再随额度恢复。
    if (available < this.minimumTripleFireworkBudget && this.rain.length > 0) {
      const deficit = this.minimumTripleFireworkBudget - available;
      this.rain.splice(0, Math.min(deficit, this.rain.length));
      available = Math.max(0, this.maxParticles - this.particleCount);
    }
    return this.queueTripleRockets(available);
  }

  /** 同一推理帧的多人笑声合并成一次场景级三重烟花，避免叠加 22/33 枚火箭。 */
  burstForFaces(faceIds: number[]) {
    if (!faceIds.length) return false;
    return this.burst();
  }

  /** 一组完整三重烟花的最低粒子预算：全部火箭 + 各层最小主粒子（移动端按倍率缩放）。 */
  private get minimumTripleFireworkBudget() {
    const launchOrder = TRIPLE_FIREWORK_CONFIG.launchOrder;
    const particleScale = this.compactDevice
      ? PERFORMANCE_BUDGET.mobileFireworkParticleScale
      : 1;
    let minimum = launchOrder.length;
    for (const kind of launchOrder) {
      const base = TRIPLE_FIREWORK_CONFIG.layers[kind].minParticles;
      minimum += this.compactDevice
        ? Math.max(6, Math.round(base * particleScale))
        : base;
    }
    return minimum;
  }

  private get fireworksActive() {
    return (
      this.rockets.length > 0 ||
      this.sparks.length > 0 ||
      this.impactFlashes.length > 0 ||
      this.burstBlooms.length > 0 ||
      this.reservedSparkCount > 0
    );
  }

  private get fireworkSequencePending() {
    return this.rockets.length > 0 || this.reservedSparkCount > 0;
  }

  private get particleCount() {
    return (
      this.rain.length +
      this.sparks.length +
      this.rockets.length +
      this.impactFlashes.length
    );
  }

  private readonly tick = (now: number) => {
    if (document.hidden) {
      this.lastFrame = now;
      this.frameId = requestAnimationFrame(this.tick);
      return;
    }
    const delta = Math.min(0.034, Math.max(0.001, (now - this.lastFrame) / 1000));
    this.lastFrame = now;
    this.update(delta);
    this.rainGlass.render(now, this.tuning.rainDensity, this.tuning.rainSpeed);
    this.draw(now);
    if (this.maskDirty) this.drawBackgroundMask();
    this.frameCount += 1;

    if (now - this.statsStartedAt >= PERFORMANCE_BUDGET.uiStatsIntervalMs) {
      const fps = Math.round((this.frameCount * 1000) / (now - this.statsStartedAt));
      this.statsCallback?.({ fps, particles: this.particleCount });
      this.frameCount = 0;
      this.statsStartedAt = now;
    }

    this.frameId = requestAnimationFrame(this.tick);
  };

  private update(delta: number) {
    if (
      this.raining &&
      !this.fireworkSequencePending &&
      this.rain.length < this.maxRainDrops &&
      this.particleCount + this.reservedSparkCount < this.maxParticles
    ) {
      const spawnRate = this.tuning.rainDensity * (this.reducedMotion ? 0.52 : 1);
      this.rainAccumulator += spawnRate * delta;
      while (
        this.rainAccumulator >= 1 &&
        this.rain.length < this.maxRainDrops &&
        this.particleCount + this.reservedSparkCount < this.maxParticles
      ) {
        this.spawnRainDrop();
        this.rainAccumulator -= 1;
      }
    } else {
      this.rainAccumulator = Math.min(1, this.rainAccumulator);
    }

    if (this.raining && !this.reducedMotion && !this.rainGlass.canRender) {
      this.screenDropletSpawnTimer -= delta;
      if (
        this.screenDropletSpawnTimer <= 0 &&
        this.screenDroplets.length < RAIN_PHYSICS_CONFIG.screenDropletsMax
      ) {
        this.spawnScreenDroplet();
        this.screenDropletSpawnTimer = randomBetween(
          RAIN_PHYSICS_CONFIG.screenDropletIntervalMin,
          RAIN_PHYSICS_CONFIG.screenDropletIntervalMax,
        );
      }
    } else {
      this.screenDropletSpawnTimer = Math.min(this.screenDropletSpawnTimer, 0.8);
    }

    retainInPlace(this.rain, (drop) => {
      drop.x += drop.vx * delta;
      drop.y += drop.vy * delta;
      // 透明雨滴直接离开画面：不碰撞头部，也不生成地面、水花或涟漪。
      return drop.y < this.height + drop.length && drop.x > -80 && drop.x < this.width + 80;
    });

    // 升空火箭只负责到达爆点，始终不参与头部碰撞。
    const completedRockets: Rocket[] = [];
    retainInPlace(this.rockets, (rocket) => {
      if (rocket.launchDelayMs > 0) {
        rocket.launchDelayMs -= delta * 1000;
        return true;
      }

      rocket.previousX = rocket.x;
      rocket.previousY = rocket.y;
      const dx = rocket.targetX - rocket.x;
      const dy = rocket.targetY - rocket.y;
      const distance = Math.hypot(dx, dy);
      const travel = rocket.speed * delta;
      if (distance <= travel) {
        rocket.x = rocket.targetX;
        rocket.y = rocket.targetY;
        completedRockets.push(rocket);
        return false;
      }

      rocket.x += (dx / distance) * travel;
      rocket.y += (dy / distance) * travel;
      return true;
    });
    for (const rocket of completedRockets) this.explodeRocket(rocket);

    const pendingImpactFlashes: Array<{
      x: number;
      y: number;
      color: string;
      glowColor: string;
      coreColor: string;
    }> = [];
    retainInPlace(this.sparks, (spark) => {
      spark.previousX = spark.x;
      spark.previousY = spark.y;
      spark.historyElapsedMs += delta * 1000;
      if (
        spark.historyX &&
        spark.historyY &&
        (spark.historyCount === 0 || spark.historyElapsedMs >= spark.historySampleMs)
      ) {
        spark.historyX[spark.historyCursor] = spark.x;
        spark.historyY[spark.historyCursor] = spark.y;
        spark.historyCursor = (spark.historyCursor + 1) % spark.historyX.length;
        spark.historyCount = Math.min(spark.historyCount + 1, spark.historyX.length);
        spark.historyElapsedMs = 0;
      }
      spark.age += delta;
      const isImpactFlying = spark.impactFlightDuration > 0;
      if (isImpactFlying) spark.impactFlightElapsed += delta;
      const gravityScale = isImpactFlying
        ? SPLENDID_SEQUENCE_CONFIG.impactFlightGravityScale
        : spark.gravityScale;
      spark.vy += FIREWORK_PHYSICS_CONFIG.gravity * gravityScale * delta;
      // 上飞阶段叠加横向正弦摆动，让反弹轨迹柔和弯曲而非笔直。
      if (isImpactFlying) {
        spark.vx +=
          Math.sin(
            spark.impactFlightElapsed * spark.impactFlightWobbleFreq +
              spark.impactFlightWobblePhase,
          ) *
          SPLENDID_SEQUENCE_CONFIG.impactFlightWobbleStrength *
          delta;
      }
      const dragPerFrame = isImpactFlying
        ? SPLENDID_SEQUENCE_CONFIG.impactFlightDragPerFrame
        : FIREWORK_PHYSICS_CONFIG.dragPerFrame;
      const drag = Math.pow(dragPerFrame, delta * 60);
      spark.vx *= drag;
      spark.vy *= drag;
      spark.x += spark.vx * delta;
      spark.y += spark.vy * delta;

      // 只在主爆炸的初始展开阶段屏蔽碰撞；保护时间结束后立即恢复检测。
      // 不要求粒子先离开头部再重新进入，否则多数粒子在寿命结束前不会再次碰撞。
      if (
        !spark.collisionArmed &&
        spark.age >= spark.collisionArmAtAge
      ) {
        spark.collisionArmed = true;
      }

      if (isImpactFlying && spark.impactFlightElapsed >= spark.impactFlightDuration) {
        if (
          pendingImpactFlashes.length <
          SPLENDID_SEQUENCE_CONFIG.maxImpactFlashesPerFrame
        ) {
          pendingImpactFlashes.push({
            x: spark.x,
            y: spark.y,
            color: spark.color,
            glowColor: spark.glowColor,
            coreColor: spark.coreColor,
          });
          return false;
        }
      }
      // 粒子创建时已按 headCollisionScatterChance 掷骰决定身份：
      // scatterOnHead 为 true 的粒子碰到头部才反弹散开，false 的粒子永不参与碰撞、直接穿过。
      const collidedHead =
        !isImpactFlying &&
        FIREWORK_PHYSICS_CONFIG.collisionEnabled &&
        spark.scatterOnHead &&
        spark.collisionArmed
          ? this.resolveHeadCollision(spark)
          : null;
      if (
        collidedHead &&
        spark.canTriggerImpactFlash &&
        !spark.impactFlashHandled
      ) {
        spark.impactFlashHandled = true;
        if (Math.random() <= SPLENDID_SEQUENCE_CONFIG.impactFlashChance) {
          const duration = randomBetween(
            SPLENDID_SEQUENCE_CONFIG.impactFlightDurationMin,
            SPLENDID_SEQUENCE_CONFIG.impactFlightDurationMax,
          );
          const requestedSpeed = randomBetween(
            SPLENDID_SEQUENCE_CONFIG.impactFlightSpeedMin,
            SPLENDID_SEQUENCE_CONFIG.impactFlightSpeedMax,
          );
          const maxVisibleSpeed = Math.max(12, (spark.y - 24) / (duration * 0.72));
          spark.impactFlightDuration = duration;
          spark.impactFlightElapsed = 0;
          spark.scatterOnHead = false;
          spark.vx =
            spark.vx * 0.24 +
            randomBetween(
              -SPLENDID_SEQUENCE_CONFIG.impactFlightHorizontalSpeed,
              SPLENDID_SEQUENCE_CONFIG.impactFlightHorizontalSpeed,
            );
          spark.vy = -Math.min(requestedSpeed, maxVisibleSpeed);
          spark.life = Math.max(spark.life, spark.age + duration + 0.5);
        }
      }
      return spark.age < spark.life && spark.y < this.height + 80;
    });
    for (const flash of pendingImpactFlashes) this.spawnImpactFlash(flash);

    retainInPlace(this.screenDroplets, (droplet) => {
      droplet.age += delta;
      droplet.x += droplet.vx * delta;
      droplet.y += droplet.vy * delta;
      return droplet.age < droplet.life;
    });

    retainInPlace(this.impactFlashes, (flash) => {
      flash.age += delta;
      if (flash.age >= flash.life) return false;
      const drag = Math.pow(
        SPLENDID_SEQUENCE_CONFIG.impactFlashParticleDragPerFrame,
        delta * 60,
      );
      for (const particle of flash.particles) {
        particle.vy +=
          FIREWORK_PHYSICS_CONFIG.gravity *
          SPLENDID_SEQUENCE_CONFIG.impactFlashParticleGravityScale *
          delta;
        particle.vx *= drag;
        particle.vy *= drag;
      }
      return true;
    });

    retainInPlace(this.burstBlooms, (bloom) => {
      bloom.age += delta;
      return bloom.age < bloom.life;
    });
  }

  private spawnRainDrop() {
    const style = RAIN_STYLE;
    const depth = randomBetween(RAIN_PHYSICS_CONFIG.depthMin, 1);
    const depthProgress =
      (depth - RAIN_PHYSICS_CONFIG.depthMin) /
      (1 - RAIN_PHYSICS_CONFIG.depthMin);
    const speedPerspective =
      RAIN_PHYSICS_CONFIG.farSpeedScale +
      (RAIN_PHYSICS_CONFIG.nearSpeedScale - RAIN_PHYSICS_CONFIG.farSpeedScale) *
        depthProgress;
    const lengthPerspective =
      RAIN_PHYSICS_CONFIG.farLengthScale +
      (RAIN_PHYSICS_CONFIG.nearLengthScale - RAIN_PHYSICS_CONFIG.farLengthScale) *
        depthProgress;
    const widthPerspective =
      RAIN_PHYSICS_CONFIG.farWidthScale +
      (RAIN_PHYSICS_CONFIG.nearWidthScale - RAIN_PHYSICS_CONFIG.farWidthScale) *
        depthProgress;
    const speed =
      this.tuning.rainSpeed *
      randomBetween(RAIN_PHYSICS_CONFIG.speedMin, RAIN_PHYSICS_CONFIG.speedMax) *
      speedPerspective;
    this.rain.push({
      x: randomBetween(-40, this.width + 40),
      y: randomBetween(-this.height * 0.22, -12),
      vx:
        RAIN_PHYSICS_CONFIG.wind *
        randomBetween(
          1 - RAIN_PHYSICS_CONFIG.windVariance,
          1 + RAIN_PHYSICS_CONFIG.windVariance,
        ),
      vy: speed,
      length:
        RAIN_PHYSICS_CONFIG.length *
        style.lengthScale *
        randomBetween(
          RAIN_PHYSICS_CONFIG.lengthVariationMin,
          RAIN_PHYSICS_CONFIG.lengthVariationMax,
        ) *
        lengthPerspective,
      opacity:
        randomBetween(style.opacityMin, style.opacityMax) *
        (0.46 + depthProgress * 0.54),
      widthScale: widthPerspective * randomBetween(0.84, 1.16),
    });
  }

  /** 每次完整触发固定交错排入 4 枚绚烂、2 枚仿真和 5 枚精细烟花。 */
  private queueTripleRockets(particleBudget: number) {
    const particleScale = this.compactDevice
      ? PERFORMANCE_BUDGET.mobileFireworkParticleScale
      : this.reducedMotion
        ? 0.55
        : 1;
    const launchOrder = TRIPLE_FIREWORK_CONFIG.launchOrder;
    const particleBudgetAfterRockets = particleBudget - launchOrder.length;
    // 移动端粒子池小，各层“最小粒子数”按移动端倍率同步缩放，
    // 否则 14 枚火箭的最小预算（286）会超过移动端池上限，烟花永远无法触发。
    const minimums = launchOrder.map((kind) => {
      const base = TRIPLE_FIREWORK_CONFIG.layers[kind].minParticles;
      return this.compactDevice
        ? Math.max(6, Math.round(base * particleScale))
        : base;
    });
    const minimumTotal = minimums.reduce((total, value) => total + value, 0);
    if (particleBudgetAfterRockets < minimumTotal) return false;

    const desired = launchOrder.map((kind, index) => {
      const { densityScale } = TRIPLE_FIREWORK_CONFIG.layers[kind];
      return Math.max(
        minimums[index],
        Math.round(this.tuning.fireworkDensity * particleScale * densityScale),
      );
    });
    const desiredTotal = desired.reduce((total, value) => total + value, 0);
    const usableBudget = Math.min(particleBudgetAfterRockets, desiredTotal);
    const excessBudget = usableBudget - minimumTotal;
    const desiredExcess = desiredTotal - minimumTotal;
    const amounts = desired.map((value, index) =>
      desiredTotal <= particleBudgetAfterRockets || desiredExcess <= 0
        ? value
        : minimums[index] +
          Math.floor(((value - minimums[index]) / desiredExcess) * excessBudget),
    );
    // 火箭延迟升空期间仍为后续爆炸保留额度，避免雨滴重新占满粒子池。
    this.reservedSparkCount += amounts.reduce((total, value) => total + value, 0);

    const occurrence: Record<TripleFireworkKind, number> = {
      splendid: 0,
      simulator: 0,
      fine: 0,
    };
    const reserved: FireworkTarget[] = this.rockets.map((rocket) => ({
      x: rocket.targetX,
      y: rocket.targetY,
    }));

    launchOrder.forEach((kind, sequenceIndex) => {
      const occurrenceIndex = occurrence[kind];
      occurrence[kind] += 1;
      const plan = TRIPLE_FIREWORK_CONFIG.layers[kind];
      const lane = plan.lanes[Math.min(occurrenceIndex, plan.lanes.length - 1)] ?? 0.5;
      const target = this.pickTripleTarget(
        this.width * lane,
        plan.targetTop,
        plan.targetBottom,
        reserved,
        kind === "simulator",
        plan.targetSeparationScale,
      );
      reserved.push(target);

      const style = TRIPLE_FIREWORK_LAYERS[kind];
      const colors = this.fireworkColors(
        style,
        Math.floor(Math.random() * style.colorOffsetCount),
      );
      const leanDirection = (occurrenceIndex + sequenceIndex) % 2 === 0 ? -1 : 1;
      const leanScale = kind === "fine" ? 0.034 : 0.052;
      const startX = kind === "simulator"
        ? target.x
        : clamp(
            target.x + leanDirection * this.width * leanScale,
            this.width * 0.05,
            this.width * 0.95,
          );
      const startY = this.height + (kind === "splendid"
        ? randomBetween(38, 74)
        : kind === "simulator"
          ? randomBetween(28, 52)
          : randomBetween(22, 46));
      const speed = kind === "simulator"
        ? randomBetween(
            SIMULATOR_FIREWORK_CONFIG.rocketSpeedMin,
            SIMULATOR_FIREWORK_CONFIG.rocketSpeedMax,
          )
        : kind === "fine"
          ? randomBetween(
              SPLENDID_SEQUENCE_CONFIG.rocketSpeedMin * 1.06,
              SPLENDID_SEQUENCE_CONFIG.rocketSpeedMax * 1.08,
            )
          : randomBetween(
              SPLENDID_SEQUENCE_CONFIG.rocketSpeedMin,
              SPLENDID_SEQUENCE_CONFIG.rocketSpeedMax,
            );
      const explosionScale = randomBetween(plan.scaleMin, plan.scaleMax);

      this.rockets.push({
        x: startX,
        y: startY,
        previousX: startX,
        previousY: startY + 18,
        targetX: target.x,
        targetY: target.y,
        speed,
        launchDelayMs:
          sequenceIndex * TRIPLE_FIREWORK_CONFIG.launchIntervalMs +
          randomBetween(0, TRIPLE_FIREWORK_CONFIG.launchJitterMs),
        color: colors.body,
        glowColor: colors.glow,
        coreColor: colors.core,
        kind,
        particleAmount: amounts[sequenceIndex],
        explosionScale,
        simulatorVariant:
          kind === "simulator" ? this.pickSimulatorVariant() : null,
        simulatorRotation: kind === "simulator" ? Math.random() * TWO_PI : 0,
        simulatorSquash:
          kind === "simulator" ? randomBetween(0.4, 0.74) : 1,
      });
    });
    return true;
  }

  private pickTripleTarget(
    preferredX: number,
    top: number,
    bottom: number,
    reserved: FireworkTarget[],
    requireVerticalLane: boolean,
    separationScale: number,
  ) {
    let best = {
      x: clamp(preferredX, this.width * 0.07, this.width * 0.93),
      y: this.height * ((top + bottom) * 0.5),
    };
    let bestScore = -Infinity;

    for (
      let attempt = 0;
      attempt < TRIPLE_FIREWORK_CONFIG.targetSearchAttempts;
      attempt += 1
    ) {
      const candidate = {
        x: clamp(
          preferredX + randomBetween(-this.width * 0.075, this.width * 0.075),
          this.width * 0.07,
          this.width * 0.93,
        ),
        y: randomBetween(this.height * top, this.height * bottom),
      };
      const peopleClearance = requireVerticalLane
        ? this.simulatorLaunchClearance(candidate.x, candidate.y)
        : this.explosionTargetClearance(candidate.x, candidate.y);
      let separationClearance = Infinity;
      for (const target of reserved) {
        const dx =
          (candidate.x - target.x) /
          Math.max(
            1,
            this.width *
              TRIPLE_FIREWORK_CONFIG.targetSeparationX *
              separationScale,
          );
        const dy =
          (candidate.y - target.y) /
          Math.max(
            1,
            this.height *
              TRIPLE_FIREWORK_CONFIG.targetSeparationY *
              separationScale,
          );
        separationClearance = Math.min(separationClearance, dx * dx + dy * dy);
      }
      const score = Math.min(peopleClearance, separationClearance);
      if (score > bestScore) {
        best = candidate;
        bestScore = score;
      }
      if (score >= 1) return candidate;
    }

    return best;
  }

  private simulatorLaunchClearance(x: number, y: number) {
    let nearestClearance = Infinity;
    for (const head of this.heads.values()) {
      // 垂直通道只看横向距离；爆点再使用覆盖头肩区域的二维安全椭圆。
      const laneDistance =
        Math.abs(x - head.x) /
        Math.max(1, head.radiusX * SIMULATOR_FIREWORK_CONFIG.launchPathPaddingX);
      const bodyCenterY = head.y + head.radiusY * 1.1;
      const targetX =
        (x - head.x) /
        Math.max(1, head.radiusX * SIMULATOR_FIREWORK_CONFIG.targetPaddingX);
      const targetY =
        (y - bodyCenterY) /
        Math.max(1, head.radiusY * SIMULATOR_FIREWORK_CONFIG.targetPaddingY);
      nearestClearance = Math.min(
        nearestClearance,
        laneDistance * laneDistance,
        targetX * targetX + targetY * targetY,
      );
    }

    for (const rocket of this.rockets) {
      if (!rocket.simulatorVariant) continue;
      const laneGap =
        Math.abs(x - rocket.targetX) /
        Math.max(1, this.width * SIMULATOR_FIREWORK_CONFIG.launchLaneGap);
      nearestClearance = Math.min(nearestClearance, laneGap * laneGap);
    }
    return nearestClearance;
  }

  private pickSimulatorVariant(): SimulatorShellVariant {
    // 只保留圆环与闪烁两种壳型：小于 ringEnd 为圆环，否则为闪烁。
    const roll = Math.random();
    if (roll < SIMULATOR_FIREWORK_CONFIG.ringEnd) return "ring";
    return "strobe";
  }

  private explosionTargetClearance(x: number, y: number) {
    if (!this.heads.size) return Infinity;
    let nearestClearance = Infinity;
    for (const head of this.heads.values()) {
      const centerY = head.y + head.radiusY * 0.42;
      const radiusX =
        head.radiusX * SPLENDID_SEQUENCE_CONFIG.targetAvoidancePaddingX;
      const radiusY =
        head.radiusY * SPLENDID_SEQUENCE_CONFIG.targetAvoidancePaddingY;
      const dx = (x - head.x) / radiusX;
      const dy = (y - centerY) / radiusY;
      nearestClearance = Math.min(nearestClearance, dx * dx + dy * dy);
    }
    return nearestClearance;
  }

  private explodeRocket(rocket: Rocket) {
    const style: FireworkLayerDefinition = TRIPLE_FIREWORK_LAYERS[rocket.kind];
    this.reservedSparkCount = Math.max(
      0,
      this.reservedSparkCount - rocket.particleAmount,
    );
    const available = Math.max(
      0,
      this.maxParticles - this.particleCount - this.reservedSparkCount,
    );
    const amount = Math.min(rocket.particleAmount, available);
    if (amount <= 0) return;
    const isSimulator = rocket.kind === "simulator";
    const colorOffset = Math.floor(Math.random() * style.colorOffsetCount);
    const bloomColors = isSimulator
      ? { glow: rocket.glowColor, body: rocket.color, core: rocket.coreColor }
      : this.fireworkColors(style, colorOffset);
    this.burstBlooms.push({
      x: rocket.x,
      y: rocket.y,
      age: 0,
      life: SPLENDID_RENDER_CONFIG.burstBloomLife,
      radius: SPLENDID_RENDER_CONFIG.burstBloomRadius * rocket.explosionScale,
      color: bloomColors.body,
      coreColor: bloomColors.core,
    });

    for (let index = 0; index < amount; index += 1) {
      const direction = isSimulator
        ? this.simulatorDirection(rocket, index, amount)
        : this.fireworkDirection(rocket.kind, index, amount);
      const speed =
        this.tuning.fireworkSpeed *
        randomBetween(style.speedMin, style.speedMax) *
        rocket.explosionScale;
      const historyPoints = this.compactDevice
        ? Math.max(
            2,
            Math.round(
              style.historyPoints * PERFORMANCE_BUDGET.mobileHistoryPointScale,
            ),
          )
        : style.historyPoints;
      const historyX = historyPoints > 0
        ? new Float32Array(historyPoints)
        : null;
      const historyY = historyPoints > 0
        ? new Float32Array(historyPoints)
        : null;
      const colors = isSimulator
        ? this.simulatorSparkColors(rocket, index)
        : this.fireworkColors(style, index + colorOffset);
      const lifeScale = rocket.simulatorVariant === "palm"
        ? 1.18
        : rocket.simulatorVariant === "ring"
          ? 0.86
          : 1;
      this.sparks.push({
        x: rocket.x,
        y: rocket.y,
        previousX: rocket.x,
        previousY: rocket.y,
        vx: direction.x * speed,
        vy: direction.y * speed,
        age: 0,
        life: randomBetween(style.lifeMin, style.lifeMax) * lifeScale,
        radius:
          this.tuning.fireworkSize *
          randomBetween(0.72, 1.28) *
          Math.sqrt(rocket.explosionScale),
        color: colors.body,
        glowColor: colors.glow,
        gravityScale: style.gravityScale,
        trailScale: style.trailScale,
        kind: rocket.kind,
        coreColor: colors.core,
        headScale: style.headScale,
        haloScale: style.haloScale,
        dottedTrail:
          style.dottedTrailEvery > 0 &&
          index % style.dottedTrailEvery === 0 &&
          (!this.compactDevice || isSimulator),
        historyX,
        historyY,
        historyCursor: 0,
        historyCount: 0,
        historySampleMs: style.historySampleMs,
        historyElapsedMs: 0,
        twinklePhase: Math.random() * TWO_PI,
        compoundTrail:
          !this.compactDevice &&
          !isSimulator &&
          (rocket.kind === "fine"
            ? FINE_RENDER_CONFIG.compoundTrailEvery > 0 &&
              index % FINE_RENDER_CONFIG.compoundTrailEvery === 0
            : SPLENDID_RENDER_CONFIG.compoundTrailEvery > 0 &&
              index % SPLENDID_RENDER_CONFIG.compoundTrailEvery === 0),
        compoundTrailSeed: Math.random(),
        scatterOnHead:
          Math.random() <=
          (style.headCollisionChance ?? FIREWORK_PHYSICS_CONFIG.headCollisionScatterChance),
        collisionArmed: false,
        collisionArmAtAge: isSimulator
          ? SIMULATOR_FIREWORK_CONFIG.postExplosionCollisionDelay
          : SPLENDID_SEQUENCE_CONFIG.postExplosionCollisionDelay,
        canTriggerImpactFlash: !isSimulator,
        impactFlashHandled: false,
        impactFlightDuration: 0,
        impactFlightElapsed: 0,
        impactFlightWobblePhase: Math.random() * TWO_PI,
        impactFlightWobbleFreq: randomBetween(
          SPLENDID_SEQUENCE_CONFIG.impactFlightWobbleFreqMin,
          SPLENDID_SEQUENCE_CONFIG.impactFlightWobbleFreqMax,
        ),
        simulatorStrobe: rocket.simulatorVariant === "strobe",
      });
    }
  }

  private simulatorSparkColors(rocket: Rocket, index: number) {
    // 少量暖白内芯模拟参考实现中的 pistil / streamer 子壳，其余主星保持单枚同色。
    if (index % 8 === 0) {
      return { glow: rocket.glowColor, body: rocket.coreColor, core: "#ffffff" };
    }
    return { glow: rocket.glowColor, body: rocket.color, core: rocket.coreColor };
  }

  private fireworkColors(style: FireworkLayerDefinition, index: number) {
    const ramps = style.colorRamps;
    const ramp = ramps[index % ramps.length];
    return { glow: ramp.glow, body: ramp.body, core: ramp.core };
  }

  private simulatorDirection(rocket: Rocket, index: number, amount: number) {
    const variant = rocket.simulatorVariant ?? "chrysanthemum";
    const progress = index / Math.max(1, amount);
    const baseAngle = progress * TWO_PI + rocket.simulatorRotation;

    if (variant === "ring") {
      // 同一枚火箭共享旋转和压扁比例，使全部主星稳定组成一个空间圆环。
      const localX = Math.cos(baseAngle);
      const localY = Math.sin(baseAngle) * rocket.simulatorSquash;
      const rotation = rocket.simulatorRotation * 0.42;
      return {
        x: localX * Math.cos(rotation) - localY * Math.sin(rotation),
        y: localX * Math.sin(rotation) + localY * Math.cos(rotation),
      };
    }

    if (variant === "palm") {
      // 多颗星共享少量分支方向，形成棕榈烟花粗壮而清晰的长枝。
      const branchCount = Math.max(10, Math.round(12 + rocket.explosionScale * 5));
      const branch = index % branchCount;
      const layer = Math.floor(index / branchCount);
      const angle =
        rocket.simulatorRotation +
        (branch / branchCount) * TWO_PI +
        (layer % 3 - 1) * 0.018;
      const magnitude = 0.72 + (layer % 4) * 0.09 + Math.random() * 0.08;
      return { x: Math.cos(angle) * magnitude, y: Math.sin(angle) * magnitude - 0.06 };
    }

    const angle = baseAngle + randomBetween(-0.045, 0.045);
    const outerBias = index % 8 === 0
      ? randomBetween(0.42, 0.58)
      : randomBetween(0.7, 1.08);
    if (variant === "strobe") {
      return {
        x: Math.cos(angle) * outerBias,
        y: Math.sin(angle) * outerBias - 0.05,
      };
    }

    // 菊花壳：主星按近球面放射，并混入较慢的白色内芯。
    return {
      x: Math.cos(angle) * outerBias,
      y: Math.sin(angle) * outerBias - 0.08,
    };
  }

  private spawnImpactFlash({
    x,
    y,
    color,
    glowColor,
    coreColor,
  }: {
    x: number;
    y: number;
    color: string;
    glowColor: string;
    coreColor: string;
  }) {
    if (this.particleCount + this.reservedSparkCount >= this.maxParticles) return;
    const particleCount = SPLENDID_SEQUENCE_CONFIG.impactFlashParticles;
    const particles: ImpactFlashParticle[] = [];
    for (let index = 0; index < particleCount; index += 1) {
      const angle = (index / particleCount) * TWO_PI + randomBetween(-0.08, 0.08);
      const speed = randomBetween(
        SPLENDID_SEQUENCE_CONFIG.impactFlashParticleSpeedMin,
        SPLENDID_SEQUENCE_CONFIG.impactFlashParticleSpeedMax,
      );
      particles.push({
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: randomBetween(
          SPLENDID_SEQUENCE_CONFIG.impactFlashParticleRadiusMin,
          SPLENDID_SEQUENCE_CONFIG.impactFlashParticleRadiusMax,
        ),
        twinklePhase: Math.random() * TWO_PI,
      });
    }
    this.impactFlashes.push({
      x,
      y,
      age: 0,
      life: SPLENDID_SEQUENCE_CONFIG.impactFlashLife,
      color,
      glowColor,
      coreColor,
      particles,
    });
  }

  private fireworkDirection(kind: TripleFireworkKind, index: number, amount: number) {
    const progress = index / Math.max(1, amount);
    const angle = progress * TWO_PI + randomBetween(-0.035, 0.035);
    if (kind === "splendid") {
      const irregularRadius = 0.88 + Math.sin(index * 2.399) * 0.12;
      return {
        x: Math.cos(angle) * irregularRadius,
        y: Math.sin(angle) * 0.86 - 0.12,
      };
    }
    if (kind === "fine") {
      const fanStride =
        FINE_RENDER_CONFIG.fountainChance > 0
          ? Math.max(2, Math.round(1 / FINE_RENDER_CONFIG.fountainChance))
          : Number.POSITIVE_INFINITY;
      if (FINE_RENDER_CONFIG.fountainChance > 0 && index % fanStride === 0) {
        const fanIndex = Math.floor(index / fanStride);
        const fanCount = Math.max(1, Math.ceil(amount / fanStride));
        const fanProgress = fanIndex / Math.max(1, fanCount - 1) - 0.5;
        const fanAngle =
          -Math.PI / 2 + fanProgress * FINE_RENDER_CONFIG.fountainArc * 2;
        return {
          x: Math.cos(fanAngle) * randomBetween(0.88, 1.04),
          y: Math.sin(fanAngle) * randomBetween(0.92, 1.12),
        };
      }
      const irregularRadius = 0.92 + Math.sin(index * 2.399) * 0.08;
      return {
        x: Math.cos(angle) * irregularRadius,
        y: Math.sin(angle) * 0.92 - 0.06,
      };
    }
    return { x: Math.cos(angle), y: Math.sin(angle) - 0.08 };
  }

  private spawnScreenDroplet() {
    const scale = Math.max(0.72, Math.min(1.25, this.width / 900));
    const radius = randomBetween(2.8, 12.5) * scale;
    this.screenDroplets.push({
      x: randomBetween(this.width * 0.06, this.width * 0.94),
      y: randomBetween(this.height * 0.08, this.height * 0.82),
      radius,
      age: 0,
      life: randomBetween(
        RAIN_PHYSICS_CONFIG.screenDropletLifeMin,
        RAIN_PHYSICS_CONFIG.screenDropletLifeMax,
      ),
      vx: randomBetween(-2.5, 2.5),
      vy: randomBetween(2, 11),
      opacity: randomBetween(0.12, 0.29),
      trailLength: radius * randomBetween(0.2, 3.6),
      flatten: randomBetween(0.72, 1.18),
    });
  }

  private findContainingHead(x: number, y: number) {
    let best: HeadCollider | null = null;
    let deepest = Infinity;
    for (const head of this.heads.values()) {
      const dx = (x - head.x) / head.radiusX;
      const dy = (y - head.y) / head.radiusY;
      const normalizedDistance = dx * dx + dy * dy;
      if (normalizedDistance <= 1 && normalizedDistance < deepest) {
        best = head;
        deepest = normalizedDistance;
      }
    }
    return best;
  }

  private resolveHeadCollision(spark: Spark) {
    const head = this.findContainingHead(spark.x, spark.y);
    if (!head) return null;
    const dx = spark.x - head.x;
    const dy = spark.y - head.y;
    const scaledX = dx / head.radiusX;
    const scaledY = dy / head.radiusY;
    const magnitude = Math.hypot(scaledX, scaledY) || 1;
    const surfaceX = head.x + (scaledX / magnitude) * head.radiusX;
    const surfaceY = head.y + (scaledY / magnitude) * head.radiusY;
    const normalXRaw = (surfaceX - head.x) / (head.radiusX * head.radiusX);
    const normalYRaw = (surfaceY - head.y) / (head.radiusY * head.radiusY);
    const normalMagnitude = Math.hypot(normalXRaw, normalYRaw) || 1;
    const normalX = normalXRaw / normalMagnitude;
    const normalY = normalYRaw / normalMagnitude;
    const velocityAlongNormal = spark.vx * normalX + spark.vy * normalY;

    spark.x = surfaceX + normalX * (spark.radius + 1);
    spark.y = surfaceY + normalY * (spark.radius + 1);
    if (velocityAlongNormal < 0) {
      const impulse = (1 + FIREWORK_PHYSICS_CONFIG.bounce) * velocityAlongNormal;
      spark.vx -= impulse * normalX;
      spark.vy -= impulse * normalY;
    }
    return head;
  }

  private draw(now: number) {
    const ctx = this.context;
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.lineCap = "round";

    // 1) 烟花（火箭、火花、二次闪光）绘制在最底层，随后会被人物遮挡层盖住。
    ctx.globalCompositeOperation = "lighter";
    for (const bloom of this.burstBlooms) {
      this.drawBurstBloom(ctx, bloom);
    }

    for (const rocket of this.rockets) {
      if (rocket.launchDelayMs > 0) continue;
      const trailX = rocket.x + (rocket.previousX - rocket.x) * 5.5;
      const trailY = rocket.y + (rocket.previousY - rocket.y) * 5.5;
      ctx.beginPath();
      ctx.moveTo(rocket.x, rocket.y);
      ctx.lineTo(trailX, trailY);
      ctx.globalAlpha = 0.24;
      ctx.strokeStyle = rocket.glowColor;
      ctx.lineWidth = this.tuning.fireworkSize * 4.2;
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(rocket.x, rocket.y);
      ctx.lineTo(trailX, trailY);
      ctx.globalAlpha = 0.56;
      ctx.strokeStyle = rocket.color;
      ctx.lineWidth = this.tuning.fireworkSize * 1.7;
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(rocket.x, rocket.y);
      ctx.lineTo(trailX, trailY);
      ctx.globalAlpha = 0.96;
      ctx.strokeStyle = rocket.coreColor;
      ctx.lineWidth = Math.max(1, this.tuning.fireworkSize * 0.62);
      ctx.stroke();
    }

    for (const spark of this.sparks) {
      const remaining = spark.impactFlightDuration > 0
        ? Math.max(
            0.42,
            0.92 -
              (spark.impactFlightElapsed / spark.impactFlightDuration) * 0.5,
          )
        : Math.max(0, 1 - spark.age / spark.life);
      if (spark.kind === "splendid") {
        this.drawSplendidSpark(ctx, spark, remaining);
        continue;
      }
      if (spark.kind === "fine") {
        this.drawFineSpark(ctx, spark, remaining);
        continue;
      }
      if (spark.kind === "simulator") {
        this.drawSimulatorSpark(ctx, spark, remaining);
        continue;
      }
    }

    for (const flash of this.impactFlashes) {
      this.drawImpactFlash(ctx, flash);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";

    // 2) 人物遮挡层：仅在有烟花粒子时，把实时视频中的人物主体抠出并盖在烟花之上，
    //    实现烟花在人物主体背后绽放；平时（只下雨）不做任何额外开销。
    if (
      FOREGROUND_PEOPLE_CONFIG.enabled &&
      (this.rockets.length > 0 ||
        this.sparks.length > 0 ||
        this.burstBlooms.length > 0 ||
        this.impactFlashes.length > 0)
    ) {
      this.drawForegroundPeople(now);
    }

    // 3) 透明下落雨滴保持绘制在最上层（人物前方）；不绘制地面、水花或涟漪。
    const rainStyle = RAIN_STYLE;
    ctx.globalCompositeOperation = "source-over";
    if (!this.compactDevice) this.drawRainRefraction(ctx);
    for (const drop of this.rain) {
      this.drawNaturalRainDrop(ctx, drop, rainStyle);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";

    if (!this.rainGlass.canRender) {
      for (const droplet of this.screenDroplets) {
        this.drawScreenDroplet(ctx, droplet, rainStyle);
      }
    }
  }

  private drawNaturalRainDrop(
    ctx: CanvasRenderingContext2D,
    drop: RainDrop,
    style: typeof RAIN_STYLE,
  ) {
    const speed = Math.hypot(drop.vx, drop.vy) || 1;
    const directionX = drop.vx / speed;
    const directionY = drop.vy / speed;
    const normalX = -directionY;
    const normalY = directionX;
    const tailX = drop.x - directionX * drop.length;
    const tailY = drop.y - directionY * drop.length;
    const width = this.rainDropWidth(drop);

    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // 水体本身接近透明，摄像头原色会直接透过；体积主要由折射和两侧边缘表现。
    ctx.beginPath();
    this.traceRainDropShape(ctx, drop, width);
    ctx.globalAlpha = drop.opacity * RAIN_PHYSICS_CONFIG.bodyOpacity;
    ctx.fillStyle = style.lineColor;
    ctx.fill();

    // 背光侧暗边：完整轮廓保持很淡，避免重新变成一根灰白直线。
    ctx.globalAlpha = drop.opacity * RAIN_PHYSICS_CONFIG.shadowEdgeOpacity;
    ctx.strokeStyle = style.shadowColor;
    ctx.lineWidth = Math.max(0.38, width * 0.18);
    ctx.stroke();

    // 迎光侧只画一段弧形高光，和暗边共同构成立体的透明水滴截面。
    const highlightStartX = tailX + directionX * drop.length * 0.18 + normalX * width * 0.08;
    const highlightStartY = tailY + directionY * drop.length * 0.18 + normalY * width * 0.08;
    const highlightEndX = drop.x - directionX * width * 0.12 + normalX * width * 0.48;
    const highlightEndY = drop.y - directionY * width * 0.12 + normalY * width * 0.48;
    ctx.beginPath();
    ctx.moveTo(highlightStartX, highlightStartY);
    ctx.quadraticCurveTo(
      drop.x - directionX * drop.length * 0.42 + normalX * width * 0.42,
      drop.y - directionY * drop.length * 0.42 + normalY * width * 0.42,
      highlightEndX,
      highlightEndY,
    );
    ctx.globalAlpha = drop.opacity * RAIN_PHYSICS_CONFIG.highlightEdgeOpacity;
    ctx.strokeStyle = style.highlightColor;
    ctx.lineWidth = Math.max(0.42, width * 0.16);
    ctx.stroke();

    // 前缘的小弧面反光使水滴具有圆润头部，而不是线条的平头。
    ctx.beginPath();
    ctx.ellipse(
      drop.x - directionX * width * 0.08 + normalX * width * 0.18,
      drop.y - directionY * width * 0.08 + normalY * width * 0.18,
      Math.max(0.34, width * 0.16),
      Math.max(0.5, width * 0.25),
      Math.atan2(directionY, directionX),
      0,
      TWO_PI,
    );
    ctx.globalAlpha = drop.opacity * Math.min(1, RAIN_PHYSICS_CONFIG.highlightEdgeOpacity * 1.08);
    ctx.fillStyle = style.highlightColor;
    ctx.fill();
    ctx.restore();
  }

  /**
   * 把所有下落雨滴合成一个裁剪路径，每帧只额外绘制一次摄像头画面。
   * 这对应参考文章的“背景纹理 + 法线偏移”思路，但避免逐雨滴 drawImage。
   */
  private drawRainRefraction(ctx: CanvasRenderingContext2D) {
    const video = this.videoSource;
    if (!video || this.rain.length === 0 || RAIN_PHYSICS_CONFIG.refractionOpacity <= 0) {
      return;
    }
    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
    if (video.videoWidth <= 0 || video.videoHeight <= 0) return;

    const dropsPath = new Path2D();
    for (const drop of this.rain) {
      this.traceRainDropShape(dropsPath, drop, this.rainDropWidth(drop));
    }

    const scale = Math.max(this.width / video.videoWidth, this.height / video.videoHeight);
    const drawnWidth = video.videoWidth * scale;
    const drawnHeight = video.videoHeight * scale;
    const offsetX = (this.width - drawnWidth) / 2;
    const offsetY = (this.height - drawnHeight) / 2;

    ctx.save();
    ctx.clip(dropsPath);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = RAIN_PHYSICS_CONFIG.refractionOpacity;
    ctx.translate(this.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(
      video,
      offsetX + RAIN_PHYSICS_CONFIG.refractionOffsetX,
      offsetY + RAIN_PHYSICS_CONFIG.refractionOffsetY,
      drawnWidth,
      drawnHeight,
    );
    ctx.restore();
  }

  private rainDropWidth(drop: RainDrop) {
    return Math.max(0.7, this.tuning.rainWidth * drop.widthScale);
  }

  /** 描出一颗前宽后尖的透明雨滴轮廓，可用于裁剪、填充和描边。 */
  private traceRainDropShape(target: RainPathTarget, drop: RainDrop, width: number) {
    const speed = Math.hypot(drop.vx, drop.vy) || 1;
    const directionX = drop.vx / speed;
    const directionY = drop.vy / speed;
    const normalX = -directionY;
    const normalY = directionX;
    const tailX = drop.x - directionX * drop.length;
    const tailY = drop.y - directionY * drop.length;
    const tipX = drop.x + directionX * width * 0.34;
    const tipY = drop.y + directionY * width * 0.34;
    const shoulderX = drop.x - directionX * width * 0.22;
    const shoulderY = drop.y - directionY * width * 0.22;

    target.moveTo(tailX, tailY);
    target.quadraticCurveTo(
      tailX + directionX * drop.length * 0.6 + normalX * width * 0.3,
      tailY + directionY * drop.length * 0.6 + normalY * width * 0.3,
      shoulderX + normalX * width * 0.56,
      shoulderY + normalY * width * 0.56,
    );
    target.quadraticCurveTo(
      drop.x + normalX * width * 0.62,
      drop.y + normalY * width * 0.62,
      tipX,
      tipY,
    );
    target.quadraticCurveTo(
      drop.x - normalX * width * 0.62,
      drop.y - normalY * width * 0.62,
      shoulderX - normalX * width * 0.56,
      shoulderY - normalY * width * 0.56,
    );
    target.quadraticCurveTo(
      tailX + directionX * drop.length * 0.6 - normalX * width * 0.3,
      tailY + directionY * drop.length * 0.6 - normalY * width * 0.3,
      tailX,
      tailY,
    );
    target.closePath();
  }

  private drawScreenDroplet(
    ctx: CanvasRenderingContext2D,
    droplet: ScreenDroplet,
    style: typeof RAIN_STYLE,
  ) {
    const progress = Math.min(1, droplet.age / droplet.life);
    const fade = Math.min(1, droplet.age / 0.35, (1 - progress) / 0.22);
    const radius = droplet.radius * (0.94 + Math.sin(droplet.age * 2.4) * 0.03);
    const trailLength = droplet.trailLength * (0.7 + progress * 0.3);
    const contrast = RAIN_PHYSICS_CONFIG.glassDropletContrast;
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = droplet.opacity * fade;

    // 先画一条低透明度拖痕，模拟水珠在玻璃上被重力拉开的湿润路径。
    ctx.lineCap = "round";
    ctx.strokeStyle = style.shadowColor;
    ctx.lineWidth = Math.max(0.7, radius * 0.72);
    ctx.globalAlpha = Math.min(1, droplet.opacity * fade * contrast * 0.34);
    ctx.beginPath();
    ctx.moveTo(droplet.x, droplet.y - trailLength);
    ctx.lineTo(droplet.x + droplet.vx * 0.12, droplet.y);
    ctx.stroke();

    // 半透明水体与暗边先勾出“贴在镜头玻璃上”的厚度。
    ctx.fillStyle = style.shadowColor;
    ctx.globalAlpha = Math.min(1, droplet.opacity * fade * contrast * 0.78);
    ctx.beginPath();
    ctx.ellipse(
      droplet.x,
      droplet.y,
      radius * 1.08,
      radius * 1.22,
      -0.2,
      0,
      TWO_PI,
    );
    ctx.fill();

    ctx.strokeStyle = style.highlightColor;
    ctx.lineWidth = Math.max(0.5, radius * 0.1);
    ctx.globalAlpha = Math.min(1, droplet.opacity * fade * contrast * 0.94);
    ctx.beginPath();
    ctx.ellipse(
      droplet.x - radius * 0.08,
      droplet.y - radius * 0.08,
      radius * 0.88 * droplet.flatten,
      radius * 1.05,
      -0.2,
      Math.PI * 0.78,
      Math.PI * 1.85,
    );
    ctx.stroke();

    // 反向暗环模拟水滴折射出的背景轮廓，让玻璃水珠在不同明暗背景上都可见。
    ctx.strokeStyle = style.shadowColor;
    ctx.lineWidth = Math.max(0.7, radius * 0.16);
    ctx.globalAlpha = Math.min(1, droplet.opacity * fade * contrast * 0.58);
    ctx.beginPath();
    ctx.ellipse(
      droplet.x + radius * 0.08,
      droplet.y + radius * 0.06,
      radius * 0.72 * droplet.flatten,
      radius * 0.82,
      -0.2,
      Math.PI * 0.05,
      Math.PI * 1.35,
    );
    ctx.stroke();

    ctx.fillStyle = style.highlightColor;
    ctx.globalAlpha = Math.min(1, droplet.opacity * fade * contrast * 1.05);
    ctx.beginPath();
    ctx.ellipse(
      droplet.x - radius * 0.28,
      droplet.y - radius * 0.42,
      Math.max(0.8, radius * 0.16),
      Math.max(1.1, radius * 0.24),
      -0.25,
      0,
      TWO_PI,
    );
    ctx.fill();
    ctx.restore();
  }

  /**
   * 在离屏 canvas 上生成“人物主体 + 实时视频画面”的遮挡层，再盖到特效画布上。
   * 视频按与 CSS（scaleX(-1)）及头部坐标一致的镜像方式绘制，并用头部椭圆外扩的
   * 柔和区域做 destination-in 裁剪，只保留人物主体部分。
   */
  private drawForegroundPeople(now: number) {
    const video = this.videoSource;
    const fctx = this.foregroundContext;
    const mctx = this.foregroundMaskContext;
    if (
      !video ||
      !fctx ||
      !mctx ||
      !this.foregroundCanvas ||
      !this.foregroundMaskCanvas ||
      this.heads.size === 0
    ) return;
    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
    if (video.videoWidth <= 0 || video.videoHeight <= 0) return;

    const refreshFps = this.compactDevice
      ? PERFORMANCE_BUDGET.foregroundFpsMobile
      : PERFORMANCE_BUDGET.foregroundFpsDesktop;
    const refreshDue = now - this.lastForegroundUpdateAt >= 1000 / refreshFps;
    const shouldRefresh =
      refreshDue &&
      (this.foregroundMaskDirty || video.currentTime !== this.lastForegroundVideoTime);
    if (!shouldRefresh) {
      this.context.drawImage(this.foregroundCanvas, 0, 0, this.width, this.height);
      return;
    }

    if (this.foregroundMaskDirty) {
      mctx.clearRect(0, 0, this.width, this.height);
      mctx.globalCompositeOperation = "source-over";
      for (const head of this.heads.values()) {
        const radiusX = head.radiusX * FOREGROUND_PEOPLE_CONFIG.bodyScaleX;
        const radiusY = head.radiusY * FOREGROUND_PEOPLE_CONFIG.bodyScaleY;
        const centerY = head.y + head.radiusY * FOREGROUND_PEOPLE_CONFIG.bodyOffsetY;
        mctx.save();
        mctx.translate(head.x, centerY);
        mctx.scale(radiusX, radiusY);
        const gradient = mctx.createRadialGradient(0, 0, 0, 0, 0, 1);
        gradient.addColorStop(0, "rgba(0, 0, 0, 1)");
        gradient.addColorStop(
          FOREGROUND_PEOPLE_CONFIG.featherStart,
          "rgba(0, 0, 0, 1)",
        );
        gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
        mctx.fillStyle = gradient;
        mctx.fillRect(-1, -1, 2, 2);
        mctx.restore();
      }
      this.foregroundMaskDirty = false;
    }

    const videoWidth = video.videoWidth;
    const videoHeight = video.videoHeight;
    const scale = Math.max(this.width / videoWidth, this.height / videoHeight);
    const drawnWidth = videoWidth * scale;
    const drawnHeight = videoHeight * scale;
    const offsetX = (this.width - drawnWidth) / 2;
    const offsetY = (this.height - drawnHeight) / 2;

    // 镜像绘制当前视频帧（与 colliderFromLandmarks 的 1-x 翻转及 CSS scaleX(-1) 一致）。
    fctx.clearRect(0, 0, this.width, this.height);
    fctx.save();
    fctx.translate(this.width, 0);
    fctx.scale(-1, 1);
    fctx.drawImage(video, offsetX, offsetY, drawnWidth, drawnHeight);
    fctx.restore();

    // 复用按人脸推理频率更新的柔边遮罩，只在视频层刷新时做一次合成。
    fctx.globalCompositeOperation = "destination-in";
    fctx.drawImage(this.foregroundMaskCanvas, 0, 0, this.width, this.height);
    fctx.globalCompositeOperation = "source-over";
    this.lastForegroundUpdateAt = now;
    this.lastForegroundVideoTime = video.currentTime;

    // 盖到主特效画布上，遮挡烟花。
    this.context.drawImage(this.foregroundCanvas, 0, 0, this.width, this.height);
  }

  /** Firework_Simulator 风格的清晰主星、彩色残影、白色亮芯与碎金珠点。 */
  private drawSimulatorSpark(
    ctx: CanvasRenderingContext2D,
    spark: Spark,
    remaining: number,
  ) {
    const fade = Math.pow(remaining, 0.72);
    const strobeVisible =
      !spark.simulatorStrobe ||
      spark.age < spark.life * 0.48 ||
      Math.floor((spark.age + spark.twinklePhase) * 19) % 3 === 0;
    const visibleScale = strobeVisible ? 1 : 0.08;

    this.traceSparkHistory(ctx, spark);
    ctx.globalAlpha = fade * 0.14 * visibleScale;
    ctx.strokeStyle = spark.glowColor;
    ctx.lineWidth = Math.max(0.9, spark.radius * spark.haloScale);
    ctx.stroke();

    this.traceSparkHistory(ctx, spark);
    ctx.globalAlpha = fade * 0.72 * visibleScale;
    ctx.strokeStyle = spark.color;
    ctx.lineWidth = Math.max(0.7, spark.radius * 0.88);
    ctx.stroke();

    // 参考双画布“彩色残影 + 当前白色主星”的观感，用短白芯强调高速星粒。
    const headEndX = spark.x + (spark.previousX - spark.x) * 1.8;
    const headEndY = spark.y + (spark.previousY - spark.y) * 1.8;
    ctx.beginPath();
    ctx.moveTo(spark.x, spark.y);
    ctx.lineTo(headEndX, headEndY);
    ctx.globalAlpha = fade * 0.96 * visibleScale;
    ctx.strokeStyle = spark.coreColor;
    ctx.lineWidth = Math.max(0.48, spark.radius * 0.34);
    ctx.stroke();

    if (spark.dottedTrail && spark.historyX && spark.historyY && strobeVisible) {
      for (let offset = 2; offset < spark.historyCount; offset += 3) {
        const index =
          (spark.historyCursor - 1 - offset + spark.historyX.length) %
          spark.historyX.length;
        const historyFade = 1 - offset / Math.max(1, spark.historyCount);
        ctx.globalAlpha = fade * historyFade * 0.58;
        ctx.fillStyle = spark.color;
        ctx.beginPath();
        ctx.arc(
          spark.historyX[index],
          spark.historyY[index],
          Math.max(0.38, spark.radius * 0.18),
          0,
          TWO_PI,
        );
        ctx.fill();
      }
    }

    ctx.globalAlpha = fade * visibleScale;
    ctx.fillStyle = spark.coreColor;
    ctx.beginPath();
    ctx.arc(spark.x, spark.y, Math.max(0.48, spark.radius * 0.3), 0, TWO_PI);
    ctx.fill();
  }

  private drawFineSpark(
    ctx: CanvasRenderingContext2D,
    spark: Spark,
    remaining: number,
  ) {
    const fade = Math.pow(remaining, 0.66);
    const twinkle = 0.84 + Math.sin(spark.age * 22 + spark.twinklePhase) * 0.16;

    if (spark.compoundTrail && spark.historyCount > 2) {
      const spread =
        spark.radius *
        (FINE_RENDER_CONFIG.compoundTrailSpreadMin +
          (FINE_RENDER_CONFIG.compoundTrailSpreadMax -
            FINE_RENDER_CONFIG.compoundTrailSpreadMin) *
            spark.compoundTrailSeed);
      const lengthScale =
        FINE_RENDER_CONFIG.compoundTrailLengthMin +
        (FINE_RENDER_CONFIG.compoundTrailLengthMax -
          FINE_RENDER_CONFIG.compoundTrailLengthMin) *
          spark.compoundTrailSeed;
      this.drawFineSideStrand(ctx, spark, spread, lengthScale, fade, twinkle);
      this.drawFineSideStrand(
        ctx,
        spark,
        -spread * 0.82,
        Math.min(1.2, lengthScale * 1.08),
        fade * 0.86,
        twinkle,
      );
    }

    this.traceSparkHistory(ctx, spark);
    ctx.globalAlpha = fade * 0.16;
    ctx.strokeStyle = spark.glowColor;
    ctx.lineWidth = Math.max(0.8, spark.radius * spark.haloScale * 0.82);
    ctx.stroke();

    this.traceSparkHistory(ctx, spark);
    ctx.globalAlpha = fade * 0.62;
    ctx.strokeStyle = spark.color;
    ctx.lineWidth = Math.max(0.7, spark.radius * FINE_RENDER_CONFIG.filamentWidth);
    ctx.stroke();

    this.traceSparkHistory(ctx, spark);
    ctx.globalAlpha = fade * 0.9 * twinkle;
    ctx.strokeStyle = spark.coreColor;
    ctx.lineWidth = Math.max(0.34, spark.radius * FINE_RENDER_CONFIG.filamentCoreWidth);
    ctx.stroke();

    this.traceSparkHistory(ctx, spark);
    ctx.globalAlpha = fade * 0.78 * twinkle;
    ctx.strokeStyle = SPLENDID_RENDER_CONFIG.highlightColor;
    ctx.lineWidth = Math.max(0.22, spark.radius * 0.075);
    ctx.stroke();

    // 亮头更短更锐利，避免精细烟花被画成粗胶囊。
    const headLength = 1.45 + spark.trailScale * 0.42;
    const headEndX = spark.x + (spark.previousX - spark.x) * headLength;
    const headEndY = spark.y + (spark.previousY - spark.y) * headLength;
    ctx.beginPath();
    ctx.moveTo(spark.x, spark.y);
    ctx.lineTo(headEndX, headEndY);
    ctx.globalAlpha = fade * 0.25;
    ctx.strokeStyle = spark.glowColor;
    ctx.lineWidth = Math.max(0.8, spark.radius * spark.headScale * 1.8);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(spark.x, spark.y);
    ctx.lineTo(headEndX, headEndY);
    ctx.globalAlpha = fade * 0.95 * twinkle;
    ctx.strokeStyle = SPLENDID_RENDER_CONFIG.highlightColor;
    ctx.lineWidth = Math.max(0.42, spark.radius * spark.headScale * 0.42);
    ctx.stroke();

    if (spark.dottedTrail && spark.historyX && spark.historyY) {
      for (let offset = 1; offset < spark.historyCount; offset += 1) {
        const index =
          (spark.historyCursor - 1 - offset + spark.historyX.length) %
          spark.historyX.length;
        const historyFade = 1 - offset / Math.max(1, spark.historyCount);
        const pearlRadius = Math.max(0.48, spark.radius * 0.16);
        ctx.globalAlpha = fade * historyFade * 0.28;
        ctx.fillStyle = spark.color;
        ctx.beginPath();
        ctx.arc(
          spark.historyX[index],
          spark.historyY[index],
          pearlRadius * FINE_RENDER_CONFIG.pearlHaloScale,
          0,
          TWO_PI,
        );
        ctx.fill();
        ctx.globalAlpha = fade * historyFade * 0.92;
        ctx.fillStyle = SPLENDID_RENDER_CONFIG.highlightColor;
        ctx.beginPath();
        ctx.arc(spark.historyX[index], spark.historyY[index], pearlRadius, 0, TWO_PI);
        ctx.fill();
      }
    }
  }

  private drawFineSideStrand(
    ctx: CanvasRenderingContext2D,
    spark: Spark,
    lateralOffset: number,
    lengthScale: number,
    fade: number,
    twinkle: number,
  ) {
    this.traceSparkHistory(ctx, spark, lateralOffset, lengthScale);
    ctx.globalAlpha = fade * 0.12;
    ctx.strokeStyle = spark.glowColor;
    ctx.lineWidth = Math.max(0.7, spark.radius * 1.35);
    ctx.stroke();

    this.traceSparkHistory(ctx, spark, lateralOffset, lengthScale);
    ctx.globalAlpha = fade * 0.48;
    ctx.strokeStyle = spark.color;
    ctx.lineWidth = Math.max(0.45, spark.radius * 0.42);
    ctx.stroke();

    this.traceSparkHistory(ctx, spark, lateralOffset, lengthScale);
    ctx.globalAlpha = fade * 0.86 * twinkle;
    ctx.strokeStyle = SPLENDID_RENDER_CONFIG.highlightColor;
    ctx.lineWidth = Math.max(0.24, spark.radius * 0.12);
    ctx.stroke();
  }

  private drawSplendidSpark(
    ctx: CanvasRenderingContext2D,
    spark: Spark,
    remaining: number,
  ) {
    const fade = Math.pow(remaining, 0.72);
    const twinkle = 0.82 + Math.sin(spark.age * 17 + spark.twinklePhase) * 0.18;

    if (spark.compoundTrail && spark.historyCount > 2) {
      const spread =
        spark.radius *
        (SPLENDID_RENDER_CONFIG.compoundTrailSpreadMin +
          (SPLENDID_RENDER_CONFIG.compoundTrailSpreadMax -
            SPLENDID_RENDER_CONFIG.compoundTrailSpreadMin) *
            spark.compoundTrailSeed);
      const lengthScale =
        SPLENDID_RENDER_CONFIG.compoundTrailLengthMin +
        (SPLENDID_RENDER_CONFIG.compoundTrailLengthMax -
          SPLENDID_RENDER_CONFIG.compoundTrailLengthMin) *
          spark.compoundTrailSeed;
      this.drawSplendidSideStrand(
        ctx,
        spark,
        spread,
        lengthScale,
        fade,
        twinkle,
      );
      this.drawSplendidSideStrand(
        ctx,
        spark,
        -spread * 0.86,
        Math.min(0.9, lengthScale * 1.08),
        fade * 0.88,
        twinkle,
      );
    }

    this.traceSparkHistory(ctx, spark);
    ctx.globalAlpha = fade * 0.12;
    ctx.strokeStyle = spark.glowColor;
    ctx.lineWidth = spark.radius * spark.haloScale;
    ctx.stroke();

    this.traceSparkHistory(ctx, spark);
    ctx.globalAlpha = fade * 0.52;
    ctx.strokeStyle = spark.color;
    ctx.lineWidth = spark.radius * 1.15;
    ctx.stroke();

    this.traceSparkHistory(ctx, spark);
    ctx.globalAlpha = fade * 0.82 * twinkle;
    ctx.strokeStyle = spark.coreColor;
    ctx.lineWidth = Math.max(0.6, spark.radius * 0.34);
    ctx.stroke();

    this.traceSparkHistory(ctx, spark);
    ctx.globalAlpha = fade * 0.66 * twinkle;
    ctx.strokeStyle = SPLENDID_RENDER_CONFIG.highlightColor;
    ctx.lineWidth = Math.max(0.32, spark.radius * 0.12);
    ctx.stroke();

    const headLength = 2.4 + spark.trailScale;
    const headEndX = spark.x + (spark.previousX - spark.x) * headLength;
    const headEndY = spark.y + (spark.previousY - spark.y) * headLength;
    ctx.beginPath();
    ctx.moveTo(spark.x, spark.y);
    ctx.lineTo(headEndX, headEndY);
    ctx.globalAlpha = fade * 0.14;
    ctx.strokeStyle = spark.glowColor;
    ctx.lineWidth = spark.radius * spark.headScale * 3.1;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(spark.x, spark.y);
    ctx.lineTo(headEndX, headEndY);
    ctx.globalAlpha = fade * 0.38;
    ctx.strokeStyle = spark.color;
    ctx.lineWidth = spark.radius * spark.headScale * 1.7;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(spark.x, spark.y);
    ctx.lineTo(headEndX, headEndY);
    ctx.globalAlpha = fade * twinkle;
    ctx.strokeStyle = spark.coreColor;
    ctx.lineWidth = spark.radius * spark.headScale * 0.72;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(spark.x, spark.y);
    ctx.lineTo(headEndX, headEndY);
    ctx.globalAlpha = fade * 0.78 * twinkle;
    ctx.strokeStyle = SPLENDID_RENDER_CONFIG.highlightColor;
    ctx.lineWidth = Math.max(0.42, spark.radius * spark.headScale * 0.2);
    ctx.stroke();

    if (spark.dottedTrail && spark.historyX && spark.historyY) {
      for (let offset = 1; offset < spark.historyCount; offset += 2) {
        const index =
          (spark.historyCursor - 1 - offset + spark.historyX.length) %
          spark.historyX.length;
        const historyFade = 1 - offset / Math.max(1, spark.historyCount);
        const pearlRadius = Math.max(0.7, spark.radius * 0.24);
        ctx.globalAlpha = fade * historyFade * 0.18;
        ctx.fillStyle = spark.color;
        ctx.beginPath();
        ctx.arc(
          spark.historyX[index],
          spark.historyY[index],
          pearlRadius * SPLENDID_RENDER_CONFIG.pearlHaloScale,
          0,
          TWO_PI,
        );
        ctx.fill();

        ctx.globalAlpha = fade * historyFade * 0.86;
        ctx.fillStyle = SPLENDID_RENDER_CONFIG.highlightColor;
        ctx.beginPath();
        ctx.arc(
          spark.historyX[index],
          spark.historyY[index],
          pearlRadius,
          0,
          TWO_PI,
        );
        ctx.fill();
      }
    }
  }

  private drawSplendidSideStrand(
    ctx: CanvasRenderingContext2D,
    spark: Spark,
    lateralOffset: number,
    lengthScale: number,
    fade: number,
    twinkle: number,
  ) {
    this.traceSparkHistory(ctx, spark, lateralOffset, lengthScale);
    ctx.globalAlpha = fade * 0.09;
    ctx.strokeStyle = spark.glowColor;
    ctx.lineWidth = spark.radius * 2.35;
    ctx.stroke();

    this.traceSparkHistory(ctx, spark, lateralOffset, lengthScale);
    ctx.globalAlpha = fade * 0.34;
    ctx.strokeStyle = spark.color;
    ctx.lineWidth = Math.max(0.7, spark.radius * 0.68);
    ctx.stroke();

    this.traceSparkHistory(ctx, spark, lateralOffset, lengthScale);
    ctx.globalAlpha = fade * 0.72 * twinkle;
    ctx.strokeStyle = SPLENDID_RENDER_CONFIG.highlightColor;
    ctx.lineWidth = Math.max(0.32, spark.radius * 0.16);
    ctx.stroke();
  }

  private traceSparkHistory(
    ctx: CanvasRenderingContext2D,
    spark: Spark,
    lateralOffset = 0,
    lengthScale = 1,
  ) {
    const movementX = spark.x - spark.previousX;
    const movementY = spark.y - spark.previousY;
    const movementLength = Math.hypot(movementX, movementY) || 1;
    const perpendicularX = -movementY / movementLength;
    const perpendicularY = movementX / movementLength;
    ctx.beginPath();
    ctx.moveTo(
      spark.x + perpendicularX * lateralOffset,
      spark.y + perpendicularY * lateralOffset,
    );
    if (!spark.historyX || !spark.historyY || spark.historyCount === 0) return;
    const pointCount = Math.max(
      1,
      Math.min(spark.historyCount, Math.ceil(spark.historyCount * lengthScale)),
    );
    for (let offset = 0; offset < pointCount; offset += 1) {
      const index =
        (spark.historyCursor - 1 - offset + spark.historyX.length) %
        spark.historyX.length;
      const tailProgress = offset / Math.max(1, pointCount - 1);
      const taperedOffset = lateralOffset * (1 - tailProgress * 0.74);
      ctx.lineTo(
        spark.historyX[index] + perpendicularX * taperedOffset,
        spark.historyY[index] + perpendicularY * taperedOffset,
      );
    }
  }

  private drawBurstBloom(ctx: CanvasRenderingContext2D, bloom: BurstBloom) {
    const progress = Math.min(1, bloom.age / bloom.life);
    const fade = (1 - progress) ** 1.8;
    const radius = bloom.radius * (0.42 + (1 - (1 - progress) ** 2) * 0.58);
    const gradient = ctx.createRadialGradient(
      bloom.x,
      bloom.y,
      0,
      bloom.x,
      bloom.y,
      radius,
    );
    gradient.addColorStop(0, SPLENDID_RENDER_CONFIG.highlightColor);
    gradient.addColorStop(0.18, bloom.coreColor);
    gradient.addColorStop(0.5, bloom.color);
    gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.globalAlpha = fade * SPLENDID_RENDER_CONFIG.burstBloomOpacity;
    ctx.fillStyle = gradient;
    ctx.fillRect(
      bloom.x - radius,
      bloom.y - radius,
      radius * 2,
      radius * 2,
    );
  }

  private drawImpactFlash(ctx: CanvasRenderingContext2D, flash: ImpactFlash) {
    const progress = Math.min(1, flash.age / flash.life);
    const fade = (1 - progress) ** 1.6;

    // 中心爆心柔光，模拟 fine 烟花的珠点光晕。
    const coreGlowRadius = Math.max(
      10,
      SPLENDID_SEQUENCE_CONFIG.impactFlashCoreGlowRadius *
        (0.55 + (1 - progress) * 1.95),
    );
    const coreGradient = ctx.createRadialGradient(
      flash.x,
      flash.y,
      0,
      flash.x,
      flash.y,
      coreGlowRadius,
    );
    coreGradient.addColorStop(0, flash.coreColor);
    coreGradient.addColorStop(0.4, flash.color);
    coreGradient.addColorStop(1, "rgba(0,0,0,0)");
    ctx.globalAlpha = fade * 0.5;
    ctx.fillStyle = coreGradient;
    ctx.beginPath();
    ctx.arc(flash.x, flash.y, coreGlowRadius, 0, TWO_PI);
    ctx.fill();

    for (const particle of flash.particles) {
      const px = flash.x + particle.vx * flash.age;
      const py = flash.y + particle.vy * flash.age;
      const twinkle =
        0.82 + Math.sin(flash.age * 24 + particle.twinklePhase) * 0.18;
      const headLength = 1.2;

      // 光晕层：粗线、半透明。
      this.traceImpactFlash(ctx, flash.x, flash.y, px, py, headLength);
      ctx.globalAlpha = fade * 0.16;
      ctx.strokeStyle = flash.glowColor;
      ctx.lineWidth = Math.max(
        0.9,
        particle.radius *
          SPLENDID_SEQUENCE_CONFIG.impactFlashHaloScale *
          0.3,
      );
      ctx.stroke();

      // 主体层。
      this.traceImpactFlash(ctx, flash.x, flash.y, px, py, headLength);
      ctx.globalAlpha = fade * 0.62;
      ctx.strokeStyle = flash.color;
      ctx.lineWidth = Math.max(
        0.7,
        particle.radius * SPLENDID_SEQUENCE_CONFIG.impactFlashBodyWidth,
      );
      ctx.stroke();

      // 亮芯层。
      this.traceImpactFlash(ctx, flash.x, flash.y, px, py, headLength);
      ctx.globalAlpha = fade * 0.9 * twinkle;
      ctx.strokeStyle = flash.coreColor;
      ctx.lineWidth = Math.max(0.34, particle.radius * 0.4);
      ctx.stroke();

      // 亮头：短促高光 + 珠点。
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(
        px + (particle.vx / (Math.hypot(particle.vx, particle.vy) || 1)) * headLength,
        py + (particle.vy / (Math.hypot(particle.vx, particle.vy) || 1)) * headLength,
      );
      ctx.globalAlpha = fade * 0.28;
      ctx.strokeStyle = flash.glowColor;
      ctx.lineWidth = Math.max(1.1, particle.radius * 2.6);
      ctx.stroke();
      ctx.globalAlpha = fade * 0.95 * twinkle;
      ctx.fillStyle = SPLENDID_RENDER_CONFIG.highlightColor;
      ctx.beginPath();
      ctx.arc(px, py, Math.max(0.7, particle.radius * 0.55), 0, TWO_PI);
      ctx.fill();
    }
  }

  private traceImpactFlash(
    ctx: CanvasRenderingContext2D,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    headLength: number,
  ) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const magnitude = Math.hypot(dx, dy) || 1;
    const headX = x1 + (dx / magnitude) * headLength;
    const headY = y1 + (dy / magnitude) * headLength;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(headX, headY);
  }

  private drawBackgroundMask() {
    const ctx = this.maskContext;
    if (!ctx) return;
    this.maskDirty = false;
    ctx.clearRect(0, 0, this.width, this.height);
    if (!BACKGROUND_MASK_CONFIG.enabled || BACKGROUND_MASK_CONFIG.opacity <= 0) return;

    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = BACKGROUND_MASK_CONFIG.opacity;
    ctx.fillStyle = BACKGROUND_MASK_CONFIG.color;
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "destination-out";

    for (const head of this.heads.values()) {
      const radiusX = head.radiusX * BACKGROUND_MASK_CONFIG.focusScaleX;
      const radiusY = head.radiusY * BACKGROUND_MASK_CONFIG.focusScaleY;
      const centerY = head.y + head.radiusY * BACKGROUND_MASK_CONFIG.focusOffsetY;
      ctx.save();
      ctx.translate(head.x, centerY);
      ctx.scale(radiusX, radiusY);
      const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      gradient.addColorStop(0, "rgba(0, 0, 0, 1)");
      gradient.addColorStop(BACKGROUND_MASK_CONFIG.featherStart, "rgba(0, 0, 0, 1)");
      gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = gradient;
      ctx.fillRect(-1, -1, 2, 2);
      ctx.restore();
    }

    ctx.globalCompositeOperation = "source-over";
  }

  private colliderFromLandmarks(
    id: number,
    landmarks: NormalizedLandmark[],
    videoWidth: number,
    videoHeight: number,
    now: number,
  ): HeadCollider {
    let minX = 1;
    let maxX = 0;
    let minY = 1;
    let maxY = 0;
    for (const landmark of landmarks) {
      minX = Math.min(minX, landmark.x);
      maxX = Math.max(maxX, landmark.x);
      minY = Math.min(minY, landmark.y);
      maxY = Math.max(maxY, landmark.y);
    }

    const scale = Math.max(this.width / videoWidth, this.height / videoHeight);
    const renderedWidth = videoWidth * scale;
    const renderedHeight = videoHeight * scale;
    const offsetX = (this.width - renderedWidth) / 2;
    const offsetY = (this.height - renderedHeight) / 2;
    const left = offsetX + (1 - maxX) * renderedWidth;
    const right = offsetX + (1 - minX) * renderedWidth;
    const top = offsetY + minY * renderedHeight;
    const bottom = offsetY + maxY * renderedHeight;

    return {
      id,
      x: (left + right) / 2,
      y: (top + bottom) / 2,
      radiusX: Math.max(
        HEAD_COLLISION_CONFIG.minRadiusX,
        (right - left) * HEAD_COLLISION_CONFIG.radiusScaleX,
      ),
      radiusY: Math.max(
        HEAD_COLLISION_CONFIG.minRadiusY,
        (bottom - top) * HEAD_COLLISION_CONFIG.radiusScaleY,
      ),
      lastSeenAt: now,
    };
  }

  private resizeCanvas(
    canvas: HTMLCanvasElement,
    context: CanvasRenderingContext2D,
    dpr: number,
  ) {
    canvas.width = Math.round(this.width * dpr);
    canvas.height = Math.round(this.height * dpr);
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
}
