// Englische Texte: Challenge-Seite, Routen-Tabelle und Eintragen-Dialoge
export default {
  // Challenge-Seite
  Routen: 'Routes',
  Teams: 'Teams',
  Pokédex: 'Pokédex',
  Friedhof: 'Graveyard',
  Timeline: 'Timeline',
  Zähler: 'Stats',
  Einstellungen: 'Settings',
  Fehler: 'Error',
  'Nicht gefunden': 'Not found',
  'Da lief etwas schief': 'Something went wrong',
  'Keine Challenge unter dieser Adresse': 'No challenge at this address',
  'Entweder gibt es sie nicht, oder sie ist privat und dieses Gerät ist noch nicht verbunden. Öffne deinen Einladungslink.':
    "Either it doesn't exist, or it's private and this device isn't connected yet. Open your invite link.",
  'Zur Startseite': 'Back to home',
  Öffentlich: 'Public',
  Privat: 'Private',
  Zuschauermodus: 'Spectator mode',
  Run: 'Run',
  'Vorheriger Run': 'Previous run',
  'Nächster Run': 'Next run',
  läuft: 'active',
  beendet: 'ended',
  Leben: 'Alive',
  Verloren: 'Lost',
  'Lebende Links': 'Alive links',
  'Verlorene Links': 'Lost links',
  'Run beenden': 'End run',
  'Begegnung eintragen': 'Log encounter',
  Bereiche: 'Sections',

  // Routen-Tabelle
  Verpasst: 'Missed',
  Nachtragen: 'Fill in',
  keine: 'none',
  Route: 'Route',
  '{route}: Soul-Link verfallen, Route ausgeblendet': '{route}: Soul Link expired, route hidden',
  'Noch keine Begegnungen in Run {run}.': 'No encounters in run {run} yet.',
  'Erste Begegnung eintragen': 'Log the first encounter',
  'Pokémon oder Route suchen …': 'Search Pokémon or route …',
  'Pokémon oder Route suchen': 'Search Pokémon or route',
  'Suche leeren': 'Clear search',
  '1 Pokémon': '1 Pokémon',
  '{n} Pokémon': '{n} Pokémon',
  '1 Route': '1 route',
  '{n} Routen': '{n} routes',
  'Verfallene Routen ausblenden': 'Hide expired routes',
  'Verfallene Routen zeigen ({n})': 'Show expired routes ({n})',
  'Dupe: {name}-Reihe schon gefangen': 'Dupe: {name} line already caught',
  '{name}-Reihe': '{name} line',
  'wurde in diesem Run noch nicht gefangen.': 'has not been caught in this run yet.',
  Static: 'Static',
  verfallen: 'expired',
  'Fehlende als verpasst?': 'Mark missing as missed?',
  Ja: 'Yes',
  Nein: 'No',
  'Nicht alle haben hier etwas gefangen: Soul-Link verfällt, die Route wird ausgeblendet':
    'Not everyone caught something here: the Soul Link expires and the route is hidden',
  'Verfallen lassen': 'Let it expire',
  'Kein Pokémon und keine Route passt zu „{query}“.': 'No Pokémon or route matches “{query}”.',

  // Nachtragen
  '{player} auf {route}.': '{player} on {route}.',
  '{player} auf {route} (Static).': '{player} on {route} (Static).',
  'Das Pokémon kommt in den bestehenden Soul-Link.': 'The Pokémon joins the existing Soul Link.',
  '{player}: Begegnung auf {route} verpasst': '{player}: missed the encounter on {route}',
  '{pokemon} für {player} nachgetragen': '{pokemon} filled in for {player}',
  'Speichere …': 'Saving …',

  // Begegnung eintragen
  'Die Pokémon jedes Soul-Link-Paars sind verbunden. Stirbt eins, stirbt der Partner mit.':
    "Each Soul Link pair's Pokémon are linked. If one dies, its partner dies too.",
  'Alle Pokémon dieser Route bilden einen Soul-Link. Stirbt eins, sterben alle.':
    'All Pokémon from this route form one Soul Link. If one dies, they all die.',
  '{route}: 1 Eintrag gespeichert': '{route}: 1 entry saved',
  '{route}: {n} Einträge gespeichert': '{route}: {n} entries saved',
  Art: 'Type',
  Wild: 'Wild',
  'schon eingetragen': 'already logged',
  'Begegnung verpasst – zählt bei {player}.': 'Encounter missed – counts for {player}.',
  'Team oder Box ergibt sich von selbst: ins Team, sobald alle Pokémon des Soul-Links da sind und jeder noch Platz hat.':
    'Team or box is decided automatically: into the team once all Pokémon of the Soul Link are in and everyone still has room.',
  'Speichern ({done}/{total})': 'Save ({done}/{total})',

  // Dupe-Warnung
  'Dupe:': 'Dupe:',
  '{name}-Reihe schon gefangen': '{name} line already caught',
  Jemand: 'Someone',

  // Status
  Team: 'Team',
  Box: 'Box',
  Tot: 'Dead',
  Mitgestorben: 'Linked death',

  // Level-Cap
  'Level-Cap': 'Level cap',
  'Vorheriger Level-Cap': 'Previous level cap',
  'Nächster Level-Cap': 'Next level cap',

  // Run beenden
  'Run {run} gewonnen! Glückwunsch!': 'Run {run} won! Congratulations!',
  'Run {run} ist vorbei. Run {next} beginnt.': 'Run {run} is over. Run {next} begins.',
  'Run {run} beenden': 'End run {run}',
  'Danach beginnt Run {next}; die Zähler des Runs starten wieder bei null. Rückgängig geht nur, solange im neuen Run noch nichts eingetragen ist.':
    'Run {next} starts afterwards; the run counters reset to zero. This can only be undone while nothing has been logged in the new run.',
  Wipe: 'Wipe',
  Gewonnen: 'Won',
  'Wer war schuld?': 'Whose fault was it?',
  'Optional, zählt in der Statistik als verursachter Wipe.': 'Optional, counts as a caused wipe in the stats.',
  'Niemand bestimmtes': 'Nobody in particular',
  Notiz: 'Note',
  'Top 4, Lucian …': 'Elite Four, Lucian …',
  'Wipe bestätigen': 'Confirm wipe',
  'Sieg eintragen': 'Log victory',
} satisfies Record<string, string>
