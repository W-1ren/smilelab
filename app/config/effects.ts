/**
 * Final Smile Interaction 集中配置
 *
 * 对外只保留“自然暴雨”和“三重烟花”。三重烟花内部的三套绘制参数直接定义在
 * TRIPLE_FIREWORK_LAYERS 中，不再作为独立可选样式暴露。
 */

export type TripleFireworkKind = "splendid" | "fine" | "simulator";

export type FireworkColorRampDefinition = {
  glow: string;
  body: string;
  core: string;
};

export type FireworkLayerDefinition = {
  /** 每组火花的外晕、主体、亮芯颜色。 */
  colorRamps: readonly FireworkColorRampDefinition[];
  /** 随机起始色的循环长度；用于保留当前配色分布。 */
  colorOffsetCount: number;
  /** 页面“展开速度”的随机最小倍率。 */
  speedMin: number;
  /** 页面“展开速度”的随机最大倍率。 */
  speedMax: number;
  /** 主火花最短寿命，单位秒。 */
  lifeMin: number;
  /** 主火花最长寿命，单位秒。 */
  lifeMax: number;
  /** 全局重力对该层的倍率。 */
  gravityScale: number;
  /** 轨迹长度倍率。 */
  trailScale: number;
  /** 每颗火花保存的历史坐标数量。 */
  historyPoints: number;
  /** 历史坐标采样间隔，单位毫秒。 */
  historySampleMs: number;
  /** 发光粒子头尺寸倍率。 */
  headScale: number;
  /** 粒子外围柔光倍率。 */
  haloScale: number;
  /** 每隔多少颗粒子绘制珠点尾迹；0 表示关闭。 */
  dottedTrailEvery: number;
  /** 覆盖全局头部碰撞抽样概率。 */
  headCollisionChance?: number;
};

/** 唯一雨效的外观；数值与原项目“自然暴雨”一致。 */
export const RAIN_STYLE = {
  /** 近乎透明的雨体填充色。 */
  lineColor: "rgba(239, 248, 252, 0.16)",
  /** 雨滴迎光侧高光。 */
  highlightColor: "rgba(255, 255, 255, 0.76)",
  /** 雨滴背光侧暗边。 */
  shadowColor: "rgba(7, 25, 34, 0.3)",
  /** 单滴最小透明度。 */
  opacityMin: 0.34,
  /** 单滴最大透明度。 */
  opacityMax: 0.78,
  /** 相对基础长度的整体倍率。 */
  lengthScale: 1.08,
} as const;

/** 三重烟花内部三层视觉，不会出现在设置面板中。 */
export const TRIPLE_FIREWORK_LAYERS = {
  splendid: {
    colorRamps: [
      { glow: "#a4331f", body: "#e65f2b", core: "#a98c65" },
      { glow: "#8e4724", body: "#ee9148", core: "#877657" },
      { glow: "#a67e42", body: "#d9ae66", core: "#d0c295" },
      { glow: "#8d8068", body: "#ead9b9", core: "#959188" },
      { glow: "#8b4038", body: "#d47a67", core: "#9f8172" },
      { glow: "#625d3d", body: "#afa56e", core: "#8c8663" },
      { glow: "#6d685f", body: "#bbb4a7", core: "#a7a194" },
    ],
    colorOffsetCount: 7,
    speedMin: 0.46,
    speedMax: 1.86,
    lifeMin: 2.15,
    lifeMax: 3.8,
    gravityScale: 1.0,
    trailScale: 1.55,
    historyPoints: 20,
    historySampleMs: 10,
    headScale: 1.7,
    haloScale: 10.8,
    dottedTrailEvery: 3,
  },
  fine: {
    colorRamps: [
      { glow: "#3c548b", body: "#749f9e", core: "#8c91aa" },
      { glow: "#3f5f96", body: "#6a8393", core: "#a3a2bb" },
      { glow: "#6b7280", body: "#798995", core: "#828e99" },
      { glow: "#456ead", body: "#7acbf4", core: "#858c9e" },
    ],
    colorOffsetCount: 5,
    speedMin: 0.48,
    speedMax: 0.58,
    lifeMin: 2.45,
    lifeMax: 2.55,
    gravityScale: 0.56,
    trailScale: 1.34,
    historyPoints: 16,
    historySampleMs: 10,
    headScale: 1.35,
    haloScale: 1.2,
    dottedTrailEvery: 2,
  },
  simulator: {
    colorRamps: [
      { glow: "#625d3d", body: "#afa56e", core: "#8c8663" },
      { glow: "#6d685f", body: "#bbb4a7", core: "#a7a194" },
      { glow: "#8b633c", body: "#fffdf5", core: "#ffffff" },
      { glow: "#966c3f", body: "#fff1cd", core: "#fffaf0" },
      { glow: "#6b7280", body: "#dce9f3", core: "#f9fcff" },
      { glow: "#9a5a36", body: "#f4b77a", core: "#fff1d6" },
    ],
    colorOffsetCount: 6,
    speedMin: 0.62,
    speedMax: 0.84,
    lifeMin: 3.45,
    lifeMax: 4.55,
    gravityScale: 0.72,
    trailScale: 1.24,
    historyPoints: 10,
    historySampleMs: 42,
    headScale: 1.08,
    haloScale: 5.3,
    dottedTrailEvery: 2,
    headCollisionChance: 0.96,
  },
} as const satisfies Record<TripleFireworkKind, FireworkLayerDefinition>;

