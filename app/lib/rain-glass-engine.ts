import { RAIN_GLASS_CONFIG } from "../config/effects";

const VERTEX_SHADER = `
attribute vec2 a_position;
varying vec2 v_uv;

void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

/**
 * 程序化玻璃雨珠：静态小水珠 + 滑落大水珠形成高度场，邻域高度差用于折射摄像头。
 * 只做 5 次纹理采样的轻柔焦，避免参考实现中最高 64 次采样对移动端造成压力。
 */
const FRAGMENT_SHADER = `
precision highp float;

varying vec2 v_uv;
uniform sampler2D u_video;
uniform vec2 u_resolution;
uniform vec2 u_video_resolution;
uniform float u_time;
uniform float u_intensity;
uniform float u_speed;
uniform float u_drop_scale;
uniform float u_normal_strength;
uniform float u_blur_intensity;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec2 hash22(vec2 p) {
  float n = hash12(p);
  return vec2(n, hash12(p + n + 19.19));
}

float staticDrops(vec2 uv, float scale, float seed) {
  vec2 gridUv = uv * scale;
  vec2 cell = floor(gridUv);
  vec2 local = fract(gridUv) - 0.5;
  vec2 random = hash22(cell + seed);
  vec2 center = (random - 0.5) * 0.7;
  float radius = mix(0.075, 0.24, hash12(cell + seed * 2.31));
  vec2 delta = local - center;
  delta.y *= mix(0.82, 1.28, random.y);
  float body = 1.0 - smoothstep(radius * 0.38, radius, length(delta));
  float visibility = smoothstep(0.12, 0.92, hash12(cell + seed * 4.73));
  return body * visibility;
}

float movingDrops(vec2 uv, vec2 grid, float seed) {
  vec2 gridUv = uv * grid;
  vec2 cell = floor(gridUv);
  vec2 local = fract(gridUv) - 0.5;
  vec2 random = hash22(cell + seed);
  float phase = fract(u_time * u_speed * mix(0.28, 0.62, random.y) + random.x);
  float headY = 0.72 - phase * 1.44;
  float headX = (random.x - 0.5) * 0.68;
  headX += sin((uv.y + random.y) * 22.0) * 0.025;
  float radius = mix(0.11, 0.235, hash12(cell + seed * 5.17));

  vec2 delta = local - vec2(headX, headY);
  delta.y *= 0.82;
  float head = 1.0 - smoothstep(radius * 0.28, radius, length(delta));

  float aboveHead = local.y - headY;
  float trailWidth = radius * mix(0.22, 0.48, random.y);
  float trail = 1.0 - smoothstep(0.0, trailWidth, abs(local.x - headX));
  trail *= smoothstep(0.0, 0.045, aboveHead);
  trail *= 1.0 - smoothstep(0.08, 0.62, aboveHead);
  trail *= 0.28 + random.y * 0.34;

  float beadY = headY + 0.17 + fract(random.x * 5.0) * 0.22;
  vec2 beadDelta = local - vec2(headX, beadY);
  float bead = 1.0 - smoothstep(radius * 0.12, radius * 0.52, length(beadDelta));
  return max(head, max(trail, bead * 0.55));
}

float dropField(vec2 uv) {
  float aspect = u_resolution.x / max(1.0, u_resolution.y);
  vec2 rainUv = vec2((uv.x - 0.5) * aspect + 0.5, uv.y);
  rainUv = (rainUv - 0.5) / max(0.2, u_drop_scale) + 0.5;

  float smallA = staticDrops(rainUv, 38.0, 7.0);
  float smallB = staticDrops(rainUv + vec2(0.17, 0.09), 67.0, 31.0);
  float movingA = movingDrops(rainUv, vec2(8.0, 2.25), 13.0);
  float movingB = movingDrops(rainUv * 1.34, vec2(7.0, 2.0), 47.0);

  float field = smallA * 0.68 + smallB * 0.38 + movingA + movingB * 0.72;
  return smoothstep(0.12, 0.92, field * u_intensity);
}

vec2 coverVideoUv(vec2 uv) {
  float screenAspect = u_resolution.x / max(1.0, u_resolution.y);
  float videoAspect = u_video_resolution.x / max(1.0, u_video_resolution.y);
  vec2 result = uv;
  if (videoAspect > screenAspect) {
    result.x = (result.x - 0.5) * (screenAspect / videoAspect) + 0.5;
  } else {
    result.y = (result.y - 0.5) * (videoAspect / screenAspect) + 0.5;
  }
  result.x = 1.0 - result.x;
  return result;
}

