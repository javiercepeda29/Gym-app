const XLSX = require('xlsx');
const crypto = require('crypto');

const DATASET_API =
  'https://entrepot.recherche.data.gouv.fr/api/datasets/:persistentId/?persistentId=doi:10.57745/RDMHWY';

const FILE_NAME =
  'Table Ciqual 2025_FR_2025_11_03.xlsx';

const EXPECTED_MD5 =
  '0d9758ce23f3f13dd63a005bc1bb4f2c';

const IMPORT_URL =
  'https://kpejsuncutkbgktqlcwe.supabase.co/functions/v1/import-nutrition-batch';

const IMPORT_TOKEN =
  'ciqual-batch-2025-once';

const BATCH_SIZE = 100;

function normalize(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function parseNutrient(value) {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return {
      value: null,
      raw: null,
      estimated: false,
    };
  }

  if (
    typeof value === 'number' &&
    Number.isFinite(value)
  ) {
    return {
      value,
      raw: String(value),
      estimated: false,
    };
  }

  const raw = String(value).trim();
  const normalized = normalize(raw);

  if (
    !raw ||
    raw === '-' ||
    normalized === 'nd' ||
    normalized === 'na'
  ) {
    return {
      value: null,
      raw,
      estimated: false,
    };
  }

  if (
    normalized.includes('trace') ||
    normalized.includes('traces')
  ) {
    return {
      value: 0,
      raw,
      estimated: true,
    };
  }

  const match = raw
    .replace(',', '.')
    .match(/-?\d+(?:\.\d+)?/);

  if (!match) {
    return {
      value: null,
      raw,
      estimated: false,
    };
  }

  const numeric = Number(match[0]);

  if (!Number.isFinite(numeric)) {
    return {
      value: null,
      raw,
      estimated: false,
    };
  }

  if (raw.startsWith('<')) {
    return {
      value: numeric / 2,
      raw,
      estimated: true,
    };
  }

  return {
    value: numeric,
    raw,
    estimated: false,
  };
}

function findHeader(headers, checks) {
  for (const check of checks) {
    const found = headers.find((header) =>
      check(normalize(header))
    );

    if (found) return found;
  }

  return null;
}

async function downloadCiqual() {
  console.log('Buscando CIQUAL 2025 oficial...');

  const metadataResponse =
    await fetch(DATASET_API);

  if (!metadataResponse.ok) {
    throw new Error(
      `No se pudo consultar el dataset: HTTP ${metadataResponse.status}`
    );
  }

  const metadata =
    await metadataResponse.json();

  const files =
    metadata?.data?.latestVersion?.files || [];

  let file = files.find(
    (item) =>
      item?.dataFile?.filename === FILE_NAME
  );

  if (!file) {
    file = files.find((item) => {
      const filename =
        String(
          item?.dataFile?.filename || ''
        ).toLowerCase();

      return (
        filename.includes('ciqual 2025') &&
        filename.endsWith('.xlsx')
      );
    });
  }

  if (!file?.dataFile?.id) {
    console.log(
      'Archivos encontrados:',
      files.map(
        (item) =>
          item?.dataFile?.filename
      )
    );

    throw new Error(
      'No se encontró el Excel oficial de CIQUAL 2025.'
    );
  }

  const fileId =
    file.dataFile.id;

  console.log(
    `Archivo encontrado: ${file.dataFile.filename}`
  );

  console.log(
    `ID del archivo: ${fileId}`
  );

  const downloadUrl =
    `https://entrepot.recherche.data.gouv.fr/api/access/datafile/${fileId}`;

  console.log(
    'Descargando CIQUAL 2025...'
  );

  const response =
    await fetch(downloadUrl);

  if (!response.ok) {
    throw new Error(
      `No se pudo descargar CIQUAL: HTTP ${response.status}`
    );
  }

  const buffer =
    Buffer.from(
      await response.arrayBuffer()
    );

  const md5 =
    crypto
      .createHash('md5')
      .update(buffer)
      .digest('hex');

  console.log(
    `MD5 descargado: ${md5}`
  );

  if (md5 !== EXPECTED_MD5) {
    throw new Error(
      `MD5 incorrecto. Esperado ${EXPECTED_MD5}, recibido ${md5}.`
    );
  }

  console.log(
    'Fichero oficial verificado correctamente.'
  );

  return buffer;
}