export const SPLENDID_RENDER_CONFIG = {
  /** 每隔多少颗绚烂粒子增加一组复合侧轨迹。 */
  compoundTrailEvery: 5,
  /** 侧轨迹最小横向间距。 */
  compoundTrailSpreadMin: 1.35,
  /** 侧轨迹最大横向间距。 */
  compoundTrailSpreadMax: 2.65,
  /** 侧轨迹相对主轨迹的最小长度。 */
  compoundTrailLengthMin: 0.58,
  /** 侧轨迹相对主轨迹的最大长度。 */
  compoundTrailLengthMax: 0.84,
  /** 绚烂烟花的暖白高光色。 */
  highlightColor: "#c3bab2",
  /** 爆心柔光寿命，单位秒。 */
  burstBloomLife: 0.56,
  /** 爆心柔光基础半径。 */
  burstBloomRadius: 62,
  /** 爆心柔光透明度。 */
  burstBloomOpacity: 0.32,
  /** 珠点外围光晕倍率。 */
  pearlHaloScale: 15.1,
} as const;

export const FINE_RENDER_CONFIG = {
  /** 每隔多少颗精细粒子增加复合侧轨迹。 */
  compoundTrailEvery: 2,
  /** 精细侧轨迹最小间距。 */
  compoundTrailSpreadMin: 1.05,
  /** 精细侧轨迹最大间距。 */
  compoundTrailSpreadMax: 2.15,
  /** 精细侧轨迹最小长度倍率。 */
  compoundTrailLengthMin: 0.72,
  /** 精细侧轨迹最大长度倍率。 */
  compoundTrailLengthMax: 1.12,
  /** 精细丝束主体线宽倍率。 */
  filamentWidth: 0.52,
  /** 精细丝束中心亮芯线宽倍率。 */
  filamentCoreWidth: 0.16,
  /** 精细珠点外围光晕倍率。 */
  pearlHaloScale: 8.5,
  /** 混入向上喷泉方向的粒子比例。 */
  fountainChance: 0.28,
  /** 喷泉扇面的半角，单位弧度。 */
  fountainArc: 0.62,
} as const;

export const SIMULATOR_FIREWORK_CONFIG = {
  /** 仿真火箭最小升空速度。 */
  rocketSpeedMin: 860,
  /** 仿真火箭最大升空速度。 */
  rocketSpeedMax: 1040,
  /** 竖直发射通道相对头宽的安全倍率。 */
  launchPathPaddingX: 2.65,
  /** 爆点相对头宽的横向避让倍率。 */
  targetPaddingX: 1.2,
  /** 爆点相对头高的纵向避让倍率。 */
  targetPaddingY: 1.2,
  /** 两条仿真发射通道的最小屏宽间距。 */
  launchLaneGap: 0.31,
  /** 仿真主爆炸后解锁碰撞的延迟秒数。 */
  postExplosionCollisionDelay: 0.82,
  /** 圆环壳型的累计概率边界；其后为闪烁壳型。菊花与棕榈已停用。 */
  ringEnd: 0.5,
} as const;

