import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const projectRoot = new URL("../", import.meta.url);
const source = (path) => readFile(new URL(path, projectRoot), "utf8");

test("static build contains the camera experience", async () => {
  const html = await source("out/index.html");
  assert.match(html, /<title>Smile Interaction/);
  assert.match(html, /笑一下/);
  assert.match(html, /打开摄像头/);
  assert.match(html, /视频不会上传或保存/);
  await access(new URL("out/models/face_landmarker.task", projectRoot));
});

test("keeps only natural rain and the fixed triple firework", async () => {
  const [experience, engine, expression, panel, config, packageJson] =
    await Promise.all([
      source("app/SmileExperience.tsx"),
      source("app/lib/effects-engine.ts"),
      source("app/lib/expression.ts"),
      source("app/components/TuningPanel.tsx"),
      source("app/config/effects.ts"),
      source("package.json"),
    ]);

  assert.match(experience, /getUserMedia/);
  assert.match(experience, /FaceTracker/);
  assert.match(experience, /burstForFaces/);
  assert.match(engine, /reservedSparkCount/);
  assert.match(engine, /升空火箭只负责到达爆点，始终不参与头部碰撞/);
  assert.match(engine, /resolveHeadCollision/);
  assert.match(expression, /laughCooldownMs/);
  assert.match(panel, /固定效果 · 自然暴雨/);
  assert.match(panel, /固定效果 · 三重烟花/);
  assert.doesNotMatch(panel, /<select/);

  const launchOrder = config.match(/launchOrder:\s*\[([\s\S]*?)\]\s*as const/);
  assert.ok(launchOrder, "triple firework launch order should be present");
  const values = launchOrder[1].match(/"(splendid|simulator|fine)"/g) ?? [];
  assert.equal(values.filter((value) => value === '"splendid"').length, 4);
  assert.equal(values.filter((value) => value === '"simulator"').length, 2);
  assert.equal(values.filter((value) => value === '"fine"').length, 5);
  assert.doesNotMatch(config, /RAIN_STYLES|FIREWORK_STYLES/);
  assert.doesNotMatch(packageJson, /vinext|wrangler|drizzle|rainy-day|tailwind/);
});