function readCiqual(buffer) {
  const workbook =
    XLSX.read(buffer, {
      type: 'buffer',
    });

  for (
    const sheetName
    of workbook.SheetNames
  ) {
    const sheet =
      workbook.Sheets[sheetName];

    const rows =
      XLSX.utils.sheet_to_json(
        sheet,
        {
          defval: null,
        }
      );

    if (!rows.length) continue;

    const headers =
      Object.keys(rows[0]);

    const hasFoodCode =
      headers.some(
        (header) =>
          normalize(header) ===
          'alim_code'
      );

    if (hasFoodCode) {
      console.log(
        `Hoja nutricional: ${sheetName}`
      );

      return rows;
    }
  }

  throw new Error(
    'No se encontró la hoja de composición nutricional.'
  );
}

function prepareFoods(rows) {
  const headers =
    Object.keys(rows[0]);

  const hCode =
    findHeader(headers, [
      (h) => h === 'alim_code',
    ]);

  const hName =
    findHeader(headers, [
      (h) => h === 'alim_nom_fr',
    ]);

  const hGroup =
    findHeader(headers, [
      (h) =>
        h === 'alim_grp_nom_fr',
    ]);

  const hSubGroup =
    findHeader(headers, [
      (h) =>
        h === 'alim_ssgrp_nom_fr',
    ]);

  const hKcal =
    findHeader(headers, [
      (h) =>
        h.includes('energie') &&
        h.includes('1169') &&
        h.includes('kcal'),

      (h) =>
        h.includes('energie') &&
        h.includes('kcal'),
    ]);

  const hProtein =
    findHeader(headers, [
      (h) =>
        h.includes('proteines') &&
        h.includes('100'),

      (h) =>
        h.startsWith('proteines'),
    ]);

  const hCarbs =
    findHeader(headers, [
      (h) =>
        h.includes('glucides') &&
        h.includes('100'),

      (h) =>
        h.startsWith('glucides'),
    ]);

  const hFat =
    findHeader(headers, [
      (h) =>
        h.includes('lipides') &&
        h.includes('100'),

      (h) =>
        h.startsWith('lipides'),
    ]);

  const hFiber =
    findHeader(headers, [
      (h) =>
        h.includes(
          'fibres alimentaires'
        ),

      (h) =>
        h.startsWith('fibres'),
    ]);

  const hSugars =
    findHeader(headers, [
      (h) =>
        h.startsWith('sucres') &&
        h.includes('100'),

      (h) =>
        h.startsWith('sucres'),
    ]);

  const hSalt =
    findHeader(headers, [
      (h) =>
        h.startsWith('sel') &&
        h.includes('100'),

      (h) =>
        h.startsWith('sel'),
    ]);

  const hWater =
    findHeader(headers, [
      (h) =>
        h.startsWith('eau') &&
        h.includes('100'),

      (h) =>
        h === 'eau',
    ]);

  const required = {
    hCode,
    hName,
    hKcal,
    hProtein,
    hCarbs,
    hFat,
  };

  for (
    const [name, header]
    of Object.entries(required)
  ) {
    if (!header) {
      console.log(
        'Cabeceras disponibles:',
        headers
      );

      throw new Error(
        `Falta la columna ${name}`
      );
    }
  }

  console.log(
    'Columnas nutricionales detectadas:'
  );

  console.log({
    calorias: hKcal,
    proteina: hProtein,
    carbohidratos: hCarbs,
    grasas: hFat,
    fibra: hFiber,
    azucares: hSugars,
    sal: hSalt,
    agua: hWater,
  });

  const foods = [];

  for (const row of rows) {
    const sourceFoodId =
      String(
        row[hCode] ?? ''
      ).trim();

    const nameSource =
      String(
        row[hName] ?? ''
      ).trim();

    if (
      !sourceFoodId ||
      !nameSource
    ) {
      continue;
    }

    const kcal =
      parseNutrient(row[hKcal]);

    const protein =
      parseNutrient(row[hProtein]);

    const carbs =
      parseNutrient(row[hCarbs]);

    const fat =
      parseNutrient(row[hFat]);

    const fiber =
      hFiber
        ? parseNutrient(
            row[hFiber]
          )
        : {
            value: null,
            raw: null,
            estimated: false,
          };

    const sugars =
      hSugars
        ? parseNutrient(
            row[hSugars]
          )
        : {
            value: null,
            raw: null,
            estimated: false,
          };

    const salt =
      hSalt
        ? parseNutrient(
            row[hSalt]
          )
        : {
            value: null,
            raw: null,
            estimated: false,
          };

    const water =
      hWater
        ? parseNutrient(
            row[hWater]
          )
        : {
            value: null,
            raw: null,
            estimated: false,
          };

    const nutrients = [
      kcal,
      protein,
      carbs,
      fat,
      fiber,
      sugars,
      salt,
      water,
    ];

    const hasEstimatedValues =
      nutrients.some(
        (item) =>
          item.estimated
      );

    const coreValues = [
      kcal.value,
      protein.value,
      carbs.value,
      fat.value,
    ];

    const completeness =
      coreValues.filter(
        (value) =>
          value !== null &&
          value !== undefined
      ).length;

    let qualityScore = 100;

    if (completeness === 3) {
      qualityScore = 94;
    }

    if (completeness < 3) {
      qualityScore = 88;
    }

    if (hasEstimatedValues) {
      qualityScore -= 2;
    }

    foods.push({
      source: 'ciqual',

      source_food_id:
        sourceFoodId,

      source_language: 'fr',

      name_es: null,

      name_source:
        nameSource,

      category_es: null,

      preparation_es: null,

      aliases_es: [],

      kcal_100g:
        kcal.value,

      protein_100g:
        protein.value,

      carbs_100g:
        carbs.value,

      fat_100g:
        fat.value,

      fiber_100g:
        fiber.value,

      sugars_100g:
        sugars.value,

      salt_100g:
        salt.value,

      water_100g:
        water.value,

      default_portion_g: null,

      verified: true,

      quality_score:
        Math.max(
          qualityScore,
          0
        ),

      source_updated_at:
        '2025-11-19',

      has_estimated_values:
        hasEstimatedValues,

      raw_values: {
        name_fr:
          nameSource,

        group_fr:
          hGroup
            ? row[hGroup]
            : null,

        subgroup_fr:
          hSubGroup
            ? row[hSubGroup]
            : null,

        kcal:
          kcal.raw,

        protein:
          protein.raw,

        carbs:
          carbs.raw,

        fat:
          fat.raw,

        fiber:
          fiber.raw,

        sugars:
          sugars.raw,

        salt:
          salt.raw,

        water:
          water.raw,
      },
    });
  }

  return foods;
}

