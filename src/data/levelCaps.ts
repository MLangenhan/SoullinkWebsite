import { getLang } from '@/lib/i18n'

// Level-Caps pro Spiel. Einträge ohne Level sind Zwischenüberschriften. Cap = höchstes Level im Team des
// Gegners beim ersten Kampf. Gen 1–4 geprüft gegen die Trainerdaten der pret-Disassemblies (pokered,
// pokeyellow, pokecrystal, pokeruby, pokeemerald, pokefirered, pokediamond, pokeplatinum, pokeheartgold);
// Gen 5 und 6 stammen aus dem Discord-Bot und sind noch ungeprüft.
// versionGroup: welche Attacken- und Entwicklungsdaten (public/dex/<versionGroup>.json) dazu passen.
// Wichtig: Die Zahl und Reihenfolge der Einträge nicht ändern, laufende Challenges speichern den Index.

export interface LevelCap {
  /** Deutsch, z. B. „Orden 1 – Viola City (Falk)“ */
  label: string
  /** Englisch, z. B. „Badge 1 – Violet City (Falkner)“ */
  labelEn: string
  level: number | null
}

export interface LevelCapPreset {
  key: string
  name: string
  versionGroup: string
  gameNames: string[]
  caps: LevelCap[]
}

/** Ort und Person, jeweils [deutsch, englisch] */
type Name = [string, string]

const badge = (n: number, place: Name, leader: Name, level: number): LevelCap => ({
  label: `Orden ${n} – ${place[0]} (${leader[0]})`,
  labelEn: `Badge ${n} – ${place[1]} (${leader[1]})`,
  level,
})
const gym = (place: Name, leader: Name, level: number): LevelCap => ({
  label: `${place[0]} (${leader[0]})`,
  labelEn: `${place[1]} (${leader[1]})`,
  level,
})
const elite = (n: number, member: Name, level: number): LevelCap => ({
  label: `Top Vier ${n} – ${member[0]}`,
  labelEn: `Elite Four ${n} – ${member[1]}`,
  level,
})
const champ = (champion: Name, level: number): LevelCap => ({
  label: `Champ – ${champion[0]}`,
  labelEn: `Champion – ${champion[1]}`,
  level,
})
const heading = (de: string, en: string): LevelCap => ({ label: de, labelEn: en, level: null })

/** Arenen, Top Vier und Champ: je acht, vier und ein Level */
const league = (badges: [Name, Name][], gyms: number[], elites: Name[], e4: number[], champion: Name, championLevel: number) => [
  ...badges.map(([place, leader], i) => badge(i + 1, place, leader, gyms[i])),
  ...elites.map((member, i) => elite(i + 1, member, e4[i])),
  champ(champion, championLevel),
]

// Kanto
const KANTO_BADGES: [Name, Name][] = [
  [['Marmoria City', 'Pewter City'], ['Rocko', 'Brock']],
  [['Azuria City', 'Cerulean City'], ['Misty', 'Misty']],
  [['Orania City', 'Vermilion City'], ['Major Bob', 'Lt. Surge']],
  [['Prismania City', 'Celadon City'], ['Erika', 'Erika']],
  [['Fuchsania City', 'Fuchsia City'], ['Koga', 'Koga']],
  [['Saffronia City', 'Saffron City'], ['Sabrina', 'Sabrina']],
  [['Zinnoberinsel', 'Cinnabar Island'], ['Pyro', 'Blaine']],
  [['Vertania City', 'Viridian City'], ['Giovanni', 'Giovanni']],
]
const KANTO_ELITE: Name[] = [['Lorelei', 'Lorelei'], ['Bruno', 'Bruno'], ['Agathe', 'Agatha'], ['Siegfried', 'Lance']]
const BLUE: Name = ['Blau', 'Blue']

