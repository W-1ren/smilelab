# 效果配置指南

精简版只保留“自然暴雨”和“三重烟花”。日常参数在页面调整；识别、物理、蒙版、内部三层烟花与性能参数统一编辑 `app/config/effects.ts`。

## 页面快速设置

| 参数 | 默认值 | 作用 |
| --- | ---: | --- |
| 雨量 `rainDensity` | `500/s` | 下落雨滴的生成速率，也影响玻璃雨珠强度 |
| 雨滴粗细 `rainWidth` | `3.4px` | 前景透明雨滴的基础宽度 |
| 下落速度 `rainSpeed` | `600px/s` | 前景雨滴速度，也会轻微影响挂珠滑落速度 |
| 绽放密度 `fireworkDensity` | `70` | 三重烟花每枚爆点的目标主粒子数 |
| 火花粗细 `fireworkSize` | `1.8px` | 三类内部火花的统一基础线宽 |
| 展开速度 `fireworkSpeed` | `410px/s` | 主烟花炸开后的径向速度 |

页面值写入 `localStorage` 的 `final-smile-interaction:tuning:v1`。修改代码默认值后若页面仍显示旧数值，请点击“恢复推荐参数”或清除该站点存储。

## 自然暴雨

自然暴雨由两层组成：

1. `effects-engine.ts` 绘制透明、前宽后尖、有远近差异的下落雨滴。
2. `rain-glass-engine.ts` 用 WebGL 生成挂在镜头上的静态水珠、滑落大水珠、折射和轻柔焦。

雨滴不会检测头部碰撞，也不绘制屏幕底部水面、水花或涟漪。

### 常用高级参数

| 配置 | 参数 | 作用 |
| --- | --- | --- |
| `RAIN_STYLE` | `lineColor / highlightColor / shadowColor` | 透明水体、迎光边和背光边颜色 |
| `RAIN_STYLE` | `opacityMin / opacityMax` | 单滴透明度随机范围 |
| `RAIN_STYLE` | `lengthScale` | 整体长度倍率 |
| `RAIN_PHYSICS_CONFIG` | `length` | 下落雨滴基础长度 |
| `RAIN_PHYSICS_CONFIG` | `lengthVariationMin / Max` | 随机长度范围 |
| `RAIN_PHYSICS_CONFIG` | `farWidthScale / nearWidthScale` | 远景与近景宽度差 |
| `RAIN_PHYSICS_CONFIG` | `farSpeedScale / nearSpeedScale` | 远景与近景速度差 |
| `RAIN_PHYSICS_CONFIG` | `bodyOpacity` | 透明水体填充强度 |
| `RAIN_PHYSICS_CONFIG` | `refractionOpacity` | 桌面端下落雨滴内部的视频折射强度 |
| `RAIN_PHYSICS_CONFIG` | `wind / windVariance` | 风向与横向随机程度 |
| `RAIN_GLASS_CONFIG` | `dropScale` | 玻璃挂珠尺寸；越大水珠越大 |
| `RAIN_GLASS_CONFIG` | `speed` | 玻璃大水珠滑落速度 |
| `RAIN_GLASS_CONFIG` | `normalStrength` | 水珠内部折射位移 |
| `RAIN_GLASS_CONFIG` | `blurIntensity` | 镜头柔焦；`0` 关闭，`0.4–0.9` 为轻度 |
| `RAIN_GLASS_CONFIG` | `fadeInMs / fadeOutMs` | 玻璃水珠渐入、渐出时长 |
| `RAIN_GLASS_CONFIG` | `intensity` | 整体挂珠数量感和可见度 |

如果只改雨滴大小和速度，优先使用页面“粗细 / 速度”。若要改变长宽比，再调整 `length` 与远近倍率；挂在玻璃上的水珠是独立层，应改 `dropScale / speed`。

## 三重烟花

三重烟花不再是一个可选注册表。`TRIPLE_FIREWORK_LAYERS` 直接内联保存 `splendid / simulator / fine` 三个内部绘制层，面板和业务代码只能触发完整三重效果。

每次的固定顺序为：

```text
绚烂 → 精细 → 仿真 → 精细 → 绚烂 → 精细
     → 绚烂 → 仿真 → 精细 → 绚烂 → 精细
```

总数始终是 4 枚绚烂、2 枚仿真、5 枚精细。相邻火箭默认间隔约 `150ms`，三类烟花的横向槽位、目标高度和大小范围不同。

### 改首次炸开的主线条数量

最直接的方法是调整页面“绽放密度”。代码默认值位于：

```ts
DEFAULT_TUNING.fireworkDensity // 默认 70
```

三类实际目标数量还会分别乘以：

```ts
TRIPLE_FIREWORK_CONFIG.layers.splendid.densityScale // 0.9
TRIPLE_FIREWORK_CONFIG.layers.simulator.densityScale // 0.72
TRIPLE_FIREWORK_CONFIG.layers.fine.densityScale      // 0.46
```

三个 `layers.*.minParticles` 是预算紧张时每枚仍要保留的最低主线条数。移动端会使用内部质量倍率压缩每枚线条，但不会删掉 11 枚中的任何一枚。

### 配色、柔光和轨迹