type TripleLayerPlan = {
  /** 每一枚该层烟花的横向屏宽比例。 */
  lanes: readonly number[];
  /** 爆点允许的屏高比例范围。 */
  targetTop: number;
  targetBottom: number;
  /** 与其他爆点计算间距时的尺寸倍率。 */
  targetSeparationScale: number;
  /** 单枚烟花的随机尺寸范围。 */
  scaleMin: number;
  scaleMax: number;
  /** 相对页面“绽放密度”的倍率。 */
  densityScale: number;
  /** 预算紧张时每枚仍保留的最低主粒子数。 */
  minParticles: number;
};

/** 每次触发严格交错发射 4 枚绚烂splendid、2 枚仿真simulator、5 枚精细fine。 */
export const TRIPLE_FIREWORK_CONFIG = {
  /** 14 枚火箭的固定交错顺序。 */
  launchOrder: [
    "splendid",
    "fine","fine","fine",
    "simulator","simulator",
    "fine",
    "splendid",
    "fine",
    "splendid",
    "simulator",
    "fine","fine",
    "splendid",
    "fine",
  ] as const satisfies readonly TripleFireworkKind[],
  /** 相邻火箭的基础发射间隔。 */
  launchIntervalMs: 40,
  /** 让节奏不机械的微小随机延迟。 */
  launchJitterMs: 40,
  /** 三个内部层各自的空间、尺寸与粒子计划。 */
  layers: {
    splendid: {
      lanes: [0.14, 0.32, 0.7, 0.84],
      targetTop: 0.16,
      targetBottom: 0.29,
      targetSeparationScale: 1,
      scaleMin: 0.5,
      scaleMax: 0.9,
      densityScale: 1.9,
      minParticles: 18,
    },
    simulator: {
      lanes: [0.3, 0.39, 0.72],
      targetTop: 0.12,
      targetBottom: 0.27,
      targetSeparationScale: 0.84,
      scaleMin: 0.99,
      scaleMax: 1.06,
      densityScale: 0.72,
      minParticles: 20,
    },
    fine: {
      lanes: [0.12, 0.18, 0.29, 0.45, 0.55, 0.69, 0.86, 0.88],
      targetTop: 0.08,
      targetBottom: 0.34,
      targetSeparationScale: 0.62,
      scaleMin: 0.36,
      scaleMax: 0.56,
      densityScale: 0.46,
      minParticles: 20,
    },
  } as const satisfies Record<TripleFireworkKind, TripleLayerPlan>,
  /** 每个爆点寻找空旷位置的最多尝试次数。 */
  targetSearchAttempts: 28,
  /** 爆点之间的横向安全间距。 */
  targetSeparationX: 0.1,
  /** 爆点之间的纵向安全间距。 */
  targetSeparationY: 0.08,
} as const;

/** 页面只保留雨和三重烟花各自的密度、尺寸、速度。 */
export type EffectTuning = {
  /** 每秒期望生成的前景雨滴数。 */
  rainDensity: number;
  /** 前景雨滴基础下落速度。 */
  rainSpeed: number;
  /** 前景透明雨滴基础宽度。 */
  rainWidth: number;
  /** 主烟花展开速度。 */
  fireworkSpeed: number;
  /** 每枚烟花的期望主粒子数量。 */
  fireworkDensity: number;
  /** 烟花粒子基础线宽。 */
  fireworkSize: number;
};

/** 与原项目当前配置保持一致。 */
export const DEFAULT_TUNING: EffectTuning = {
  rainDensity: 500,
  rainSpeed: 600,
  rainWidth: 3.4,
  fireworkSpeed: 410,
  fireworkDensity: 70,
  fireworkSize: 1.8,
};

export const FACE_TRACKING_CONFIG = {
  /** 同时推理的最大人脸数。 */
  maxFaces: 4,
  /** MediaPipe 人脸检测、存在和跟踪置信度。 */
  minFaceDetectionConfidence: 0.55,
  minFacePresenceConfidence: 0.55,
  minTrackingConfidence: 0.5,
  /** 跨帧 ID 匹配允许的中心距离。 */
  idMatchDistance: 0.24,
  /** 人脸尺寸变化在 ID 匹配分数中的权重。 */
  idSizePenalty: 0.35,
  /** 人脸漏检后保留稳定 ID 的时间。 */
  idRetentionMs: 700,
} as const;

