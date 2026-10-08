// Level-Caps pro Spiel, übernommen aus dem Discord-Bot. Einträge ohne Level sind Zwischenüberschriften.
// versionGroup: welche Attacken- und Entwicklungsdaten (public/dex/<versionGroup>.json) dazu passen.

export interface LevelCap {
  label: string
  level: number | null
}

export interface LevelCapPreset {
  key: string
  name: string
  versionGroup: string
  gameNames: string[]
  caps: LevelCap[]
}

const kanto: LevelCap[] = [
  { label: 'Orden 1 – Pewter City (Rocko)', level: 14 },
  { label: 'Orden 2 – Cerulean City (Maren)', level: 21 },
  { label: 'Orden 3 – Vermillion City (Surge)', level: 24 },
  { label: 'Orden 4 – Celadon City (Erika)', level: 29 },
  { label: 'Orden 5 – Fuchsia City (Koga)', level: 43 },
  { label: 'Orden 6 – Saffron City (Sabrina)', level: 47 },
  { label: 'Orden 7 – Cinnabar Island (Pyro)', level: 50 },
  { label: 'Orden 8 – Viridian City (Giovanni)', level: 53 },
  { label: 'Elite Four 1 – Lorelei', level: 54 },
  { label: 'Elite Four 2 – Bruno', level: 54 },
  { label: 'Elite Four 3 – Agatha', level: 56 },
  { label: 'Elite Four 4 – Lance', level: 60 },
  { label: 'Champion – Gary/Blau', level: 65 },
]

const johtoLeague = (first: number, fifth: number, sixth: number, seventh: number): LevelCap[] => [
  { label: 'Orden 1 – Violastadt (Falkner)', level: first },
  { label: 'Orden 2 – Azaleaburg (Knospe)', level: 17 },
  { label: 'Orden 3 – Dukatiastadt (Whitney)', level: 19 },
  { label: 'Orden 4 – Teakstadt (Morty)', level: 25 },
  { label: 'Orden 5 – Olivianastadt (Chuck)', level: fifth },
  { label: 'Orden 6 – Anemoniastadt (Jasmine)', level: sixth },
  { label: 'Orden 7 – Mahagoniastadt (Pryce)', level: seventh },
  { label: 'Orden 8 – Ebenholzstadt (Clair)', level: 41 },
  { label: 'Elite Four 1 – Will', level: 42 },
  { label: 'Elite Four 2 – Koga', level: 44 },
  { label: 'Elite Four 3 – Bruno', level: 46 },
  { label: 'Elite Four 4 – Karen', level: 47 },
  { label: 'Champion – Lance', level: 50 },
  { label: 'Kanto (optionale Reihenfolge)', level: null },
]

const sinnohLeague = (eighth: number): LevelCap[] => [
  { label: 'Orden 1 – Sandgemme (Roxy)', level: 14 },
  { label: 'Orden 2 – Erzelingen (Gardenia)', level: 22 },
  { label: 'Orden 3 – Herzhofen (Maylene)', level: 28 },
  { label: 'Orden 4 – Weideburg (Crasher Wake)', level: 30 },
  { label: 'Orden 5 – Elyses (Fantina)', level: 36 },
  { label: 'Orden 6 – Fleetburg (Byron)', level: 40 },
  { label: 'Orden 7 – Blizzach (Candice)', level: 44 },
  { label: 'Orden 8 – Sonnewik (Volkner)', level: eighth },
  { label: 'Elite Four 1 – Aaron', level: 53 },
  { label: 'Elite Four 2 – Bertha', level: 55 },
  { label: 'Elite Four 3 – Flint', level: 57 },
  { label: 'Elite Four 4 – Lucian', level: 59 },
  { label: 'Champion – Cynthia', level: 66 },
]

const hoennLeague = (sixth: LevelCap, seventh: LevelCap, eighth: string, champion: string): LevelCap[] => [
  { label: 'Orden 1 – Wurzelheim (Roxanne)', level: 15 },
  { label: 'Orden 2 – Metarost City (Brawly)', level: 18 },
  { label: 'Orden 3 – Ewigenau (Wattson)', level: 24 },
  { label: 'Orden 4 – Herzhofen (Flannery)', level: 29 },
  { label: 'Orden 5 – Petalburg City (Norman)', level: 31 },
  sixth,
  seventh,
  { label: `Orden 8 – Sootopolis City (${eighth})`, level: 46 },
  { label: 'Elite Four 1 – Sidney', level: 47 },
  { label: 'Elite Four 2 – Phoebe', level: 48 },
  { label: 'Elite Four 3 – Glacia', level: 50 },
  { label: 'Elite Four 4 – Drake', level: 52 },
  { label: `Champion – ${champion}`, level: 58 },
]

