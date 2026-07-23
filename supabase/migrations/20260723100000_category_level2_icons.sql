-- Gir hver nivå 2-kategori sitt eget, unike ikon, slik at forsidens
-- ikonoversikt over underkategorier kan vise noe mer enn generiske bokser
-- når kun en hovedkategori er valgt.
update categories set icon = case slug
  -- Bildeler og tilbehør
  when 'dekk-og-felg' then 'Disc'
  when 'bilstereo-og-elektronikk' then 'Radio'
  when 'reservedeler' then 'Cog'

  -- Elektronikk
  when 'tv-og-lyd' then 'Tv'
  when 'mobil-og-nettbrett' then 'TabletSmartphone'
  when 'data' then 'Laptop'
  when 'foto-og-video' then 'Camera'
  when 'gaming' then 'Gamepad2'
  when 'hvitevarer' then 'Refrigerator'
  when 'smaelektrisk' then 'Zap'

  -- Interiør
  when 'mobler' then 'Armchair'
  when 'belysning' then 'Lightbulb'
  when 'tekstiler' then 'Layers'
  when 'kjokken-og-servise' then 'ChefHat'
  when 'dekorasjon' then 'Flower2'

  -- Hus og hage
  when 'verktoy' then 'Wrench'
  when 'byggevarer' then 'Hammer'
  when 'hage' then 'Trees'
  when 'stillas-og-sikkerhet' then 'HardHat'
  when 'tjenester' then 'Handshake'

  -- Klær og mote
  when 'herreklaer' then 'SuitJacket'
  when 'dameklaer' then 'Dress'
  when 'barneklaer' then 'Baby'
  when 'vesker-og-accessories' then 'Briefcase'
  when 'smykker-og-klokker' then 'Gem'
  when 'sport-og-undertoy' then 'ShoppingBag'

  -- Sport
  when 'trening-og-fitness' then 'Activity'
  when 'sykkel' then 'Bike'
  when 'ball-og-lagidrett' then 'Trophy'
  when 'vintersport' then 'Snowflake'
  when 'friluftsliv' then 'Tent'
  when 'festivalutstyr' then 'Guitar'

  -- Dyr og utstyr
  when 'hund' then 'Dog'
  when 'katt' then 'Cat'
  when 'smadyr' then 'Rabbit'
  when 'fugl-og-akvarium' then 'Bird'
  when 'hest' then 'Footprints'

  -- Bil og MC
  when 'bil' then 'Gauge'
  when 'bobil' then 'Caravan'
  when 'campingvogn' then 'Container'
  when 'mc-og-moped' then 'Wind'
  when 'atv' then 'Compass'
  when 'snoscooter' then 'MountainSnow'
  when 'tilhenger' then 'Warehouse'
  when 'lastebil-og-henger' then 'Truck'
  when 'buss-og-minibuss' then 'Bus'
  when 'traktor-og-redskap' then 'Tractor'
  when 'anleggsmaskiner' then 'Construction'

  -- Kunst
  when 'malerier-og-grafikk' then 'Paintbrush'
  when 'skulptur-og-keramikk' then 'Shapes'
  when 'hobby-og-handverk' then 'PaintRoller'
  when 'musikk' then 'Music'
  when 'boker-og-film' then 'Film'
  when 'samleobjekter' then 'Blocks'

  -- Barn og baby
  when 'barnevogn-og-bilstol' then 'Package'
  when 'mobler-til-barnerom' then 'ToyBrick'
  when 'lek-og-laering' then 'Puzzle'
  when 'amming-og-mat' then 'Milk'

  -- Båt
  when 'bater' then 'Sailboat'
  when 'motor' then 'Fuel'
  when 'tilbehor-og-utstyr' then 'Anchor'
  when 'vannsport' then 'Waves'

  else icon
end
where parent_id is not null
  and slug in (
    'dekk-og-felg', 'bilstereo-og-elektronikk', 'reservedeler',
    'tv-og-lyd', 'mobil-og-nettbrett', 'data', 'foto-og-video', 'gaming', 'hvitevarer', 'smaelektrisk',
    'mobler', 'belysning', 'tekstiler', 'kjokken-og-servise', 'dekorasjon',
    'verktoy', 'byggevarer', 'hage', 'stillas-og-sikkerhet', 'tjenester',
    'herreklaer', 'dameklaer', 'barneklaer', 'vesker-og-accessories', 'smykker-og-klokker', 'sport-og-undertoy',
    'trening-og-fitness', 'sykkel', 'ball-og-lagidrett', 'vintersport', 'friluftsliv', 'festivalutstyr',
    'hund', 'katt', 'smadyr', 'fugl-og-akvarium', 'hest',
    'bil', 'bobil', 'campingvogn', 'mc-og-moped', 'atv', 'snoscooter', 'tilhenger', 'lastebil-og-henger', 'buss-og-minibuss', 'traktor-og-redskap', 'anleggsmaskiner',
    'malerier-og-grafikk', 'skulptur-og-keramikk', 'hobby-og-handverk', 'musikk', 'boker-og-film', 'samleobjekter',
    'barnevogn-og-bilstol', 'mobler-til-barnerom', 'lek-og-laering', 'amming-og-mat',
    'bater', 'motor', 'tilbehor-og-utstyr', 'vannsport'
  );
