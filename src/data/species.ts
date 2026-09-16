// Edible mushrooms of Czech forests — ecology for the model, shape for the 3D
// symbol, and a compact card text. Numbers are conservative field-guide ranges.
export type ForestKind = "spruce" | "pine" | "beech" | "oak";
export type CapShape = "convex" | "flat" | "funnel" | "bell" | "umbrella";

export type Species = {
  id: string;
  cz: string;
  latin: string;
  en: string;
  /** affinity per forest kind, 0..1 */
  forest: Record<ForestKind, number>;
  /** preferred altitude band (m), soft ±150 m */
  alt: readonly [number, number];
  /** trapezoid on the 5-day mean air temperature (°C): zero, optLo, optHi, zero */
  temp: readonly [number, number, number, number];
  /** rain needed (mm) inside the lag window for a full flush */
  rainNeed: number;
  /** fruiting lag after rain (days): window [from, to] */
  lag: readonly [number, number];
  /** night minimum below which the flush is killed (°C) */
  frost: number;
  /** season as day-of-year window, soft ±15 days */
  season: readonly [number, number];
  /** topsoil moisture (m³/m³) mapping 0 → 1 */
  soil: readonly [number, number];
  info: string;
  infoCz: string;
  look: {
    cap: CapShape;
    capColor: string;
    stemColor: string;
    underColor: string;
    capW: number;
    capH: number;
    stemH: number;
    stemW: number;
    ring: boolean;
    bulb: boolean;
  };
};

