// Englische Texte: Einstellungen, Spielregeln, Pokédex
export default {
  // Rollen
  Leitung: 'Host',
  Spieler: 'Player',
  Zuschauer: 'Spectator',

  // Mitglied bearbeiten
  Gespeichert: 'Saved',
  Name: 'Name',
  Farbe: 'Colour',
  'Discord-ID': 'Discord ID',
  'Für den Bot: Rechtsklick auf dich → „Nutzer-ID kopieren“': 'For the bot: right-click yourself → “Copy User ID”',
  Speichern: 'Save',

  // Eigener Platz
  'Mein Platz': 'My seat',
  'Du bist hier {role}.': 'You are {role} here.',
  'Weiteres Gerät verbinden': 'Connect another device',
  'Auf dem anderen Gerät öffnen. 24 Stunden gültig, einmal nutzbar.': 'Open on the other device. Valid for 24 hours, single use.',
  Zuschauen: 'Spectating',
  'Du siehst diese Challenge nur. Mitspielen geht über einen Einladungslink der Leitung.':
    'You can only view this challenge. To play, ask the host for an invite link.',

  // Challenge
  Challenge: 'Challenge',
  Sichtbarkeit: 'Visibility',
  Privat: 'Private',
  'Öffentlich (Zuschauen ohne Link)': 'Public (spectate without link)',
  'Bot: Auch Discord-Nutzer ohne hinterlegte Discord-ID dürfen eintragen': 'Bot: Discord users without a saved Discord ID may also log entries',

  // Mitglieder & Geräte
  'Mitglieder & Geräte': 'Members & devices',
  'Jeder Platz wird über einen persönlichen Link mit einem oder mehreren Geräten verbunden. Verlorenes Handy? Geräte abmelden und neuen Link schicken.':
    'Each seat is connected to one or more devices via a personal link. Lost your phone? Sign out its devices and send a new link.',
  '1 Gerät': '1 device',
  '{count} Geräte': '{count} devices',
  'Platz frei': 'Seat open',
  'Discord {id}': 'Discord {id}',
  'Paar {number}': 'Pair {number}',
  Bearbeiten: 'Edit',
  Gerätelink: 'Device link',
  'Alle Geräte von {name} abmelden?': 'Sign out all devices of {name}?',
  'Geräte abgemeldet': 'Devices signed out',
  Abmelden: 'Sign out',
  'Für {name}: 72 Stunden gültig, einmal nutzbar.': 'For {name}: valid for 72 hours, single use.',
  'Spieler hinzufügen': 'Add player',
  'Hinzufügen & Link erstellen': 'Add & create link',

  // Offene Einladung
  'Offene Einladung': 'Invite link',
  'Ein Link für Leute ohne festen Platz: Wer ihn öffnet, gibt seinen Namen ein und wird Spieler oder Zuschauer.':
    'A link for people without a fixed seat: whoever opens it enters their name and becomes a player or spectator.',
  Rolle: 'Role',
  Nutzbar: 'Uses',
  'Link erstellen': 'Create link',
  '72 Stunden gültig.': 'Valid for 72 hours.',
  'Gerätelink für {name}': 'Device link for {name}',
  'Leitungs-Einladung': 'Host invite',
  'Spieler-Einladung': 'Player invite',
  'Zuschauer-Einladung': 'Spectator invite',
  '{uses}/{max} genutzt · bis {time}': '{uses}/{max} used · until {time}',
  'Einladung widerrufen': 'Invite revoked',
  Widerrufen: 'Revoke',

  // Discord-Bot
  'Discord-Bot': 'Discord bot',
  'Der Bot bekommt nur dieses Token (plus den öffentlichen Key), nie einen geheimen Schlüssel. Er sieht und schreibt nur diese Challenge.':
    'The bot only gets this token (plus the public key), never a secret key. It can only see and edit this challenge.',
  Bezeichnung: 'Label',
  'Token erstellen': 'Create token',
  'Wird nur jetzt angezeigt. In der .env des Bots als SOULLINK_BOT_TOKEN eintragen.':
    'Shown only once. Put it in the bot’s .env as SOULLINK_BOT_TOKEN.',
  'widerrufen {time}': 'revoked {time}',
  'zuletzt aktiv {time}': 'last active {time}',
  'noch nie benutzt': 'never used',
  'Token widerrufen': 'Token revoked',

  // Löschen
  'Challenge löschen': 'Delete challenge',
  'Löscht alle Runs, Begegnungen und Ereignisse endgültig.': 'Permanently deletes all runs, encounters and events.',
  'Challenge gelöscht': 'Challenge deleted',
  'Zur Bestätigung „{slug}“ eingeben': 'Type “{slug}” to confirm',
  'Endgültig löschen': 'Delete permanently',

  // Spielregeln
  Spielregeln: 'Game rules',
  'Spielregeln gespeichert': 'Game rules saved',
  'Level-Caps und Pokédex-Daten richten sich nach dem Spiel. Dupes gelten immer für alle Spieler zusammen.':
    'Level caps and Pokédex data follow the game. Dupes always count across all players.',
  'Level-Caps und Pokédex nach Spiel': 'Level caps and Pokédex by game',
  'Automatisch (erkannt: {name})': 'Automatic (detected: {name})',
  'Automatisch (nicht erkannt)': 'Automatic (not detected)',
  'Ohne Level-Cap': 'No level cap',
  'Dupes-Clause': 'Dupes clause',
  'Warnt beim Eintragen, wenn die Entwicklungsreihe in diesem Run schon von irgendwem gefangen wurde.':
    'Warns when logging an encounter if anyone has already caught that evolution line in this run.',

  // Teams angleichen
  'Teams angleichen': 'Match teams',
  'Teams werden automatisch angeglichen': 'Teams are now matched automatically',
  'Teams werden nicht mehr angeglichen': 'Teams are no longer matched',
  'Kommt ein Pokémon ins Team oder in die Box, wechseln seine Soul-Link-Partner bei den anderen mit (wild und Static getrennt). Einzelne Wechsel lassen sich trotzdem nur für ein Team machen: Schalter „Teams angleichen“ im Tab Teams oder Shift beim Ablegen.':
    'When a Pokémon moves to the team or the box, its Soul Link partners move along for the others (wild and static kept separate). You can still make a single change for one team only: use the “Match teams” switch in the Teams tab or hold Shift when dropping.',
  Automatisch: 'Automatic',
  'Teamwechsel gelten für alle verbundenen Teams. Die anderen bekommen einen Hinweis.':
    'Team changes apply to all linked teams. The others get a notification.',
  Aus: 'Off',
  'Jeder ändert nur sein eigenes Team.': 'Everyone only changes their own team.',

  // Soul-Links
  'Soul-Links': 'Soul Links',
  'Soul-Links jetzt paarweise': 'Soul Links are now in pairs',
  'Soul-Links jetzt für alle gemeinsam': 'Soul Links now shared by everyone',
  'Wer ist mit wem verbunden? Gilt für neue Begegnungen; bestehende Soul-Links bleiben, wie sie sind.':
    'Who is linked with whom? Applies to new encounters; existing Soul Links stay as they are.',
  'Alle verbunden': 'All linked',
  'Stirbt ein Pokémon, sterben die Pokémon aller Spieler auf dieser Route.': 'If one Pokémon dies, every player’s Pokémon from that route dies too.',
  Paare: 'Pairs',
  'Spieler 1↔2, 3↔4 …': 'Players 1↔2, 3↔4 …',

  // Level-Cap-Vorlagen (Spiele)
  'Rot, Blau, Gelb': 'Red, Blue, Yellow',
  'Feuerrot, Blattgrün': 'FireRed, LeafGreen',
  'Gold, Silber, Kristall': 'Gold, Silver, Crystal',
  'HeartGold, SoulSilver': 'HeartGold, SoulSilver',
  'Rubin, Saphir, Smaragd': 'Ruby, Sapphire, Emerald',
  'Omega Rubin, Alpha Saphir': 'Omega Ruby, Alpha Sapphire',
  'Diamant, Perl': 'Diamond, Pearl',
  Platin: 'Platinum',
  'Schwarz, Weiß': 'Black, White',
  'Schwarz 2, Weiß 2': 'Black 2, White 2',
  'X, Y': 'X, Y',

  // Editionen der Pokédex-Daten
  'Rot/Blau': 'Red/Blue',
  'Feuerrot/Blattgrün': 'FireRed/LeafGreen',
  Kristall: 'Crystal',
  'HeartGold/SoulSilver': 'HeartGold/SoulSilver',
  Smaragd: 'Emerald',
  'Omega Rubin/Alpha Saphir': 'Omega Ruby/Alpha Sapphire',
  'Diamant/Perl': 'Diamond/Pearl',
  'Schwarz/Weiß': 'Black/White',
  'Schwarz 2/Weiß 2': 'Black 2/White 2',
  'X/Y': 'X/Y',

  // Pokédex
  'Pokémon nachschlagen': 'Look up Pokémon',
  'Dein Team': 'Your team',
  'Daten: {edition} (PokéAPI). Bei Randomizern können Typen, Werte und Attacken abweichen.':
    'Data: {edition} (PokéAPI). Types, stats and moves may differ in randomizers.',
  'Gegnerisches Pokémon eintippen: Typen, Schwächen, Werte und Attacken bis zum Level-Cap.':
    'Type an opposing Pokémon: types, weaknesses, stats and moves up to the level cap.',
  '{name} gibt es in {edition} noch nicht.': '{name} does not exist in {edition} yet.',
  'Im PokéWiki öffnen': 'Open in PokéWiki',
  Entwicklung: 'Evolution',
  'Entwickelt sich nicht.': 'Does not evolve.',
  'Attacken per Level': 'Moves by level',
  'Level-Cap {cap}': 'Level cap {cap}',
  'über Level-Cap {cap}': 'above level cap {cap}',
  'Keine Level-Attacken in dieser Edition.': 'No level-up moves in this game.',
  'Lv.': 'Lv.',
  Attacke: 'Move',
  Typ: 'Type',
  'Kat.': 'Cat.',
  Stärke: 'Power',
  'Gen.': 'Acc.',
  AP: 'PP',
  Start: 'Start',
  Summe: 'Total',
  // Basiswerte
  KP: 'HP',
  Angriff: 'Attack',
  Verteidigung: 'Defense',
  'Sp.-Angriff': 'Sp. Atk',
  'Sp.-Vert.': 'Sp. Def',
  Initiative: 'Speed',
  // Kategorien
  Status: 'Status',
  Physisch: 'Physical',
  Speziell: 'Special',
  // Schwächen
  'Schwächen und Resistenzen': 'Weaknesses and resistances',
  'Sehr schwach (×4)': 'Very weak (×4)',
  'Schwach (×2)': 'Weak (×2)',
  'Resistent (×½)': 'Resists (×½)',
  'Sehr resistent (×¼)': 'Strongly resists (×¼)',
  'Immun (×0)': 'Immune (×0)',
  // Eigenes Team dagegen
  'Dein Team dagegen': 'Your team against it',
  'Gleichtypige Attacken: was dein Pokémon austeilt und was es einsteckt.': 'Same-type moves: what your Pokémon deals and what it takes.',
  Austeilen: 'Deals',
  Einstecken: 'Takes',
  'trifft {factor}': 'hits {factor}',
  'nimmt {factor}': 'takes {factor}',
} satisfies Record<string, string>