// Johto
const JOHTO_BADGES: [Name, Name][] = [
  [['Viola City', 'Violet City'], ['Falk', 'Falkner']],
  [['Azalea City', 'Azalea Town'], ['Kai', 'Bugsy']],
  [['Dukatia City', 'Goldenrod City'], ['Bianka', 'Whitney']],
  [['Teak City', 'Ecruteak City'], ['Jens', 'Morty']],
  [['Anemonia City', 'Cianwood City'], ['Hartwig', 'Chuck']],
  [['Oliviana City', 'Olivine City'], ['Jasmin', 'Jasmine']],
  [['Mahagonia City', 'Mahogany Town'], ['Norbert', 'Pryce']],
  [['Ebenholz City', 'Blackthorn City'], ['Sandra', 'Clair']],
]
const JOHTO_ELITE: Name[] = [['Willi', 'Will'], ['Koga', 'Koga'], ['Bruno', 'Bruno'], ['Melanie', 'Karen']]

/** Johto-Liga, danach die Kanto-Arenen in beliebiger Reihenfolge und Rot */
const johto = (gyms: number[], kanto: number[], red: number): LevelCap[] => [
  ...league(JOHTO_BADGES, gyms, JOHTO_ELITE, [42, 44, 46, 47], ['Siegfried', 'Lance'], 50),
  heading('Kanto (beliebige Reihenfolge)', 'Kanto (any order)'),
  ...(
    [
      [['Marmoria City', 'Pewter City'], ['Rocko', 'Brock']],
      [['Azuria City', 'Cerulean City'], ['Misty', 'Misty']],
      [['Orania City', 'Vermilion City'], ['Major Bob', 'Lt. Surge']],
      [['Prismania City', 'Celadon City'], ['Erika', 'Erika']],
      [['Fuchsania City', 'Fuchsia City'], ['Janina', 'Janine']],
      [['Saffronia City', 'Saffron City'], ['Sabrina', 'Sabrina']],
      [['Seeschauminseln', 'Seafoam Islands'], ['Pyro', 'Blaine']],
      [['Vertania City', 'Viridian City'], BLUE],
    ] as [Name, Name][]
  ).map(([place, leader], i) => gym(place, leader, kanto[i])),
  { label: 'Rot (Silberberg)', labelEn: 'Red (Mt. Silver)', level: red },
]

// Hoenn
const hoennBadges = (sixthFortree: boolean, eighth: Name): [Name, Name][] => {
  const fortree: [Name, Name] = [['Baumhausen City', 'Fortree City'], ['Wibke', 'Winona']]
  const mossdeep: [Name, Name] = [['Moosbach City', 'Mossdeep City'], ['Ben & Svenja', 'Tate & Liza']]
  return [
    [['Metarost City', 'Rustboro City'], ['Felizia', 'Roxanne']],
    [['Faustauhaven', 'Dewford Town'], ['Kamillo', 'Brawly']],
    [['Malvenfroh City', 'Mauville City'], ['Walter', 'Wattson']],
    [['Bad Lavastadt', 'Lavaridge Town'], ['Flavia', 'Flannery']],
    [['Blütenburg City', 'Petalburg City'], ['Norman', 'Norman']],
    sixthFortree ? fortree : mossdeep,
    sixthFortree ? mossdeep : fortree,
    [['Xeneroville', 'Sootopolis City'], eighth],
  ]
}
const HOENN_ELITE: Name[] = [['Ulrich', 'Sidney'], ['Antonia', 'Phoebe'], ['Frosina', 'Glacia'], ['Dragan', 'Drake']]
const WALLACE: Name = ['Wassili', 'Wallace']
const STEVEN: Name = ['Troy', 'Steven']

// Sinnoh: in Platin kommt Lamina vor Hilda und Marinus
const ROARK: [Name, Name] = [['Erzelingen', 'Oreburgh City'], ['Veit', 'Roark']]
const GARDENIA: [Name, Name] = [['Ewigenau', 'Eterna City'], ['Silvana', 'Gardenia']]
const MAYLENE: [Name, Name] = [['Schleiede', 'Veilstone City'], ['Hilda', 'Maylene']]
const WAKE: [Name, Name] = [['Weideburg', 'Pastoria City'], ['Wellenbrecher Marinus', 'Crasher Wake']]
const FANTINA: [Name, Name] = [['Herzhofen', 'Hearthome City'], ['Lamina', 'Fantina']]
const BYRON: [Name, Name] = [['Fleetburg', 'Canalave City'], ['Adam', 'Byron']]
const CANDICE: [Name, Name] = [['Blizzach', 'Snowpoint City'], ['Frida', 'Candice']]
const VOLKNER: [Name, Name] = [['Sonnewik', 'Sunyshore City'], ['Volkner', 'Volkner']]
const SINNOH_ELITE: Name[] = [['Herbaro', 'Aaron'], ['Teresa', 'Bertha'], ['Ignaz', 'Flint'], ['Lucian', 'Lucian']]
const CYNTHIA: Name = ['Cynthia', 'Cynthia']