void main() {
  vec2 pixel = 1.0 / max(u_resolution, vec2(1.0));
  float height = dropField(v_uv);
  float heightX = dropField(v_uv + vec2(pixel.x * 1.4, 0.0));
  float heightY = dropField(v_uv + vec2(0.0, pixel.y * 1.4));
  vec2 gradient = vec2(heightX - height, heightY - height);
  vec2 refractedUv = v_uv + gradient * u_normal_strength;
  vec2 videoUv = coverVideoUv(refractedUv);

  vec2 blurStep = pixel * u_blur_intensity;
  vec3 color = texture2D(u_video, videoUv).rgb * 0.4;
  color += texture2D(u_video, coverVideoUv(refractedUv + vec2(blurStep.x, 0.0))).rgb * 0.15;
  color += texture2D(u_video, coverVideoUv(refractedUv - vec2(blurStep.x, 0.0))).rgb * 0.15;
  color += texture2D(u_video, coverVideoUv(refractedUv + vec2(0.0, blurStep.y))).rgb * 0.15;
  color += texture2D(u_video, coverVideoUv(refractedUv - vec2(0.0, blurStep.y))).rgb * 0.15;

  float edge = smoothstep(0.002, 0.032, length(gradient));
  vec2 normal = normalize(gradient + vec2(0.0001));
  float highlight = max(0.0, dot(normal, normalize(vec2(-0.62, 0.78))));
  color += vec3(0.20, 0.23, 0.25) * highlight * edge * height;
  color -= vec3(0.075, 0.082, 0.09) * (1.0 - highlight) * edge * height;
  color *= 1.0 - height * 0.025;

  gl_FragColor = vec4(color, 1.0);
}
`;

type UniformLocations = {
  video: WebGLUniformLocation | null;
  resolution: WebGLUniformLocation | null;
  videoResolution: WebGLUniformLocation | null;
  time: WebGLUniformLocation | null;
  intensity: WebGLUniformLocation | null;
  speed: WebGLUniformLocation | null;
  dropScale: WebGLUniformLocation | null;
  normalStrength: WebGLUniformLocation | null;
  blurIntensity: WebGLUniformLocation | null;
};

export class RainGlassEngine {
  private readonly gl: WebGLRenderingContext | null;
  private readonly program: WebGLProgram | null = null;
  private readonly texture: WebGLTexture | null = null;
  private readonly buffer: WebGLBuffer | null = null;
  private readonly uniforms: UniformLocations | null = null;
  private readonly positionAttribute: number | null = null;
  private video: HTMLVideoElement | null = null;
  private enabled = false;
  private lastRenderAt = 0;
  private uploadedVideoWidth = 0;
  private uploadedVideoHeight = 0;
  private uploadedVideoTime = -1;

  readonly available: boolean;

  get canRender() {
    return Boolean(
      this.available &&
        this.video &&
        this.video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
        this.video.videoWidth > 0 &&
        this.video.videoHeight > 0,
    );
  }

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly compactDevice = false,
  ) {
    // 由集中配置驱动 CSS 透明度过渡；关闭时保留最后一帧，交给 CSS 平滑淡出。
    canvas.style.setProperty("--rain-glass-fade-in", `${RAIN_GLASS_CONFIG.fadeInMs}ms`);
    canvas.style.setProperty("--rain-glass-fade-out", `${RAIN_GLASS_CONFIG.fadeOutMs}ms`);

    if (!RAIN_GLASS_CONFIG.enabled) {
      this.gl = null;
      this.available = false;
      return;
    }

    const gl = canvas.getContext("webgl", {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
    });
    this.gl = gl;
    if (!gl) {
      this.available = false;
      return;
    }

    const vertexShader = this.compileShader(gl.VERTEX_SHADER, VERTEX_SHADER);
    const fragmentShader = this.compileShader(gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    if (!vertexShader || !fragmentShader) {
      this.available = false;
      return;
    }

    const program = gl.createProgram();
    if (!program) {
      this.available = false;
      return;
    }
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      gl.deleteProgram(program);
      this.available = false;
      return;
    }
    this.program = program;

    const buffer = gl.createBuffer();
    const texture = gl.createTexture();
    if (!buffer || !texture) {
      gl.deleteProgram(program);
      this.available = false;
      return;
    }
    this.buffer = buffer;
    this.texture = texture;

    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW,
    );
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      1,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array([0, 0, 0, 255]),
    );

    this.uniforms = {
      video: gl.getUniformLocation(program, "u_video"),
      resolution: gl.getUniformLocation(program, "u_resolution"),
      videoResolution: gl.getUniformLocation(program, "u_video_resolution"),
      time: gl.getUniformLocation(program, "u_time"),
      intensity: gl.getUniformLocation(program, "u_intensity"),
      speed: gl.getUniformLocation(program, "u_speed"),
      dropScale: gl.getUniformLocation(program, "u_drop_scale"),
      normalStrength: gl.getUniformLocation(program, "u_normal_strength"),
      blurIntensity: gl.getUniformLocation(program, "u_blur_intensity"),
    };
    this.positionAttribute = gl.getAttribLocation(program, "a_position");
    this.available = true;
  }

  attachVideo(video: HTMLVideoElement | null) {
    this.video = video;
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled && this.available;
    if (!this.enabled) this.canvas.classList.remove("is-active");
  }

  resize(cssWidth: number, cssHeight: number) {
    if (!this.gl || !this.available) return;
    const scale =
      Math.min(window.devicePixelRatio || 1, RAIN_GLASS_CONFIG.pixelRatioCap) *
      (this.compactDevice
        ? RAIN_GLASS_CONFIG.mobileResolutionScale
        : RAIN_GLASS_CONFIG.resolutionScale);
    const width = Math.max(1, Math.round(cssWidth * scale));
    const height = Math.max(1, Math.round(cssHeight * scale));
    if (this.canvas.width !== width) this.canvas.width = width;
    if (this.canvas.height !== height) this.canvas.height = height;
    this.gl.viewport(0, 0, width, height);
  }

  render(now: number, rainDensity: number, rainSpeed: number) {
    const gl = this.gl;
    const video = this.video;
    if (
      !this.enabled ||
      !this.available ||
      !gl ||
      !this.program ||
      !this.buffer ||
      !this.texture ||
      !this.uniforms ||
      !video ||
      video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
      video.videoWidth <= 0 ||
      video.videoHeight <= 0
    ) {
      return;
    }

    const maxFps = this.compactDevice
      ? RAIN_GLASS_CONFIG.mobileMaxFps
      : RAIN_GLASS_CONFIG.maxFps;
    const interval = 1000 / Math.max(1, maxFps);
    if (now - this.lastRenderAt < interval) return;
    this.lastRenderAt = now - ((now - this.lastRenderAt) % interval);

    gl.useProgram(this.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    if (this.positionAttribute === null || this.positionAttribute < 0) return;
    gl.enableVertexAttribArray(this.positionAttribute);
    gl.vertexAttribPointer(this.positionAttribute, 2, gl.FLOAT, false, 0, 0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    try {
      if (video.currentTime !== this.uploadedVideoTime) {
        if (
          video.videoWidth !== this.uploadedVideoWidth ||
          video.videoHeight !== this.uploadedVideoHeight
        ) {
          gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.RGBA,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            video,
          );
          this.uploadedVideoWidth = video.videoWidth;
          this.uploadedVideoHeight = video.videoHeight;
        } else {
          gl.texSubImage2D(
            gl.TEXTURE_2D,
            0,
            0,
            0,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            video,
          );
        }
        this.uploadedVideoTime = video.currentTime;
      }
    } catch {
      this.canvas.classList.remove("is-active");
      return;
    }

    const densityScale = Math.min(
      1.35,
      Math.max(0.35, rainDensity / RAIN_GLASS_CONFIG.densityReference),
    );
    const speedScale = Math.min(
      1.6,
      Math.max(0.45, rainSpeed / RAIN_GLASS_CONFIG.speedReference),
    );
    gl.uniform1i(this.uniforms.video, 0);
    gl.uniform2f(this.uniforms.resolution, this.canvas.width, this.canvas.height);
    gl.uniform2f(
      this.uniforms.videoResolution,
      video.videoWidth,
      video.videoHeight,
    );
    gl.uniform1f(this.uniforms.time, now / 1000);
    gl.uniform1f(
      this.uniforms.intensity,
      RAIN_GLASS_CONFIG.intensity * densityScale,
    );
    gl.uniform1f(this.uniforms.speed, RAIN_GLASS_CONFIG.speed * speedScale);
    gl.uniform1f(this.uniforms.dropScale, RAIN_GLASS_CONFIG.dropScale);
    // 移动端把折射与镜头柔焦减半，保持画面锐利，避免人物被糊化变形。
    gl.uniform1f(
      this.uniforms.normalStrength,
      RAIN_GLASS_CONFIG.normalStrength * (this.compactDevice ? 0.5 : 1),
    );
    gl.uniform1f(
      this.uniforms.blurIntensity,
      RAIN_GLASS_CONFIG.blurIntensity * (this.compactDevice ? 0.45 : 1),
    );
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    this.canvas.classList.add("is-active");
  }

  destroy() {
    this.canvas.classList.remove("is-active");
    if (!this.gl) return;
    if (this.texture) this.gl.deleteTexture(this.texture);
    if (this.buffer) this.gl.deleteBuffer(this.buffer);
    if (this.program) this.gl.deleteProgram(this.program);
  }

  private compileShader(type: number, source: string) {
    const gl = this.gl;
    if (!gl) return null;
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }
}