async function uploadBatch(
  rows,
  batchNumber,
  totalBatches
) {
  const response =
    await fetch(
      IMPORT_URL,
      {
        method: 'POST',

        headers: {
          'Content-Type':
            'application/json',

          'x-import-token':
            IMPORT_TOKEN,
        },

        body: JSON.stringify({
          rows,
        }),
      }
    );

  const text =
    await response.text();

  let data;

  try {
    data =
      JSON.parse(text);
  } catch {
    data = {
      raw: text,
    };
  }

  if (
    !response.ok ||
    !data.ok
  ) {
    throw new Error(
      `Lote ${batchNumber} falló: ${JSON.stringify(data)}`
    );
  }

  console.log(
    `Lote ${batchNumber}/${totalBatches} OK · ${rows.length} alimentos`
  );
}

async function main() {
  try {
    const buffer =
      await downloadCiqual();

    const rows =
      readCiqual(buffer);

    console.log(
      `Filas CIQUAL encontradas: ${rows.length}`
    );

    const foods =
      prepareFoods(rows);

    console.log(
      `Alimentos preparados: ${foods.length}`
    );

    if (
      foods.length < 3400 ||
      foods.length > 3550
    ) {
      throw new Error(
        `Cantidad inesperada de alimentos: ${foods.length}. Importación detenida por seguridad.`
      );
    }

    const totalBatches =
      Math.ceil(
        foods.length /
          BATCH_SIZE
      );

    console.log(
      `Subiendo ${foods.length} alimentos en ${totalBatches} lotes...`
    );

    let uploaded = 0;

    for (
      let start = 0;
      start < foods.length;
      start += BATCH_SIZE
    ) {
      const batch =
        foods.slice(
          start,
          start +
            BATCH_SIZE
        );

      const batchNumber =
        Math.floor(
          start /
            BATCH_SIZE
        ) + 1;

      await uploadBatch(
        batch,
        batchNumber,
        totalBatches
      );

      uploaded +=
        batch.length;
    }

    console.log('');
    console.log(
      '=============================='
    );
    console.log(
      'IMPORTACIÓN TERMINADA'
    );
    console.log(
      `Alimentos importados: ${uploaded}`
    );
    console.log(
      'Fuente: CIQUAL 2025'
    );
    console.log(
      '=============================='
    );
  } catch (error) {
    console.error('');
    console.error(
      'IMPORTACIÓN CANCELADA'
    );

    console.error(
      error instanceof Error
        ? error.message
        : error
    );

    process.exitCode = 1;
  }
}

main();