| 配置 | 作用 |
| --- | --- |
| `colorRamps` | 每组颜色的外晕、主体、亮芯三层渐变感 |
| `colorOffsetCount` | 随机起始配色的循环长度 |
| `speedMin / speedMax` | 页面展开速度的随机倍率 |
| `lifeMin / lifeMax` | 主粒子寿命 |
| `gravityScale` | 下坠程度 |
| `trailScale` | 拖尾长度倍率 |
| `historyPoints / historySampleMs` | 轨迹缓存长度与采样间隔 |
| `headScale / haloScale` | 发光粒子头和柔光尺寸 |
| `dottedTrailEvery` | 珠点尾迹出现频率；数值越小越密 |
| `SPLENDID_RENDER_CONFIG` | 绚烂层复合侧轨迹与爆心柔光 |
| `FINE_RENDER_CONFIG` | 精细层细丝宽度、侧轨迹和向上扇射比例 |
| `SIMULATOR_FIREWORK_CONFIG` | 仿真层垂直升空、壳型比例、碎裂声与低碰撞延迟 |

### 时间、空间和人物避让

`TRIPLE_FIREWORK_CONFIG` 控制 11 枚火箭的完整编排：

- `launchOrder`：三类内部层的固定顺序。
- `launchIntervalMs / launchJitterMs`：发射间隔与极小随机错位。
- `layers.*.lanes`：每一类烟花的横向位置比例。
- `layers.*.targetTop / targetBottom`：爆点在屏幕高度中的范围。
- `layers.*.scaleMin / scaleMax`：每类烟花的尺寸范围。
- `targetSearchAttempts`：寻找避开全部人物和其他爆点的位置次数。
- `targetSeparationX / Y`：相邻爆点的安全间距。

升空火箭永远不碰撞头部。主烟花炸开后，绚烂/精细层先等待 `SPLENDID_SEQUENCE_CONFIG.postExplosionCollisionDelay`，仿真层等待 `SIMULATOR_FIREWORK_CONFIG.postExplosionCollisionDelay`，随后才允许部分主粒子碰撞。

碰撞后的上飞与二次闪光由 `SPLENDID_SEQUENCE_CONFIG` 控制：

- `impactFlashChance`：碰撞后进入二段闪光的概率。
- `impactFlightDurationMin / Max`：反弹上飞等待时长。
- `impactFlightSpeedMin / Max`：向上初速度。
- `impactFlightHorizontalSpeed`：横向散开速度。
- `impactFlightWobbleStrength / FreqMin / FreqMax`：上飞阶段横向正弦摆动的强度与频率范围，让轨迹柔和弯曲。
- `impactFlashParticles`：二次闪光的四散粒子数。
- `impactFlashParticleSpeedMin / Max`：四散粒子初速度范围。
- `impactFlashParticleGravityScale / DragPerFrame`：四散粒子的重力倍率与速度阻尼。
- `impactFlashHaloScale / BodyWidth`：四散粒子光晕与主体丝束线宽倍率。
- `impactFlashCoreGlowRadius / Life`：中心爆心柔光半径与整体寿命。

## 背景暗化和人物前景

`BACKGROUND_MASK_CONFIG` 先铺暗色蒙版，再按每张脸挖出羽化亮区：

| 参数 | 作用 |
| --- | --- |
| `enabled` | 背景蒙版总开关 |
| `color` | 蒙版颜色 |
| `opacity` | 背景暗度；越大越暗 |
| `focusScaleX / focusScaleY` | 人物透亮范围 |
| `focusOffsetY` | 亮区向肩部偏移量 |
| `featherStart` | 羽化开始位置 |

`FOREGROUND_PEOPLE_CONFIG` 控制“烟花在人物背后、雨在人物前面”的分层合成。人物遮挡视频层以桌面 30fps / 移动端 20fps 缓存，遮罩只随人脸位置更新。

## 多人和表情阈值

| 配置 | 作用 |
| --- | --- |
| `FACE_TRACKING_CONFIG.maxFaces` | 最多人脸数，默认 4 |
| `idMatchDistance / idSizePenalty` | 跨帧稳定 ID 匹配 |
| `EXPRESSION_THRESHOLDS.smileOn / smileOff` | 微笑进入与退出迟滞阈值 |
| `laughSmile / laughJawOpen` | 大笑需要的笑容与张嘴阈值 |
| `laughCooldownMs` | 每张脸独立的大笑冷却 |
| `HEAD_COLLISION_CONFIG` | 多个头部椭圆尺寸、跟随平滑与漏检宽限 |

同一帧多人笑会合并为一个场景级三重烟花；已有三重烟花尚未结束时不会继续叠加新一组。这是为了保证移动端稳定和每组 11 枚的完整性，不影响每张脸独立的表情判断。

## 性能参数

`PERFORMANCE_BUDGET` 分桌面与移动端两档：

- `maxParticlesDesktop / Mobile`：全部前景雨滴、火箭和主火花总量。
- `maxRainDesktop / Mobile`：下落雨滴单独上限。
- `inferenceFps / minInferenceFps`：桌面 AI 推理自适应范围。
- `mobileInferenceFps / mobileMinInferenceFps`：移动端 AI 推理范围。
- `devicePixelRatioCap / mobileDevicePixelRatioCap`：Canvas 像素比上限。
- `mobileHistoryPointScale`：移动端轨迹缓存缩短比例。

`RAIN_GLASS_CONFIG.mobileMaxFps / mobileResolutionScale` 只降低移动端 WebGL 内部刷新率与分辨率，不改变水珠的视觉参数。

调优时优先观察页面性能读数。如果低端手机掉帧，建议依次降低 `fireworkDensity`、`rainDensity`、`maxFaces`；不要移除粒子总上限或整组预留逻辑，否则会重新出现后续烟花残缺的问题。