export const BACKGROUND_MASK_CONFIG = {
  /** 背景暗化总开关。 */
  enabled: true,
  /** 蒙版颜色。 */
  color: "#020508",
  /** 背景暗度，数值越高越暗。 */
  opacity: 0.2,
  /** 人物透亮椭圆相对头部的横纵范围。 */
  focusScaleX: 1.05,
  focusScaleY: 1.75,
  /** 透亮区域向肩部下移的头高倍率。 */
  focusOffsetY: 0.68,
  /** 透亮区域开始羽化的位置。 */
  featherStart: 0.5,
} as const;

export const RAIN_PHYSICS_CONFIG = {
  /** 前景雨滴基础长度和随机长短范围。 */
  length: 34,
  lengthVariationMin: 0.72,
  lengthVariationMax: 1.34,
  /** 随机景深的最远取值。 */
  depthMin: 0.06,
  /** 远近雨滴的速度倍率。 */
  farSpeedScale: 1.8,
  nearSpeedScale: 2.5,
  /** 远近雨滴的长度倍率。 */
  farLengthScale: 0.56,
  nearLengthScale: 1.28,
  /** 远近雨滴的宽度倍率。 */
  farWidthScale: 0.9,
  nearWidthScale: 2,
  /** 透明雨体、暗边和高光的绘制强度。 */
  bodyOpacity: 0.10,
  shadowEdgeOpacity: 0.2,
  highlightEdgeOpacity: 0.58,
  /** 桌面端下落雨滴内部的视频折射强度与偏移。 */
  refractionOpacity: 0.28,
  refractionOffsetX: 2.2,
  refractionOffsetY: -1.2,
  /** 横向风速。负数向左，正数向右。 */
  wind: -72,
  /** WebGL 不可用时的 Canvas 挂珠数量上限。 */
  screenDropletsMax: 60,
  /** Canvas 挂珠生成间隔范围，单位秒。 */
  screenDropletIntervalMin: 0.28,
  screenDropletIntervalMax: 0.78,
  /** Canvas 挂珠寿命范围，单位秒。 */
  screenDropletLifeMin: 2.2,
  screenDropletLifeMax: 5.8,
  /** WebGL 不可用时施加到摄像头的模糊像素。 */
  glassBlurPx: 1.8,
  /** Canvas 挂珠的亮暗边对比度。 */
  glassDropletContrast: 5.45,
  /** 页面雨速的单滴随机倍率。 */
  speedMin: 0.78,
  speedMax: 1.18,
  /** 风速随机变化比例。 */
  windVariance: 0.8,
} as const;

export const RAIN_GLASS_CONFIG = {
  /** WebGL 写实玻璃雨珠总开关。 */
  enabled: true,
  /** 触发与停止后的透明度过渡时间。 */
  fadeInMs: 1820,
  fadeOutMs: 1820,
  /** 水珠高度场的整体强度。 */
  intensity: 0.42,
  /** 页面雨量映射到水珠强度时的基准值。 */
  densityReference: 180,
  /** 玻璃大水珠基础滑落速度。 */
  speed: 0.38,
  /** 页面雨速映射到滑落速度时的基准值。 */
  speedReference: 820,
  /** 玻璃上全部水珠的尺寸倍率。 */
  dropScale: 0.8,
  /** 水珠法线造成的背景折射强度。 */
  normalStrength: 0.042,
  /** 水珠内部的镜头柔焦程度。 */
  blurIntensity: 0.798,
  /** 桌面端最大刷新率与内部渲染比例。 */
  maxFps: 30,
  resolutionScale: 0.72,
  /** WebGL 画布像素比上限。 */
  pixelRatioCap: 2,
  /** 移动端只降低内部刷新率，采样分辨率与桌面一致，避免人物被低分辨率拉伸变形。 */
  mobileMaxFps: 24,
  mobileResolutionScale: 0.72,
} as const;