/** Gen 5 und 6: Orte und Namen wie im Bot (englisch), Level ungeprüft */
const english = (n: number, place: string, leader: string, level: number) => badge(n, [place, place], [leader, leader], level)
const unovaLeague = (gyms: LevelCap[], e4: number, champion: LevelCap): LevelCap[] => [
  ...gyms,
  ...['Shauntal', 'Marshal', 'Grimsley', 'Caitlin'].map((name, i) => elite(i + 1, [name, name], e4)),
  champion,
]

export const LEVEL_CAP_PRESETS: LevelCapPreset[] = [
  {
    key: 'kanto_rby',
    name: 'Rot, Blau',
    versionGroup: 'red-blue',
    gameNames: ['Rote Edition', 'Blaue Edition', 'Pokemon Rot', 'Pokemon Blau', 'Red', 'Blue'],
    caps: league(KANTO_BADGES, [14, 21, 24, 29, 43, 43, 47, 50], KANTO_ELITE, [56, 58, 60, 62], BLUE, 65),
  },
  {
    key: 'kanto_yellow',
    name: 'Gelb',
    versionGroup: 'red-blue',
    gameNames: ['Gelbe Edition', 'Pokemon Gelb', 'Gelb', 'Yellow'],
    caps: league(KANTO_BADGES, [12, 21, 28, 32, 50, 50, 54, 55], KANTO_ELITE, [56, 58, 60, 62], BLUE, 65),
  },
  {
    key: 'kanto_frlg',
    name: 'Feuerrot, Blattgrün',
    versionGroup: 'firered-leafgreen',
    gameNames: ['Feuerrote Edition', 'Blattgrüne Edition', 'Pokemon Feuerrot', 'Pokemon Blattgrün', 'Feuerrot', 'Blattgrün', 'FireRed', 'LeafGreen'],
    caps: league(KANTO_BADGES, [14, 21, 24, 29, 43, 43, 47, 50], KANTO_ELITE, [54, 56, 58, 60], BLUE, 63),
  },
  {
    key: 'johto_gsc',
    name: 'Gold, Silber, Kristall',
    versionGroup: 'crystal',
    gameNames: ['Goldene Edition', 'Silberne Edition', 'Kristall-Edition', 'Pokemon Gold', 'Pokemon Silber', 'Pokemon Kristall', 'Gold', 'Silver', 'Crystal', 'Silber', 'Kristall'],
    // Werte aus Kristall (Bianka hat dort Level 20, in Gold/Silber 19)
    caps: johto([9, 16, 20, 25, 30, 35, 31, 40], [44, 47, 46, 46, 39, 48, 50, 58], 81),
  },
  {
    key: 'johto_hgss',
    name: 'HeartGold, SoulSilver',
    versionGroup: 'heartgold-soulsilver',
    gameNames: ['HeartGold', 'SoulSilver', 'HGSS', 'Heart Gold', 'Soul Silver', 'Goldene Edition HeartGold', 'Silberne Edition SoulSilver'],
    caps: johto([13, 17, 19, 25, 31, 35, 34, 41], [54, 54, 53, 56, 50, 55, 59, 60], 88),
  },
  {
    key: 'hoenn_rs',
    name: 'Rubin, Saphir',
    versionGroup: 'emerald',
    gameNames: ['Rubin-Edition', 'Saphir-Edition', 'Pokemon Rubin', 'Pokemon Saphir', 'Ruby', 'Sapphire', 'Rubin', 'Saphir'],
    caps: league(hoennBadges(true, WALLACE), [15, 18, 23, 28, 31, 33, 42, 43], HOENN_ELITE, [49, 51, 53, 55], STEVEN, 58),
  },
  {
    key: 'hoenn_rse',
    name: 'Smaragd',
    versionGroup: 'emerald',
    gameNames: ['Smaragd-Edition', 'Pokemon Smaragd', 'Emerald', 'Smaragd'],
    caps: league(hoennBadges(true, ['Juan', 'Juan']), [15, 19, 24, 29, 31, 33, 42, 46], HOENN_ELITE, [49, 51, 53, 55], WALLACE, 58),
  },
  {
    key: 'hoenn_oras',
    name: 'Omega Rubin, Alpha Saphir',
    versionGroup: 'omega-ruby-alpha-sapphire',
    gameNames: ['Omega Rubin', 'Alpha Saphir', 'Pokemon Omega Rubin', 'Pokemon Alpha Saphir', 'Omega Ruby', 'Alpha Sapphire', 'ORAS'],
    // Level aus dem Bot, ungeprüft
    caps: league(hoennBadges(true, WALLACE), [15, 18, 24, 29, 31, 33, 42, 46], HOENN_ELITE, [47, 48, 50, 52], STEVEN, 58),
  },
  {
    key: 'sinnoh_dp',
    name: 'Diamant, Perl',
    versionGroup: 'diamond-pearl',
    gameNames: ['Diamant-Edition', 'Perl-Edition', 'Pokemon Diamant', 'Pokemon Perl', 'Diamond', 'Pearl', 'Diamant', 'Perl', 'Strahlender Diamant', 'Leuchtende Perle', 'Brilliant Diamond', 'Shining Pearl', 'BDSP'],
    caps: league([ROARK, GARDENIA, MAYLENE, WAKE, FANTINA, BYRON, CANDICE, VOLKNER], [14, 22, 30, 30, 36, 39, 42, 49], SINNOH_ELITE, [57, 59, 61, 63], CYNTHIA, 66),
  },
  {
    key: 'sinnoh_pt',
    name: 'Platin',
    versionGroup: 'platinum',
    gameNames: ['Platin-Edition', 'Pokemon Platin', 'Platinum', 'Platin', 'Platin Randomizer', 'Platin Rand'],
    caps: league([ROARK, GARDENIA, FANTINA, MAYLENE, WAKE, BYRON, CANDICE, VOLKNER], [14, 22, 26, 32, 37, 41, 44, 50], SINNOH_ELITE, [53, 55, 57, 59], CYNTHIA, 62),
  },
  {
    key: 'einall_bw',
    name: 'Schwarz, Weiß',
    versionGroup: 'black-white',
    gameNames: ['Schwarze Edition', 'Weiße Edition', 'Pokemon Schwarz', 'Pokemon Weiß', 'Black', 'White', 'Schwarz', 'Weiß', 'BW'],
    caps: unovaLeague(
      [
        english(1, 'Striaton City', 'Cilan/Chili/Cress', 15),
        english(2, 'Nacrene City', 'Lenora', 20),
        english(3, 'Castelia City', 'Burgh', 24),
        english(4, 'Nimbasa City', 'Elesa', 29),
        english(5, 'Driftveil City', 'Clay', 32),
        english(6, 'Mistralton City', 'Skyla', 37),
        english(7, 'Icirrus City', 'Brycen', 41),
        english(8, 'Opelucid City', 'Drayden/Iris', 48),
      ],
      50,
      champ(['Alder', 'Alder'], 54),
    ),
  },
  {
    key: 'einall_bw2',
    name: 'Schwarz 2, Weiß 2',
    versionGroup: 'black-2-white-2',
    gameNames: ['Schwarze Edition 2', 'Weiße Edition 2', 'Pokemon Schwarz 2', 'Pokemon Weiß 2', 'Black 2', 'White 2', 'BW2', 'Schwarz 2', 'Weiß 2'],
    caps: unovaLeague(
      [
        english(1, 'Aspertia City', 'Cheren', 13),
        english(2, 'Virbank City', 'Roxie', 18),
        english(3, 'Castelia City', 'Burgh', 24),
        english(4, 'Nimbasa City', 'Elesa', 28),
        english(5, 'Driftveil City', 'Clay', 32),
        english(6, 'Mistralton City', 'Skyla', 37),
        english(7, 'Opelucid City', 'Drayden', 46),
        english(8, 'Humilau City', 'Marlon', 49),
      ],
      52,
      champ(['Iris', 'Iris'], 57),
    ),
  },
  {
    key: 'kalos',
    name: 'X, Y',
    versionGroup: 'x-y',
    gameNames: ['X', 'Y', 'Pokemon X', 'Pokemon Y', 'XY', 'Pokemon X und Y', 'X und Y'],
    caps: [
      english(1, 'Santalune City', 'Viola', 12),
      english(2, 'Cyllage City', 'Grant', 25),
      english(3, 'Shalour City', 'Korrina', 30),
      english(4, 'Coumarine City', 'Ramos', 34),
      english(5, 'Lumiose City', 'Clemont', 38),
      english(6, 'Laverre City', 'Valerie', 42),
      english(7, 'Anistar City', 'Olympia', 48),
      english(8, 'Snowbelle City', 'Wulfric', 51),
      ...['Malva', 'Siebold', 'Wikstrom', 'Drasna'].map((name, i) => elite(i + 1, [name, name], [55, 56, 57, 59][i])),
      champ(['Diantha', 'Diantha'], 65),
    ],
  },
]

