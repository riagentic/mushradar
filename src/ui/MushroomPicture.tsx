// Side-view illustration of a species, drawn from its `look` proportions.
// Procedural SVG: same data that shapes the 3D mesh, no image assets.
import type { JSX } from "aio";
import type { CapShape, Species } from "../data/species.ts";
import { type Lang, speciesName } from "../i18n.ts";

const W = 120;
const H = 104;
const BASELINE = 84;
const CX = W / 2;
const K = 30;

/** Cap outline as an SVG path, centered on the stem top. */
const capPath = (
  shape: CapShape,
  capR: number,
  capH: number,
  base: number,
): string => {
  const top = base - capH;
  switch (shape) {
    case "funnel": {
      const rimY = base - capH * 0.55;
      return [
        `M ${CX - capR} ${rimY}`,
        `Q ${CX - capR} ${top}, ${CX} ${top}`,
        `Q ${CX + capR} ${top}, ${CX + capR} ${rimY}`,
        `Q ${CX} ${base - capH * 0.05}, ${CX - capR} ${rimY}`,
        "Z",
      ].join(" ");
    }
    case "bell":
      return [
        `M ${CX - capR} ${base}`,
        `C ${CX - capR} ${top - capH * 0.3}, ${CX + capR} ${
          top - capH * 0.3
        }, ${CX + capR} ${base}`,
        "Z",
      ].join(" ");
    case "umbrella":
      return [
        `M ${CX - capR} ${base - capH * 0.25}`,
        `Q ${CX - capR * 0.55} ${top}, ${CX} ${top - capH * 0.15}`,
        `Q ${CX + capR * 0.55} ${top}, ${CX + capR} ${base - capH * 0.25}`,
        `Q ${CX} ${base + capH * 0.15}, ${CX - capR} ${base - capH * 0.25}`,
        "Z",
      ].join(" ");
    case "flat":
      return [
        `M ${CX - capR} ${base}`,
        `Q ${CX} ${top + capH * 0.35}, ${CX + capR} ${base}`,
        `Q ${CX} ${base + capH * 0.2}, ${CX - capR} ${base}`,
        "Z",
      ].join(" ");
    case "convex":
    default:
      return [
        `M ${CX - capR} ${base}`,
        `C ${CX - capR} ${top}, ${CX + capR} ${top}, ${CX + capR} ${base}`,
        "Z",
      ].join(" ");
  }
};

export default function MushroomPicture(
  { species, lang }: { species: Species; lang: Lang },
): JSX.Element {
  const { look } = species;
  const stemH = look.stemH * K;
  const stemW = look.stemW * K * 0.5;
  const capR = look.capW * K * 0.55;
  const capH = Math.max(look.capH * K * 1.05, 12);
  const capBase = BASELINE - stemH;
  const stemTop = capBase + capH * 0.15;
  const bottomW = stemW * (look.bulb ? 1.35 : 1);

  return (
    <svg
      class="mush-pic"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={speciesName(species, lang)}
    >
      <defs>
        <radialGradient id="mush-bg" cx="50%" cy="35%" r="75%">
          <stop offset="0%" stop-color="#1d2b45" />
          <stop offset="100%" stop-color="#0c1424" />
        </radialGradient>
      </defs>
      <rect x="0" y="0" width={W} height={H} rx="10" fill="url(#mush-bg)" />
      <ellipse
        cx={CX}
        cy={BASELINE + 3}
        rx={capR * 1.15}
        ry={5}
        fill="#000"
        opacity="0.35"
      />

      <path
        d={`M ${CX - bottomW} ${BASELINE} L ${CX - stemW * 0.85} ${stemTop}
            L ${CX + stemW * 0.85} ${stemTop} L ${CX + bottomW} ${BASELINE} Z`}
        fill={look.stemColor}
        stroke="#00000033"
        stroke-width="1"
      />

      {look.ring && (
        <ellipse
          cx={CX}
          cy={capBase + stemH * 0.28}
          rx={stemW * 1.9}
          ry={stemW * 0.85}
          fill={look.stemColor}
          stroke="#00000033"
          stroke-width="1"
        />
      )}

      <ellipse
        cx={CX}
        cy={capBase + 1}
        rx={capR * 0.92}
        ry={capH * 0.28}
        fill={look.underColor}
      />

      <path
        d={capPath(look.cap, capR, capH, capBase)}
        fill={look.capColor}
        stroke="#00000044"
        stroke-width="1.2"
      />
      <path
        d={`M ${CX - capR * 0.55} ${capBase - capH * 0.55}
            Q ${CX} ${capBase - capH * 1.05}, ${CX + capR * 0.3} ${
          capBase - capH * 0.72
        }`}
        fill="none"
        stroke="#ffffff"
        stroke-width="2.2"
        stroke-linecap="round"
        opacity="0.28"
      />
    </svg>
  );
}