export const FIREWORK_PHYSICS_CONFIG = {
  /** 主火花向下重力，单位 px/s²。 */
  gravity: 50,
  /** 火花碰撞头部后的反弹系数。 */
  bounce: 0.22,
  /** 烟花与全部头部碰撞的总开关。 */
  collisionEnabled: true,
  /** 绚烂/精细主粒子参与碰撞的抽样概率。 */
  headCollisionScatterChance: 0.6,
  /** 按 60fps 计算的单帧速度阻尼。 */
  dragPerFrame: 0.98,
} as const;

export const FOREGROUND_PEOPLE_CONFIG = {
  /** 是否把实时人物盖回烟花上方。 */
  enabled: false,
  /** 人物遮挡椭圆相对头部的横纵范围。 */
  bodyScaleX: 1.6,
  bodyScaleY: 1.6,
  /** 遮挡中心向身体方向的偏移。 */
  bodyOffsetY: 0.7,
  /** 遮挡椭圆的羽化起点。 */
  featherStart: 1.0,
} as const;

export const SPLENDID_SEQUENCE_CONFIG = {
  /** 绚烂/精细火箭升空速度范围。 */
  rocketSpeedMin: 760,
  rocketSpeedMax: 980,
  /** 爆点相对全部人物的横纵避让倍率。 */
  targetAvoidancePaddingX: 1.15,
  targetAvoidancePaddingY: 1.7,
  /** 主爆炸完成初始展开后解锁头部碰撞的时间。 */
  postExplosionCollisionDelay: 0.2,
  /** 命中头部后进入二段上飞闪光的概率。 */
  impactFlashChance: 0.7,
  /** 二段上飞等待时长范围，单位秒。 */
  impactFlightDurationMin: 0.06,
  impactFlightDurationMax: 0.12,
  /** 二段上飞的初速度范围。 */
  impactFlightSpeedMin: 10,
  impactFlightSpeedMax: 25,
  /** 二段上飞时的最大横向随机速度。 */
  impactFlightHorizontalSpeed: 12,
  /** 二段上飞按 60fps 计算的速度阻尼。 */
  impactFlightDragPerFrame: 0.3,
  /** 二段上飞使用的重力倍率。 */
  impactFlightGravityScale: 2.6,
  /** 上飞阶段横向摆动强度，让反弹轨迹柔和弯曲。 */
  impactFlightWobbleStrength: 1060,
  /** 上飞阶段横向摆动频率范围。 */
  impactFlightWobbleFreqMin: 2.5,
  impactFlightWobbleFreqMax: 5,
  /** 单帧最多创建的二次闪光数。 */
  maxImpactFlashesPerFrame: 1,
  /** 二次闪光的四散粒子数。 */
  impactFlashParticles: 14,
  /** 二次闪光粒子的初速度范围。 */
  impactFlashParticleSpeedMin: 99,
  impactFlashParticleSpeedMax: 270,
  /** 二次闪光粒子的半径范围。 */
  impactFlashParticleRadiusMin: 0.9,
  impactFlashParticleRadiusMax: 0.95,
  /** 二次闪光粒子受的重力倍率。 */
  impactFlashParticleGravityScale: 0.3,
  /** 二次闪光粒子按 60fps 计算的速度阻尼。 */
  impactFlashParticleDragPerFrame: 0.9,
  /** 二次闪光粒子的光晕倍率。 */
  impactFlashHaloScale: 5,
  /** 二次闪光粒子的主体丝束线宽倍率。 */
  impactFlashBodyWidth: 1.5,
  /** 二次闪光中心爆心柔光半径。 */
  impactFlashCoreGlowRadius: 10,
  /** 二次闪光寿命。 */
  impactFlashLife: 1.42,
} as const;

export const HEAD_COLLISION_CONFIG = {
  /** 关键点包围盒转换成碰撞椭圆的横纵倍率。 */
  radiusScaleX: 0.90,
  radiusScaleY: 0.95,
  /** 碰撞椭圆的最小横纵半径。 */
  minRadiusX: 28,
  minRadiusY: 36,
  /** 每次识别更新向新位置靠近的比例。 */
  positionLerp: 0.32,
  /** 短暂漏检后继续保留碰撞体的时间。 */
  colliderGraceMs: 180,
} as const;