/** Daten für den Pokédex, wenn kein Spiel erkannt wird */
export const FALLBACK_VERSION_GROUP = 'x-y'

const words = (text: string) =>
  ` ${text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()} `

/** Vorlage am Spielnamen erkennen ("Pokémon Platin", "SoulSilver Randomizer"); längster Treffer gewinnt */
export function detectPreset(game: string): LevelCapPreset | null {
  const haystack = words(game)
  let best: { preset: LevelCapPreset; length: number } | null = null
  for (const preset of LEVEL_CAP_PRESETS) {
    for (const name of preset.gameNames) {
      const needle = words(name)
      if (haystack.includes(needle) && (!best || needle.length > best.length)) best = { preset, length: needle.length }
    }
  }
  return best?.preset ?? null
}

/** 'none' = bewusst ohne Level-Cap, null = am Spielnamen erkennen */
export function presetFor(challenge: { game: string; level_cap_preset: string | null }): LevelCapPreset | null {
  if (challenge.level_cap_preset === 'none') return null
  if (challenge.level_cap_preset) return LEVEL_CAP_PRESETS.find((p) => p.key === challenge.level_cap_preset) ?? null
  return detectPreset(challenge.game)
}

/** Erster Eintrag mit Level (Startwert eines neuen Runs) */
export function firstCap(preset: LevelCapPreset) {
  return Math.max(0, preset.caps.findIndex((c) => c.level !== null))
}

