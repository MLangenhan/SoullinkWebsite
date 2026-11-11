-- Regionalformen (generiert von tools/generate_species.py, nicht von Hand ändern)
-- 18 Formen (alola), Quelle: PokeAPI
--
-- Eine Regionalform ist ein eigener Eintrag mit der PokeAPI-ID der Form (über 10000) und form_of =
-- nationale Nummer der Art. Sie gehört zur selben Entwicklungsreihe: Dupes-Regel und Entwicklung
-- behandeln Alola-Rattfratz wie Rattfratz, Sprite und Typen kommen von der Form.

alter table public.species add column if not exists form_of integer references public.species (id);
comment on column public.species.id is 'Nationale Pokédex-Nummer, bei Regionalformen die PokeAPI-ID der Form';
comment on column public.species.form_of is 'Bei Regionalformen: nationale Nummer der Art';

insert into public.species (id, slug, name_en, name_de, generation, evolution_chain_id, evolves_from_id, evolution_stage, sprite_url, form_of) values
  (10091, 'rattata-alola', 'Alolan Rattata', 'Alola Rattfratz', 7, 7, null, 1, 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/10091.png', 19),
  (10092, 'raticate-alola', 'Alolan Raticate', 'Alola Rattikarl', 7, 7, 10091, 2, 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/10092.png', 20),
  (10100, 'raichu-alola', 'Alolan Raichu', 'Alola Raichu', 7, 10, 25, 3, 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/10100.png', 26),
  (10101, 'sandshrew-alola', 'Alolan Sandshrew', 'Alola Sandan', 7, 11, null, 1, 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/10101.png', 27),
  (10102, 'sandslash-alola', 'Alolan Sandslash', 'Alola Sandamer', 7, 11, 10101, 2, 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/10102.png', 28),
  (10103, 'vulpix-alola', 'Alolan Vulpix', 'Alola Vulpix', 7, 15, null, 1, 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/10103.png', 37),
  (10104, 'ninetales-alola', 'Alolan Ninetales', 'Alola Vulnona', 7, 15, 10103, 2, 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/10104.png', 38),
  (10105, 'diglett-alola', 'Alolan Diglett', 'Alola Digda', 7, 21, null, 1, 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/10105.png', 50),
  (10106, 'dugtrio-alola', 'Alolan Dugtrio', 'Alola Digdri', 7, 21, 10105, 2, 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/10106.png', 51),
  (10107, 'meowth-alola', 'Alolan Meowth', 'Alola Mauzi', 7, 22, null, 1, 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/10107.png', 52),
  (10108, 'persian-alola', 'Alolan Persian', 'Alola Snobilikat', 7, 22, 10107, 2, 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/10108.png', 53),
  (10109, 'geodude-alola', 'Alolan Geodude', 'Alola Kleinstein', 7, 31, null, 1, 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/10109.png', 74),
  (10110, 'graveler-alola', 'Alolan Graveler', 'Alola Georok', 7, 31, 10109, 2, 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/10110.png', 75),
  (10111, 'golem-alola', 'Alolan Golem', 'Alola Geowaz', 7, 31, 10110, 3, 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/10111.png', 76),
  (10112, 'grimer-alola', 'Alolan Grimer', 'Alola Sleima', 7, 38, null, 1, 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/10112.png', 88),
  (10113, 'muk-alola', 'Alolan Muk', 'Alola Sleimok', 7, 38, 10112, 2, 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/10113.png', 89),
  (10114, 'exeggutor-alola', 'Alolan Exeggutor', 'Alola Kokowei', 7, 45, 102, 2, 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/10114.png', 103),
  (10115, 'marowak-alola', 'Alolan Marowak', 'Alola Knogga', 7, 46, 104, 2, 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/10115.png', 105)
on conflict (id) do update set
  slug = excluded.slug,
  name_en = excluded.name_en,
  name_de = excluded.name_de,
  generation = excluded.generation,
  evolution_chain_id = excluded.evolution_chain_id,
  evolves_from_id = excluded.evolves_from_id,
  evolution_stage = excluded.evolution_stage,
  sprite_url = excluded.sprite_url,
  form_of = excluded.form_of;
