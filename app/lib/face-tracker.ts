import {
  FaceLandmarker,
  FilesetResolver,
  type NormalizedLandmark,
} from "@mediapipe/tasks-vision";
import { FACE_TRACKING_CONFIG } from "../config/effects";

const MEDIAPIPE_VERSION = "1.0.1";
const WASM_ROOT = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;

/** MediaPipe C++ 层经 WASM stderr 输出到 console.error 的无害日志特征。 */
const MEDIAPIPE_NOISE_PATTERNS = [
  "face_landmarker_graph",
  "gl_context",
  "XNNPACK",
  "TensorFlow Lite",
  "xnnpack",
  "Sets FaceBlendshapesGraph",
];

let mediaPipeLogFilterInstalled = false;

/**
 * 拦截 MediaPipe WASM 内部经 stderr 打印的日志。
 * MediaPipe 的 C++ 日志（包括 Warning/Info）会通过 Emscripten 的
 * `_fd_write` -> `put_char` -> console.error 输出，导致浏览器左下角
 * 把无害的初始化提示显示成报错。这里只吞掉已知的 MediaPipe 噪声，
 * 其余 console 输出原样透传。
 */
function installMediaPipeLogFilter() {
  if (mediaPipeLogFilterInstalled) return;
  mediaPipeLogFilterInstalled = true;

  const isNoise = (args: unknown[]) =>
    args.some((arg) => {
      const text = typeof arg === "string" ? arg : String(arg ?? "");
      return MEDIAPIPE_NOISE_PATTERNS.some((pattern) => text.includes(pattern));
    });

  const originalError = console.error.bind(console);
  const originalWarn = console.warn.bind(console);
  console.error = (...args) => {
    if (isNoise(args)) return;
    originalError(...args);
  };
  console.warn = (...args) => {
    if (isNoise(args)) return;
    originalWarn(...args);
  };
}

export type TrackedFace = {
  id: number;
  smile: number;
  jawOpen: number;
  landmarks: NormalizedLandmark[];
};

export type FaceFrame = {
  faces: TrackedFace[];
};

type RawFace = Omit<TrackedFace, "id"> & {
  centerX: number;
  centerY: number;
  scale: number;
};

type FaceTrack = {
  id: number;
  centerX: number;
  centerY: number;
  scale: number;
  lastSeenAt: number;
};

function faceCenter(landmarks: NormalizedLandmark[]) {
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

  return {
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
    scale: Math.hypot(maxX - minX, maxY - minY),
  };
}

export class FaceTracker {
  private landmarker: FaceLandmarker | null = null;
  private tracks = new Map<number, FaceTrack>();
  private nextFaceId = 1;

  async load(modelUrl: string) {
    installMediaPipeLogFilter();
    const files = await FilesetResolver.forVisionTasks(WASM_ROOT);
    const sharedOptions = {
      baseOptions: { modelAssetPath: modelUrl, delegate: "GPU" as const },
      runningMode: "VIDEO" as const,
      numFaces: FACE_TRACKING_CONFIG.maxFaces,
      minFaceDetectionConfidence: FACE_TRACKING_CONFIG.minFaceDetectionConfidence,
      minFacePresenceConfidence: FACE_TRACKING_CONFIG.minFacePresenceConfidence,
      minTrackingConfidence: FACE_TRACKING_CONFIG.minTrackingConfidence,
      outputFaceBlendshapes: true,
      outputFacialTransformationMatrixes: false,
    };

    try {
      this.landmarker = await FaceLandmarker.createFromOptions(files, sharedOptions);
    } catch {
      this.landmarker = await FaceLandmarker.createFromOptions(files, {
        ...sharedOptions,
        baseOptions: { ...sharedOptions.baseOptions, delegate: "CPU" },
      });
    }
  }

  detect(video: HTMLVideoElement, timestamp: number): FaceFrame {
    if (!this.landmarker || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      return { faces: [] };
    }

    const result = this.landmarker.detectForVideo(video, timestamp);
    const rawFaces: RawFace[] = result.faceLandmarks.map((landmarks, faceIndex) => {
      const center = faceCenter(landmarks);
      let smileLeft = 0;
      let smileRight = 0;
      let jawOpen = 0;
      for (const category of result.faceBlendshapes[faceIndex]?.categories ?? []) {
        if (category.categoryName === "mouthSmileLeft") smileLeft = category.score;
        else if (category.categoryName === "mouthSmileRight") smileRight = category.score;
        else if (category.categoryName === "jawOpen") jawOpen = category.score;
      }
      return {
        landmarks,
        smile: (smileLeft + smileRight) / 2,
        jawOpen,
        ...center,
      };
    });

    return { faces: this.assignStableIds(rawFaces, timestamp) };
  }

  close() {
    this.landmarker?.close();
    this.landmarker = null;
    this.tracks.clear();
    this.nextFaceId = 1;
  }

  private assignStableIds(rawFaces: RawFace[], timestamp: number): TrackedFace[] {
    for (const [id, track] of this.tracks) {
      if (timestamp - track.lastSeenAt > FACE_TRACKING_CONFIG.idRetentionMs) {
        this.tracks.delete(id);
      }
    }

    const candidates: Array<{ rawIndex: number; trackId: number; distance: number }> = [];
    rawFaces.forEach((face, rawIndex) => {
      for (const track of this.tracks.values()) {
        const centerDistance = Math.hypot(
          face.centerX - track.centerX,
          face.centerY - track.centerY,
        );
        if (centerDistance <= FACE_TRACKING_CONFIG.idMatchDistance) {
          const sizePenalty =
            Math.abs(face.scale - track.scale) * FACE_TRACKING_CONFIG.idSizePenalty;
          candidates.push({
            rawIndex,
            trackId: track.id,
            distance: centerDistance + sizePenalty,
          });
        }
      }
    });
    candidates.sort((left, right) => left.distance - right.distance);

    const assignments = new Map<number, number>();
    const claimedTracks = new Set<number>();
    for (const candidate of candidates) {
      if (assignments.has(candidate.rawIndex) || claimedTracks.has(candidate.trackId)) continue;
      assignments.set(candidate.rawIndex, candidate.trackId);
      claimedTracks.add(candidate.trackId);
    }

    return rawFaces.map((face, rawIndex) => {
      const id = assignments.get(rawIndex) ?? this.nextFaceId++;
      this.tracks.set(id, {
        id,
        centerX: face.centerX,
        centerY: face.centerY,
        scale: face.scale,
        lastSeenAt: timestamp,
      });
      return {
        id,
        smile: face.smile,
        jawOpen: face.jawOpen,
        landmarks: face.landmarks,
      };
    });
  }
}