export const SPECIES: readonly Species[] = [
  {
    id: "hrib-smrkovy",
    cz: "Hřib smrkový",
    latin: "Boletus edulis",
    en: "Penny bun / porcini",
    forest: { spruce: 1, pine: 0.55, beech: 0.7, oak: 0.6 },
    alt: [300, 1100],
    temp: [8, 12, 20, 26],
    rainNeed: 25,
    lag: [6, 14],
    frost: -2,
    season: [166, 304],
    soil: [0.17, 0.3],
    info:
      "King of Czech baskets. Brown cap, white net on a fat stem, pores white→yellow-green. Flushes 1–2 weeks after soaking rain when nights stay above ~8 °C. Under spruce, also beech and oak.",
    infoCz:
      "Král českých košíků. Hnědý klobouk, bílá síťka na tlustém třeni, póry bílé→žlutozelené. Roste 1–2 týdny po vydatném dešti, když noci zůstávají nad ~8 °C. Pod smrkem, též bukem a dubem.",
    look: {
      cap: "convex",
      capColor: "#7a4a22",
      stemColor: "#e8dcc2",
      underColor: "#d9d3a0",
      capW: 1,
      capH: 0.55,
      stemH: 1,
      stemW: 0.36,
      ring: false,
      bulb: true,
    },
  },
  {
    id: "hrib-dubovy",
    cz: "Hřib dubový",
    latin: "Boletus reticulatus",
    en: "Summer bolete",
    forest: { spruce: 0.15, pine: 0.2, beech: 0.7, oak: 1 },
    alt: [150, 650],
    temp: [12, 16, 24, 30],
    rainNeed: 20,
    lag: [5, 12],
    frost: 0,
    season: [140, 275],
    soil: [0.15, 0.28],
    info:
      "The warm-season porcini of oak and beech woods. Pale brown, finely cracked cap; net covers the whole stem. Likes warm humid weeks after thunderstorms.",
    infoCz:
      "Teplomilný hřib dubových a bukových lesů. Světle hnědý, jemně rozpraskaný klobouk; síťka pokrývá celý třeň. Má rád teplé vlhké týdny po bouřkách.",
    look: {
      cap: "convex",
      capColor: "#a5793f",
      stemColor: "#d8c9a6",
      underColor: "#e6e0b8",
      capW: 1,
      capH: 0.5,
      stemH: 1,
      stemW: 0.34,
      ring: false,
      bulb: true,
    },
  },
  {
    id: "hrib-kovar",
    cz: "Hřib kovář",
    latin: "Neoboletus luridiformis",
    en: "Scarletina bolete",
    forest: { spruce: 0.9, pine: 0.4, beech: 0.8, oak: 0.5 },
    alt: [300, 1200],
    temp: [8, 11, 19, 25],
    rainNeed: 22,
    lag: [5, 12],
    frost: -2,
    season: [150, 300],
    soil: [0.17, 0.3],
    info:
      "Dark velvety cap, red pores, yellow flesh that turns blue at a touch. Excellent once cooked well. Acid spruce and beech soils, from lowlands to the mountains.",
    infoCz:
      "Tmavý sametový klobouk, červené rourky, žlutá dužnina na řezu modrá. Výborný po důkladném tepelném zpracování. Kyselé smrčiny a bučiny, od nížin po hory.",
    look: {
      cap: "convex",
      capColor: "#3d2a1a",
      stemColor: "#c7a13a",
      underColor: "#b8412a",
      capW: 1,
      capH: 0.5,
      stemH: 1.05,
      stemW: 0.34,
      ring: false,
      bulb: true,
    },
  },
  {
    id: "kremenac",
    cz: "Křemenáč osikový",
    latin: "Leccinum aurantiacum",
    en: "Orange oak bolete",
    forest: { spruce: 0.4, pine: 0.5, beech: 0.45, oak: 0.8 },
    alt: [200, 800],
    temp: [8, 12, 20, 25],
    rainNeed: 20,
    lag: [5, 12],
    frost: -2,
    season: [160, 295],
    soil: [0.16, 0.29],
    info:
      "Bright orange cap, tall stem covered in dark scales. Grows with aspen, birch and oak on forest edges. Flesh darkens when cut — harmless.",
    infoCz:
      "Zářivě oranžový klobouk, vysoký třeň s tmavými šupinkami. Roste s osikou, břízou a dubem na okrajích lesů. Dužnina na řezu tmavne — neškodí.",
    look: {
      cap: "convex",
      capColor: "#d2622a",
      stemColor: "#dad4c4",
      underColor: "#e9e4d0",
      capW: 0.85,
      capH: 0.5,
      stemH: 1.35,
      stemW: 0.26,
      ring: false,
      bulb: false,
    },
  },
  {
    id: "kozak",
    cz: "Kozák březový",
    latin: "Leccinum scabrum",
    en: "Birch bolete",
    forest: { spruce: 0.5, pine: 0.6, beech: 0.35, oak: 0.5 },
    alt: [200, 900],
    temp: [7, 11, 19, 24],
    rainNeed: 18,
    lag: [4, 11],
    frost: -2,
    season: [160, 300],
    soil: [0.16, 0.29],
    info:
      "Soft brown cap on a slender scaly stem, always near birch. Comes up quickly after rain, even in wet summers. Best young; cap only when older.",
    infoCz:
      "Měkký hnědý klobouk na štíhlém šupinatém třeni, vždy poblíž břízy. Po dešti roste rychle, i ve vlhkých létech. Nejlepší mladý; starší jen klobouk.",
    look: {
      cap: "convex",
      capColor: "#8a6a4c",
      stemColor: "#e0dccf",
      underColor: "#eeeadb",
      capW: 0.8,
      capH: 0.45,
      stemH: 1.4,
      stemW: 0.22,
      ring: false,
      bulb: false,
    },
  },
  {
    id: "liska",
    cz: "Liška obecná",
    latin: "Cantharellus cibarius",
    en: "Chanterelle",
    forest: { spruce: 0.9, pine: 0.7, beech: 0.8, oak: 0.6 },
    alt: [300, 1000],
    temp: [10, 13, 21, 26],
    rainNeed: 30,
    lag: [8, 16],
    frost: -1,
    season: [170, 290],
    soil: [0.18, 0.31],
    info:
      "Egg-yellow funnel with blunt ridges running down the stem, apricot smell. Mossy spruce and beech slopes; slow to appear, then stays for weeks. Never wormy.",
    infoCz:
      "Vejcově žlutá nálevka s tupými lištami sbíhajícími na třeň, voní po meruňkách. Mechaté smrčiny a bučiny; objevuje se pomalu, pak vydrží týdny. Nikdy nebývá červivá.",
    look: {
      cap: "funnel",
      capColor: "#e9b52c",
      stemColor: "#e3b43a",
      underColor: "#d9a52a",
      capW: 0.8,
      capH: 0.45,
      stemH: 0.8,
      stemW: 0.24,
      ring: false,
      bulb: false,
    },
  },
  {
    id: "bedla",
    cz: "Bedla vysoká",
    latin: "Macrolepiota procera",
    en: "Parasol",
    forest: { spruce: 0.4, pine: 0.75, beech: 0.5, oak: 0.7 },
    alt: [150, 700],
    temp: [10, 14, 22, 27],
    rainNeed: 15,
    lag: [4, 10],
    frost: -1,
    season: [185, 300],
    soil: [0.14, 0.27],
    info:
      "Tall umbrella with a snakeskin stem and a movable ring. Grassy clearings, forest edges and pine woods. Fry the caps whole like a schnitzel.",
    infoCz:
      "Vysoký deštník s hadovitě vzorovaným třeněm a posuvným prstenem. Travnaté paseky, okraje lesů a borové porosty. Klobouky se smaží vcelku jako řízek.",
    look: {
      cap: "umbrella",
      capColor: "#c9b28c",
      stemColor: "#b39b7a",
      underColor: "#f2ede0",
      capW: 1.1,
      capH: 0.32,
      stemH: 1.7,
      stemW: 0.16,
      ring: true,
      bulb: true,
    },
  },
  {
    id: "klouzek",
    cz: "Klouzek obecný",
    latin: "Suillus luteus",
    en: "Slippery jack",
    forest: { spruce: 0.1, pine: 1, beech: 0.05, oak: 0.05 },
    alt: [150, 850],
    temp: [7, 11, 19, 24],
    rainNeed: 15,
    lag: [3, 10],
    frost: -3,
    season: [190, 315],
    soil: [0.14, 0.27],
    info:
      "Slimy chocolate cap with a ring, always under pine. The most reliable autumn mushroom in sandy pine woods; peel the cap skin before cooking.",
    infoCz:
      "Slizký čokoládový klobouk s prstenem, vždy pod borovicí. Nejspolehlivější podzimní houba v písčitých borech; před vařením sloupněte pokožku klobouku.",
    look: {
      cap: "convex",
      capColor: "#5a3a1e",
      stemColor: "#e2d7b0",
      underColor: "#e6d27a",
      capW: 0.85,
      capH: 0.42,
      stemH: 0.9,
      stemW: 0.26,
      ring: true,
      bulb: false,
    },
  },
  {
    id: "vaclavka",
    cz: "Václavka smrková",
    latin: "Armillaria ostoyae",
    en: "Honey fungus",
    forest: { spruce: 1, pine: 0.35, beech: 0.5, oak: 0.5 },
    alt: [250, 950],
    temp: [5, 9, 16, 21],
    rainNeed: 20,
    lag: [5, 12],
    frost: -3,
    season: [244, 320],
    soil: [0.17, 0.3],
    info:
      "Dense clusters on spruce stumps and roots, honey-brown scaly caps with a ring. A cool-autumn mushroom that appears in massive flushes; must be cooked thoroughly.",
    infoCz:
      "Husté trsy na smrkových pařezech a kořenech, medově hnědé šupinaté klobouky s prstenem. Chladnomilná podzimní houba rostoucí v obrovských trsech; nutno důkladně tepelně upravit.",
    look: {
      cap: "bell",
      capColor: "#b1843c",
      stemColor: "#b89a66",
      underColor: "#e8dcb4",
      capW: 0.7,
      capH: 0.5,
      stemH: 1.2,
      stemW: 0.2,
      ring: true,
      bulb: false,
    },
  },
  {
    id: "lisak",
    cz: "Lišák zprohýbaný",
    latin: "Hydnum repandum",
    en: "Hedgehog mushroom",
    forest: { spruce: 0.8, pine: 0.5, beech: 0.9, oak: 0.4 },
    alt: [300, 1000],
    temp: [4, 8, 16, 20],
    rainNeed: 20,
    lag: [7, 15],
    frost: -4,
    season: [225, 325],
    soil: [0.17, 0.3],
    info:
      "Cream irregular cap with tiny spines instead of gills. Late-season, frost-tolerant, in mossy spruce and beech woods. Has no poisonous look-alike.",
    infoCz:
      "Krémový nepravidelný klobouk s drobnými ostny místo lupenů. Pozdně sezónní, mrazuvzdorný, v mechatých smrčinách a bučinách. Nemá jedovatou podobu.",
    look: {
      cap: "flat",
      capColor: "#e6c99a",
      stemColor: "#efe3c8",
      underColor: "#f0dcb0",
      capW: 0.9,
      capH: 0.35,
      stemH: 0.8,
      stemW: 0.3,
      ring: false,
      bulb: false,
    },
  },
  {
    id: "ryzec",
    cz: "Ryzec pravý",
    latin: "Lactarius deliciosus",
    en: "Saffron milk cap",
    forest: { spruce: 0.35, pine: 1, beech: 0.05, oak: 0.05 },
    alt: [200, 850],
    temp: [6, 10, 18, 23],
    rainNeed: 18,
    lag: [5, 12],
    frost: -3,
    season: [215, 305],
    soil: [0.15, 0.28],
    info:
      "Orange funnel with darker rings, bleeds carrot-orange milk, bruises green. Young pine plantations after autumn rain. Best fried in butter.",
    infoCz:
      "Oranžová nálevka s tmavšími kruhy, roní mrkvově oranžové mléko, na dotek zelená. Mladé borové výsadby po podzimním dešti. Nejlepší na másle.",
    look: {
      cap: "funnel",
      capColor: "#d97a34",
      stemColor: "#e2a06a",
      underColor: "#e78d47",
      capW: 0.95,
      capH: 0.4,
      stemH: 0.7,
      stemW: 0.3,
      ring: false,
      bulb: false,
    },
  },
];

export const speciesById = (id: string): Species | undefined =>
  SPECIES.find((s) => s.id === id);
