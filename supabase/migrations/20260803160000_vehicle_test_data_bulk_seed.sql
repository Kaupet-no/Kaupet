-- Stort testdatasett for merker/modeller/klasser (bil), kuratert fra ekstern liste
-- for a teste modellklasse-funksjonaliteten E2E. Kun kategori_group='bil'.

-- Abarth
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('Abarth', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('500'), ('500e'), ('595'), ('595 Competizione'), ('595 Turismo'), ('695'), ('124 Spider'), ('Grande Punto'), ('Punto Evo')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'Abarth' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- AC
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('AC', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('Cobra'), ('Ace'), ('Aceca'), ('3000ME'), ('Schnitzer')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'AC' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- Acura
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('Acura', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('Integra'), ('TLX'), ('TL'), ('ILX'), ('RLX'), ('RL'), ('MDX'), ('RDX'), ('ZDX'), ('NSX'), ('CL'), ('Legend')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'Acura' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- Aiways
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('Aiways', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('U5'), ('U6')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'Aiways' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- Aixam
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('Aixam', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('City'), ('Crossline'), ('Coupé'), ('GTO'), ('Mega')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'Aixam' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- Ariel
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('Ariel', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('Atom'), ('Nomad')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'Ariel' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- Artega
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('Artega', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('GT'), ('Scalo')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'Artega' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- Alfa Romeo
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('Alfa Romeo', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('Giulietta'), ('Giulia'), ('Stelvio'), ('Tonale'), ('4C'), ('Mito'), ('156'), ('147'), ('159'), ('166'), ('Brera'), ('Spider'), ('GT'), ('33'), ('75'), ('145'), ('146'), ('164'), ('GTV')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'Alfa Romeo' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- Alpina
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('Alpina', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('B3'), ('B4'), ('B5'), ('B6'), ('B7'), ('B8'), ('D3'), ('D4'), ('D5'), ('XD3'), ('XB7')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'Alpina' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- Alpine
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('Alpine', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('A110'), ('A310'), ('A610'), ('GTA'), ('A290')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'Alpine' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- Aston Martin
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('Aston Martin', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('DB9'), ('DB11'), ('DB12'), ('DBS'), ('DBX'), ('Vantage'), ('Vanquish'), ('Rapide'), ('Cygnet'), ('Valkyrie'), ('Valhalla')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'Aston Martin' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- Audi
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('Audi', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('A1'), ('A3'), ('A4'), ('A5'), ('A6'), ('A7'), ('A8'), ('Q2'), ('Q3'), ('Q4 e-tron'), ('Q5'), ('Q6 e-tron'), ('Q7'), ('Q8'), ('e-tron'), ('e-tron GT'), ('Q8 e-tron'), ('TT'), ('R8'), ('RS3'), ('RS4'), ('RS5'), ('RS6'), ('RS7'), ('RS Q8'), ('S3'), ('S4'), ('S5'), ('S6'), ('S7'), ('S8')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'Audi' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- Austin Healey
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('Austin Healey', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('Sprite'), ('100'), ('3000')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'Austin Healey' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- BAIC
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('BAIC', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('X55'), ('X7'), ('BJ40'), ('EU5'), ('EU7')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'BAIC' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- BAW
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('BAW', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('Yusheng'), ('BJ40')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'BAW' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- Bedford
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('Bedford', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('CF'), ('Rascal'), ('HA')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'Bedford' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- Bentley
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('Bentley', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('Continental GT'), ('Continental Flying Spur'), ('Bentayga'), ('Mulsanne'), ('Arnage'), ('Azure'), ('Brooklands'), ('Turbo R'), ('Flying Spur')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'Bentley' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- Brilliance
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('Brilliance', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('V5'), ('V6'), ('H230'), ('H320'), ('H330')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'Brilliance' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- BMW
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('BMW', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_model_classes (brand_id, name, status)
SELECT b.id, v.class_name, 'approved'
FROM (VALUES ('1-serie'), ('2-serie'), ('2-serie Active Tourer'), ('2-serie Gran Coupé'), ('3-serie'), ('4-serie'), ('4-serie Gran Coupé'), ('5-serie'), ('6-serie'), ('7-serie'), ('8-serie'), ('X1'), ('X2'), ('X3'), ('X4'), ('X5'), ('X6'), ('X7'), ('i3'), ('i4'), ('i5'), ('i7'), ('iX'), ('iX1'), ('iX2'), ('iX3'), ('M-modeller'), ('Z-serie')) AS v(class_name)
CROSS JOIN (SELECT id FROM public.vehicle_brands WHERE name = 'BMW' AND category_group = 'bil') b
ON CONFLICT (brand_id, name) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, class_id, name, status)
SELECT b.id, c.id, v.model, 'approved'
FROM (VALUES ('1-serie', '116i'), ('1-serie', '118i'), ('1-serie', '120i'), ('1-serie', '125i'), ('1-serie', '128ti'), ('1-serie', '135i'), ('1-serie', 'M135i'), ('1-serie', '116d'), ('1-serie', '118d'), ('1-serie', '120d'), ('1-serie', '123d'), ('1-serie', '125d'), ('2-serie', '218i'), ('2-serie', '220i'), ('2-serie', '228i'), ('2-serie', '230i'), ('2-serie', '235i'), ('2-serie', 'M240i'), ('2-serie', '218d'), ('2-serie', '220d'), ('2-serie', '225d'), ('2-serie Active Tourer', '216i'), ('2-serie Active Tourer', '218i'), ('2-serie Active Tourer', '220i'), ('2-serie Active Tourer', '225i'), ('2-serie Active Tourer', '216d'), ('2-serie Active Tourer', '218d'), ('2-serie Active Tourer', '220d'), ('2-serie Gran Coupé', '218i'), ('2-serie Gran Coupé', '220i'), ('2-serie Gran Coupé', 'M235i'), ('2-serie Gran Coupé', '218d'), ('2-serie Gran Coupé', '220d'), ('3-serie', '316i'), ('3-serie', '318i'), ('3-serie', '320i'), ('3-serie', '323i'), ('3-serie', '325i'), ('3-serie', '328i'), ('3-serie', '330i'), ('3-serie', '335i'), ('3-serie', '340i'), ('3-serie', '316d'), ('3-serie', '318d'), ('3-serie', '320d'), ('3-serie', '325d'), ('3-serie', '330d'), ('3-serie', '335d'), ('4-serie', '420i'), ('4-serie', '428i'), ('4-serie', '430i'), ('4-serie', '435i'), ('4-serie', '440i'), ('4-serie', '420d'), ('4-serie', '425d'), ('4-serie', '430d'), ('4-serie', '435d'), ('4-serie Gran Coupé', '420i'), ('4-serie Gran Coupé', '430i'), ('4-serie Gran Coupé', '440i'), ('4-serie Gran Coupé', '420d'), ('4-serie Gran Coupé', '430d'), ('5-serie', '518i'), ('5-serie', '520i'), ('5-serie', '523i'), ('5-serie', '525i'), ('5-serie', '528i'), ('5-serie', '530i'), ('5-serie', '535i'), ('5-serie', '540i'), ('5-serie', '550i'), ('5-serie', '518d'), ('5-serie', '520d'), ('5-serie', '525d'), ('5-serie', '530d'), ('5-serie', '535d'), ('5-serie', '540d'), ('6-serie', '630i'), ('6-serie', '635i'), ('6-serie', '640i'), ('6-serie', '650i'), ('6-serie', '630d'), ('6-serie', '635d'), ('6-serie', '640d'), ('7-serie', '725i'), ('7-serie', '728i'), ('7-serie', '730i'), ('7-serie', '735i'), ('7-serie', '740i'), ('7-serie', '745i'), ('7-serie', '750i'), ('7-serie', '760i'), ('7-serie', '725d'), ('7-serie', '730d'), ('7-serie', '740d'), ('7-serie', '750d'), ('8-serie', '840i'), ('8-serie', '850i'), ('8-serie', '840d'), ('8-serie', 'M850i'), ('X1', 'sDrive18i'), ('X1', 'sDrive20i'), ('X1', 'xDrive20i'), ('X1', 'xDrive25i'), ('X1', 'sDrive18d'), ('X1', 'xDrive20d'), ('X1', 'xDrive25d'), ('X2', 'sDrive18i'), ('X2', 'sDrive20i'), ('X2', 'xDrive20i'), ('X2', 'xDrive25i'), ('X2', 'M35i'), ('X2', 'sDrive18d'), ('X2', 'xDrive20d'), ('X2', 'xDrive25d'), ('X3', 'xDrive20i'), ('X3', 'xDrive30i'), ('X3', 'xDrive20d'), ('X3', 'xDrive30d'), ('X3', 'M40i'), ('X3', 'M40d'), ('X4', 'xDrive20i'), ('X4', 'xDrive30i'), ('X4', 'xDrive20d'), ('X4', 'xDrive30d'), ('X4', 'M40i'), ('X4', 'M40d'), ('X5', 'xDrive40i'), ('X5', 'xDrive45e'), ('X5', 'xDrive25d'), ('X5', 'xDrive30d'), ('X5', 'xDrive40d'), ('X5', 'M50d'), ('X5', 'M50i'), ('X6', 'xDrive40i'), ('X6', 'xDrive30d'), ('X6', 'xDrive40d'), ('X6', 'M50d'), ('X6', 'M50i'), ('X7', 'xDrive40i'), ('X7', 'xDrive40d'), ('X7', 'xDrive30d'), ('X7', 'M60i'), ('i3', 'i3'), ('i3', 'i3s'), ('i4', 'i4 eDrive35'), ('i4', 'i4 eDrive40'), ('i4', 'i4 xDrive40'), ('i4', 'i4 M50'), ('i5', 'i5 eDrive40'), ('i5', 'i5 xDrive40'), ('i5', 'i5 M60'), ('i7', 'i7 eDrive50'), ('i7', 'i7 xDrive60'), ('i7', 'i7 M70'), ('iX', 'iX xDrive40'), ('iX', 'iX xDrive50'), ('iX', 'iX M60'), ('iX1', 'iX1 eDrive20'), ('iX1', 'iX1 xDrive30'), ('iX2', 'iX2 eDrive20'), ('iX2', 'iX2 xDrive30'), ('iX3', 'iX3'), ('M-modeller', 'M2'), ('M-modeller', 'M3'), ('M-modeller', 'M4'), ('M-modeller', 'M5'), ('M-modeller', 'M8'), ('M-modeller', 'X3 M'), ('M-modeller', 'X4 M'), ('M-modeller', 'X5 M'), ('M-modeller', 'X6 M'), ('Z-serie', 'Z3'), ('Z-serie', 'Z4')) AS v(class_name, model)
JOIN public.vehicle_model_classes c ON c.name = v.class_name AND c.brand_id = (SELECT id FROM public.vehicle_brands WHERE name = 'BMW' AND category_group = 'bil')
JOIN public.vehicle_brands b ON b.id = c.brand_id
ON CONFLICT (brand_id, name) DO NOTHING;

-- Bugatti
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('Bugatti', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('Veyron'), ('Chiron'), ('EB110'), ('Divo')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'Bugatti' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- Buick
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('Buick', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('Regal'), ('LaCrosse'), ('Enclave'), ('Encore'), ('Envision'), ('Century'), ('Riviera'), ('Skylark'), ('Roadmaster')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'Buick' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- BYD
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('BYD', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('Atto 3'), ('Dolphin'), ('Seal'), ('Seal U'), ('Han'), ('Tang'), ('Song'), ('Yuan')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'BYD' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- Cadillac
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('Cadillac', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('CTS'), ('CT4'), ('CT5'), ('CT6'), ('ATS'), ('XT4'), ('XT5'), ('XT6'), ('Escalade'), ('SRX'), ('DeVille'), ('Eldorado'), ('Seville'), ('BLS'), ('Lyriq')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'Cadillac' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- Casalini
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('Casalini', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('M10'), ('M12'), ('Sulky')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'Casalini' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- Caterham
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('Caterham', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('Seven'), ('620')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'Caterham' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- Chevrolet
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('Chevrolet', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('Aveo'), ('Cruze'), ('Malibu'), ('Impala'), ('Camaro'), ('Corvette'), ('Spark'), ('Trax'), ('Captiva'), ('Orlando'), ('Matiz'), ('Lacetti'), ('Kalos'), ('Epica'), ('Volt'), ('Bolt'), ('Suburban'), ('Tahoe'), ('Silverado'), ('Blazer')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'Chevrolet' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- Chrysler
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('Chrysler', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('300C'), ('300M'), ('Sebring'), ('PT Cruiser'), ('Voyager'), ('Grand Voyager'), ('Crossfire'), ('Neon'), ('Stratus'), ('Pacifica')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'Chrysler' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- Citroën
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('Citroën', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('C1'), ('C2'), ('C3'), ('C3 Aircross'), ('C4'), ('C4 Cactus'), ('C4 X'), ('C5'), ('C5 Aircross'), ('C5 X'), ('C6'), ('Berlingo'), ('Jumpy'), ('Jumper'), ('DS3 (tidligere Citroën-modell)'), ('Xsara'), ('Xantia'), ('ZX'), ('Saxo'), ('Picasso'), ('Grand Picasso'), ('Ami')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'Citroën' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- Cupra
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('Cupra', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('Leon'), ('Formentor'), ('Ateca'), ('Born'), ('Tavascan')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'Cupra' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- Dacia
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('Dacia', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('Sandero'), ('Sandero Stepway'), ('Logan'), ('Duster'), ('Spring'), ('Jogger'), ('Lodgy'), ('Dokker')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'Dacia' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- Daewoo
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('Daewoo', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('Matiz'), ('Lanos'), ('Nubira'), ('Leganza'), ('Kalos'), ('Tacuma'), ('Espero'), ('Tico')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'Daewoo' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- Daihatsu
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('Daihatsu', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('Cuore'), ('Sirion'), ('Terios'), ('Materia'), ('Copen'), ('YRV'), ('Charade'), ('Applause')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'Daihatsu' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- Dallara
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('Dallara', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('Stradale')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'Dallara' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- Datsun
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('Datsun', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('240Z'), ('260Z'), ('280Z'), ('redi-GO'), ('GO'), ('on-DO')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'Datsun' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- DeLorean
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('DeLorean', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('DMC-12')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'DeLorean' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- DeTomaso
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('DeTomaso', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('Pantera'), ('Longchamp'), ('Guarà')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'DeTomaso' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- Dodge
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('Dodge', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('Charger'), ('Challenger'), ('Viper'), ('Nitro'), ('Journey'), ('Caliber'), ('Avenger'), ('Ram'), ('Durango'), ('Neon'), ('Stratus'), ('Magnum')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'Dodge' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- Donkervoort
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('Donkervoort', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('D8'), ('D10')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'Donkervoort' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- DS Automobiles
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('DS Automobiles', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('DS3'), ('DS3 Crossback'), ('DS4'), ('DS5'), ('DS7'), ('DS7 Crossback'), ('DS9')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'DS Automobiles' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- e.GO
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('e.GO', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('Life'), ('Life Cross')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'e.GO' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- Ferrari
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('Ferrari', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('296'), ('488'), ('458'), ('430'), ('360'), ('F8 Tributo'), ('SF90'), ('Roma'), ('Portofino'), ('California'), ('812'), ('812 Superfast'), ('FF'), ('GTC4Lusso'), ('Purosangue'), ('Testarossa'), ('F12berlinetta'), ('Enzo'), ('LaFerrari'), ('Daytona SP3')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'Ferrari' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- Fiat
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('Fiat', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('500'), ('500X'), ('500L'), ('Panda'), ('Punto'), ('Tipo'), ('Bravo'), ('Doblo'), ('Idea'), ('Croma'), ('Ulysse'), ('Multipla'), ('Sedici'), ('Freemont'), ('Marea'), ('Stilo'), ('Ducato'), ('Talento'), ('500e')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'Fiat' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- Fisker
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('Fisker', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('Karma'), ('Ocean')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'Fisker' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- Ford
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('Ford', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('Fiesta'), ('Focus'), ('Mondeo'), ('Ka'), ('Puma'), ('Kuga'), ('EcoSport'), ('Edge'), ('Explorer'), ('Galaxy'), ('S-Max'), ('C-Max'), ('B-Max'), ('Mustang'), ('Mustang Mach-E'), ('Ranger'), ('Transit'), ('Transit Custom'), ('Tourneo Connect'), ('Tourneo Custom'), ('Streetka'), ('Cougar'), ('Scorpio'), ('Sierra'), ('Escort'), ('Orion'), ('Probe')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'Ford' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- Geely
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('Geely', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('Coolray'), ('Emgrand'), ('Atlas'), ('Tugella')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'Geely' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- Gemballa
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('Gemballa', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('Avalanche'), ('Mirage GT')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'Gemballa' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- Genesis
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('Genesis', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('G70'), ('G80'), ('G90'), ('GV60'), ('GV70'), ('GV80')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'Genesis' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- GMC
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('GMC', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('Sierra'), ('Yukon'), ('Terrain'), ('Acadia'), ('Canyon'), ('Savana')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'GMC' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- Holden
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('Holden', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('Commodore'), ('Astra'), ('Barina'), ('Captiva'), ('Cruze'), ('Ute'), ('Monaro')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'Holden' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- Honda
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('Honda', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('Civic'), ('Accord'), ('Jazz'), ('CR-V'), ('HR-V'), ('e:Ny1'), ('e (elbil)'), ('Insight'), ('Legend'), ('Prelude'), ('S2000'), ('NSX'), ('FR-V'), ('Stream'), ('Element')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'Honda' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- Hongqi
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('Hongqi', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('H5'), ('H9'), ('E-HS9'), ('HS5'), ('HS7')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'Hongqi' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- Hummer
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('Hummer', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('H1'), ('H2'), ('H3'), ('EV')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'Hummer' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- Hyundai
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('Hyundai', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('i10'), ('i20'), ('i30'), ('i40'), ('ix20'), ('ix35'), ('Kona'), ('Tucson'), ('Santa Fe'), ('Palisade'), ('Bayon'), ('Elantra'), ('Sonata'), ('Accent'), ('Getz'), ('Matrix'), ('Coupé'), ('Genesis Coupe'), ('Ioniq'), ('Ioniq 5'), ('Ioniq 6'), ('Nexo'), ('Terracan'), ('Trajet')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'Hyundai' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- INEOS
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('INEOS', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('Grenadier')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'INEOS' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- Infiniti
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('Infiniti', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('Q30'), ('Q50'), ('Q60'), ('Q70'), ('QX30'), ('QX50'), ('QX60'), ('QX70'), ('QX80'), ('FX'), ('EX'), ('G37'), ('M37')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'Infiniti' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- Invicta
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('Invicta', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('S1')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'Invicta' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- Isuzu
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('Isuzu', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('D-Max'), ('Trooper'), ('Rodeo'), ('MU-X'), ('Campo')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'Isuzu' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- Iveco
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('Iveco', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('Daily'), ('Massif'), ('Turbo Daily'), ('EuroCargo')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'Iveco' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- JAC
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('JAC', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('J5'), ('J6'), ('J7'), ('iEV7S'), ('JS4'), ('JS6')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'JAC' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- Jaecoo
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('Jaecoo', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('J7'), ('J8')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'Jaecoo' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- Jaguar
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('Jaguar', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('XE'), ('XF'), ('XJ'), ('F-Type'), ('F-Pace'), ('E-Pace'), ('I-Pace'), ('X-Type'), ('S-Type')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'Jaguar' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- Jeep
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('Jeep', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('Renegade'), ('Compass'), ('Cherokee'), ('Grand Cherokee'), ('Wrangler'), ('Avenger'), ('Patriot'), ('Commander'), ('Gladiator')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'Jeep' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- KGM
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('KGM', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('Torres'), ('Torres EVX'), ('Musso'), ('Rexton'), ('Actyon')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'KGM' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- KIA
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('KIA', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('Picanto'), ('Rio'), ('Ceed'), ('Proceed'), ('Xceed'), ('Stonic'), ('Sportage'), ('Sorento'), ('Niro'), ('Soul'), ('Optima'), ('Stinger'), ('Venga'), ('Carens'), ('Carnival'), ('EV6'), ('EV9'), ('e-Niro')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'KIA' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- Koenigsegg
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('Koenigsegg', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('Agera'), ('Regera'), ('Jesko'), ('CCX'), ('Gemera')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'Koenigsegg' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- KTM
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('KTM', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('X-Bow')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'KTM' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- Lada
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('Lada', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('Niva'), ('Kalina'), ('Granta'), ('Vesta'), ('2107'), ('Samara')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'Lada' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- Lamborghini
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('Lamborghini', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('Huracán'), ('Aventador'), ('Gallardo'), ('Murciélago'), ('Urus'), ('Revuelto'), ('Diablo'), ('Countach')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'Lamborghini' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- Lancia
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('Lancia', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('Ypsilon'), ('Delta'), ('Musa'), ('Thesis'), ('Kappa'), ('Lybra'), ('Phedra'), ('Voyager')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'Lancia' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- Land Rover
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('Land Rover', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('Defender'), ('Discovery'), ('Discovery Sport'), ('Range Rover'), ('Range Rover Sport'), ('Range Rover Evoque'), ('Range Rover Velar'), ('Freelander')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'Land Rover' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- Landwind
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('Landwind', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('X7'), ('CV9'), ('X2')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'Landwind' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- Leapmotor
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('Leapmotor', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('T03'), ('C10'), ('C11')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'Leapmotor' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- LEVC
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('LEVC', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('TX'), ('VN5')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'LEVC' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- Lexus
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('Lexus', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('IS'), ('ES'), ('GS'), ('LS'), ('CT'), ('UX'), ('NX'), ('RX'), ('GX'), ('LX'), ('RC'), ('LC'), ('RZ')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'Lexus' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- Ligier
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('Ligier', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('JS50'), ('JS60'), ('Ambra'), ('Nova')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'Ligier' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- Lincoln
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('Lincoln', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('MKZ'), ('MKC'), ('MKX'), ('Navigator'), ('Continental'), ('Aviator'), ('Corsair'), ('Town Car')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'Lincoln' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- Lotus
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('Lotus', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('Elise'), ('Exige'), ('Evora'), ('Emira'), ('Eletre'), ('Esprit')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'Lotus' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- Lucid
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('Lucid', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('Air'), ('Gravity')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'Lucid' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- Lynk & Co
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('Lynk & Co', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('01'), ('02'), ('03')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'Lynk & Co' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- Mahindra
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('Mahindra', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('XUV300'), ('XUV500'), ('Scorpio'), ('Bolero'), ('Thar')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'Mahindra' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- MAN
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('MAN', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('TGE')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'MAN' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- Maserati
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('Maserati', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('Ghibli'), ('Quattroporte'), ('Levante'), ('GranTurismo'), ('GranCabrio'), ('MC20'), ('Grecale')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'Maserati' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- Maxus
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('Maxus', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('eDeliver 3'), ('eDeliver 9'), ('T60'), ('T90'), ('G10')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'Maxus' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- Maybach
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('Maybach', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('57'), ('62'), ('S-Class Maybach')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'Maybach' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- Mazda
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('Mazda', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('2'), ('3'), ('6'), ('CX-3'), ('CX-30'), ('CX-5'), ('CX-60'), ('CX-80'), ('MX-5'), ('MX-30'), ('RX-8'), ('RX-7'), ('5'), ('121'), ('626'), ('323')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'Mazda' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- McLaren
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('McLaren', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('570S'), ('600LT'), ('650S'), ('675LT'), ('720S'), ('750S'), ('765LT'), ('Artura'), ('GT'), ('P1'), ('Senna'), ('12C')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'McLaren' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- Mercedes-Benz
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('Mercedes-Benz', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_model_classes (brand_id, name, status)
SELECT b.id, v.class_name, 'approved'
FROM (VALUES ('A-klasse'), ('B-klasse'), ('C-klasse'), ('E-klasse'), ('S-klasse'), ('CLA-klasse'), ('CLS-klasse'), ('CLE-klasse'), ('G-klasse'), ('GLA'), ('GLB'), ('GLC'), ('GLE'), ('GLS'), ('EQ (elbil)'), ('V-klasse / Vito'), ('SL'), ('SLC / SLK'), ('AMG GT'), ('Andre')) AS v(class_name)
CROSS JOIN (SELECT id FROM public.vehicle_brands WHERE name = 'Mercedes-Benz' AND category_group = 'bil') b
ON CONFLICT (brand_id, name) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, class_id, name, status)
SELECT b.id, c.id, v.model, 'approved'
FROM (VALUES ('A-klasse', 'A140'), ('A-klasse', 'A150'), ('A-klasse', 'A160'), ('A-klasse', 'A170'), ('A-klasse', 'A180'), ('A-klasse', 'A190'), ('A-klasse', 'A200'), ('A-klasse', 'A210'), ('A-klasse', 'A220'), ('A-klasse', 'A250'), ('A-klasse', 'A35 AMG'), ('A-klasse', 'A45 AMG'), ('A-klasse', 'A45 S AMG'), ('B-klasse', 'B150'), ('B-klasse', 'B160'), ('B-klasse', 'B170'), ('B-klasse', 'B180'), ('B-klasse', 'B200'), ('B-klasse', 'B220'), ('B-klasse', 'B250'), ('C-klasse', 'C160'), ('C-klasse', 'C180'), ('C-klasse', 'C200'), ('C-klasse', 'C220'), ('C-klasse', 'C230'), ('C-klasse', 'C240'), ('C-klasse', 'C250'), ('C-klasse', 'C270'), ('C-klasse', 'C280'), ('C-klasse', 'C300'), ('C-klasse', 'C320'), ('C-klasse', 'C350'), ('C-klasse', 'C400'), ('C-klasse', 'C43 AMG'), ('C-klasse', 'C55 AMG'), ('C-klasse', 'C63 AMG'), ('E-klasse', 'E200'), ('E-klasse', 'E220'), ('E-klasse', 'E230'), ('E-klasse', 'E240'), ('E-klasse', 'E250'), ('E-klasse', 'E270'), ('E-klasse', 'E280'), ('E-klasse', 'E300'), ('E-klasse', 'E320'), ('E-klasse', 'E350'), ('E-klasse', 'E400'), ('E-klasse', 'E420'), ('E-klasse', 'E430'), ('E-klasse', 'E450'), ('E-klasse', 'E500'), ('E-klasse', 'E550'), ('E-klasse', 'E55 AMG'), ('E-klasse', 'E63 AMG'), ('S-klasse', 'S250'), ('S-klasse', 'S280'), ('S-klasse', 'S300'), ('S-klasse', 'S320'), ('S-klasse', 'S350'), ('S-klasse', 'S400'), ('S-klasse', 'S420'), ('S-klasse', 'S450'), ('S-klasse', 'S500'), ('S-klasse', 'S550'), ('S-klasse', 'S560'), ('S-klasse', 'S600'), ('S-klasse', 'S63 AMG'), ('S-klasse', 'S65 AMG'), ('CLA-klasse', 'CLA180'), ('CLA-klasse', 'CLA200'), ('CLA-klasse', 'CLA220'), ('CLA-klasse', 'CLA250'), ('CLA-klasse', 'CLA35 AMG'), ('CLA-klasse', 'CLA45 AMG'), ('CLS-klasse', 'CLS250'), ('CLS-klasse', 'CLS300'), ('CLS-klasse', 'CLS320'), ('CLS-klasse', 'CLS350'), ('CLS-klasse', 'CLS400'), ('CLS-klasse', 'CLS500'), ('CLS-klasse', 'CLS550'), ('CLS-klasse', 'CLS63 AMG'), ('CLE-klasse', 'CLE200'), ('CLE-klasse', 'CLE300'), ('CLE-klasse', 'CLE450'), ('CLE-klasse', 'CLE53 AMG'), ('G-klasse', 'G350'), ('G-klasse', 'G400'), ('G-klasse', 'G500'), ('G-klasse', 'G550'), ('G-klasse', 'G55 AMG'), ('G-klasse', 'G63 AMG'), ('G-klasse', 'G65 AMG'), ('GLA', 'GLA180'), ('GLA', 'GLA200'), ('GLA', 'GLA220'), ('GLA', 'GLA250'), ('GLA', 'GLA35 AMG'), ('GLA', 'GLA45 AMG'), ('GLB', 'GLB180'), ('GLB', 'GLB200'), ('GLB', 'GLB220'), ('GLB', 'GLB250'), ('GLC', 'GLC200'), ('GLC', 'GLC220'), ('GLC', 'GLC250'), ('GLC', 'GLC300'), ('GLC', 'GLC43 AMG'), ('GLC', 'GLC63 AMG'), ('GLE', 'GLE300'), ('GLE', 'GLE350'), ('GLE', 'GLE400'), ('GLE', 'GLE450'), ('GLE', 'GLE580'), ('GLE', 'GLE53 AMG'), ('GLE', 'GLE63 AMG'), ('GLS', 'GLS400'), ('GLS', 'GLS450'), ('GLS', 'GLS500'), ('GLS', 'GLS580'), ('GLS', 'GLS63 AMG'), ('EQ (elbil)', 'EQA'), ('EQ (elbil)', 'EQB'), ('EQ (elbil)', 'EQC'), ('EQ (elbil)', 'EQE'), ('EQ (elbil)', 'EQS'), ('EQ (elbil)', 'EQV'), ('V-klasse / Vito', 'V-klasse'), ('V-klasse / Vito', 'Vito'), ('V-klasse / Vito', 'Viano'), ('SL', 'SL280'), ('SL', 'SL300'), ('SL', 'SL320'), ('SL', 'SL350'), ('SL', 'SL400'), ('SL', 'SL500'), ('SL', 'SL550'), ('SL', 'SL55 AMG'), ('SL', 'SL63 AMG'), ('SL', 'SL65 AMG'), ('SLC / SLK', 'SLC180'), ('SLC / SLK', 'SLC200'), ('SLC / SLK', 'SLC300'), ('SLC / SLK', 'SLK200'), ('SLC / SLK', 'SLK230'), ('SLC / SLK', 'SLK250'), ('SLC / SLK', 'SLK280'), ('SLC / SLK', 'SLK350'), ('AMG GT', 'AMG GT'), ('AMG GT', 'AMG GT S'), ('AMG GT', 'AMG GT C'), ('AMG GT', 'AMG GT R'), ('AMG GT', 'AMG GT 4-Door Coupé'), ('Andre', 'Sprinter'), ('Andre', 'Citan')) AS v(class_name, model)
JOIN public.vehicle_model_classes c ON c.name = v.class_name AND c.brand_id = (SELECT id FROM public.vehicle_brands WHERE name = 'Mercedes-Benz' AND category_group = 'bil')
JOIN public.vehicle_brands b ON b.id = c.brand_id
ON CONFLICT (brand_id, name) DO NOTHING;

-- MG
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('MG', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('MG3'), ('MG4'), ('MG5'), ('ZS'), ('HS'), ('Marvel R'), ('Cyberster'), ('6')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'MG' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- Microlino
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('Microlino', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('Microlino'), ('Microlino Lite')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'Microlino' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- MINI
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('MINI', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('Cooper'), ('Cooper S'), ('One'), ('Clubman'), ('Countryman'), ('Paceman'), ('Cabrio'), ('Aceman'), ('Coupé (MINI)')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'MINI' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- Mitsubishi
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('Mitsubishi', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('Space Star'), ('Colt'), ('ASX'), ('Eclipse Cross'), ('Outlander'), ('Pajero'), ('L200'), ('Lancer'), ('Galant'), ('Carisma'), ('Grandis')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'Mitsubishi' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- Morgan
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('Morgan', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('Plus Four'), ('Plus Six'), ('3 Wheeler'), ('Aero 8')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'Morgan' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- NIO
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('NIO', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('ES6'), ('ES8'), ('ET5'), ('ET7'), ('EL6'), ('EL7')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'NIO' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- Nissan
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('Nissan', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('Micra'), ('Note'), ('Leaf'), ('Juke'), ('Qashqai'), ('X-Trail'), ('Ariya'), ('Navara'), ('Pathfinder'), ('Murano'), ('350Z'), ('370Z'), ('GT-R'), ('Almera'), ('Primera'), ('Sunny'), ('Terrano'), ('Patrol'), ('Pixo'), ('Cube')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'Nissan' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- Oldsmobile
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('Oldsmobile', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('Cutlass'), ('Alero'), ('Aurora'), ('88'), ('98'), ('Silhouette')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'Oldsmobile' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- Opel
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('Opel', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('Corsa'), ('Astra'), ('Insignia'), ('Mokka'), ('Crossland'), ('Grandland'), ('Combo'), ('Zafira'), ('Meriva'), ('Vectra'), ('Omega'), ('Signum'), ('Tigra'), ('Agila'), ('Antara'), ('Ampera'), ('Adam'), ('Karl'), ('Vivaro'), ('Movano')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'Opel' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- ORA
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('ORA', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('Funky Cat / 03'), ('Lightning Cat')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'ORA' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- Packard
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('Packard', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('Clipper'), ('Caribbean'), ('Patrician')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'Packard' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- Pagani
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('Pagani', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('Zonda'), ('Huayra')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'Pagani' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- Peugeot
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('Peugeot', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('108'), ('208'), ('308'), ('508'), ('2008'), ('3008'), ('5008'), ('Partner'), ('Rifter'), ('Traveller'), ('Expert'), ('Boxer'), ('107'), ('206'), ('207'), ('306'), ('307'), ('406'), ('407'), ('607'), ('807'), ('RCZ'), ('e-208'), ('e-2008')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'Peugeot' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- Piaggio
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('Piaggio', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('Porter'), ('Ape')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'Piaggio' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- Plymouth
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('Plymouth', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('Barracuda'), ('Road Runner'), ('Fury'), ('Voyager'), ('Neon')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'Plymouth' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- Polestar
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('Polestar', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('1'), ('2'), ('3'), ('4')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'Polestar' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- Pontiac
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('Pontiac', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('Firebird'), ('Trans Am'), ('Grand Am'), ('Grand Prix'), ('Solstice'), ('Vibe'), ('G6')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'Pontiac' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- Porsche
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('Porsche', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('911'), ('718 Boxster'), ('718 Cayman'), ('Panamera'), ('Macan'), ('Cayenne'), ('Taycan'), ('924'), ('928'), ('944'), ('968'), ('356')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'Porsche' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- Proton
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('Proton', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('Saga'), ('Persona'), ('X50'), ('X70'), ('Gen-2'), ('Wira')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'Proton' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- Renault
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('Renault', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('Clio'), ('Captur'), ('Megane'), ('Scenic'), ('Espace'), ('Talisman'), ('Twingo'), ('Kadjar'), ('Koleos'), ('Zoe'), ('Kangoo'), ('Trafic'), ('Master'), ('Laguna'), ('Grand Scenic'), ('Austral'), ('Arkana')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'Renault' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- Riley
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('Riley', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('RM'), ('Elf'), ('Kestrel')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'Riley' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- Rimac
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('Rimac', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('Concept One'), ('C_Two'), ('Nevera')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'Rimac' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- Rolls-Royce
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('Rolls-Royce', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('Phantom'), ('Ghost'), ('Wraith'), ('Dawn'), ('Cullinan'), ('Silver Shadow'), ('Silver Spirit'), ('Corniche'), ('Spectre')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'Rolls-Royce' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- Rover
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('Rover', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('25'), ('45'), ('75'), ('200'), ('400'), ('600'), ('800'), ('Mini (klassisk Rover Mini)'), ('Streetwise')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'Rover' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- Ruf
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('Ruf', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('CTR'), ('RGT'), ('SCR')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'Ruf' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- SAAB
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('SAAB', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('900'), ('9-3'), ('9-5'), ('9000'), ('90'), ('96')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'SAAB' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- Santana
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('Santana', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('PS-10'), ('Anibal')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'Santana' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- Seat
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('Seat', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('Ibiza'), ('Leon'), ('Arona'), ('Ateca'), ('Tarraco'), ('Alhambra'), ('Toledo'), ('Altea'), ('Cordoba'), ('Exeo'), ('Mii')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'Seat' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- Seres
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('Seres', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('3'), ('5')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'Seres' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- Skoda
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('Skoda', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('Fabia'), ('Scala'), ('Octavia'), ('Superb'), ('Kamiq'), ('Karoq'), ('Kodiaq'), ('Enyaq'), ('Citigo'), ('Rapid'), ('Yeti'), ('Roomster'), ('Felicia')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'Skoda' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- Smart
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('Smart', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('ForTwo'), ('ForFour'), ('Roadster'), ('#1'), ('#3')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'Smart' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- Spyker
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('Spyker', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('C8')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'Spyker' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- Ssangyong
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('Ssangyong', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('Tivoli'), ('Korando'), ('Rexton'), ('Musso'), ('Actyon'), ('Kyron'), ('Rodius')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'Ssangyong' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- Studebaker
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('Studebaker', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('Champion'), ('Commander'), ('Avanti'), ('Lark')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'Studebaker' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- Subaru
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('Subaru', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('Impreza'), ('Legacy'), ('Outback'), ('Forester'), ('XV'), ('Levorg'), ('BRZ'), ('Solterra'), ('Justy'), ('Tribeca')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'Subaru' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- Suzuki
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('Suzuki', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('Swift'), ('Vitara'), ('SX4'), ('S-Cross'), ('Jimny'), ('Baleno'), ('Ignis'), ('Splash'), ('Alto'), ('Celerio'), ('Grand Vitara'), ('Across')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'Suzuki' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- Talbot
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('Talbot', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('Samba'), ('Horizon'), ('Alpine'), ('Solara')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'Talbot' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- Tata
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('Tata', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('Nexon'), ('Tiago'), ('Punch'), ('Tigor'), ('Harrier'), ('Safari')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'Tata' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- Tesla
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('Tesla', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('Model S'), ('Model 3'), ('Model X'), ('Model Y'), ('Cybertruck'), ('Roadster')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'Tesla' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- Toyota
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('Toyota', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('Aygo'), ('Yaris'), ('Yaris Cross'), ('Corolla'), ('Corolla Cross'), ('Camry'), ('Avensis'), ('Auris'), ('C-HR'), ('RAV4'), ('Highlander'), ('Land Cruiser'), ('Prius'), ('Hilux'), ('Proace'), ('Supra'), ('GR86'), ('bZ4X'), ('Verso'), ('Previa'), ('Celica'), ('MR2')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'Toyota' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- Trabant
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('Trabant', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('601'), ('1.1')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'Trabant' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- Triumph
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('Triumph', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('TR6'), ('TR7'), ('Spitfire'), ('Herald'), ('Stag'), ('Dolomite')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'Triumph' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- TVR
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('TVR', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('Chimaera'), ('Griffith'), ('Tuscan'), ('Cerbera'), ('Sagaris')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'TVR' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- VinFast
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('VinFast', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('VF 8'), ('VF 9'), ('VF e34')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'VinFast' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- Volkswagen
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('Volkswagen', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('Up'), ('Polo'), ('Golf'), ('Golf Plus'), ('Jetta'), ('Passat'), ('Arteon'), ('T-Cross'), ('T-Roc'), ('Tiguan'), ('Touareg'), ('Touran'), ('Sharan'), ('Caddy'), ('Transporter'), ('Multivan'), ('California'), ('ID.3'), ('ID.4'), ('ID.5'), ('ID.7'), ('ID.Buzz'), ('Beetle'), ('Scirocco'), ('Bora'), ('Lupo'), ('Fox'), ('Amarok')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'Volkswagen' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- Volvo
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('Volvo', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('V40'), ('V60'), ('V90'), ('S60'), ('S90'), ('XC40'), ('XC60'), ('XC90'), ('C30'), ('C40'), ('C70'), ('850'), ('940'), ('960'), ('EX30'), ('EX90')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'Volvo' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- Voyah
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('Voyah', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('Free'), ('Dreamer'), ('Passion')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'Voyah' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- Westfield
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('Westfield', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('Sport'), ('SEight'), ('XTR2')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'Westfield' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- Wiesmann
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('Wiesmann', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('MF3'), ('MF4'), ('MF5'), ('GT MF5'), ('Project Thunderball')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'Wiesmann' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- XPENG
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('XPENG', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('P5'), ('P7'), ('G3'), ('G6'), ('G9')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'XPENG' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

-- Zeekr
INSERT INTO public.vehicle_brands (name, category_group, status)
VALUES ('Zeekr', 'bil', 'approved')
ON CONFLICT (name, category_group) DO NOTHING;
INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES ('001'), ('007'), ('X'), ('009')) AS v(model)
JOIN public.vehicle_brands b ON b.name = 'Zeekr' AND b.category_group = 'bil'
ON CONFLICT (brand_id, name) DO NOTHING;

