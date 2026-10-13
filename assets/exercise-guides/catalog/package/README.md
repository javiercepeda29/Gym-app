# @bryllim/workout-guide

Framework-neutral metadata and 906 exercise frames created by
[Bryl Lim](https://bryllim.com).

```sh
npm install @bryllim/workout-guide
```

```ts
import { getExercise, searchExercises } from '@bryllim/workout-guide';

const pushUp = getExercise('push-up');
const dumbbellChest = searchExercises('chest', { equipment: 'Dumbbell' });
```

Visit the [integration guide](https://bryllim.github.io/workout-guide/guide/)
for local imports, CDN URLs, and Expo examples.

Code is MIT licensed. Visual assets are CC BY-SA 4.0; see `LICENSES.md` and
`ATTRIBUTION.md`.