export const EXPRESSION_SMOOTHING_CONFIG = {
  /** 看见人脸时新分数进入指数平滑的比例。 */
  visibleFactor: 0.28,
  /** 漏检时表情分数的衰减比例。 */
  missingFactor: 0.12,
} as const;

export const CAMERA_CONFIG = {
  /** 桌面端摄像头理想/最大分辨率和帧率。 */
  idealWidth: 1280,
  maxWidth: 1280,
  idealHeight: 720,
  maxHeight: 720,
  idealFps: 30,
  maxFps: 30,
  /** 移动端摄像头理想/最大分辨率和帧率。 */
  mobileIdealWidth: 960,
  mobileMaxWidth: 960,
  mobileIdealHeight: 540,
  mobileMaxHeight: 540,
  mobileIdealFps: 24,
  mobileMaxFps: 24,
  /** user 表示优先前置摄像头。 */
  facingMode: "user" as const,
} as const;

export const PREVIEW_CONFIG = {
  /** 手动雨预览持续时间。 */
  rainDurationMs: 3400,
  /** 手动烟花预览的“大笑”徽章持续时间。 */
  laughBadgeDurationMs: 900,
} as const;

export const EXPRESSION_THRESHOLDS = {
  /** 进入与退出微笑的迟滞阈值。 */
  smileOn: 0.38,
  smileOff: 0.25,
  /** 触发大笑所需的笑容和张嘴分数。 */
  laughSmile: 0.57,
  laughJawOpen: 0.28,
  /** 同一张脸两次大笑触发的冷却时间。 */
  laughCooldownMs: 1150,
  /** 短暂漏检时继续保持表情状态的时间。 */
  missingFaceGraceMs: 260,
} as const;

/** 桌面保留原有预算；移动端降低绘制成本，并为三重烟花预留空间。 */
export const PERFORMANCE_BUDGET = {
  /** 小屏或低核设备进入移动质量档的宽度阈值。 */
  compactBreakpoint: 760,
  /** CPU 逻辑核心数不高于该值时也进入移动质量档。 */
  lowCoreThreshold: 4,
  /** 桌面 AI 推理的目标与最低自适应帧率。 */
  inferenceFps: 18,
  minInferenceFps: 10,
  /** 移动端 AI 推理的目标与最低自适应帧率。 */
  mobileInferenceFps: 12,
  mobileMinInferenceFps: 8,
  /** 用上一帧推理耗时估算下一次推理间隔的余量。 */
  inferenceCostMultiplier: 1.35,
  /** 桌面与移动端全部前景粒子的上限。 */
  maxParticlesDesktop: 520,
  maxParticlesMobile: 260,
  /** 桌面与移动端下落雨滴的独立上限。 */
  maxRainDesktop: 180,
  maxRainMobile: 72,
  /** 桌面与移动端主 Canvas 的像素比上限。 */
  devicePixelRatioCap: 1.5,
  mobileDevicePixelRatioCap: 1,
  /** 系统要求“减少动态效果”时的粒子倍率。 */
  reducedMotionParticleScale: 0.48,
  /** 减少动态效果时的粒子下限；必须不低于一组三重烟花的最低预算（11 枚火箭 + 各层最小粒子 212 = 223），否则雨滴让位后仍无法触发烟花。 */
  reducedMotionMinimumParticles: 240,
  /** 移动端单枚烟花的内部粒子倍率；不会减少 11 枚火箭。 */
  mobileFireworkParticleScale: 0.48,
  /** 移动端火花历史轨迹保留比例。 */
  mobileHistoryPointScale: 0.62,
  /** 人物遮挡离屏层在桌面与移动端的分辨率倍率。 */
  foregroundResolutionScaleDesktop: 1,
  foregroundResolutionScaleMobile: 0.6,
  /** 人物前景视频遮挡层在桌面与移动端的刷新率。 */
  foregroundFpsDesktop: 30,
  foregroundFpsMobile: 20,
  /** 性能读数和表情 UI 的最短刷新间隔。 */
  uiStatsIntervalMs: 800,
  uiExpressionIntervalMs: 160,
} as const;

export const TUNING_STORAGE_KEY = "final-smile-interaction:tuning:v1";