/** Nächster bzw. vorheriger Eintrag mit Level; null am Ende der Liste */
export function stepCap(preset: LevelCapPreset, index: number, direction: 1 | -1): number | null {
  for (let i = index + direction; i >= 0 && i < preset.caps.length; i += direction) {
    if (preset.caps[i].level !== null) return i
  }
  return null
}

/** Aktueller Cap-Eintrag; ein neuer Run beginnt beim ersten Cap */
export function capIndex(
  challenge: { game: string; level_cap_preset: string | null; level_cap_index: number; level_cap_run: number },
  currentRun: number,
): number | null {
  const preset = presetFor(challenge)
  if (!preset) return null
  const index = challenge.level_cap_run === currentRun ? challenge.level_cap_index : firstCap(preset)
  return preset.caps[index]?.level != null ? index : firstCap(preset)
}

/** Aktuelles Level-Cap (Zahl) oder null */
export function capLevel(
  challenge: { game: string; level_cap_preset: string | null; level_cap_index: number; level_cap_run: number },
  currentRun: number,
): number | null {
  const preset = presetFor(challenge)
  const index = capIndex(challenge, currentRun)
  return preset && index !== null ? preset.caps[index].level : null
}

/** Edition für die Pokédex-Daten (Attacken, Werte, Entwicklungen) */
export function versionGroupFor(challenge: { game: string; level_cap_preset: string | null }) {
  const preset =
    challenge.level_cap_preset === 'none' ? detectPreset(challenge.game) : presetFor(challenge)
  return preset?.versionGroup ?? FALLBACK_VERSION_GROUP
}

/** Eintrag in der eingestellten Sprache */
export function capLabel(cap: LevelCap) {
  return getLang() === 'en' ? cap.labelEn : cap.label
}
