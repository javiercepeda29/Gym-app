const IO_URL =
  'https://kpejsuncutkbgktqlcwe.supabase.co/functions/v1/canonical-food-io';

const NORMALIZE_URL =
  'https://kpejsuncutkbgktqlcwe.supabase.co/functions/v1/normalize-food-batch';

const IO_TOKEN =
  'rivalset-canonical-io-2026';

const NORMALIZE_TOKEN =
  'rivalset-normalize-2026';

const BATCH_SIZE = 8;

const wait = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));

async function postJson(url, headers, body) {
  let lastError;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: JSON.stringify(body),
      });

      const text = await response.text();

      let data;

      try {
        data = JSON.parse(text);
      } catch {
        data = { raw: text };
      }

      if (response.ok) {
        return data;
      }

      lastError = new Error(
        `HTTP ${response.status}: ${JSON.stringify(data)}`
      );
    } catch (error) {
      lastError = error;
    }

    if (attempt < 3) {
      console.log(
        `Reintentando... intento ${attempt + 1}/3`
      );

      await wait(1500 * attempt);
    }
  }

  throw lastError;
}

async function getNextFoods(afterId) {
  return postJson(
    IO_URL,
    {
      'x-canonical-token': IO_TOKEN,
    },
    {
      action: 'next',
      afterId,
      limit: BATCH_SIZE,
    }
  );
}

async function normalizeFoods(foods) {
  const payload = foods.map((food) => ({
    id: Number(food.id),

    name_fr:
      food.name_source,

    group_fr:
      food.raw_values?.group_fr || '',

    subgroup_fr:
      food.raw_values?.subgroup_fr || '',
  }));

  return postJson(
    NORMALIZE_URL,
    {
      'x-normalize-token':
        NORMALIZE_TOKEN,
    },
    {
      foods: payload,
    }
  );
}

async function saveFoods(
  originals,
  normalized
) {
  const originalsById =
    new Map(
      originals.map((food) => [
        Number(food.id),
        food,
      ])
    );

  const items =
    (normalized.foods || [])
      .map((food) => {
        const original =
          originalsById.get(
            Number(food.id)
          );

        if (!original) {
          return null;
        }

        return {
          nutrition_food_id:
            Number(original.id),

          quality_score:
            Number(
              original.quality_score
            ) || 95,

          name_es:
            String(
              food.name_es || ''
            ).trim(),

          category_es:
            String(
              food.category_es || ''
            ).trim(),

          preparation_es:
            String(
              food.preparation_es || ''
            ).trim(),

          aliases_es:
            Array.isArray(
              food.aliases_es
            )
              ? food.aliases_es
              : [],
        };
      })
      .filter(
        (food) =>
          food &&
          food.name_es
      );

  if (!items.length) {
    throw new Error(
      'La IA no devolvió alimentos válidos.'
    );
  }

  return postJson(
    IO_URL,
    {
      'x-canonical-token': IO_TOKEN,
    },
    {
      action: 'save',
      items,
    }
  );
}

async function main() {
  console.log(
    'Creando catálogo profesional en español...'
  );

  let afterId = 0;
  let batch = 0;

  let processedTotal = 0;
  let createdTotal = 0;
  let linkedTotal = 0;

  while (true) {
    const next =
      await getNextFoods(afterId);

    if (next.done) {
      break;
    }

    const foods =
      next.foods || [];

    if (!foods.length) {
      break;
    }

    batch += 1;

    console.log(
      `Lote ${batch} · normalizando ${foods.length} alimentos...`
    );

    const normalized =
      await normalizeFoods(foods);

    const saved =
      await saveFoods(
        foods,
        normalized
      );

    processedTotal +=
      foods.length;

    createdTotal +=
      Number(saved.saved || 0);

    linkedTotal +=
      Number(saved.linked || 0);

    afterId =
      Number(next.lastId);

    console.log(
      `Lote ${batch} OK · ${processedTotal} procesados`
    );

    await wait(250);
  }

  console.log('');
  console.log(
    '================================'
  );

  console.log(
    'CATÁLOGO ESPAÑOL TERMINADO'
  );

  console.log(
    `Procesados: ${processedTotal}`
  );

  console.log(
    `Referencias creadas: ${createdTotal}`
  );

  console.log(
    `Fuentes vinculadas: ${linkedTotal}`
  );

  console.log(
    '================================'
  );
}

main().catch((error) => {
  console.error('');
  console.error(
    'PROCESO CANCELADO'
  );

  console.error(
    error instanceof Error
      ? error.message
      : error
  );

  process.exitCode = 1;
});