const unovaLeague = (gyms: LevelCap[], e4: number, champion: LevelCap): LevelCap[] => [
  ...gyms,
  { label: 'Elite Four 1 – Shauntal', level: e4 },
  { label: 'Elite Four 2 – Marshal', level: e4 },
  { label: 'Elite Four 3 – Grimsley', level: e4 },
  { label: 'Elite Four 4 – Caitlin', level: e4 },
  champion,
]

export const LEVEL_CAP_PRESETS: LevelCapPreset[] = [
  {
    key: 'kanto_rby',
    name: 'Rot, Blau, Gelb',
    versionGroup: 'red-blue',
    gameNames: ['Rote Edition', 'Blaue Edition', 'Gelbe Edition', 'Pokemon Rot', 'Pokemon Blau', 'Pokemon Gelb', 'Red', 'Blue', 'Yellow'],
    caps: kanto,
  },
  {
    key: 'kanto_frlg',
    name: 'Feuerrot, Blattgrün',
    versionGroup: 'firered-leafgreen',
    gameNames: ['Feuerrote Edition', 'Blattgrüne Edition', 'Pokemon Feuerrot', 'Pokemon Blattgrün', 'Feuerrot', 'Blattgrün', 'FireRed', 'LeafGreen'],
    caps: kanto,
  },
  {
    key: 'johto_gsc',
    name: 'Gold, Silber, Kristall',
    versionGroup: 'crystal',
    gameNames: ['Goldene Edition', 'Silberne Edition', 'Kristall-Edition', 'Pokemon Gold', 'Pokemon Silber', 'Pokemon Kristall', 'Gold', 'Silver', 'Crystal', 'Silber', 'Kristall'],
    caps: [
      ...johtoLeague(9, 29, 31, 35),
      { label: 'Pewter City Gym (Rocko)', level: 54 },
      { label: 'Cerulean City Gym (Maren)', level: 54 },
      { label: 'Vermillion City Gym (Surge)', level: 53 },
      { label: 'Celadon City Gym (Erika)', level: 56 },
      { label: 'Fuchsia City Gym (Koga Ersatz)', level: 50 },
      { label: 'Saffron City Gym (Sabrina)', level: 55 },
      { label: 'Seafoam Island Gym (Pyro Ersatz)', level: 59 },
      { label: 'Viridian City Gym (Giovanni Ersatz)', level: 60 },
      { label: 'Rot (Mt. Silver)', level: 88 },
    ],
  },
  {
    key: 'johto_hgss',
    name: 'HeartGold, SoulSilver',
    versionGroup: 'heartgold-soulsilver',
    gameNames: ['HeartGold', 'SoulSilver', 'HGSS', 'Heart Gold', 'Soul Silver', 'Goldene Edition HeartGold', 'Silberne Edition SoulSilver'],
    caps: [
      ...johtoLeague(13, 31, 35, 34),
      { label: 'Pewter City Gym (Rocko)', level: 54 },
      { label: 'Cerulean City Gym (Maren)', level: 54 },
      { label: 'Vermillion City Gym (Surge)', level: 53 },
      { label: 'Celadon City Gym (Erika)', level: 56 },
      { label: 'Fuchsia City Gym (Janine)', level: 50 },
      { label: 'Saffron City Gym (Sabrina)', level: 55 },
      { label: 'Seafoam Island Gym (Blaine)', level: 59 },
      { label: 'Viridian City Gym (Blue)', level: 60 },
      { label: 'Rot (Mt. Silver)', level: 88 },
    ],
  },
  {
    key: 'hoenn_rse',
    name: 'Rubin, Saphir, Smaragd',
    versionGroup: 'emerald',
    gameNames: ['Rubin-Edition', 'Saphir-Edition', 'Smaragd-Edition', 'Pokemon Rubin', 'Pokemon Saphir', 'Pokemon Smaragd', 'Ruby', 'Sapphire', 'Emerald', 'Rubin', 'Saphir', 'Smaragd'],
    caps: hoennLeague(
      { label: 'Orden 6 – Mossdeep City (Tate & Liza)', level: 42 },
      { label: 'Orden 7 – Fortree City (Winona)', level: 33 },
      'Juan/Wallace',
      'Steven/Wallace',
    ),
  },
  {
    key: 'hoenn_oras',
    name: 'Omega Rubin, Alpha Saphir',
    versionGroup: 'omega-ruby-alpha-sapphire',
    gameNames: ['Omega Rubin', 'Alpha Saphir', 'Pokemon Omega Rubin', 'Pokemon Alpha Saphir', 'Omega Ruby', 'Alpha Sapphire', 'ORAS'],
    caps: hoennLeague(
      { label: 'Orden 6 – Fortree City (Winona)', level: 33 },
      { label: 'Orden 7 – Mossdeep City (Tate & Liza)', level: 42 },
      'Wallace',
      'Steven',
    ),
  },
  {
    key: 'sinnoh_dp',
    name: 'Diamant, Perl',
    versionGroup: 'diamond-pearl',
    gameNames: ['Diamant-Edition', 'Perl-Edition', 'Pokemon Diamant', 'Pokemon Perl', 'Diamond', 'Pearl', 'Diamant', 'Perl', 'Strahlender Diamant', 'Leuchtende Perle', 'Brilliant Diamond', 'Shining Pearl', 'BDSP'],
    caps: sinnohLeague(46),
  },
  {
    key: 'sinnoh_pt',
    name: 'Platin',
    versionGroup: 'platinum',
    gameNames: ['Platin-Edition', 'Pokemon Platin', 'Platinum', 'Platin', 'Platin Randomizer', 'Platin Rand'],
    caps: sinnohLeague(50),
  },
  {
    key: 'einall_bw',
    name: 'Schwarz, Weiß',
    versionGroup: 'black-white',
    gameNames: ['Schwarze Edition', 'Weiße Edition', 'Pokemon Schwarz', 'Pokemon Weiß', 'Black', 'White', 'Schwarz', 'Weiß', 'BW'],
    caps: unovaLeague(
      [
        { label: 'Orden 1 – Striaton City (Cilan/Chili/Cress)', level: 15 },
        { label: 'Orden 2 – Nacrene City (Lenora)', level: 20 },
        { label: 'Orden 3 – Castelia City (Burgh)', level: 24 },
        { label: 'Orden 4 – Nimbasa City (Elesa)', level: 29 },
        { label: 'Orden 5 – Driftveil City (Clay)', level: 32 },
        { label: 'Orden 6 – Mistralton City (Skyla)', level: 37 },
        { label: 'Orden 7 – Icirrus City (Brycen)', level: 41 },
        { label: 'Orden 8 – Opelucid City (Drayden/Iris)', level: 48 },
      ],
      50,
      { label: 'Champion – Alder', level: 54 },
    ),
  },
  {
    key: 'einall_bw2',
    name: 'Schwarz 2, Weiß 2',
    versionGroup: 'black-2-white-2',
    gameNames: ['Schwarze Edition 2', 'Weiße Edition 2', 'Pokemon Schwarz 2', 'Pokemon Weiß 2', 'Black 2', 'White 2', 'BW2', 'Schwarz 2', 'Weiß 2'],
    caps: unovaLeague(
      [
        { label: 'Orden 1 – Aspertia City (Cheren)', level: 13 },
        { label: 'Orden 2 – Virbank City (Roxie)', level: 18 },
        { label: 'Orden 3 – Castelia City (Burgh)', level: 24 },
        { label: 'Orden 4 – Nimbasa City (Elesa)', level: 28 },
        { label: 'Orden 5 – Driftveil City (Clay)', level: 32 },
        { label: 'Orden 6 – Mistralton City (Skyla)', level: 37 },
        { label: 'Orden 7 – Opelucid City (Drayden)', level: 46 },
        { label: 'Orden 8 – Humilau City (Marlon)', level: 49 },
      ],
      52,
      { label: 'Champion – Iris', level: 57 },
    ),
  },
  {
    key: 'kalos',
    name: 'X, Y',
    versionGroup: 'x-y',
    gameNames: ['X', 'Y', 'Pokemon X', 'Pokemon Y', 'XY', 'Pokemon X und Y', 'X und Y'],
    caps: [
      { label: 'Orden 1 – Santalune City (Viola)', level: 12 },
      { label: 'Orden 2 – Cyllage City (Grant)', level: 25 },
      { label: 'Orden 3 – Shalour City (Korrina)', level: 30 },
      { label: 'Orden 4 – Coumarine City (Ramos)', level: 34 },
      { label: 'Orden 5 – Lumiose City (Clemont)', level: 38 },
      { label: 'Orden 6 – Laverre City (Valerie)', level: 42 },
      { label: 'Orden 7 – Anistar City (Olympia)', level: 48 },
      { label: 'Orden 8 – Snowbelle City (Wulfric)', level: 51 },
      { label: 'Elite Four 1 – Malva', level: 55 },
      { label: 'Elite Four 2 – Siebold', level: 56 },
      { label: 'Elite Four 3 – Wikstrom', level: 57 },
      { label: 'Elite Four 4 – Drasna', level: 59 },
      { label: 'Champion – Diantha', level: 65 },
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
