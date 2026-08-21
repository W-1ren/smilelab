import type { EffectTuning } from "../config/effects";

type NumberKey = {
  [Key in keyof EffectTuning]: EffectTuning[Key] extends number ? Key : never;
}[keyof EffectTuning];

type Props = {
  open: boolean;
  tuning: EffectTuning;
  onChange: (tuning: EffectTuning) => void;
  onClose: () => void;
  onReset: () => void;
  onPreviewRain: () => void;
  onPreviewFirework: () => void;
};

function RangeControl({
  label,
  value,
  min,
  max,
  step,
  unit = "",
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="range-control">
      <span>
        <span>{label}</span>
        <output>{value}{unit}</output>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

export function TuningPanel({
  open,
  tuning,
  onChange,
  onClose,
  onReset,
  onPreviewRain,
  onPreviewFirework,
}: Props) {
  const setNumber = (key: NumberKey, value: number) => {
    onChange({ ...tuning, [key]: value });
  };

  return (
    <aside className={`tuning-panel ${open ? "is-open" : ""}`} aria-hidden={!open}>
      <div className="tuning-heading">
        <div>
          <p className="eyebrow">LIVE LAB</p>
          <h2>效果样式</h2>
        </div>
        <button className="icon-button" type="button" onClick={onClose} aria-label="关闭效果设置">
          ×
        </button>
      </div>

      <div className="tuning-scroll">
        <section className="tuning-section">
          <div className="section-title-row">
            <div>
              <span className="section-index">01</span>
              <h3>雨滴样式</h3>
            </div>
            <button className="mini-action" type="button" onClick={onPreviewRain}>预览</button>
          </div>

          <RangeControl label="雨量" value={tuning.rainDensity} min={18} max={600} step={2} unit="/s" onChange={(value) => setNumber("rainDensity", value)} />
          <RangeControl label="粗细" value={tuning.rainWidth} min={0.6} max={3.4} step={0.1} unit="px" onChange={(value) => setNumber("rainWidth", value)} />
          <RangeControl label="速度" value={tuning.rainSpeed} min={280} max={1200} step={20} unit="px/s" onChange={(value) => setNumber("rainSpeed", value)} />
        </section>

        <section className="tuning-section">
          <div className="section-title-row">
            <div>
              <span className="section-index">02</span>
              <h3>烟花样式</h3>
            </div>
            <button className="mini-action" type="button" onClick={onPreviewFirework}>预览</button>
          </div>

          <RangeControl label="绽放密度" value={tuning.fireworkDensity} min={28} max={120} step={4} onChange={(value) => setNumber("fireworkDensity", value)} />
          <RangeControl label="火花粗细" value={tuning.fireworkSize} min={1} max={4.4} step={0.1} unit="px" onChange={(value) => setNumber("fireworkSize", value)} />
          <RangeControl label="展开速度" value={tuning.fireworkSpeed} min={180} max={680} step={10} unit="px/s" onChange={(value) => setNumber("fireworkSpeed", value)} />
        </section>

        <button className="reset-button" type="button" onClick={onReset}>恢复推荐参数</button>
      </div>
    </aside>
  );
}
