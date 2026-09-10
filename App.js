import { useEffect, useRef, useState } from 'react';

import {
  Alert,
  Animated,
  Image,
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import { LinearGradient } from 'expo-linear-gradient';
import * as Notifications from 'expo-notifications';
import { supabase } from './supabase';
import * as WebBrowser from 'expo-web-browser';
import * as AppleAuthentication from 'expo-apple-authentication';
/* =========================================================
   NOTIFICACIONES LOCALES
========================================================= */

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/* =========================================================
   STORAGE
========================================================= */

const ROUTINES_KEY = '@app_gym_routines';
const WORKOUTS_KEY = '@app_gym_workouts';
const WEEK_CHECKS_KEY = '@app_gym_week_checks';
const PROFILE_KEY = '@app_gym_profile';
const SETTINGS_KEY = '@app_gym_settings';
const LEAGUE_KEY = '@app_gym_league';

/* =========================================================
   ASSETS
========================================================= */

const MEDAL_IMAGES = {
  bronze: require('./assets/medal-bronze-app.png'),
  silver: require('./assets/medal-silver-app.png'),
  gold: require('./assets/medal-gold-app.png'),
  diamond: require('./assets/medal-diamond-app.png'),
};

const LEAGUE_BADGE = require('./assets/Medalla-liga.png');

/* =========================================================
   CONSTANTES
========================================================= */

const DAY_LABELS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

const MUSCLE_GROUPS = [
  'Pecho',
  'Espalda',
  'Hombro',
  'Bíceps',
  'Tríceps',
  'Cuádriceps',
  'Femoral',
  'Glúteo',
  'Gemelo',
  'Abdomen',
  'Cardio',
  'Otro',
];

const ACHIEVEMENTS = [
  {
    id: 'first',
    tier: 'bronze',
    title: 'Primer día',
    description: 'Completa tu primer día de entrenamiento',
    type: 'uniqueDays',
    target: 1,
  },
  {
    id: 'week',
    tier: 'bronze',
    title: 'Primera semana',
    description: 'Mantente activo durante tu primera semana',
    type: 'elapsedWeeks',
    target: 1,
  },
  {
    id: 'ten',
    tier: 'bronze',
    title: '10 días entrenados',
    description: 'Entrena durante 10 días diferentes',
    type: 'uniqueDays',
    target: 10,
  },
  {
    id: 'twoWeeks',
    tier: 'silver',
    title: 'Dos semanas activo',
    description: 'Registra entrenamientos durante 2 semanas',
    type: 'activeWeeks',
    target: 2,
  },
  {
    id: 'month',
    tier: 'silver',
    title: 'Primer mes',
    description: 'Registra entrenamientos durante 4 semanas',
    type: 'activeWeeks',
    target: 4,
  },
  {
    id: 'twentyFive',
    tier: 'silver',
    title: '25 días entrenados',
    description: 'Entrena durante 25 días diferentes',
    type: 'uniqueDays',
    target: 25,
  },
  {
    id: 'fifty',
    tier: 'gold',
    title: '50 días entrenados',
    description: 'Entrena durante 50 días diferentes',
    type: 'uniqueDays',
    target: 50,
  },
  {
    id: 'threeMonths',
    tier: 'gold',
    title: 'Tres meses constante',
    description: 'Registra entrenamientos durante 12 semanas',
    type: 'activeWeeks',
    target: 12,
  },
  {
    id: 'hundred',
    tier: 'gold',
    title: '100 días entrenados',
    description: 'Entrena durante 100 días diferentes',
    type: 'uniqueDays',
    target: 100,
  },
  {
    id: 'iron',
    tier: 'diamond',
    title: 'Disciplina de hierro',
    description: 'Registra entrenamientos durante 24 semanas',
    type: 'activeWeeks',
    target: 24,
  },
];


const COLORS = {
  background: '#08090C',
  card: '#121419',
  border: '#252830',
  yellow: '#FFD54A',
  orange: '#FFB000',
  darkOrange: '#C97800',
  text: '#F8F8FA',
  muted: '#858A95',
  darkText: '#181205',
};

/* =========================================================
   HELPERS
========================================================= */

const localDayKey = (dateValue = new Date()) => {
  const date = new Date(dateValue);

  return `${date.getFullYear()}-${String(
    date.getMonth() + 1
  ).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const mondayFor = (dateValue = new Date()) => {
  const date = new Date(dateValue);

  date.setHours(12, 0, 0, 0);

  const offset = (date.getDay() + 6) % 7;

  date.setDate(date.getDate() - offset);

  return date;
};

const addDays = (date, amount) => {
  const next = new Date(date);

  next.setDate(next.getDate() + amount);

  return next;
};

const isSameWeek = (dateValue, reference = new Date()) =>
  localDayKey(mondayFor(dateValue)) ===
  localDayKey(mondayFor(reference));

const parseNumber = (value) => {
  if (value === '' || value === null || value === undefined) {
    return null;
  }

  const parsed = Number(String(value).replace(',', '.'));

  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeExerciseName = (value = '') =>
  value.trim().toLowerCase();

const getExerciseMuscles = (exercise = {}) => {
  if (Array.isArray(exercise.muscles)) {
    return exercise.muscles.filter(Boolean);
  }

  if (exercise.muscle) {
    return [exercise.muscle];
  }

  return [];
};

const muscleText = (exercise = {}) => {
  const muscles = getExerciseMuscles(exercise);

  return muscles.length > 0 ? muscles.join(' · ') : 'Sin grupo';
};

const emptyExercise = () => ({
  id: Date.now() + Math.random(),
  name: '',
  series: '',
  reps: '',
  weight: '',
  muscles: [],
});

const exercisePlan = (exercise) => {
  if (exercise.series && exercise.reps) {
    return `${exercise.series} series · ${exercise.reps} rep${
      exercise.weight ? ` · ${exercise.weight} kg` : ''
    }`;
  }

  return exercise.plan || '';
};

const buildWorkoutSets = (exercise) => {
  const amount = Math.max(
    1,
    parseInt(exercise.series, 10) || 1
  );

  return Array.from({ length: amount }, (_, index) => ({
    id: `${exercise.id}-set-${Date.now()}-${index}-${Math.random()}`,
    weight: exercise.weight || '',
    reps: exercise.reps || '',
    completed: false,
    prType: null,
    prText: '',
    prData: null,
  }));
};

/* =========================================================
   DEGRADADO GENERAL
========================================================= */

const AppGradient = () => (
  <LinearGradient
    colors={[
    'rgba(255,176,0,0.34)',
'rgba(255,176,0,0.18)',
'rgba(255,176,0,0.07)',
'rgba(8,9,12,0.97)',
'#08090C',
    ]}
    locations={[0, 0.16, 0.31, 0.52, 0.70]}
    style={StyleSheet.absoluteFillObject}
    pointerEvents="none"
  />
);

/* =========================================================
   MEDALLA
========================================================= */

const Medal = ({
  tier,
  unlocked = true,
  size = 'normal',
}) => {
  const large = size === 'large';

  return (
    <View
      style={[
        styles.medalWrap,
        large && styles.medalWrapLarge,
      ]}
    >
      <Image
        source={MEDAL_IMAGES[tier]}
        resizeMode="contain"
        style={[
          styles.medalImage,
          large && styles.medalImageLarge,
          !unlocked && styles.medalImageLocked,
        ]}
      />
    </View>
  );
};

/* =========================================================
   BOTÓN PERFIL
========================================================= */

const ProfileButton = ({
  onPress,
  letter = 'J',
  vibrationEnabled = true,
}) => {
  const [pressed, setPressed] = useState(false);

  const handlePressIn = async () => {
    setPressed(true);

    if (vibrationEnabled) {
      try {
        await Haptics.impactAsync(
          Haptics.ImpactFeedbackStyle.Medium
        );
      } catch {}
    }
  };

  return (
    <TouchableOpacity
      activeOpacity={1}
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={() => setPressed(false)}
      style={[
        styles.avatarDepth,
        pressed && styles.avatarDepthPressed,
      ]}
    >
      <View
        style={[
          styles.avatar,
          pressed && styles.avatarPressed,
        ]}
      >
    <MaterialCommunityIcons
  name="account"
  size={28}
  color="#17191F"
/>
      </View>
    </TouchableOpacity>
  );
};

/* =========================================================
   APP
========================================================= */

export default function App() {

  const [selectedTab, setSelectedTab] = useState('Inicio');
  
  const [screen, setScreen] = useState('home');
const [realLeagueId, setRealLeagueId] = useState(null);
  const [routines, setRoutines] = useState([]);
  const [routineName, setRoutineName] = useState('');
  const [editingRoutineId, setEditingRoutineId] = useState(null);

  const [draftExercises, setDraftExercises] = useState([
    emptyExercise(),
  ]);

  const [activeRoutine, setActiveRoutine] = useState(null);

  const [workoutExercises, setWorkoutExercises] = useState([]);
  const [workouts, setWorkouts] = useState([]);
  const [checkedDays, setCheckedDays] = useState([]);
  const [workoutOrigin, setWorkoutOrigin] = useState('home');

  const [profileName, setProfileName] = useState('');
  const [currentWeight, setCurrentWeight] = useState('');
  const [targetWeight, setTargetWeight] = useState('');
  const [startWeight, setStartWeight] = useState('');

  const [notificationsEnabled, setNotificationsEnabled] =
    useState(true);

  const [vibrationEnabled, setVibrationEnabled] =
    useState(true);

  const [sendingTestNotification, setSendingTestNotification] =
    useState(false);

  const [prFlashId, setPrFlashId] = useState(null);

  const [leagueName, setLeagueName] =
    useState('');
    const [realLeaguePlayers, setRealLeaguePlayers] = useState([]);
    const [currentUserId, setCurrentUserId] = useState(null);
    const [inviteCode, setInviteCode] = useState('');
    const [currentLeagueId, setCurrentLeagueId] = useState(null);
    const [weeklyScoredWorkouts, setWeeklyScoredWorkouts] = useState(0);
    const [leagueActivity, setLeagueActivity] = useState([]);
    const [monthlyAwards, setMonthlyAwards] = useState([]);
    const [joinLeagueCode, setJoinLeagueCode] = useState('');
const [joiningLeague, setJoiningLeague] = useState(false);
const [authEmail, setAuthEmail] = useState('');
const [authPassword, setAuthPassword] = useState('');
const [authLoading, setAuthLoading] = useState(false);
const [showEmailAuth, setShowEmailAuth] = useState(false);
const [session, setSession] = useState(null);
const [sessionLoading, setSessionLoading] = useState(true);
  const [editingLeagueName, setEditingLeagueName] =
    useState(false);

  const progressAnimation = useRef(
    new Animated.Value(0)
  ).current;

  const celebrationAnimation = useRef(
    new Animated.Value(0)
  ).current;

  const celebrated = useRef(false);
  const workoutSaved = useRef(false);

  /* =====================================================
     HÁPTICOS
  ===================================================== */

  const impact = async (
    style = Haptics.ImpactFeedbackStyle.Light
  ) => {
    if (!vibrationEnabled) return;

    try {
      await Haptics.impactAsync(style);
    } catch {}
  };

  const notificationHaptic = async (
    type = Haptics.NotificationFeedbackType.Success
  ) => {
    if (!vibrationEnabled) return;

    try {
      await Haptics.notificationAsync(type);
    } catch {}
  };

  /* =====================================================
     CARGA
  ===================================================== */
useEffect(() => {
  supabase.auth.getSession().then(({ data: { session } }) => {
    setSession(session);
    setSessionLoading(false);
  });

  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((_event, session) => {
    setSession(session);
    setSessionLoading(false);
  });

  return () => {
    subscription.unsubscribe();
  };
}, []);
  useEffect(() => {
    const load = async () => {
      try {
        const [
          savedRoutines,
          savedWorkouts,
          savedChecks,
          savedProfile,
          savedSettings,
          savedLeague,
        ] = await Promise.all([
          AsyncStorage.getItem(ROUTINES_KEY),
          AsyncStorage.getItem(WORKOUTS_KEY),
          AsyncStorage.getItem(WEEK_CHECKS_KEY),
          AsyncStorage.getItem(PROFILE_KEY),
          AsyncStorage.getItem(SETTINGS_KEY),
          AsyncStorage.getItem(LEAGUE_KEY),
        ]);

        if (savedRoutines) {
          setRoutines(JSON.parse(savedRoutines));
        }

        if (savedWorkouts) {
          setWorkouts(JSON.parse(savedWorkouts));
        }

        if (savedChecks) {
          setCheckedDays(JSON.parse(savedChecks));
        }

        if (savedProfile) {
          const data = JSON.parse(savedProfile);

          setProfileName(data.name || '');
          setCurrentWeight(data.currentWeight || '');
          setTargetWeight(data.targetWeight || '');
          setStartWeight(data.startWeight || '');
        }

        if (savedSettings) {
          const settings = JSON.parse(savedSettings);

          setNotificationsEnabled(
            settings.notificationsEnabled !== false
          );

          setVibrationEnabled(
            settings.vibrationEnabled !== false
          );
        }

        if (savedLeague) {
          const league = JSON.parse(savedLeague);

          setLeagueName(
            league.name || ''
          );
        }      } catch {
        Alert.alert(
          'Aviso',
          'No se pudieron recuperar todos los datos guardados.'
        );
      }
    };

    load();
  }, []);

  /* =====================================================
     STORAGE
  ===================================================== */

  const persistRoutines = async (next) => {
    setRoutines(next);

    try {
      await AsyncStorage.setItem(
        ROUTINES_KEY,
        JSON.stringify(next)
      );
    } catch {
      Alert.alert(
        'Aviso',
        'No se pudieron guardar las rutinas.'
      );
    }
  };

  const persistWorkouts = async (next) => {
    setWorkouts(next);

    try {
      await AsyncStorage.setItem(
        WORKOUTS_KEY,
        JSON.stringify(next)
      );
    } catch {
      Alert.alert(
        'Aviso',
        'No se pudo actualizar el historial.'
      );
    }
  };

  /* =====================================================
     PERFIL
  ===================================================== */

  const saveProfile = async () => {
    const current = parseNumber(currentWeight);
    const target = parseNumber(targetWeight);

    if (currentWeight && current === null) {
      Alert.alert(
        'Peso actual',
        'Introduce un peso válido.'
      );
      return;
    }

    if (targetWeight && target === null) {
      Alert.alert(
        'Peso objetivo',
        'Introduce un peso válido.'
      );
      return;
    }

    let nextStartWeight = startWeight;

    if (
      !nextStartWeight &&
      current !== null &&
      target !== null
    ) {
      nextStartWeight = currentWeight;
    }

    const cleanName = profileName.trim();
    if (!cleanName) {
  Alert.alert(
    'Nombre obligatorio',
    'Escribe un nombre para tu perfil.'
  );
  return;
}

  try {
  // 1. Obtenemos el usuario real conectado
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error('No hay ningún usuario conectado.');
  }

  // 2. Guardamos/actualizamos su nombre real en Supabase
  const { error: profileError } = await supabase
    .from('profiles')
    .upsert(
      {
        id: user.id,
        username: cleanName,
      },
      {
        onConflict: 'id',
      }
    );

  if (profileError) {
    throw profileError;
  }

  // 3. Seguimos guardando los datos privados del perfil en el dispositivo
  await AsyncStorage.setItem(
    PROFILE_KEY,
    JSON.stringify({
      name: cleanName,
      currentWeight,
      targetWeight,
      startWeight: nextStartWeight,
    })
  );

  setProfileName(cleanName);
  setStartWeight(nextStartWeight);

  await notificationHaptic();

  Alert.alert(
    'Guardado',
    'Tu perfil se ha actualizado.'
  );
} catch (error) {
  console.log('ERROR GUARDANDO PERFIL:', error);

  Alert.alert(
    'No se pudo guardar el perfil',
    error?.message || 'Inténtalo de nuevo.'
  );
}
  };

  const saveSettings = async (
    nextNotifications = notificationsEnabled,
    nextVibration = vibrationEnabled
  ) => {
    try {
      await AsyncStorage.setItem(
        SETTINGS_KEY,
        JSON.stringify({
          notificationsEnabled: nextNotifications,
          vibrationEnabled: nextVibration,
        })
      );
    } catch {}
  };

  const toggleNotifications = async () => {
    const next = !notificationsEnabled;

    setNotificationsEnabled(next);

    await saveSettings(
      next,
      vibrationEnabled
    );

    await impact();
  };

  const toggleVibration = async () => {
    const next = !vibrationEnabled;

    setVibrationEnabled(next);

    await saveSettings(
      notificationsEnabled,
      next
    );

    if (next) {
      try {
        await Haptics.impactAsync(
          Haptics.ImpactFeedbackStyle.Medium
        );
      } catch {}
    }
  };

  

  /* =====================================================
     NOTIFICACIÓN DE PRUEBA
  ===================================================== */

  const sendTestNotification = async () => {
    if (!notificationsEnabled || sendingTestNotification) {
      return;
    }

    await impact(
      Haptics.ImpactFeedbackStyle.Medium
    );

    if (Platform.OS === 'web') {
      Alert.alert(
        'Prueba en el móvil',
        'La notificación real del sistema se verá cuando abras la app desde Expo Go o una versión instalada en el móvil.'
      );

      return;
    }

    setSendingTestNotification(true);

    try {
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync(
          'rivalzone-default',
          {
            name: 'RivalZone',
            importance: Notifications.AndroidImportance.HIGH,
            vibrationPattern: [0, 250, 150, 250],
            lightColor: '#FFB000',
            sound: 'default',
          }
        );
      }

      const currentPermissions =
        await Notifications.getPermissionsAsync();

      let finalStatus = currentPermissions.status;

      if (finalStatus !== 'granted') {
        const requestedPermissions =
          await Notifications.requestPermissionsAsync();

        finalStatus = requestedPermissions.status;
      }

      if (finalStatus !== 'granted') {
        Alert.alert(
          'Notificaciones desactivadas',
          'Necesitas permitir las notificaciones para poder ver la prueba.'
        );

        return;
      }

      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'RivalZone',
          body: '🔥 ¿Listo para entrenar? Tu próxima sesión puede acercarte al primer puesto.',
          sound: 'default',
          data: {
            type: 'test',
          },
        },
        trigger: null,
      });

      await notificationHaptic(
        Haptics.NotificationFeedbackType.Success
      );
    } catch (error) {
      Alert.alert(
        'No se pudo enviar',
        'No hemos podido mostrar la notificación de prueba en este dispositivo.'
      );
    } finally {
      setSendingTestNotification(false);
    }
  };

  /* =====================================================
     LIGA
  ===================================================== */
const loadRealLeaguePlayers = async () => {
  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      throw new Error('No hay usuario conectado');
    }
setCurrentUserId(user.id);
    const { data: membership, error: membershipError } = await supabase
  .from('league_members')
  .select('league_id')
  .eq('user_id', user.id)
  .order('joined_at', { ascending: false })
  .limit(1)
  .maybeSingle();

if (membershipError) {
  throw membershipError;
}

if (!membership) {
  setRealLeaguePlayers([]);
  return;
}

const { data: league, error: leagueError } = await supabase
  .from('leagues')
  .select('id, name, invite_code')
  .eq('id', membership.league_id)
  .single();

    if (leagueError) {
      throw leagueError;
    }
setLeagueName(league.name || '');
setCurrentLeagueId(league.id);
const { data: weeklyCount, error: weeklyCountError } = await supabase.rpc(
  'get_weekly_scored_workouts',
  {
    target_league_id: league.id,
  }
);

if (weeklyCountError) {
  throw weeklyCountError;
}

setWeeklyScoredWorkouts(Number(weeklyCount || 0));
const { data: activity, error: activityError } = await supabase.rpc(
  'get_league_activity_feed',
  {
    target_league_id: league.id,
  }
);

if (activityError) {
  throw activityError;
}

setLeagueActivity(activity || []);
setInviteCode(league.invite_code || '');
setRealLeagueId(league.id);
    if (!league) {
      setRealLeaguePlayers([]);
      return;
    }

  const { data: members, error: membersError } = await supabase.rpc(
  'get_my_league_members',
  {
    target_league_id: league.id,
  }
);

    if (membersError) {
      throw membersError;
    }

    setRealLeaguePlayers(members || []);

    const { data: latestMonthlyResult, error: monthlyResultError } =
  await supabase
    .from('league_monthly_results')
    .select('id, month')
    .eq('league_id', league.id)
    .order('month', { ascending: false })
    .limit(1)
    .maybeSingle();

if (monthlyResultError) {
  throw monthlyResultError;
}

if (latestMonthlyResult?.id) {
  const { data: awards, error: awardsError } = await supabase
    .from('league_monthly_awards')
    .select('user_id, award_type, points, record_points')
    .eq('result_id', latestMonthlyResult.id);

  if (awardsError) {
    throw awardsError;
  }

  setMonthlyAwards(
    (awards || []).map((award) => ({
      ...award,
      month: latestMonthlyResult.month,
    }))
  );
} else {
  setMonthlyAwards([]);
}
    console.log('MIEMBROS REALES DE LA LIGA:', members);
  } catch (error) {
  console.log('ERROR CARGANDO MIEMBROS:', error);
  Alert.alert(
    'Error cargando la liga',
    error?.message || JSON.stringify(error)
  );
}
};
useEffect(() => {
  if (session?.user) {
    loadRealLeaguePlayers();
  }
}, [session]);
  const saveLeagueName = async () => {
  const clean = leagueName.trim();
  const finalName = clean;

if (!finalName) {
  Alert.alert(
    'Nombre obligatorio',
    'Escribe un nombre para tu liga.'
  );
  return;
}

  try {
    // Guardado local
    await AsyncStorage.setItem(
      LEAGUE_KEY,
      JSON.stringify({
        name: finalName,
      })
    );

    // Usuario actualmente conectado
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      throw new Error('No hay usuario conectado');
    }

    // Comprobamos si este usuario ya tiene una liga creada
    const { data: existingLeague, error: searchError } = await supabase
      .from('leagues')
      .select('id, name, invite_code')
      .eq('owner_id', user.id)
      .limit(1)
      .maybeSingle();

    if (searchError) {
      throw searchError;
    }

    if (existingLeague) {
      // Si ya existe, actualizamos su nombre
      const { error: updateError } = await supabase
        .from('leagues')
        .update({
          name: finalName,
        })
        .eq('id', existingLeague.id);

      if (updateError) {
        throw updateError;
      }
setInviteCode(existingLeague.invite_code || '');
      console.log(
        'LIGA ACTUALIZADA:',
        existingLeague.id
      );
    } else {
      // Si todavía no existe, creamos la liga
      const { data: newLeague, error: createError } = await supabase
        .from('leagues')
        .insert({
          name: finalName,
          owner_id: user.id,
        })
        .select('id, name, invite_code')
        .single();

      if (createError) {
        throw createError;
      }
setInviteCode(newLeague.invite_code || '');
      console.log(
        'LIGA CREADA:',
        newLeague
      );
    }

    setLeagueName(finalName);
    setEditingLeagueName(false);

    await impact(
      Haptics.ImpactFeedbackStyle.Medium
    );
  } catch (error) {
    console.log(
      'ERROR GUARDANDO LIGA:',
      error.message
    );

    Alert.alert(
      'Error',
      'No se pudo guardar la liga.'
    );
  }
};

  const inviteFriends = async () => {
    await impact(
      Haptics.ImpactFeedbackStyle.Medium
    );

  Alert.alert(
  'Invitar rivales',
  inviteCode
    ? `Código de invitación: ${inviteCode}\n\nComparte este código con la persona que quieras añadir a la liga.`
    : 'No se ha podido obtener el código de invitación.'
);
  };
const joinLeague = async () => {
  const cleanCode = joinLeagueCode.trim().toUpperCase();

  if (!cleanCode) {
    Alert.alert(
      'Código necesario',
      'Introduce un código de invitación.'
    );
    return;
  }

  try {
    setJoiningLeague(true);

    const { data, error } = await supabase.rpc(
      'join_league_by_code',
      {
        p_invite_code: cleanCode,
      }
    );

    if (error) {
      throw error;
    }

    setJoinLeagueCode('');

    await loadRealLeaguePlayers();

    Alert.alert(
      'Liga encontrada',
      'Te has unido correctamente a la liga.'
    );
  } catch (error) {
    console.log('ERROR UNIÉNDOSE A LA LIGA:', error);

    Alert.alert(
      'No se pudo unir a la liga',
      error?.message || 'Comprueba el código e inténtalo de nuevo.'
    );
  } finally {
    setJoiningLeague(false);
  }
};
const loginUser = async () => {
  const email = authEmail.trim().toLowerCase();

  if (!email || !authPassword) {
    Alert.alert(
      'Datos necesarios',
      'Introduce tu email y contraseña.'
    );
    return;
  }

  try {
    setAuthLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password: authPassword,
    });

    if (error) {
      throw error;
    }

    setAuthPassword('');

    await loadRealLeaguePlayers();

    Alert.alert(
      'Sesión iniciada',
      'Has iniciado sesión correctamente.'
    );
  } catch (error) {
    console.log('ERROR INICIANDO SESIÓN:', error);

    Alert.alert(
      'No se pudo iniciar sesión',
      error?.message || 'Comprueba tus datos e inténtalo de nuevo.'
    );
  } finally {
    setAuthLoading(false);
  }
};
const signupWithEmail = async () => {
  const email = authEmail.trim().toLowerCase();

  if (!email || !authPassword) {
    Alert.alert(
      'Datos necesarios',
      'Introduce tu email y contraseña.'
    );
    return;
  }

  try {
    setAuthLoading(true);

    const { error } = await supabase.auth.signUp({
      email,
      password: authPassword,
    });

    if (error) {
      throw error;
    }

    Alert.alert(
      'Cuenta creada',
      'Tu cuenta se ha creado correctamente.'
    );

    setShowEmailAuth(false);
    setAuthPassword('');
  } catch (error) {
    console.log('ERROR CREANDO CUENTA:', error);

    Alert.alert(
      'No se pudo crear la cuenta',
      error?.message || 'Inténtalo de nuevo.'
    );
  } finally {
    setAuthLoading(false);
  }
};
const loginWithApple = async () => {
  try {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });

    if (!credential.identityToken) {
      throw new Error('Apple no devolvió un token de identidad.');
    }

    const { error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: credential.identityToken,
    });

    if (error) {
      throw error;
    }

    

    Alert.alert(
      'Sesión iniciada',
      'Has iniciado sesión con Apple correctamente.'
    );
  } catch (error) {
    if (error?.code === 'ERR_REQUEST_CANCELED') {
      return;
    }

    console.log('ERROR INICIANDO CON APPLE:', error);

    Alert.alert(
      'No se pudo iniciar sesión con Apple',
      error?.message || 'Inténtalo de nuevo.'
    );
  }
};
const loginWithGoogle = async () => {
  try {
    const redirectTo = 'tempapp://auth/callback';

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        skipBrowserRedirect: true,
      },
    });

    if (error) {
      throw error;
    }

    if (!data?.url) {
      throw new Error('Google no devolvió una URL de autenticación.');
    }

    const result = await WebBrowser.openAuthSessionAsync(
      data.url,
      redirectTo
    );

    if (result.type !== 'success' || !result.url) {
      return;
    }

    const callbackUrl = result.url;

    const fragment = callbackUrl.includes('#')
      ? callbackUrl.split('#')[1]
      : callbackUrl.split('?')[1];

    if (!fragment) {
      throw new Error('No se recibieron los datos de sesión de Google.');
    }

    const params = new URLSearchParams(fragment);

    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');

    if (!accessToken || !refreshToken) {
      throw new Error('Google no devolvió una sesión válida.');
    }

    const { error: sessionError } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    if (sessionError) {
      throw sessionError;
    }

    Alert.alert(
      'Sesión iniciada',
      'Has iniciado sesión con Google correctamente.'
    );
  } catch (error) {
    console.log('ERROR INICIANDO CON GOOGLE:', error);

    Alert.alert(
      'No se pudo iniciar sesión con Google',
      error?.message || 'Inténtalo de nuevo.'
    );
  }
};
  const leagueWorkoutsThisWeek = workouts
    .filter((workout) =>
      isSameWeek(workout.finishedAt)
    )
    .sort(
      (a, b) =>
        new Date(a.finishedAt) -
        new Date(b.finishedAt)
    );

  const leagueScoringWorkouts =
    leagueWorkoutsThisWeek.slice(0, 4);

  const leagueScoringCount = weeklyScoredWorkouts;

  const leagueWeeklyLimitReached =
    leagueScoringCount >= 4;

  const remainingLeagueWorkouts = Math.max(
    0,
    4 - leagueScoringCount
  );

  const leagueTrainingProgress =
    Math.min(
      100,
      (leagueScoringCount / 4) * 100
    );

  const addLeagueWorkout = async () => {
    await impact(
      Haptics.ImpactFeedbackStyle.Medium
    );

    if (leagueWeeklyLimitReached) {
      Alert.alert(
        'Límite semanal alcanzado',
        'Ya has completado tus 4 entrenamientos puntuables. Puedes seguir entrenando normalmente, pero las siguientes sesiones de esta semana no sumarán puntos de Liga.',
        [
          {
            text: 'Cancelar',
            style: 'cancel',
          },
          {
            text: 'Entrenar igualmente',
            onPress: () => {
              setWorkoutOrigin('league');
              setScreen('quickStart');
            },
          },
        ]
      );

      return;
    }

    setWorkoutOrigin('league');
    setScreen('quickStart');
  };

  /* =====================================================
     SEMANA
  ===================================================== */

  const currentMonday = mondayFor();

  const weekDays = DAY_LABELS.map((label, index) => ({
    label,
    key: localDayKey(
      addDays(currentMonday, index)
    ),
  }));

  const activeWeekDays = weekDays.filter((day) =>
    checkedDays.includes(day.key)
  ).length;

  const toggleWeekDay = async (dayKey) => {
    const next = checkedDays.includes(dayKey)
      ? checkedDays.filter((key) => key !== dayKey)
      : [...checkedDays, dayKey];

    setCheckedDays(next);

    await AsyncStorage.setItem(
      WEEK_CHECKS_KEY,
      JSON.stringify(next)
    );

    await impact();
  };

  /* =====================================================
     ESTADÍSTICAS
  ===================================================== */

  const weekDaySets = workouts.reduce((counts, item) => {
    const key = localDayKey(
      mondayFor(item.finishedAt)
    );

    if (!counts[key]) {
      counts[key] = new Set();
    }

    counts[key].add(
      localDayKey(item.finishedAt)
    );

    return counts;
  }, {});

  const uniqueTrainingDays = new Set(
    workouts.map((item) =>
      localDayKey(item.finishedAt)
    )
  ).size;

  const activeWeeks = Object.keys(weekDaySets).length;

  const firstWorkoutTime = workouts.length
    ? Math.min(
        ...workouts.map((item) =>
          new Date(item.finishedAt).getTime()
        )
      )
    : null;

  const elapsedWeeks = firstWorkoutTime
    ? Math.floor(
        (Date.now() - firstWorkoutTime) /
          (7 * 24 * 60 * 60 * 1000)
      )
    : 0;

  const achievementProgress = (achievement) => {
    if (achievement.type === 'uniqueDays') {
      return uniqueTrainingDays;
    }

    if (achievement.type === 'elapsedWeeks') {
      return elapsedWeeks;
    }

    return activeWeeks;
  };

  const unlockedAchievements = ACHIEVEMENTS.filter(
    (item) =>
      achievementProgress(item) >= item.target
  ).length;

  const nextAchievement =
    ACHIEVEMENTS.find(
      (item) =>
        achievementProgress(item) < item.target
    ) ||
    ACHIEVEMENTS[ACHIEVEMENTS.length - 1];

  const nextValue = Math.min(
    achievementProgress(nextAchievement),
    nextAchievement.target
  );

  const nextPercent = Math.min(
    100,
    (nextValue / nextAchievement.target) * 100
  );

  const profileInitial =
    profileName.trim().charAt(0).toUpperCase() || 'J';

  /* =====================================================
     PESO
  ===================================================== */

  const startWeightNumber = parseNumber(startWeight);
  const currentWeightNumber = parseNumber(currentWeight);
  const targetWeightNumber = parseNumber(targetWeight);

  let bodyWeightProgress = 0;
  let remainingWeight = null;

  if (
    startWeightNumber !== null &&
    currentWeightNumber !== null &&
    targetWeightNumber !== null
  ) {
    const totalDistance = Math.abs(
      targetWeightNumber - startWeightNumber
    );

    remainingWeight = Math.abs(
      targetWeightNumber - currentWeightNumber
    );

    if (totalDistance === 0) {
      bodyWeightProgress =
        currentWeightNumber === targetWeightNumber
          ? 100
          : 0;
    } else {
      bodyWeightProgress = Math.max(
        0,
        Math.min(
          100,
          ((totalDistance - remainingWeight) /
            totalDistance) *
            100
        )
      );
    }
  }

  /* =====================================================
     PR
  ===================================================== */

  const getHistoricalSets = (exercise) => {
    const normalized = normalizeExerciseName(
      exercise.name
    );

    const exerciseId = exercise.id;

    const result = [];

    workouts.forEach((workout) => {
      (workout.exercises || []).forEach(
        (historicalExercise) => {
          const sameId =
            exerciseId !== undefined &&
            exerciseId !== null &&
            historicalExercise.id !== undefined &&
            historicalExercise.id !== null &&
            historicalExercise.id === exerciseId;

          const sameName =
            normalizeExerciseName(
              historicalExercise.name
            ) === normalized;

          if (!sameId && !sameName) {
            return;
          }

          if (
            Array.isArray(
              historicalExercise.sets
            )
          ) {
            historicalExercise.sets.forEach((set) => {
              if (set.completed === false) {
                return;
              }

              const weight = parseNumber(set.weight);
              const reps = parseNumber(set.reps);

              if (
                weight !== null &&
                reps !== null
              ) {
                result.push({
                  weight,
                  reps,
                });
              }
            });

            return;
          }

          const oldWeight = parseNumber(
            historicalExercise.weight
          );

          const oldReps = parseNumber(
            historicalExercise.reps
          );

          if (
            oldWeight !== null &&
            oldReps !== null
          ) {
            result.push({
              weight: oldWeight,
              reps: oldReps,
            });
          }
        }
      );
    });

    return result;
  };

  const detectPR = (exercise, targetSet) => {
    const weight = parseNumber(targetSet.weight);
    const reps = parseNumber(targetSet.reps);

    if (
      weight === null ||
      reps === null ||
      weight <= 0 ||
      reps <= 0
    ) {
      return null;
    }

    const historical = getHistoricalSets(exercise);

    if (historical.length === 0) {
      return null;
    }

    const currentCompleted = (exercise.sets || [])
      .filter(
        (set) =>
          set.id !== targetSet.id &&
          set.completed
      )
      .map((set) => ({
        weight: parseNumber(set.weight),
        reps: parseNumber(set.reps),
      }))
      .filter(
        (set) =>
          set.weight !== null &&
          set.reps !== null
      );

    const comparison = [
      ...historical,
      ...currentCompleted,
    ];

    const maxWeight = Math.max(
      ...comparison.map((set) => set.weight)
    );

    if (weight > maxWeight) {
      const improvement = weight - maxWeight;

      return {
        type: 'weight',
        previousWeight: maxWeight,
        newWeight: weight,
        improvement,
        text: `${maxWeight} kg → ${weight} kg  +${improvement} kg`,
      };
    }

    const sameWeight = comparison.filter(
      (set) => set.weight === weight
    );

    if (sameWeight.length > 0) {
      const maxReps = Math.max(
        ...sameWeight.map((set) => set.reps)
      );

      if (reps > maxReps) {
        return {
          type: 'reps',
          previousReps: maxReps,
          newReps: reps,
          weight,
          improvement: reps - maxReps,
          text: `${weight} kg · ${maxReps} → ${reps} reps`,
        };
      }
    }

    return null;
  };

  const totalCurrentPRs = workoutExercises.reduce(
    (total, exercise) =>
      total +
      (exercise.sets || []).filter(
        (set) => !!set.prType
      ).length,
    0
  );

  const currentPRList = workoutExercises.flatMap(
    (exercise) =>
      (exercise.sets || [])
        .filter((set) => !!set.prType)
        .map((set) => ({
          id: set.id,
          exercise: exercise.name,
          text: set.prText,
        }))
  );

  /* =====================================================
     NAVEGACIÓN
  ===================================================== */

  const startWorkout = async () => {
    await impact(
      Haptics.ImpactFeedbackStyle.Medium
    );

    setWorkoutOrigin('home');
    setScreen('quickStart');
  };

  const openProfile = () => {
    setScreen('profile');
  };

  const openTab = (tab) => {
    setSelectedTab(tab);

    if (tab === 'Inicio') {
      setScreen('home');
    }

    if (tab === 'Liga') {
      setScreen('league');
    }

    if (tab === 'Historial') {
      setScreen('history');
    }

    if (tab === 'Rutinas') {
      setScreen('routines');
    }
  };

  const goBack = async () => {
    await impact();

    if (screen === 'editor') {
      setEditingRoutineId(null);
      setScreen('routines');
      } else if (screen === 'personalRecords') {
  setScreen('history');
    } else if (screen === 'workout') {
      setScreen(
        workoutOrigin === 'league'
          ? 'league'
          : 'quickStart'
      );
    } else if (
      screen === 'quickStart' &&
      workoutOrigin === 'league'
    ) {
      setScreen('league');
    } else {
      setScreen('home');
    }
  };

  /* =====================================================
     RUTINAS
  ===================================================== */

  const beginCreate = async () => {
    await impact(
      Haptics.ImpactFeedbackStyle.Medium
    );

    setEditingRoutineId(null);
    setRoutineName('');
    setDraftExercises([emptyExercise()]);
    setScreen('editor');
  };

  const beginEditRoutine = async (routine) => {
    await impact(
      Haptics.ImpactFeedbackStyle.Medium
    );

    setEditingRoutineId(routine.id);
    setRoutineName(routine.name);

    setDraftExercises(
      routine.exercises.map((exercise) => ({
        ...exercise,
        id:
          exercise.id ||
          Date.now() + Math.random(),
        muscles: getExerciseMuscles(exercise),
      }))
    );

    setScreen('editor');
  };

  const updateExercise = (
    id,
    field,
    value
  ) => {
    setDraftExercises((items) =>
      items.map((item) =>
        item.id === id
          ? {
              ...item,
              [field]: value,
            }
          : item
      )
    );
  };

  const toggleExerciseMuscle = async (
    exerciseId,
    muscle
  ) => {
    await impact();

    setDraftExercises((items) =>
      items.map((exercise) => {
        if (exercise.id !== exerciseId) {
          return exercise;
        }

        const current = getExerciseMuscles(exercise);

        const next = current.includes(muscle)
          ? current.filter((item) => item !== muscle)
          : [...current, muscle];

        return {
          ...exercise,
          muscles: next,
          muscle: undefined,
        };
      })
    );
  };

  const addExercise = async () => {
    await impact();

    setDraftExercises((items) => [
      ...items,
      emptyExercise(),
    ]);
  };

  const removeExercise = async (id) => {
    await impact();

    setDraftExercises((items) =>
      items.length === 1
        ? [emptyExercise()]
        : items.filter(
            (item) => item.id !== id
          )
    );
  };

  const saveRoutine = async () => {
    const clean = draftExercises
      .map((item) => ({
        ...item,
        name: item.name.trim(),
        series: (item.series || '').trim(),
        reps: (item.reps || '').trim(),
        weight: (item.weight || '').trim(),
        muscles: getExerciseMuscles(item),
      }))
      .filter(
        (item) =>
          item.name ||
          item.series ||
          item.reps ||
          item.weight ||
          item.muscles.length > 0
      );

    if (!routineName.trim()) {
      Alert.alert(
        'Falta el nombre',
        'Escribe un nombre para la rutina.'
      );

      return;
    }

    if (
      !clean.length ||
      clean.some(
        (item) =>
          !item.name ||
          !item.series ||
          !item.reps ||
          item.muscles.length === 0
      )
    ) {
      Alert.alert(
        'Revisa los ejercicios',
        'Cada ejercicio necesita nombre, series, repeticiones y al menos un grupo muscular. Los kilos son opcionales.'
      );

      return;
    }

    if (editingRoutineId !== null) {
      const next = routines.map((routine) =>
        routine.id === editingRoutineId
          ? {
              ...routine,
              name: routineName.trim(),
              exercises: clean,
            }
          : routine
      );

      await persistRoutines(next);
      await notificationHaptic();

      setEditingRoutineId(null);
      setRoutineName('');
      setDraftExercises([emptyExercise()]);
      setScreen('routines');

      return;
    }

    await persistRoutines([
      ...routines,
      {
        id: Date.now(),
        name: routineName.trim(),
        exercises: clean,
      },
    ]);

    await notificationHaptic();

    setRoutineName('');
    setDraftExercises([emptyExercise()]);
    setScreen('routines');
  };

  const deleteRoutine = (id, name) => {
    Alert.alert(
      'Eliminar rutina',
      `¿Quieres eliminar “${name}”?`,
      [
        {
          text: 'Cancelar',
          style: 'cancel',
        },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: () =>
            persistRoutines(
              routines.filter(
                (item) => item.id !== id
              )
            ),
        },
      ]
    );
  };

  /* =====================================================
     ENTRENAMIENTO
  ===================================================== */

  const openWorkout = async (
    routine,
    origin = workoutOrigin || 'home'
  ) => {
    await impact(
      Haptics.ImpactFeedbackStyle.Heavy
    );

    setActiveRoutine(routine);

    setWorkoutExercises(
      routine.exercises.map(
        (exercise, index) => ({
          ...exercise,
          muscles: getExerciseMuscles(exercise),
          expanded: index === 0,
          sets: buildWorkoutSets(exercise),
        })
      )
    );

    progressAnimation.setValue(0);
    celebrationAnimation.setValue(0);

    celebrated.current = false;
    workoutSaved.current = false;

    setPrFlashId(null);
    setWorkoutOrigin(origin);
    setScreen('workout');
  };

  const toggleExerciseExpanded = async (
    exerciseId
  ) => {
    await impact();

    setWorkoutExercises((items) =>
      items.map((exercise) =>
        exercise.id === exerciseId
          ? {
              ...exercise,
              expanded: !exercise.expanded,
            }
          : exercise
      )
    );
  };

  const updateWorkoutSet = (
    exerciseId,
    setId,
    field,
    value
  ) => {
    setWorkoutExercises((items) =>
      items.map((exercise) =>
        exercise.id !== exerciseId
          ? exercise
          : {
              ...exercise,
              sets: exercise.sets.map((set) =>
                set.id === setId
                  ? {
                      ...set,
                      [field]: value,
                      prType: null,
                      prText: '',
                      prData: null,
                    }
                  : set
              ),
            }
      )
    );
  };

  const updateWorkoutProgress = (
    nextExercises
  ) => {
    const allSets = nextExercises.flatMap(
      (exercise) => exercise.sets || []
    );

    const completedSets = allSets.filter(
      (set) => set.completed
    ).length;

    Animated.spring(progressAnimation, {
      toValue:
        allSets.length > 0
          ? completedSets / allSets.length
          : 0,
      useNativeDriver: false,
      friction: 8,
      tension: 55,
    }).start();

    if (
      completedSets === allSets.length &&
      allSets.length > 0 &&
      !celebrated.current
    ) {
      celebrated.current = true;

      notificationHaptic();

      Animated.sequence([
        Animated.timing(
          celebrationAnimation,
          {
            toValue: 1,
            duration: 260,
            useNativeDriver: true,
          }
        ),
        Animated.timing(
          celebrationAnimation,
          {
            toValue: 0.45,
            duration: 260,
            useNativeDriver: true,
          }
        ),
        Animated.timing(
          celebrationAnimation,
          {
            toValue: 1,
            duration: 260,
            useNativeDriver: true,
          }
        ),
      ]).start();
    }

    if (completedSets < allSets.length) {
      celebrated.current = false;
    }
  };

  const addWorkoutSet = async (
    exerciseId
  ) => {
    await impact();

    setWorkoutExercises((items) => {
      const next = items.map((exercise) => {
        if (exercise.id !== exerciseId) {
          return exercise;
        }

        const lastSet =
          exercise.sets[
            exercise.sets.length - 1
          ];

        return {
          ...exercise,
          sets: [
            ...exercise.sets,
            {
              id: `${exercise.id}-extra-${Date.now()}-${Math.random()}`,
              weight:
                lastSet?.weight ||
                exercise.weight ||
                '',
              reps:
                lastSet?.reps ||
                exercise.reps ||
                '',
              completed: false,
              prType: null,
              prText: '',
              prData: null,
            },
          ],
        };
      });

      updateWorkoutProgress(next);

      return next;
    });
  };

  const removeWorkoutSet = async (
    exerciseId,
    setId
  ) => {
    await impact();

    setWorkoutExercises((items) => {
      const next = items.map((exercise) => {
        if (
          exercise.id !== exerciseId ||
          exercise.sets.length <= 1
        ) {
          return exercise;
        }

        return {
          ...exercise,
          sets: exercise.sets.filter(
            (set) => set.id !== setId
          ),
        };
      });

      updateWorkoutProgress(next);

      return next;
    });
  };

  const toggleWorkoutSet = async (
    exerciseId,
    setId
  ) => {
    const exercise = workoutExercises.find(
      (item) => item.id === exerciseId
    );

    if (!exercise) return;

    const targetSet = exercise.sets.find(
      (set) => set.id === setId
    );

    if (!targetSet) return;

    if (targetSet.completed) {
      const next = workoutExercises.map((item) =>
        item.id !== exerciseId
          ? item
          : {
              ...item,
              sets: item.sets.map((set) =>
                set.id === setId
                  ? {
                      ...set,
                      completed: false,
                      prType: null,
                      prText: '',
                      prData: null,
                    }
                  : set
              ),
            }
      );

      setWorkoutExercises(next);
      updateWorkoutProgress(next);
      await impact();

      return;
    }

    const weight = parseNumber(
      targetSet.weight
    );

    const reps = parseNumber(
      targetSet.reps
    );

    if (
      weight === null ||
      weight < 0
    ) {
      Alert.alert(
        'Revisa el peso',
        'Introduce un peso válido para completar la serie.'
      );

      return;
    }

    if (
      reps === null ||
      reps <= 0
    ) {
      Alert.alert(
        'Revisa las repeticiones',
        'Introduce las repeticiones realizadas.'
      );

      return;
    }

    const pr = detectPR(
      exercise,
      targetSet
    );

    const next = workoutExercises.map((item) =>
      item.id !== exerciseId
        ? item
        : {
            ...item,
            sets: item.sets.map((set) =>
              set.id === setId
                ? {
                    ...set,
                    completed: true,
                    prType: pr?.type || null,
                    prText: pr?.text || '',
                    prData: pr || null,
                  }
                : set
            ),
          }
    );

    setWorkoutExercises(next);

    updateWorkoutProgress(next);

    if (pr) {
      setPrFlashId(setId);

      await notificationHaptic(
        Haptics.NotificationFeedbackType.Success
      );

      setTimeout(() => {
        setPrFlashId((current) =>
          current === setId
            ? null
            : current
        );
      }, 1700);
    } else {
      await impact(
        Haptics.ImpactFeedbackStyle.Medium
      );
    }
  };

  const recordWorkout = async () => {
    if (workoutSaved.current) {
      return;
    }

    workoutSaved.current = true;

    const finishedAt =
      new Date().toISOString();

    const todayKey = localDayKey(
      finishedAt
    );

    const next = [
      ...workouts,
      {
        id: Date.now(),
        routineId: activeRoutine?.id,
        routineName: activeRoutine?.name,
        finishedAt,
        exercises: workoutExercises.map(
          ({ expanded, ...exercise }) => ({
            ...exercise,
            muscles: getExerciseMuscles(exercise),
          })
        ),
      },
    ];

    setWorkouts(next);

    await AsyncStorage.setItem(
      WORKOUTS_KEY,
      JSON.stringify(next)
    );

    if (!checkedDays.includes(todayKey)) {
      const nextChecks = [
        ...checkedDays,
        todayKey,
      ];

      setCheckedDays(nextChecks);

      await AsyncStorage.setItem(
        WEEK_CHECKS_KEY,
        JSON.stringify(nextChecks)
      );
   } if (currentLeagueId) {
  try {
    const workoutKey = `${finishedAt}-${activeRoutine?.id || 'quick'}`;
    const recordPoints = totalCurrentPRs * 3;

    const { error: scoreError } = await supabase.rpc(
      'score_league_workout',
      {
        target_league_id: currentLeagueId,
        target_workout_key: workoutKey,
        target_record_points: recordPoints,
      }
    );

    if (scoreError) {
      throw scoreError;
    }

    await loadRealLeaguePlayers();
  } catch (error) {
    console.log('ERROR PUNTUANDO ENTRENAMIENTO:', error);
  }
}
  };

  const finishWorkout = () => {
    const allSets = workoutExercises.flatMap(
      (exercise) => exercise.sets || []
    );

    const pending = allSets.filter(
      (set) => !set.completed
    ).length;

    const finish = async () => {
      await recordWorkout();

      await notificationHaptic();

      const returnToLeague =
        workoutOrigin === 'league';

      if (totalCurrentPRs > 0) {
        const names = currentPRList
          .slice(0, 3)
          .map(
            (pr) =>
              `• ${pr.exercise}: ${pr.text}`
          )
          .join('\n');

        Alert.alert(
          `🏅 ${totalCurrentPRs} ${
            totalCurrentPRs === 1
              ? 'nuevo récord'
              : 'nuevos récords'
          }`,
          names,
          [
            {
              text: 'Genial',
              onPress: () => {
                if (returnToLeague) {
                  setSelectedTab('Liga');
                  setScreen('league');
                } else {
                  setSelectedTab('Inicio');
                  setScreen('home');
                }
              },
            },
          ]
        );

        return;
      }

      if (returnToLeague) {
        setSelectedTab('Liga');
        setScreen('league');
      } else {
        setSelectedTab('Inicio');
        setScreen('home');
      }
    };

    if (pending > 0) {
      Alert.alert(
        'Entrenamiento incompleto',
        `Quedan ${pending} ${
          pending === 1
            ? 'serie pendiente'
            : 'series pendientes'
        }. ¿Quieres finalizar igualmente?`,
        [
          {
            text: 'Seguir entrenando',
            style: 'cancel',
          },
          {
            text: 'Finalizar',
            onPress: finish,
          },
        ]
      );
    } else {
      finish();
    }
  };

  const deleteWorkout = (workout) => {
    Alert.alert(
      'Eliminar entrenamiento',
      `¿Quieres borrar “${
        workout.routineName ||
        'Entrenamiento'
      }” del historial?`,
      [
        {
          text: 'Cancelar',
          style: 'cancel',
        },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            await persistWorkouts(
              workouts.filter(
                (item) =>
                  item.id !== workout.id
              )
            );

            await notificationHaptic(
              Haptics.NotificationFeedbackType.Warning
            );
          },
        },
      ]
    );
  };

  /* =====================================================
     BOTTOM NAV
  ===================================================== */

  const BottomNavigation = () => (
    <LinearGradient
      colors={[
        'rgba(255,176,0,0.25)',
        'rgba(119,71,0,0.19)',
        'rgba(15,12,7,0.98)',
      ]}
      locations={[0, 0.42, 1]}
      style={styles.navigation}
    >
      {[
        'Inicio',
        'Liga',
        'Historial',
        'Rutinas',
      ].map((tab) => (
        <TouchableOpacity
          key={tab}
          style={styles.navItem}
          activeOpacity={0.7}
          onPress={() => openTab(tab)}
        >
          {tab === 'Rutinas' ? (
            <MaterialCommunityIcons
              name="dumbbell"
              size={22}
              color={
                selectedTab === tab
                  ? COLORS.orange
                  : '#5C5D61'
              }
              style={styles.navVectorIcon}
            />
          ) : tab === 'Liga' ? (
  <Text
    style={{
      fontSize: 16,
      fontWeight: '900',
      letterSpacing: -0.8,
      color:
        selectedTab === tab
          ? COLORS.orange
          : '#5C5D61',
      marginBottom: 1,
    }}
  >
    VS
  </Text>
        ) : tab === 'Historial' ? (
  <View
    style={{
      height: 22,
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 2,
      marginBottom: 1,
    }}
  >
    {[8, 14, 11, 19].map((height, index) => (
      <View
        key={index}
        style={{
          width: 4,
          height,
          borderRadius: 2,
          backgroundColor:
            selectedTab === tab
              ? COLORS.orange
              : '#5C5D61',
        }}
      />
    ))}
  </View>
) : (
<MaterialCommunityIcons
  name="home-outline"
  size={22}
  color={
    selectedTab === tab
      ? COLORS.orange
      : '#5C5D61'
  }
  style={styles.navVectorIcon}
/>
)}

          <Text
            style={[
              styles.navText,
              selectedTab === tab &&
                styles.navTextSelected,
            ]}
          >
            {tab}
          </Text>

          {selectedTab === tab && (
            <View style={styles.navIndicator} />
          )}
        </TouchableOpacity>
      ))}
    </LinearGradient>
  );

  /* =====================================================
     HEADER
  ===================================================== */

  const PageHeader = ({
    title,
    subtitle,
    showBack = true,
  }) => (
    <View style={styles.pageHeader}>
      {showBack ? (
        <TouchableOpacity
          style={styles.backButton}
          activeOpacity={0.7}
          onPress={goBack}
        >
          <Text style={styles.backArrow}>‹</Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.headerSpace} />
      )}

      <View style={styles.pageTitleBox}>
        <Text style={styles.pageTitle}>
          {title}
        </Text>

        <Text style={styles.pageSubtitle}>
          {subtitle}
        </Text>
      </View>

      <View style={styles.headerSpace} />
    </View>
  );

  /* =====================================================
     HOME
  ===================================================== */

  const Home = () => (
    <>
      <View style={styles.homeScreen}>
        

        <View style={styles.container}>
          <View style={styles.header}>
            <View>
              <Text style={styles.hello}>
                Hola, {profileName || ''}
              </Text>

              <Text style={styles.subtitle}>
                ¡Sigue Así, Hazlo posible!
              </Text>
            </View>

            <ProfileButton
              onPress={openProfile}
              letter={profileInitial}
              vibrationEnabled={vibrationEnabled}
            />
          </View>

          <View style={styles.pointsCard}>
          

            <Text style={styles.pointsLabel}>
              PRÓXIMO LOGRO
            </Text>

            <View style={styles.nextAchievementRow}>
              <Medal
                tier={nextAchievement.tier}
                size="large"
              />

              <View style={styles.flex}>
                <Text style={styles.nextAchievementTitle}>
                  {nextAchievement.title}
                </Text>

                <Text style={styles.pointsMessage}>
                  {nextAchievement.description}
                </Text>
              </View>
            </View>

            <View style={styles.progressBackground}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${nextPercent}%`,
                  },
                ]}
              />
            </View>

            <View style={styles.positionRow}>
              <Text style={styles.positionText}>
                Tu progreso
              </Text>

              <Text style={styles.positionNumber}>
                {nextValue}/{nextAchievement.target}
              </Text>
            </View>
          </View>

          <Text style={styles.sectionTitle}>
            Esta semana
          </Text>

          <View style={styles.weekCard}>
            <View style={styles.flex}>
              <Text style={styles.weekNumber}>
                {activeWeekDays}{' '}
                {activeWeekDays === 1
                  ? 'día entrenado'
                  : 'días entrenados'}
              </Text>

              <Text style={styles.weekLabel}>
                Tu registro personal de esta semana
              </Text>
            </View>

            <View style={styles.weekBadge}>
              <Text style={styles.weekBadgeText}>
                {activeWeekDays}/7
              </Text>

              <Text style={styles.weekBadgeLabel}>
                esta semana
              </Text>
            </View>
          </View>

          <View style={styles.trainingDots}>
            {weekDays.map((day) => {
              const done = checkedDays.includes(day.key);

              return (
                <TouchableOpacity
                  key={day.key}
                  activeOpacity={0.72}
                  onPress={() =>
                    toggleWeekDay(day.key)
                  }
                  style={
                    done
                      ? styles.completedDot
                      : styles.pendingDot
                  }
                >
                  <Text
                    style={
                      done
                        ? styles.activeDayText
                        : styles.pendingText
                    }
                  >
                    {done ? '✓' : day.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity
            style={styles.buttonShadow}
            activeOpacity={1}
            onPress={startWorkout}
          >
            <View style={styles.mainButton}>
              <View style={styles.buttonShine} />

              <Text style={styles.mainButtonIcon}>
                ＋
              </Text>

              <View>
                <Text style={styles.mainButtonText}>
                  INICIAR ENTRENAMIENTO
                </Text>

                <Text style={styles.mainButtonSubtext}>
                  Selecciona una rutina y registra tu sesión
                </Text>
              </View>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            activeOpacity={0.75}
            onPress={() =>
              setScreen('achievements')
            }
          >
            <Medal tier="gold" />

            <View style={styles.flex}>
              <Text style={styles.secondaryText}>
                Ver todos los logros
              </Text>

              <Text style={styles.achievementButtonSubtext}>
                Descubre tus próximos desafíos
              </Text>
            </View>

            <Text style={styles.arrow}>›</Text>
          </TouchableOpacity>
        </View>
      </View>

      {BottomNavigation()}
    </>
  );

  /* =====================================================
     LIGA
  ===================================================== */

  const League = () => {
    const now = new Date();

const todayUtc = Date.UTC(
  now.getFullYear(),
  now.getMonth(),
  now.getDate()
);

const nextMonthUtc = Date.UTC(
  now.getFullYear(),
  now.getMonth() + 1,
  1
);

const leagueDaysRemaining = Math.max(
  1,
  Math.ceil(
    (nextMonthUtc - todayUtc) / (1000 * 60 * 60 * 24)
  )
);
  const leaguePlayers = realLeaguePlayers
  .map((member) => ({
    id: member.user_id,
    user_id: member.user_id,
    name: member.username || 'Miembro',
    points: Number(member.points || 0),
    me: member.user_id === currentUserId,
  }))
  .sort((a, b) => b.points - a.points)
  .map((player , index) => ({
  ...player,

  isMonthlyMvp: index === 0,

  isRevengeMode: monthlyAwards.some(
    (award) =>
      award.user_id === player.user_id &&
      award.award_type === 'revenge'
  ),
}));

    const myIndex = leaguePlayers.findIndex(
      (player) => player.me
    );

    const myPosition =
      myIndex >= 0 ? myIndex + 1 : 1;

    const myPlayer =
      myIndex >= 0
        ? leaguePlayers[myIndex]
        : {
            name: profileName ,
            points: 0,
          };

    const playerAhead =
      myPosition > 1
        ? leaguePlayers[myIndex - 1]
        : null;

    const playerBehind =
      myPosition === 1 &&
      leaguePlayers.length > 1
        ? leaguePlayers[1]
        : null;

    const pointsGap = playerAhead
      ? Math.max(
          0,
          playerAhead.points - myPlayer.points
        )
      : playerBehind
      ? Math.max(
          0,
          myPlayer.points - playerBehind.points
        )
      : 0;

    const rivalTargetPoints = playerAhead
      ? playerAhead.points
      : myPlayer.points;

    const chaseProgress =
      playerAhead && rivalTargetPoints > 0
        ? Math.max(
            0,
            Math.min(
              100,
              (myPlayer.points /
                rivalTargetPoints) *
                100
            )
          )
        : 100;

    return (
      <>
        <View style={styles.leaguePage}>
          

          <ScrollView
            contentContainerStyle={styles.leagueContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View
  style={{
    marginBottom: 16,
    gap: 10,
  }}
>

{Platform.OS === 'ios' && (
  <AppleAuthentication.AppleAuthenticationButton
    buttonType={
      AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN
    }
    buttonStyle={
      AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
    }
    cornerRadius={14}
    style={{
      width: '100%',
      height: 48,
    
    }}
    onPress={loginWithApple}
  />
)}
<TouchableOpacity
  activeOpacity={0.85}
  onPress={loginWithGoogle}
  style={{
    width: '100%',
    height: 48,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
    
  }}
>
  <Text
    style={{
      color: '#111111',
      fontSize: 16,
      fontWeight: '700',
    }}
  >
    G
  </Text>

  <Text
    style={{
      color: '#111111',
      fontSize: 16,
      fontWeight: '600',
    }}
  >
    Iniciar sesión con Google
  </Text>
</TouchableOpacity>
<TouchableOpacity
  activeOpacity={0.85}
  onPress={() => setShowEmailAuth(true)}
  style={{
    width: '100%',
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#343840',
    backgroundColor: '#111318',
    alignItems: 'center',
    justifyContent: 'center',
    
  }}
>
  <Text
    style={{
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: '700',
    }}
  >
    Continuar con correo
  </Text>
</TouchableOpacity>
{showEmailAuth && (
  <View
    style={{
      width: '100%',
      marginBottom: 12,
      gap: 10,
    }}
  >
    <TextInput
      value={authEmail}
      onChangeText={setAuthEmail}
      placeholder="Email"
      placeholderTextColor="#626873"
      autoCapitalize="none"
      keyboardType="email-address"
      style={{
        height: 48,
        borderWidth: 1,
        borderColor: '#343840',
        borderRadius: 14,
        paddingHorizontal: 14,
        color: '#FFFFFF',
        backgroundColor: '#111318',
      }}
    />

    <TextInput
      value={authPassword}
      onChangeText={setAuthPassword}
      placeholder="Contraseña"
      placeholderTextColor="#626873"
      secureTextEntry
      style={{
        height: 48,
        borderWidth: 1,
        borderColor: '#343840',
        borderRadius: 14,
        paddingHorizontal: 14,
        color: '#FFFFFF',
        backgroundColor: '#111318',
      }}
    />

    <View
      style={{
        flexDirection: 'row',
        gap: 10,
      }}
    >
      <TouchableOpacity
        activeOpacity={0.85}
        disabled={authLoading}
        onPress={loginUser}
        style={{
          flex: 1,
          height: 48,
          borderRadius: 14,
          backgroundColor: COLORS.orange,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: authLoading ? 0.55 : 1,
        }}
      >
        <Text
          style={{
            color: '#111111',
            fontSize: 14,
            fontWeight: '900',
          }}
        >
          ENTRAR
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        activeOpacity={0.85}
        disabled={authLoading}
        onPress={signupWithEmail}
        style={{
          flex: 1,
          height: 48,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: COLORS.orange,
          backgroundColor: '#111318',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: authLoading ? 0.55 : 1,
        }}
      >
        <Text
          style={{
            color: COLORS.orange,
            fontSize: 14,
            fontWeight: '900',
          }}
        >
          CREAR CUENTA
        </Text>
      </TouchableOpacity>
    </View>
  </View>
)}
</View>
            <View
  style={{
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  }}
>
  <TextInput
    value={joinLeagueCode}
    onChangeText={setJoinLeagueCode}
    placeholder="Código de liga"
    placeholderTextColor="#626873"
    autoCapitalize="characters"
    maxLength={6}
    style={{
      flex: 1,
      height: 48,
      borderWidth: 1,
      borderColor: 'rgba(255,176,0,0.35)',
      borderRadius: 14,
      paddingHorizontal: 14,
      color: '#FFFFFF',
      backgroundColor: '#0D0F13',
    }}
  />

  <TouchableOpacity
    onPress={joinLeague}
    disabled={joiningLeague}
    style={{
      minWidth: 105,
      height: 48,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: COLORS.orange,
      opacity: joiningLeague ? 0.55 : 1,
    }}
  >
    <Text
      style={{
        color: '#111111',
        fontWeight: '900',
        fontSize: 13,
      }}
    >
      {joiningLeague ? 'UNIENDO...' : 'UNIRSE'}
    </Text>
  </TouchableOpacity>
</View>
            <View style={styles.leagueHero}>
              <Text style={styles.leagueHeroSmall}>
                AQUÍ NO VALEN LAS EXCUSAS
              </Text>

              <Text style={styles.leagueHeroBig}>
                QUE GANE EL MEJOR
              </Text>

              <View style={styles.leagueVsRow}>
                <LinearGradient
                  colors={[
                    'rgba(255,176,0,0.02)',
                    'rgba(255,176,0,0.14)',
                    'rgba(255,176,0,0.46)',
                  ]}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 1, y: 0.5 }}
                  style={styles.leagueVsLine}
                />

                <View style={styles.leagueVsCenter}>
                  <Text style={styles.leagueVsText}>
                    VS
                  </Text>
                </View>

                <LinearGradient
                  colors={[
                    'rgba(255,176,0,0.46)',
                    'rgba(255,176,0,0.14)',
                    'rgba(255,176,0,0.02)',
                  ]}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 1, y: 0.5 }}
                  style={styles.leagueVsLine}
                />
              </View>
            </View>

            <View style={styles.leagueMainCard}>
              <View style={styles.leagueBadgeBox}>
                <Image
                  source={LEAGUE_BADGE}
                  resizeMode="contain"
                  style={styles.leagueBadgeImage}
                />
              </View>

              <View style={styles.leagueIdentity}>
                {editingLeagueName ? (
                  <TextInput
                    value={leagueName}
                    onChangeText={setLeagueName}
                    autoFocus
                    maxLength={24}
                    returnKeyType="done"
                    onSubmitEditing={saveLeagueName}
                    onBlur={saveLeagueName}
                    style={styles.leagueNameInput}
                    placeholder="Nombre de la liga"
                    placeholderTextColor="#626873"
                  />
                ) : (
                  <>
                    <View style={styles.leagueNameRow}>
                      <Text
                        style={styles.leagueNameTitle}
                        numberOfLines={1}
                      >
                        {leagueName}
                      </Text>

                      <TouchableOpacity
                        activeOpacity={0.7}
                        style={styles.leagueEditNameButton}
                        onPress={async () => {
                          await impact();
                          setEditingLeagueName(true);
                        }}
                      >
                        <MaterialCommunityIcons
                          name="pencil-outline"
                          size={13}
                          color="#A6AAB2"
                        />
                      </TouchableOpacity>
                    </View>
                {inviteCode ? (
  <TouchableOpacity
    activeOpacity={0.7}
    onPress={async () => {
      await Clipboard.setStringAsync(inviteCode);
      await impact();
      Alert.alert('Código copiado', inviteCode);
    }}
  >
    <Text style={styles.leagueInviteCode}>
      Código: {inviteCode} · COPIAR
    </Text>
  </TouchableOpacity>
) : null}
                <View
  style={{
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  }}
>
  <Text style={styles.leagueMetaText}>
    {leaguePlayers.length} miembros · Ranking mensual
  </Text>

  
</View>
                  </>
                )}
              </View>

              <View style={styles.leaguePositionDivider} />

              <View style={styles.leaguePositionBox}>
                <Text style={styles.leaguePositionLabel}>
                  TU PUESTO
                </Text>

                <Text style={styles.leaguePositionNumber}>
                  #{myPosition}
                </Text>

                <Text style={styles.leaguePositionPoints}>
                  {myPlayer.points} PTS
                </Text>
              </View>
          
            </View>

            <View style={styles.leagueChaseCard}>
              <View style={styles.leagueChaseTop}>
                <View>
                  <Text style={styles.leagueChaseEyebrow}>
                    {myPosition === 1
                      ? 'LIDERATO'
                      : 'OBJETIVO INMEDIATO'}
                  </Text>

                  <Text style={styles.leagueChaseTitle}>
                    {myPosition === 1
                      ? `+${pointsGap} pts sobre el #2`
                      : `A ${pointsGap} pts del #${
                          myPosition - 1
                        }`}
                  </Text>
                </View>

                <MaterialCommunityIcons
                  name={
                    myPosition === 1
                      ? 'crown'
                      : 'arrow-up-bold'
                  }
                  size={20}
                  color={COLORS.orange}
                />
              </View>

              <View style={styles.leagueChaseBar}>
                <View
                  style={[
                    styles.leagueChaseFill,
                    {
                      width: `${chaseProgress}%`,
                    },
                  ]}
                />
              </View>

              <View style={styles.leagueChaseBottom}>
                <Text style={styles.leagueChaseValue}>
                  {myPlayer.points} pts
                </Text>

                <Text style={styles.leagueChaseTarget}>
                  {myPosition === 1
                    ? `#2 · ${
                        playerBehind?.points || 0
                      } pts`
                    : `#${
                        myPosition - 1
                      } · ${
                        playerAhead?.points || 0
                      } pts`}
                </Text>
              </View>
            </View>

            <View style={styles.leagueTrainingCard}>
              <View style={styles.leagueTrainingHeader}>
                <View style={styles.flex}>
                  <Text style={styles.leagueSectionTitle}>
                    ENTRENAMIENTOS PUNTUABLES
                  </Text>

                  <Text style={styles.leagueTrainingExplanation}>
                    Se puntúan hasta 4 entrenamientos semanales para mantener la competición equilibrada.
                  </Text>
                </View>

                <View style={styles.leagueTrainingCounter}>
                  <Text style={styles.leagueTrainingCounterNumber}>
                    {leagueScoringCount}
                  </Text>

                  <Text style={styles.leagueTrainingCounterSlash}>
                    /4
                  </Text>
                </View>
              </View>

              <View style={styles.leagueTrainingProgressTrack}>
                <View
                  style={[
                    styles.leagueTrainingProgressFill,
                    {
                      width: `${leagueTrainingProgress}%`,
                    },
                  ]}
                />
              </View>

              <View style={styles.leagueTrainingProgressInfo}>
                <Text
                  style={[
                    styles.leagueTrainingMessage,
                    leagueWeeklyLimitReached &&
                      styles.leagueTrainingMessageComplete,
                  ]}
                >
                  {leagueWeeklyLimitReached
                    ? 'Límite semanal alcanzado'
                    : remainingLeagueWorkouts === 1
                    ? 'Te queda 1 entrenamiento puntuable'
                    : `Te quedan ${remainingLeagueWorkouts} entrenamientos puntuables`}
                </Text>

                <Text style={styles.leagueTrainingAutomatic}>
                  Automático
                </Text>
              </View>

              <TouchableOpacity
                activeOpacity={0.86}
                style={styles.leagueAddWorkoutDepth}
                onPress={addLeagueWorkout}
              >
                <View
                  style={[
                    styles.leagueAddWorkoutButton,
                    leagueWeeklyLimitReached &&
                      styles.leagueAddWorkoutButtonLimit,
                  ]}
                >
                  <MaterialCommunityIcons
                    name={
                      leagueWeeklyLimitReached
                        ? 'dumbbell'
                        : 'plus'
                    }
                    size={21}
                    color={
                      leagueWeeklyLimitReached
                        ? COLORS.orange
                        : COLORS.darkText
                    }
                  />

                  <View style={styles.leagueAddWorkoutTextBox}>
                    <Text
                      style={[
                        styles.leagueAddWorkoutText,
                        leagueWeeklyLimitReached &&
                          styles.leagueAddWorkoutTextLimit,
                      ]}
                    >
                      {leagueWeeklyLimitReached
                        ? 'ENTRENAR'
                        : 'AÑADIR ENTRENAMIENTO'}
                    </Text>

                    <Text
                      style={[
                        styles.leagueAddWorkoutSubtext,
                        leagueWeeklyLimitReached &&
                          styles.leagueAddWorkoutSubtextLimit,
                      ]}
                    >
                      {leagueWeeklyLimitReached
                        ? 'Se guardará, pero ya no sumará puntos'
                        : 'Elige una rutina y registra tu sesión'}
                    </Text>
                  </View>

                  <MaterialCommunityIcons
                    name="arrow-right"
                    size={18}
                    color={
                      leagueWeeklyLimitReached
                        ? COLORS.orange
                        : COLORS.darkText
                    }
                  />
                </View>
              </TouchableOpacity>
            </View>



<TouchableOpacity
  activeOpacity={0.7}
  onPress={() => setScreen('leagueHistory')}
  style={{
    alignSelf: 'flex-end',
    marginBottom: 10,
  }}
>
  <Text
    style={{
      color: COLORS.orange,
      fontSize: 12,
      fontWeight: '800',
      letterSpacing: 0.4,
    }}
  >
    HISTORIAL DE LIGA ›
  </Text>
</TouchableOpacity>

            <View style={styles.leagueRankingCard}>
              <View style={styles.leagueSectionHeader}>
                <View style={styles.leagueSectionHeading}>
                  <MaterialCommunityIcons
                    name="trophy-outline"
                    size={17}
                    color={COLORS.orange}
                  />

                  <View>
                    <Text style={styles.leagueSectionTitle}>
                      CLASIFICACIÓN
                    </Text>

                    <Text style={styles.leagueSectionSubtitle}>
                      Ranking mensual
                    </Text>
                  </View>
                </View>

              <Text style={styles.leagueMonthBadge}>
  {leagueDaysRemaining}{' '}
  {leagueDaysRemaining === 1 ? 'DÍA' : 'DÍAS'}
</Text>
              </View>

              <View style={styles.leagueRankingLabels}>
                <Text style={styles.leagueRankingLabelPosition}>
                  POS.
                </Text>

                <Text style={styles.leagueRankingLabelName}>
                  RIVAL
                </Text>

                <Text style={styles.leagueRankingLabelPoints}>
                  PTS
                </Text>
              </View>

              {leaguePlayers.map((player, index) => {
                const position = index + 1;

                return (
                  <View
                    key={player.id}
                    style={[
                      styles.leaguePlayerRow,
                      position === 1 &&
                        styles.leaguePlayerRowFirst,
                      position === 2 &&
                        styles.leaguePlayerRowSecond,
                      position === 3 &&
                        styles.leaguePlayerRowThird,
                    ]}
                  >
                    <View style={styles.leaguePlayerPosition}>
                      {position === 1 ? (
                        <MaterialCommunityIcons
                          name="crown"
                          size={18}
                          color={COLORS.orange}
                        />
                      ) : (
                        <Text
                          style={[
                            styles.leaguePlayerPositionText,
                            player.me &&
                              styles.leaguePlayerPositionMe,
                          ]}
                        >
                          {position}
                        </Text>
                      )}
                    </View>

                    <View style={styles.leaguePlayerInfo}>
                      <Text
                        style={[
                          styles.leaguePlayerName,
                          player.me &&
                            styles.leaguePlayerNameMe,
                        ]}
                      >
                        {player.name}
                      </Text>

                  <View style={styles.leaguePlayerAwardBox}>
  {player.isMonthlyMvp && (
    <Text style={styles.leaguePlayerAward}>
     MVP DEL MES
    </Text>
  )}

  {player.isRevengeMode && (
    <Text style={styles.leaguePlayerAward}>
    ÚLTIMO DEL MES
    </Text>
  )}
</View>
                    </View>

                    <View style={styles.leaguePlayerPointsBox}>
                      <Text
                        style={[
                          styles.leaguePlayerPoints,
                          player.me &&
                            styles.leaguePlayerPointsMe,
                        ]}
                      >
                        {player.points}
                      </Text>

                      <Text style={styles.leaguePlayerPts}>
                        PTS
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>

            <TouchableOpacity
              activeOpacity={0.86}
              style={styles.leagueInviteWide}
              onPress={inviteFriends}
            >
              <LinearGradient
                colors={[
                  '#FFD24A',
                  '#FFB000',
                  '#E99100',
                ]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFillObject}
              />

              <MaterialCommunityIcons
                name="account-plus-outline"
                size={21}
                color={COLORS.darkText}
              />

              <View style={styles.leagueActionTextBox}>
                <Text style={styles.leagueInviteText}>
                  INVITAR RIVALES
                </Text>

                <Text style={styles.leagueInviteSubtext}>
                  Comparte tu liga
                </Text>
              </View>

              <MaterialCommunityIcons
                name="arrow-right"
                size={18}
                color={COLORS.darkText}
              />
            </TouchableOpacity>

            <View style={styles.leagueActivityCard}>
              <View style={styles.leagueSectionHeader}>
                <View>
                  <Text style={styles.leagueSectionTitle}>
                    ACTIVIDAD GRUPAL
                  </Text>

                  <Text style={styles.leagueSectionSubtitle}>
                    Lo último de tus rivales
                  </Text>
                </View>

                <MaterialCommunityIcons
                  name="pulse"
                  size={19}
                  color={COLORS.orange}
                />
              </View>

            {leagueActivity.length > 0 ? (
  leagueActivity.map((activity, index) => {
    const hasRecord = Number(activity.record_points || 0) > 0;
const isJoined = activity.event_type === 'joined';

const activityText = isJoined
  ? 'se ha unido a la liga'
  : hasRecord
    ? `ha completado un entrenamiento y conseguido récords · +${activity.total_points} pts`
    : `ha completado un entrenamiento · +${activity.total_points} pts`;

const activityDate = new Date(activity.event_at);
    const diffMs = Date.now() - activityDate.getTime();
    const diffMinutes = Math.max(0, Math.floor(diffMs / 60000));

    const timeText =
      diffMinutes < 1
        ? 'Ahora'
        : diffMinutes < 60
        ? `Hace ${diffMinutes} min`
        : diffMinutes < 1440
        ? `Hace ${Math.floor(diffMinutes / 60)} h`
        : `Hace ${Math.floor(diffMinutes / 1440)} d`;

    return (
      <View
        key={activity.event_id}
        style={[
          styles.leagueActivityRow,
          index === leagueActivity.length - 1 &&
            styles.leagueActivityRowLast,
        ]}
      >
        <View style={styles.leagueActivityDot} />

        <View style={styles.leagueActivityInfo}>
          <Text style={styles.leagueActivityText}>
            <Text style={styles.leagueActivityName}>
              {activity.username || 'Miembro'}{' '}
            </Text>

            {activityText}
          </Text>
        </View>

        <Text style={styles.leagueActivityTime}>
          {timeText}
        </Text>
      </View>
    );
  })
) : (
  <Text style={styles.leagueSectionSubtitle}>
    Aún no hay actividad en la liga
  </Text>
)}
            </View>
          </ScrollView>
        </View>

        {BottomNavigation()}
      </>
    );
  };

  /* =====================================================
     PERFIL
  ===================================================== */
const logoutUser = async () => {
  try {
    const { error } = await supabase.auth.signOut();

    if (error) {
      throw error;
    }

    setCurrentUserId(null);
    setRealLeaguePlayers([]);
    setLeagueActivity([]);
    setCurrentLeagueId(null);
    setInviteCode('');
    setWeeklyScoredWorkouts(0);

    Alert.alert(
      'Sesión cerrada',
      'Has cerrado sesión correctamente.'
    );
  } catch (error) {
    console.log('ERROR CERRANDO SESIÓN:', error);

    Alert.alert(
      'No se pudo cerrar sesión',
      error?.message || 'Inténtalo de nuevo.'
    );
  }
};
const AuthScreen = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    const cleanEmail = email.trim();

    if (!cleanEmail || !password) {
      Alert.alert(
        'Datos necesarios',
        'Introduce tu email y contraseña.'
      );
      return;
    }

    try {
      setLoading(true);

      const { error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });

      if (error) {
        throw error;
      }
    } catch (error) {
      Alert.alert(
        'No se pudo iniciar sesión',
        error?.message || 'Comprueba tus datos e inténtalo de nuevo.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar
        barStyle="light-content"
        backgroundColor="#08090C"
      />

      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          paddingHorizontal: 28,
        }}
      >
        <Text
          style={{
            color: COLORS.text,
            fontSize: 30,
            fontWeight: '900',
            marginBottom: 8,
          }}
        >
          INICIAR SESIÓN
        </Text>

        <Text
          style={{
            color: '#626873',
            fontSize: 14,
            marginBottom: 28,
          }}
        >
          Entra en tu cuenta para continuar
        </Text>

        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="Email"
          placeholderTextColor="#626873"
          autoCapitalize="none"
          keyboardType="email-address"
          style={{
            backgroundColor: '#111318',
            color: COLORS.text,
            borderWidth: 1,
            borderColor: '#252830',
            borderRadius: 14,
            paddingHorizontal: 16,
            height: 54,
            marginBottom: 12,
          }}
        />

        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder="Contraseña"
          placeholderTextColor="#626873"
          secureTextEntry
          style={{
            backgroundColor: '#111318',
            color: COLORS.text,
            borderWidth: 1,
            borderColor: '#252830',
            borderRadius: 14,
            paddingHorizontal: 16,
            height: 54,
            marginBottom: 18,
          }}
        />

        <TouchableOpacity
          activeOpacity={0.82}
          disabled={loading}
          onPress={handleLogin}
          style={{
            height: 54,
            borderRadius: 14,
            backgroundColor: COLORS.orange,
            justifyContent: 'center',
            alignItems: 'center',
            opacity: loading ? 0.6 : 1,
          }}
        >
          <Text
            style={{
              color: COLORS.darkText,
              fontSize: 14,
              fontWeight: '900',
            }}
          >
            {loading ? 'ENTRANDO...' : 'ENTRAR'}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};
  const Profile = () => (
    <View style={styles.page}>
    

      <PageHeader
        title="Perfil"
        subtitle="Tu progreso personal"
      />

      <ScrollView
        contentContainerStyle={styles.profileContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        

        <View style={styles.profileIdentity}>
          <View style={styles.profileAvatarDepth}>
            <View style={styles.profileAvatar}>
              <Text style={styles.profileAvatarText}>
                {profileInitial}
              </Text>
            </View>
          </View>

          <Text style={styles.profileNameLabel}>
            TU NOMBRE
          </Text>

          <View style={styles.nameEditBox}>
          <TextInput
  value={profileName}
  onChangeText={setProfileName}
  placeholder="Tu nombre"
  placeholderTextColor="#626873"
  style={styles.nameInput}
  maxLength={20}
  returnKeyType="done"
  onSubmitEditing={saveProfile}
  onBlur={saveProfile}
/>

            <MaterialCommunityIcons
              name="pencil-outline"
              size={15}
              color="#A6AAB2"
            />
          </View>
        </View>

        <View style={styles.profileStatsCard}>
          <View style={styles.profileStat}>
            <Text style={styles.profileStatNumber}>
              {workouts.length}
            </Text>

            <Text style={styles.profileStatLabel}>
              Entrenamientos
            </Text>
          </View>

          <View style={styles.profileStatDivider} />

          <View style={styles.profileStat}>
            <Text style={styles.profileStatNumber}>
              {uniqueTrainingDays}
            </Text>

            <Text style={styles.profileStatLabel}>
              Días
            </Text>
          </View>

          <View style={styles.profileStatDivider} />

          <View style={styles.profileStat}>
            <Text style={styles.profileStatNumber}>
              {unlockedAchievements}
            </Text>

            <Text style={styles.profileStatLabel}>
              Logros
            </Text>
          </View>
        </View>

        <View style={styles.profileTitleRow}>
          <Text style={styles.profileSectionTitle}>
            Objetivo de peso
          </Text>

          <MaterialCommunityIcons
            name="target"
            size={18}
            color={COLORS.orange}
          />
        </View>

        <View style={styles.weightCard}>
          <View style={styles.weightTopRow}>
            <View style={styles.weightColumn}>
              <Text style={styles.weightLabel}>
                PESO ACTUAL
              </Text>

              <View style={styles.weightInputBox}>
                <TextInput
                  value={currentWeight}
                  onChangeText={setCurrentWeight}
                  placeholder="--"
                  placeholderTextColor="#555A64"
                  keyboardType="decimal-pad"
                  maxLength={6}
                  style={styles.weightInputValue}
                />

                <Text style={styles.weightKg}>
                  kg
                </Text>
              </View>
            </View>

            <View style={styles.weightArrow}>
              <MaterialCommunityIcons
                name="arrow-right"
                size={20}
                color={COLORS.orange}
              />
            </View>

            <View style={styles.weightColumn}>
              <Text style={styles.weightLabel}>
                OBJETIVO
              </Text>

              <View style={styles.weightInputBox}>
                <TextInput
                  value={targetWeight}
                  onChangeText={setTargetWeight}
                  placeholder="--"
                  placeholderTextColor="#555A64"
                  keyboardType="decimal-pad"
                  maxLength={6}
                  style={styles.weightInputValue}
                />

                <Text style={styles.weightKg}>
                  kg
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.weightProgressTop}>
            <Text style={styles.weightProgressLabel}>
              PROGRESO
            </Text>

            <Text style={styles.weightProgressPercent}>
              {Math.round(bodyWeightProgress)}%
            </Text>
          </View>

          <View style={styles.weightProgressTrack}>
            <View
              style={[
                styles.weightProgressFill,
                {
                  width: `${bodyWeightProgress}%`,
                },
              ]}
            />
          </View>

          <View style={styles.weightFooter}>
            <Text style={styles.weightFooterText}>
              {startWeightNumber === null ||
              currentWeightNumber === null ||
              targetWeightNumber === null
                ? 'Guarda tu peso para empezar'
                : remainingWeight <= 0.01
                ? 'Objetivo conseguido ✓'
                : `${remainingWeight.toFixed(
                    1
                  )} kg restantes`}
            </Text>
          </View>
        </View>

        <Text style={styles.settingsTitle}>
          AJUSTES
        </Text>

        <View style={styles.settingsCard}>
          <View style={styles.settingRow}>
            <View style={styles.settingIcon}>
              <MaterialCommunityIcons
                name="bell-outline"
                size={19}
                color={COLORS.orange}
              />
            </View>

            <View style={styles.settingInfo}>
              <Text style={styles.settingName}>
                Notificaciones
              </Text>

              <Text style={styles.settingDescription}>
                Recordatorios y avisos
              </Text>
            </View>

            <TouchableOpacity
              activeOpacity={0.85}
              onPress={toggleNotifications}
              style={[
                styles.miniSwitch,
                notificationsEnabled &&
                  styles.miniSwitchActive,
              ]}
            >
              <View
                style={[
                  styles.miniSwitchCircle,
                  notificationsEnabled &&
                    styles.miniSwitchCircleActive,
                ]}
              />
            </TouchableOpacity>
          </View>

          <View style={styles.settingDivider} />

          <TouchableOpacity
            activeOpacity={
              notificationsEnabled ? 0.7 : 1
            }
            onPress={sendTestNotification}
            style={[
              styles.settingRow,
              !notificationsEnabled &&
                styles.settingDisabled,
            ]}
          >
            <View style={styles.settingIcon}>
              <MaterialCommunityIcons
                name="bell-ring-outline"
                size={19}
                color={
                  notificationsEnabled
                    ? COLORS.orange
                    : '#555861'
                }
              />
            </View>

            <View style={styles.settingInfo}>
              <Text style={styles.settingName}>
                Enviar notificación de prueba
              </Text>

              <Text style={styles.settingDescription}>
                Comprueba cómo se verá en tu móvil
              </Text>
            </View>

            {sendingTestNotification ? (
              <Text style={styles.notificationTestStatus}>
                ENVIANDO
              </Text>
            ) : (
              <View style={styles.notificationTestButton}>
                <Text style={styles.notificationTestButtonText}>
                  PROBAR
                </Text>
              </View>
            )}
          </TouchableOpacity>

          <View style={styles.settingDivider} />

          <View style={styles.settingRow}>
            <View style={styles.settingIcon}>
              <MaterialCommunityIcons
                name="vibrate"
                size={19}
                color={COLORS.orange}
              />
            </View>

            <View style={styles.settingInfo}>
              <Text style={styles.settingName}>
                Vibración
              </Text>

              <Text style={styles.settingDescription}>
                Respuesta al interactuar
              </Text>
            </View>

            <TouchableOpacity
              activeOpacity={0.85}
              onPress={toggleVibration}
              style={[
                styles.miniSwitch,
                vibrationEnabled &&
                  styles.miniSwitchActive,
              ]}
            >
              <View
                style={[
                  styles.miniSwitchCircle,
                  vibrationEnabled &&
                    styles.miniSwitchCircleActive,
                ]}
              />
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity
          style={styles.profileSaveDepth}
          activeOpacity={0.85}
          onPress={saveProfile}
        >
          <View style={styles.profileSaveButton}>
            <MaterialCommunityIcons
              name="check"
              size={18}
              color={COLORS.darkText}
            />

            <Text style={styles.profileSaveText}>
              GUARDAR CAMBIOS
            </Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity
  activeOpacity={0.85}
  onPress={logoutUser}
  style={{
    marginTop: 18,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
  }}
>
  <Text
    style={{
      color: '#FF5A5F',
      fontSize: 13,
      fontWeight: '800',
    }}
  >
    CERRAR SESIÓN
  </Text>
</TouchableOpacity>
      </ScrollView>
    </View>
  );

  /* =====================================================
     RUTINAS
  ===================================================== */

  const Routines = () => (
    <>
      <View style={styles.page}>
        <AppGradient />

        <PageHeader
          title="Mis rutinas"
          subtitle="Organiza tus entrenamientos"
          showBack={selectedTab !== 'Rutinas'}
        />

        <ScrollView
          contentContainerStyle={styles.pageContent}
          showsVerticalScrollIndicator={false}
        >
          {routines.length === 0 ? (
            <View style={styles.emptyCard}>
              <View style={styles.emptyIcon}>
                <MaterialCommunityIcons
                  name="dumbbell"
                  size={28}
                  color={COLORS.orange}
                />
              </View>

              <Text style={styles.emptyTitle}>
                Crea tu primera rutina
              </Text>

              <Text style={styles.emptyText}>
                Agrupa tus ejercicios y define series, repeticiones, kilos y grupos musculares.
              </Text>
            </View>
          ) : (
            routines.map((routine) => (
              <View
                key={routine.id}
                style={styles.routineCard}
              >
                <View style={styles.routineTop}>
                  <View style={styles.routineIcon}>
                    <MaterialCommunityIcons
                      name="dumbbell"
                      size={21}
                      color={COLORS.orange}
                    />
                  </View>

                  <View style={styles.routineInfo}>
                    <Text style={styles.routineName}>
                      {routine.name}
                    </Text>

                    <Text style={styles.routineCount}>
                      {routine.exercises.length}{' '}
                      {routine.exercises.length === 1
                        ? 'ejercicio'
                        : 'ejercicios'}
                    </Text>
                  </View>

                  <View style={styles.routineActions}>
                    <TouchableOpacity
                      style={styles.editRoutineButton}
                      activeOpacity={0.7}
                      onPress={() =>
                        beginEditRoutine(routine)
                      }
                    >
                      <MaterialCommunityIcons
                        name="pencil-outline"
                        size={17}
                        color="#A7ABB3"
                      />
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.deleteButton}
                      activeOpacity={0.7}
                      onPress={() =>
                        deleteRoutine(
                          routine.id,
                          routine.name
                        )
                      }
                    >
                      <MaterialCommunityIcons
                        name="trash-can-outline"
                        size={17}
                        color="#D97069"
                      />
                    </TouchableOpacity>
                  </View>
                </View>

                {routine.exercises.map((exercise) => (
                  <View
                    key={exercise.id}
                    style={styles.savedExercise}
                  >
                    <View style={styles.flex}>
                      <Text style={styles.savedExerciseName}>
                        {exercise.name}
                      </Text>

                      <Text style={styles.savedExerciseMuscle}>
                        {muscleText(exercise)}
                      </Text>
                    </View>

                    <View style={styles.planBadge}>
                      <Text style={styles.planBadgeText}>
                        {exercisePlan(exercise)}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            ))
          )}

          <TouchableOpacity
            style={styles.buttonShadow}
            activeOpacity={1}
            onPress={beginCreate}
          >
            <View style={styles.mainButton}>
              <View style={styles.buttonShine} />

              <Text style={styles.mainButtonIcon}>
                ＋
              </Text>

              <View>
                <Text style={styles.mainButtonText}>
                  CREAR RUTINA
                </Text>

                <Text style={styles.mainButtonSubtext}>
                  Añade ejercicios a tu planificación
                </Text>
              </View>
            </View>
          </TouchableOpacity>
          <View style={styles.comingSoonRoutineCard}>
  <View style={styles.comingSoonRoutineIcon}>
    <MaterialCommunityIcons
      name="lightning-bolt"
      size={24}
      color={COLORS.orange}
    />
  </View>

  <View style={styles.comingSoonRoutineContent}>
    <Text style={styles.comingSoonRoutineTitle}>
      NUEVAS RUTINAS
    </Text>

    <Text style={styles.comingSoonRoutineSubtitle}>
      Próximamente encontrarás nuevas rutinas aquí
    </Text>
  </View>

  <View style={styles.comingSoonRoutineBadge}>
    <Text style={styles.comingSoonRoutineBadgeText}>
      PRÓXIMAMENTE
    </Text>
  </View>
</View>
        </ScrollView>
      </View>

      {BottomNavigation()}
    </>
  );

  /* =====================================================
     EDITOR
  ===================================================== */

  const Editor = () => (
    <View style={styles.page}>
      

      <PageHeader
        title={
          editingRoutineId !== null
            ? 'Editar rutina'
            : 'Nueva rutina'
        }
        subtitle={
          editingRoutineId !== null
            ? 'Modifica tu planificación'
            : 'Prepara tu entrenamiento'
        }
      />

      <ScrollView
        contentContainerStyle={styles.pageContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.fieldLabel}>
          NOMBRE DE LA RUTINA
        </Text>

        <TextInput
          style={styles.routineInput}
          placeholder="Ejemplo: Push, Pierna, Torso..."
          placeholderTextColor="#626873"
          value={routineName}
          onChangeText={setRoutineName}
        />

        <View style={styles.editorHeading}>
          <Text style={styles.editorTitle}>
            Ejercicios
          </Text>

          <Text style={styles.editorHint}>
            Series · reps · kg
          </Text>
        </View>

        {draftExercises.map(
          (exercise, index) => {
            const selectedMuscles =
              getExerciseMuscles(exercise);

            return (
              <View
                key={exercise.id}
                style={styles.exerciseRow}
              >
                <View style={styles.exerciseNumber}>
                  <Text style={styles.exerciseNumberText}>
                    {index + 1}
                  </Text>
                </View>

                <View style={styles.exerciseFields}>
                  <TextInput
                    style={styles.exerciseNameInput}
                    placeholder="Nombre del ejercicio"
                    placeholderTextColor="#626873"
                    value={exercise.name}
                    onChangeText={(value) =>
                      updateExercise(
                        exercise.id,
                        'name',
                        value
                      )
                    }
                  />

                  <View style={styles.exerciseMetricsRow}>
                    <TextInput
                      style={styles.metricInput}
                      placeholder="Series"
                      placeholderTextColor="#626873"
                      keyboardType="number-pad"
                      value={exercise.series}
                      onChangeText={(value) =>
                        updateExercise(
                          exercise.id,
                          'series',
                          value
                        )
                      }
                    />

                    <TextInput
                      style={styles.metricInput}
                      placeholder="Reps"
                      placeholderTextColor="#626873"
                      keyboardType="number-pad"
                      value={exercise.reps}
                      onChangeText={(value) =>
                        updateExercise(
                          exercise.id,
                          'reps',
                          value
                        )
                      }
                    />

                    <TextInput
                      style={[
                        styles.metricInput,
                        styles.weightInput,
                      ]}
                      placeholder="Kg"
                      placeholderTextColor="#8B773B"
                      keyboardType="decimal-pad"
                      value={exercise.weight}
                      onChangeText={(value) =>
                        updateExercise(
                          exercise.id,
                          'weight',
                          value
                        )
                      }
                    />
                  </View>

                  <View style={styles.muscleLabelRow}>
                    <Text style={styles.muscleLabel}>
                      GRUPOS MUSCULARES
                    </Text>

                    {selectedMuscles.length > 0 && (
                      <Text style={styles.muscleSelectedCount}>
                        {selectedMuscles.length}{' '}
                        {selectedMuscles.length === 1
                          ? 'seleccionado'
                          : 'seleccionados'}
                      </Text>
                    )}
                  </View>

                  <Text style={styles.muscleHelper}>
                    Puedes seleccionar varios
                  </Text>

                  <View style={styles.muscleOptions}>
                    {MUSCLE_GROUPS.map((muscle) => {
                      const selected =
                        selectedMuscles.includes(muscle);

                      return (
                        <TouchableOpacity
                          key={muscle}
                          activeOpacity={0.72}
                          onPress={() =>
                            toggleExerciseMuscle(
                              exercise.id,
                              muscle
                            )
                          }
                          style={[
                            styles.muscleChip,
                            selected &&
                              styles.muscleChipSelected,
                          ]}
                        >
                          {selected && (
                            <MaterialCommunityIcons
                              name="check"
                              size={12}
                              color={COLORS.darkText}
                              style={styles.muscleChipCheck}
                            />
                          )}

                          <Text
                            style={[
                              styles.muscleChipText,
                              selected &&
                                styles.muscleChipTextSelected,
                            ]}
                          >
                            {muscle}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                <TouchableOpacity
                  style={styles.removeButton}
                  onPress={() =>
                    removeExercise(exercise.id)
                  }
                >
                  <Text style={styles.removeText}>
                    ×
                  </Text>
                </TouchableOpacity>
              </View>
            );
          }
        )}

        <TouchableOpacity
          style={styles.addExerciseButton}
          onPress={addExercise}
        >
          <Text style={styles.addExerciseIcon}>
            ＋
          </Text>

          <Text style={styles.addExerciseText}>
            Añadir ejercicio
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.buttonShadow}
          onPress={saveRoutine}
        >
          <View style={styles.mainButton}>
            <View style={styles.buttonShine} />

            <Text style={styles.saveIcon}>
              ✓
            </Text>

            <View>
              <Text style={styles.mainButtonText}>
                {editingRoutineId !== null
                  ? 'GUARDAR CAMBIOS'
                  : 'GUARDAR RUTINA'}
              </Text>

              <Text style={styles.mainButtonSubtext}>
                {editingRoutineId !== null
                  ? 'Actualiza tu planificación'
                  : 'Guárdala en Mis rutinas'}
              </Text>
            </View>
          </View>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );

  /* =====================================================
     LOGROS
  ===================================================== */

  const Achievements = () => (
    <View style={styles.page}>
      

      <PageHeader
        title="Logros"
        subtitle="Tu progreso personal"
      />

      <ScrollView
        contentContainerStyle={styles.pageContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.achievementSummary}>
          <Text style={styles.achievementSummaryNumber}>
            {unlockedAchievements}
          </Text>

          <Text style={styles.achievementSummaryText}>
            de {ACHIEVEMENTS.length} logros desbloqueados
          </Text>
        </View>

        {ACHIEVEMENTS.map((item) => {
          const value = Math.min(
            achievementProgress(item),
            item.target
          );

          const unlocked = value >= item.target;

          return (
            <View
              key={item.id}
              style={[
                styles.achievementCard,
                unlocked &&
                  styles.achievementCardUnlocked,
              ]}
            >
              <View style={styles.achievementIconBox}>
                <Medal
                  tier={item.tier}
                  unlocked={unlocked}
                />
              </View>

              <View style={styles.achievementInfo}>
                <View style={styles.achievementTitleRow}>
                  <Text
                    style={[
                      styles.achievementTitle,
                      !unlocked &&
                        styles.achievementTitleLocked,
                    ]}
                  >
                    {item.title}
                  </Text>

                  <Text
                    style={
                      unlocked
                        ? styles.unlockedLabel
                        : styles.progressLabel
                    }
                  >
                    {unlocked
                      ? 'CONSEGUIDO'
                      : `${value}/${item.target}`}
                  </Text>
                </View>

                <Text style={styles.achievementDescription}>
                  {item.description}
                </Text>

                {!unlocked && (
                  <View style={styles.smallProgressTrack}>
                    <View
                      style={[
                        styles.smallProgressFill,
                        {
                          width: `${Math.min(
                            100,
                            (value / item.target) * 100
                          )}%`,
                        },
                      ]}
                    />
                  </View>
                )}
              </View>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );

  /* =====================================================
     QUICK START
  ===================================================== */

  const QuickStart = () => {
    const latestWorkout = [...workouts].sort(
      (a, b) =>
        new Date(b.finishedAt) -
        new Date(a.finishedAt)
    )[0];

    const preferredRoutine =
      routines.find(
        (routine) =>
          routine.id === latestWorkout?.routineId
      ) || routines[0];

    const otherRoutines = routines.filter(
      (routine) =>
        routine.id !== preferredRoutine?.id
    );

    return (
      <View style={styles.page}>
        

        <PageHeader
          title="Entrena ahora"
          subtitle={
            workoutOrigin === 'league'
              ? 'Elige una rutina y compite'
              : 'Elige una rutina y pasa a la acción'
          }
        />

        <ScrollView
          contentContainerStyle={styles.quickContent}
        >
          {workoutOrigin === 'league' && (
            <View style={styles.quickLeagueBanner}>
              <MaterialCommunityIcons
                name="crown-outline"
                size={18}
                color={COLORS.orange}
              />

              <View style={styles.flex}>
                <Text style={styles.quickLeagueBannerTitle}>
                  LIGA
                </Text>

                <Text style={styles.quickLeagueBannerText}>
                  {leagueWeeklyLimitReached
                    ? 'Tu límite puntuable ya está completo. Esta sesión seguirá guardándose normalmente.'
                    : `Esta será tu sesión ${
                        leagueScoringCount + 1
                      } de 4 puntuables.`}
                </Text>
              </View>
            </View>
          )}

          <View style={styles.quickHero}>
            <View style={styles.quickHeroIcon}>
              <MaterialCommunityIcons
                name="dumbbell"
                size={46}
                color={COLORS.darkText}
              />
            </View>

            <Text style={styles.quickEyebrow}>
              MODO ENTRENAMIENTO
            </Text>

            <Text style={styles.quickHeroTitle}>
              Hoy también cuenta
            </Text>

            <Text style={styles.quickHeroText}>
              Elige una rutina y registra cada serie de verdad.
            </Text>
          </View>

          {preferredRoutine ? (
            <>
              <TouchableOpacity
                style={styles.quickFeaturedCard}
                onPress={() =>
                  openWorkout(
                    preferredRoutine,
                    workoutOrigin
                  )
                }
              >
                <View style={styles.quickFeaturedTop}>
                  <View style={styles.quickRoutineIcon}>
                    <MaterialCommunityIcons
                      name="dumbbell"
                      size={25}
                      color={COLORS.orange}
                    />
                  </View>

                  <View style={styles.flex}>
                    <Text style={styles.quickRoutineName}>
                      {preferredRoutine.name}
                    </Text>

                    <Text style={styles.quickRoutineMeta}>
                      {preferredRoutine.exercises.length}{' '}
                      ejercicios
                    </Text>
                  </View>

                  <Text style={styles.quickFeaturedArrow}>
                    ›
                  </Text>
                </View>

                <View style={styles.quickStartButton}>
                  <Text style={styles.quickStartText}>
                    EMPEZAR ENTRENAMIENTO
                  </Text>

                  <MaterialCommunityIcons
                    name="arrow-right"
                    size={19}
                    color={COLORS.darkText}
                  />
                </View>
              </TouchableOpacity>

              {otherRoutines.map((routine) => (
                <TouchableOpacity
                  key={routine.id}
                  style={styles.quickListCard}
                  onPress={() =>
                    openWorkout(
                      routine,
                      workoutOrigin
                    )
                  }
                >
                  <View style={styles.quickListIcon}>
                    <MaterialCommunityIcons
                      name="dumbbell"
                      size={20}
                      color={COLORS.orange}
                    />
                  </View>

                  <View style={styles.flex}>
                    <Text style={styles.quickListName}>
                      {routine.name}
                    </Text>

                    <Text style={styles.quickRoutineMeta}>
                      {routine.exercises.length}{' '}
                      ejercicios
                    </Text>
                  </View>

                  <Text style={styles.quickListArrow}>
                    ›
                  </Text>
                </TouchableOpacity>
              ))}
            </>
          ) : (
            <View style={styles.quickEmptyCard}>
              <MaterialCommunityIcons
                name="dumbbell"
                size={38}
                color={COLORS.orange}
              />

              <Text style={styles.quickEmptyTitle}>
                Prepara tu primera rutina
              </Text>

              <Text style={styles.quickEmptyText}>
                Cuando la tengas creada aparecerá aquí.
              </Text>
            </View>
          )}
        </ScrollView>
      </View>
    );
  };

  /* =====================================================
     HISTORIAL
  ===================================================== */

  const History = () => {
    const orderedWorkouts = [...workouts].sort(
      (a, b) =>
        new Date(b.finishedAt) -
        new Date(a.finishedAt)
    );
const historyYear = new Date().getFullYear();
const currentMonthIndex = new Date().getMonth();

const monthInitials = [
  'E', 'F', 'M', 'A', 'M', 'J',
  'J', 'A', 'S', 'O', 'N', 'D',
];

const monthlyTrainingDays = monthInitials.map(
  (label, monthIndex) => {
    const days = new Set();

    workouts.forEach((workout) => {
      const date = new Date(workout.finishedAt);

      if (
        date.getFullYear() === historyYear &&
        date.getMonth() === monthIndex
      ) {
        days.add(localDayKey(date));
      }
    });

    return {
      label,
      monthIndex,
      count: days.size,
    };
  }
);

const maxMonthlyTrainingDays = Math.max(
  1,
  ...monthlyTrainingDays.map((item) => item.count)
);
    const muscleDays = MUSCLE_GROUPS.reduce(
      (result, muscle) => {
        result[muscle] = new Set();
        return result;
      },
      {}
    );

    workouts.forEach((workout) => {
      const workoutDay = localDayKey(
        workout.finishedAt
      );

      const musclesToday = new Set();

      (workout.exercises || []).forEach(
        (exercise) => {
          getExerciseMuscles(exercise).forEach(
            (muscle) => {
              if (muscle) {
                musclesToday.add(muscle);
              }
            }
          );
        }
      );

      musclesToday.forEach((muscle) => {
        if (muscleDays[muscle]) {
          muscleDays[muscle].add(workoutDay);
        }
      });
    });

    const muscleStats = MUSCLE_GROUPS.map(
      (muscle) => ({
        muscle,
        days: muscleDays[muscle].size,
      })
    )
      .filter((item) => item.days > 0)
      .sort((a, b) => b.days - a.days);

    const maximumMuscleDays = Math.max(
      1,
      ...muscleStats.map((item) => item.days)
    );

    return (
      <>
        <View style={styles.page}>
          

          <PageHeader
            title="Historial"
            subtitle="Tu actividad personal"
            showBack={selectedTab !== 'Historial'}
          />

          <ScrollView
            contentContainerStyle={styles.pageContent}
            showsVerticalScrollIndicator={false}
          >
<View
  style={{
    marginBottom: 22,
  }}
>
  <View
    style={{
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 14,
    }}
  >
    <Text
      style={{
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '900',
      }}
    >
      ACTIVIDAD ANUAL
    </Text>

    <Text
      style={{
        color: '#858A95',
        fontSize: 13,
        fontWeight: '700',
      }}
    >
      {historyYear}
    </Text>
  </View>

  <View
    style={{
      height: 125,
      flexDirection: 'row',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
    }}
  >
    {monthlyTrainingDays.map((item) => {
      const isCurrentMonth =
        item.monthIndex === currentMonthIndex;

      const isPastMonth =
        item.monthIndex < currentMonthIndex;

      const barHeight =
        item.count > 0
          ? Math.max(
              8,
              (item.count / maxMonthlyTrainingDays) * 78
            )
          : 3;

      return (
        <View
          key={item.monthIndex}
          style={{
            flex: 1,
            alignItems: 'center',
          }}
        >
          <Text
            style={{
              color: isCurrentMonth
                ? '#FFFFFF'
                : '#858A95',
              fontSize: 10,
              fontWeight: '800',
              marginBottom: 5,
              opacity: item.monthIndex > currentMonthIndex
                ? 0.3
                : 1,
            }}
          >
            {item.count}
          </Text>

          <View
            style={{
              width: 10,
              height: barHeight,
              borderRadius: 5,
              backgroundColor: COLORS.orange,
              opacity: isCurrentMonth
                ? 1
                : isPastMonth
                ? 0.42
                : 0.12,
            }}
          />

          <Text
            style={{
              color: isCurrentMonth
                ? COLORS.orange
                : '#858A95',
              fontSize: 11,
              fontWeight: isCurrentMonth ? '900' : '700',
              marginTop: 7,
              opacity: item.monthIndex > currentMonthIndex
                ? 0.35
                : 1,
            }}
          >
            {item.label}
          </Text>
        </View>
      );
    })}
  </View>
</View>           <TouchableOpacity
  activeOpacity={0.8}
  onPress={() => setScreen('personalRecords')}
  style={{
    height: 50,
    backgroundColor: '#111318',
    borderWidth: 1,
    borderColor: 'rgba(255,176,0,0.22)',
    borderRadius: 14,
    paddingHorizontal: 16,
    marginBottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  }}
>
  <Text
    style={{
      color: '#FFFFFF',
      fontSize: 14,
      fontWeight: '900',
      letterSpacing: 0.3,
    }}
  >
    TUS MEJORES MARCAS
  </Text>

  <MaterialCommunityIcons
    name="chevron-right"
    size={22}
    color={COLORS.orange}
  />
</TouchableOpacity>
            <Text style={styles.historySectionTitle}>
              Grupos trabajados
            </Text>

            <Text style={styles.historySectionSubtitle}>
              Días distintos que has trabajado cada grupo
            </Text>

            <View style={styles.muscleStatsCard}>
              {muscleStats.length > 0 ? (
                muscleStats.map((item) => {
                  const percentage = Math.max(
                    5,
                    (item.days /
                      maximumMuscleDays) *
                      100
                  );

                  return (
                    <View
                      key={item.muscle}
                      style={styles.muscleStatRow}
                    >
                      <View style={styles.muscleStatTop}>
                        <Text style={styles.muscleStatName}>
                          {item.muscle}
                        </Text>

                        <Text style={styles.muscleStatDays}>
                          {item.days}{' '}
                          {item.days === 1
                            ? 'día'
                            : 'días'}
                        </Text>
                      </View>

                      <View style={styles.muscleBarTrack}>
                        <View
                          style={[
                            styles.muscleBarFill,
                            {
                              width: `${percentage}%`,
                            },
                          ]}
                        />
                      </View>
                    </View>
                  );
                })
              ) : (
                <View style={styles.muscleStatsEmpty}>
                  <MaterialCommunityIcons
                    name="chart-bar"
                    size={25}
                    color="#4C5058"
                  />

                  <Text style={styles.historyEmptyText}>
                    Cuando completes entrenamientos, aquí verás qué grupos musculares has trabajado.
                  </Text>
                </View>
              )}
            </View>

            <Text
              style={[
                styles.historySectionTitle,
                styles.historyWorkoutSectionTitle,
              ]}
            >
              Entrenamientos
            </Text>

            {orderedWorkouts.map((workout) => (
              <View
                key={workout.id}
                style={styles.historyWorkoutCard}
              >
                <View style={styles.historyWorkoutTop}>
                  <View style={styles.flex}>
                    <Text style={styles.historyWorkoutName}>
                      {workout.routineName ||
                        'Entrenamiento'}
                    </Text>

                    <Text style={styles.historyWorkoutDate}>
                      {new Date(
                        workout.finishedAt
                      ).toLocaleDateString(
                        'es-ES',
                        {
                          day: '2-digit',
                          month: 'long',
                          year: 'numeric',
                        }
                      )}
                    </Text>
                  </View>

                  <TouchableOpacity
                    style={styles.deleteWorkoutButton}
                    onPress={() =>
                      deleteWorkout(workout)
                    }
                  >
                    <Text style={styles.deleteWorkoutText}>
                      ×
                    </Text>
                  </TouchableOpacity>
                </View>

                {(workout.exercises || []).map((exercise) => {
                  const sets = Array.isArray(exercise.sets)
                    ? exercise.sets.filter(
                        (set) =>
                          set.completed !== false
                      )
                    : [];

                  const prCount = sets.filter(
                    (set) => !!set.prType
                  ).length;

                  return (
                    <View
                      key={exercise.id}
                      style={styles.historyExerciseBlock}
                    >
                      <View style={styles.historyExerciseHeader}>
                        <View style={styles.flex}>
                          <Text style={styles.historyExerciseName}>
                            {exercise.name}
                          </Text>

                          <Text style={styles.historyMuscleText}>
                            {muscleText(exercise)}
                          </Text>
                        </View>

                        {prCount > 0 && (
                          <View style={styles.historyPRBadge}>
                            <Text style={styles.historyPRText}>
                              PR ×{prCount}
                            </Text>
                          </View>
                        )}
                      </View>

                      {sets.length > 0 ? (
                        sets.map((set, index) => (
                          <View
                            key={set.id || index}
                            style={styles.historySetRow}
                          >
                            <Text style={styles.historySetNumber}>
                              {index + 1}
                            </Text>

                            <Text style={styles.historySetValue}>
                              {set.weight} kg
                            </Text>

                            <Text style={styles.historySetValue}>
                              {set.reps} reps
                            </Text>

                            {!!set.prType && (
                              <Text style={styles.historySetPR}>
                                PR
                              </Text>
                            )}
                          </View>
                        ))
                      ) : (
                        <Text style={styles.legacyWorkoutText}>
                          {exercisePlan(exercise)}
                        </Text>
                      )}
                    </View>
                  );
                })}
              </View>
            ))}

            {orderedWorkouts.length === 0 && (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>
                  Aún no hay entrenamientos
                </Text>

                <Text style={styles.emptyText}>
                  Finaliza tu primera rutina y aparecerá aquí.
                </Text>
              </View>
            )}
          </ScrollView>
        </View>

        {BottomNavigation()}
      </>
    );
  };
/* =====================================================
   MEJORES MARCAS
===================================================== */

const PersonalRecords = () => {
  const recordsByExercise = {};

  workouts.forEach((workout) => {
    (workout.exercises || []).forEach((exercise) => {
      const key = normalizeExerciseName(exercise.name || '');

      if (!key) return;

      const sets = Array.isArray(exercise.sets)
        ? exercise.sets.filter(
            (set) => set.completed !== false
          )
        : [];

      sets.forEach((set) => {
        const weight = parseNumber(set.weight);
        const reps = parseNumber(set.reps);

        if (weight === null || reps === null) {
          return;
        }

        const current = recordsByExercise[key];

        const isBetter =
          !current ||
          weight > current.weight ||
          (weight === current.weight &&
            reps > current.reps);

        if (isBetter) {
          recordsByExercise[key] = {
            name: exercise.name,
            weight,
            reps,
            muscles: muscleText(exercise),
            finishedAt: workout.finishedAt,
          };
        }
      });
    });
  });

  const personalRecords = Object.values(
    recordsByExercise
  ).sort((a, b) =>
    a.name.localeCompare(b.name, 'es', {
      sensitivity: 'base',
    })
  );

  return (
    <View style={styles.page}>
      <AppGradient />

      <PageHeader
        title="Mejores marcas"
        subtitle="Tus récords personales"
      />

      <ScrollView
        contentContainerStyle={styles.pageContent}
        showsVerticalScrollIndicator={false}
      >
<View
  style={{
    marginBottom: 22,
  }}
>
  <Text
    style={{
      color: '#FFFFFF',
      fontSize: 18,
      fontWeight: '900',
      letterSpacing: 0.2,
      marginBottom: 6,
    }}
  >
  AQUÍ ES DONDE VES TU PROGRESO
  </Text>

  <Text
    style={{
      color: '#858A95',
      fontSize: 13,
      lineHeight: 19,
    }}
  >
    ¡Esto es lo que estás construyendo! Sigue avanzando.
  </Text>
</View>
        {personalRecords.length > 0 ? (
          personalRecords.map((record) => (
            <View
              key={normalizeExerciseName(record.name)}
              style={{
                backgroundColor: '#111318',
                borderWidth: 1,
                borderColor: '#252830',
                borderRadius: 18,
                padding: 16,
                marginBottom: 12,
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <View
                  style={{
                    flex: 1,
                    paddingRight: 12,
                  }}
                >
                  <Text
                    style={{
                      color: '#FFFFFF',
                      fontSize: 16,
                      fontWeight: '900',
                      marginBottom: 5,
                    }}
                  >
                    {record.name}
                  </Text>

                  <Text
                    style={{
                      color: '#777D88',
                      fontSize: 12,
                    }}
                  >
                    {record.muscles}
                  </Text>
                </View>

                <View
                  style={{
                    alignItems: 'flex-end',
                  }}
                >
                  <Text
                    style={{
                      color: COLORS.orange,
                      fontSize: 20,
                      fontWeight: '900',
                    }}
                  >
                    {record.weight} kg
                  </Text>

                  <Text
                    style={{
                      color: '#FFFFFF',
                      fontSize: 12,
                      fontWeight: '700',
                      marginTop: 2,
                    }}
                  >
                    {record.reps} reps
                  </Text>
                </View>
              </View>

              <Text
                style={{
                  color: '#555B65',
                  fontSize: 11,
                  marginTop: 12,
                }}
              >
                Récord ·{' '}
                {new Date(
                  record.finishedAt
                ).toLocaleDateString('es-ES')}
              </Text>
            </View>
          ))
        ) : (
          <View style={styles.emptyCard}>
            <MaterialCommunityIcons
              name="trophy-outline"
              size={32}
              color="#4C5058"
            />

            <Text style={styles.emptyTitle}>
              Aún no hay marcas
            </Text>

            <Text style={styles.emptyText}>
              Cuando registres peso y repeticiones,
              tus mejores marcas aparecerán aquí.
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
};
  /* =====================================================
     WORKOUT
  ===================================================== */

  const Workout = () => {
    const allSets = workoutExercises.flatMap(
      (exercise) => exercise.sets || []
    );

    const completed = allSets.filter(
      (set) => set.completed
    ).length;

    const total = allSets.length;

    const allCompleted =
      total > 0 && completed === total;

    const animatedWidth =
      progressAnimation.interpolate({
        inputRange: [0, 1],
        outputRange: ['0%', '100%'],
      });

    const celebrationScale =
      celebrationAnimation.interpolate({
        inputRange: [0, 1],
        outputRange: [0.96, 1],
      });

    return (
      <View style={styles.page}>
        

        <PageHeader
          title={
            activeRoutine?.name ||
            'Entrenamiento'
          }
          subtitle="Entrenamiento en curso"
        />

        <ScrollView
          contentContainerStyle={styles.workoutContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Animated.View
            style={[
              styles.workoutProgressCard,
              allCompleted &&
                styles.workoutProgressCardComplete,
              {
                transform: [
                  {
                    scale: celebrationScale,
                  },
                ],
              },
            ]}
          >
            <View style={styles.workoutProgressTop}>
              <View>
                <Text style={styles.pointsLabel}>
                  PROGRESO
                </Text>

                <Text style={styles.workoutProgressNumber}>
                  {completed} de {total} series
                </Text>
              </View>

              <Text style={styles.workoutPercentage}>
                {total
                  ? Math.round(
                      (completed / total) *
                        100
                    )
                  : 0}
                %
              </Text>
            </View>

            <View style={styles.workoutProgressTrack}>
              <Animated.View
                style={[
                  styles.workoutProgressFill,
                  {
                    width: animatedWidth,
                  },
                ]}
              />
            </View>
          </Animated.View>

          <Text style={styles.workoutSectionTitle}>
            Ejercicios
          </Text>

          {workoutExercises.map((exercise) => {
            const done = exercise.sets.filter(
              (set) => set.completed
            ).length;

            const exerciseComplete =
              exercise.sets.length > 0 &&
              done === exercise.sets.length;

            return (
              <View
                key={exercise.id}
                style={[
                  styles.liveExerciseCard,
                  exerciseComplete &&
                    styles.liveExerciseCardComplete,
                ]}
              >
                <TouchableOpacity
                  activeOpacity={0.78}
                  onPress={() =>
                    toggleExerciseExpanded(
                      exercise.id
                    )
                  }
                  style={styles.liveExerciseHeader}
                >
                  <View style={styles.liveExerciseIcon}>
                    <MaterialCommunityIcons
                      name="dumbbell"
                      size={19}
                      color={
                        exerciseComplete
                          ? COLORS.yellow
                          : COLORS.orange
                      }
                    />
                  </View>

                  <View style={styles.flex}>
                    <Text style={styles.liveExerciseName}>
                      {exercise.name}
                    </Text>

                    <Text style={styles.liveExerciseMeta}>
                      {muscleText(exercise)}
                    </Text>
                  </View>

                  <View
                    style={[
                      styles.exerciseProgressBadge,
                      exerciseComplete &&
                        styles.exerciseProgressBadgeComplete,
                    ]}
                  >
                    <Text
                      style={[
                        styles.exerciseProgressText,
                        exerciseComplete &&
                          styles.exerciseProgressTextComplete,
                      ]}
                    >
                      {done}/{exercise.sets.length}
                    </Text>
                  </View>

                  <MaterialCommunityIcons
                    name={
                      exercise.expanded
                        ? 'chevron-up'
                        : 'chevron-down'
                    }
                    size={21}
                    color="#777C86"
                  />
                </TouchableOpacity>

                {exercise.expanded && (
                  <View style={styles.liveSetsContainer}>
                    <View style={styles.liveSetsLabels}>
                      <Text
                        style={[
                          styles.liveSetLabel,
                          styles.setNumberColumn,
                        ]}
                      >
                        SERIE
                      </Text>

                      <Text
                        style={[
                          styles.liveSetLabel,
                          styles.setFieldColumn,
                        ]}
                      >
                        KG
                      </Text>

                      <Text
                        style={[
                          styles.liveSetLabel,
                          styles.setFieldColumn,
                        ]}
                      >
                        REPS
                      </Text>

                      <View style={styles.setCheckColumn} />
                    </View>

                    {exercise.sets.map(
                      (set, index) => {
                        const flashing =
                          prFlashId === set.id;

                        return (
                          <View
                            key={set.id}
                            style={styles.liveSetWrapper}
                          >
                            <View
                              style={[
                                styles.liveSetRow,
                                set.completed &&
                                  styles.liveSetRowDone,
                                !!set.prType &&
                                  styles.liveSetRowPR,
                                flashing &&
                                  styles.liveSetRowPRFlash,
                              ]}
                            >
                              {!!set.prType && (
                                <LinearGradient
                                  colors={[
                                    'rgba(255,176,0,0.32)',
                                    'rgba(255,176,0,0.16)',
                                    'rgba(255,176,0,0.04)',
                                  ]}
                                  start={{
                                    x: 0,
                                    y: 0.5,
                                  }}
                                  end={{
                                    x: 1,
                                    y: 0.5,
                                  }}
                                  style={[
                                    StyleSheet.absoluteFillObject,
                                    {
                                      borderRadius: 12,
                                    },
                                  ]}
                                  pointerEvents="none"
                                />
                              )}

                              <View style={styles.setNumberColumn}>
                                <Text
                                  style={[
                                    styles.liveSetNumber,
                                    !!set.prType &&
                                      styles.liveSetNumberPR,
                                  ]}
                                >
                                  {index + 1}
                                </Text>
                              </View>

                              <View style={styles.setFieldColumn}>
                                <TextInput
                                  value={String(
                                    set.weight ?? ''
                                  )}
                                  onChangeText={(value) =>
                                    updateWorkoutSet(
                                      exercise.id,
                                      set.id,
                                      'weight',
                                      value
                                    )
                                  }
                                  keyboardType="decimal-pad"
                                  placeholder="0"
                                  placeholderTextColor="#50545D"
                                  style={[
                                    styles.liveSetInput,
                                    !!set.prType &&
                                      styles.liveSetInputPR,
                                  ]}
                                />
                              </View>

                              <View style={styles.setFieldColumn}>
                                <TextInput
                                  value={String(
                                    set.reps ?? ''
                                  )}
                                  onChangeText={(value) =>
                                    updateWorkoutSet(
                                      exercise.id,
                                      set.id,
                                      'reps',
                                      value
                                    )
                                  }
                                  keyboardType="number-pad"
                                  placeholder="0"
                                  placeholderTextColor="#50545D"
                                  style={[
                                    styles.liveSetInput,
                                    !!set.prType &&
                                      styles.liveSetInputPR,
                                  ]}
                                />
                              </View>

                              <View style={styles.setCheckColumn}>
                                <TouchableOpacity
                                  activeOpacity={0.75}
                                  onPress={() =>
                                    toggleWorkoutSet(
                                      exercise.id,
                                      set.id
                                    )
                                  }
                                  style={[
                                    styles.liveSetCheck,
                                    set.completed &&
                                      styles.liveSetCheckDone,
                                    !!set.prType &&
                                      styles.liveSetCheckPR,
                                  ]}
                                >
                                  {set.completed && (
                                    <Text style={styles.liveSetCheckText}>
                                      ✓
                                    </Text>
                                  )}
                                </TouchableOpacity>
                              </View>

                              {exercise.sets.length > 1 && (
                                <TouchableOpacity
                                  style={styles.removeLiveSet}
                                  onPress={() =>
                                    removeWorkoutSet(
                                      exercise.id,
                                      set.id
                                    )
                                  }
                                >
                                  <Text style={styles.removeLiveSetText}>
                                    ×
                                  </Text>
                                </TouchableOpacity>
                              )}
                            </View>

                            {!!set.prType && (
                              <View style={styles.prCelebrationRow}>
                                <View style={styles.prBadgeLarge}>
                                  <MaterialCommunityIcons
                                    name="medal-outline"
                                    size={14}
                                    color={COLORS.darkText}
                                  />

                                  <Text style={styles.prBadgeLargeText}>
                                    PR
                                  </Text>
                                </View>

                                <View style={styles.flex}>
                                  <Text style={styles.prCelebrationTitle}>
                                    {set.prType === 'weight'
                                      ? 'NUEVO MÁXIMO'
                                      : 'NUEVO RÉCORD DE REPS'}
                                  </Text>

                                  <Text style={styles.prCelebrationText}>
                                    {set.prText}
                                  </Text>
                                </View>
                              </View>
                            )}
                          </View>
                        );
                      }
                    )}

                    <TouchableOpacity
                      style={styles.addLiveSetButton}
                      activeOpacity={0.75}
                      onPress={() =>
                        addWorkoutSet(exercise.id)
                      }
                    >
                      <MaterialCommunityIcons
                        name="plus"
                        size={17}
                        color={COLORS.orange}
                      />

                      <Text style={styles.addLiveSetText}>
                        Añadir serie
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          })}

          {totalCurrentPRs > 0 && (
            <View style={styles.prSummaryCard}>
              <View style={styles.prSummaryTop}>
                <View style={styles.prSummaryIcon}>
                  <MaterialCommunityIcons
                    name="medal-outline"
                    size={21}
                    color={COLORS.yellow}
                  />
                </View>

                <View style={styles.flex}>
                  <Text style={styles.prSummaryTitle}>
                    {totalCurrentPRs}{' '}
                    {totalCurrentPRs === 1
                      ? 'nuevo récord'
                      : 'nuevos récords'}
                  </Text>

                  <Text style={styles.prSummarySubtitle}>
                    Mejoras conseguidas hoy
                  </Text>
                </View>
              </View>

              {currentPRList.map((pr) => (
                <View
                  key={pr.id}
                  style={styles.prSummaryItem}
                >
                  <Text style={styles.prSummaryExercise}>
                    {pr.exercise}
                  </Text>

                  <Text style={styles.prSummaryValue}>
                    {pr.text}
                  </Text>
                </View>
              ))}
            </View>
          )}

          <TouchableOpacity
            style={[
              styles.finishWorkoutButton,
              allCompleted &&
                styles.finishWorkoutButtonComplete,
            ]}
            activeOpacity={0.82}
            onPress={finishWorkout}
          >
            <Text style={styles.finishWorkoutIcon}>
              ✓
            </Text>

            <View style={styles.flex}>
              <Text style={styles.finishWorkoutText}>
                FINALIZAR ENTRENAMIENTO
              </Text>

              <Text style={styles.finishWorkoutSubtext}>
                {allCompleted
                  ? '¡Rutina completada!'
                  : 'Guarda lo que hayas realizado hoy'}
              </Text>
            </View>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  };

  /* =====================================================
     RENDER
  ===================================================== */
if (sessionLoading) {
  return (
    <SafeAreaView style={styles.screen} />
  );
}
const LeagueHistory = () => {
    const [leagueHistory, setLeagueHistory] = useState([]);
  const [leagueHistoryLoading, setLeagueHistoryLoading] = useState(true);

  useEffect(() => {
    const loadLeagueHistory = async () => {
      if (!realLeagueId) {
        setLeagueHistory([]);
        setLeagueHistoryLoading(false);
        return;
      }

      setLeagueHistoryLoading(true);

      const { data, error } = await supabase.rpc(
        'get_league_monthly_history',
        {
          target_league_id: realLeagueId,
        }
      );

      if (error) {
        console.log('Error cargando historial de liga:', error);
        setLeagueHistory([]);
      } else {
      const groupedHistory = Object.values(
  (data || []).reduce((acc, row) => {
    const monthKey = row.month;

    if (!acc[monthKey]) {
      const monthDate = new Date(`${monthKey}T12:00:00`);

      const label = monthDate.toLocaleDateString(
        'es-ES',
        {
          month: 'long',
          year: 'numeric',
        }
      );

      acc[monthKey] = {
        result_id: monthKey,
        month: monthKey,
        month_label:
          label.charAt(0).toUpperCase() +
          label.slice(1),
        standings: [],
      };
    }

    acc[monthKey].standings.push({
      position: Number(row.rank_position || 0),
      user_id: row.user_id,
      username: row.username || 'Miembro',
      points: Number(row.points || 0),
      record_points: Number(
        row.record_points || 0
      ),
      is_mvp: !!row.is_mvp,
      is_revenge: !!row.is_revenge,
    });

    return acc;
  }, {})
)
  .sort(
    (a, b) =>
      new Date(b.month) - new Date(a.month)
  )
  .map((month) => ({
    ...month,
    standings: month.standings.sort(
      (a, b) => a.position - b.position
    ),
  }));

setLeagueHistory(groupedHistory);
      }

      setLeagueHistoryLoading(false);
    };

    loadLeagueHistory();
  }, [realLeagueId]);
  return (
    <ScrollView
      contentContainerStyle={{
        paddingHorizontal: 20,
        paddingTop: 16,
        paddingBottom: 40,
      }}
      showsVerticalScrollIndicator={false}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          marginBottom: 28,
        }}
      >
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => setScreen('league')}
          style={{
            width: 40,
            height: 40,
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: 10,
          }}
        >
          <MaterialCommunityIcons
            name="chevron-left"
            size={30}
            color="#FFFFFF"
          />
        </TouchableOpacity>

        <View>
          <Text
            style={{
              color: '#FFFFFF',
              fontSize: 24,
              fontWeight: '900',
              letterSpacing: -0.5,
            }}
          >
            HISTORIAL DE LIGA
          </Text>

          <Text
            style={{
              color: '#8C9099',
              fontSize: 13,
              marginTop: 3,
            }}
          >
            Resultados de meses anteriores
          </Text>
        </View>
        </View>
        {leagueHistoryLoading ? (
  <Text
    style={{
      color: '#8C9099',
      fontSize: 14,
      marginTop: 10,
    }}
  >
    Cargando resultados...
  </Text>
) : leagueHistory.length === 0 ? (
  <View
    style={{
      marginTop: 12,
      padding: 18,
      borderRadius: 16,
      backgroundColor: 'rgba(255,255,255,0.04)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.06)',
    }}
  >
    <Text
      style={{
        color: '#FFFFFF',
        fontSize: 15,
        fontWeight: '800',
        marginBottom: 4,
      }}
    >
      Aún no hay meses cerrados
    </Text>

    <Text
      style={{
        color: '#8C9099',
        fontSize: 13,
        lineHeight: 18,
      }}
    >
      Cuando termine un mes, su clasificación aparecerá aquí.
    </Text>
  </View>
) : (
  leagueHistory.map((monthResult) => (
    <View
      key={monthResult.result_id}
      style={{
        marginBottom: 18,
        padding: 16,
        borderRadius: 18,
        backgroundColor: 'rgba(255,255,255,0.04)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
      }}
    >
      <Text
        style={{
          color: '#FFFFFF',
          fontSize: 17,
          fontWeight: '900',
          marginBottom: 12,
        }}
      >
        {monthResult.month_label}
      </Text>

      {monthResult.standings.map((player) => (
        <View
          key={player.user_id}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingVertical: 9,
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              flex: 1,
            }}
          >
            <Text
              style={{
                color:
                  player.position === 1
                    ? COLORS.orange
                    : '#FFFFFF',
                fontSize: 14,
                fontWeight: '900',
                width: 34,
              }}
            >
              {player.position}º
            </Text>

            <Text
              style={{
                color: '#FFFFFF',
                fontSize: 14,
                fontWeight: '700',
                flex: 1,
              }}
              numberOfLines={1}
            >
              {player.username}
            </Text>
          </View>

          <Text
            style={{
              color: '#A8ACB6',
              fontSize: 13,
              fontWeight: '800',
            }}
          >
            {player.points} pts
          </Text>
        </View>
      ))}
    </View>
  ))
)}

    </ScrollView>
  );
};

return (
<LinearGradient
  colors={[
    'rgba(255,176,0,0.34)',
    'rgba(255,176,0,0.18)',
    'rgba(255,176,0,0.07)',
    'rgba(8,9,12,0.97)',
    '#08090C',
  ]}
  locations={[0, 0.16, 0.31, 0.52, 0.70]}
  style={styles.screen}
>
  <SafeAreaView style={styles.flex}>

  
      <StatusBar
        barStyle="light-content"
        backgroundColor="#08090C"
      />

      {screen === 'home'
        ? Home()
    : screen === 'league'
? League()
: screen === 'leagueHistory'
? <LeagueHistory />
: screen === 'profile'
        ? Profile()
        : screen === 'routines'
        ? Routines()
        : screen === 'editor'
        ? Editor()
        : screen === 'achievements'
        ? Achievements()
: screen === 'personalRecords'
? PersonalRecords()
: screen === 'history'
? History()
: screen === 'quickStart'
? QuickStart()
: Workout()}
    </SafeAreaView>
</LinearGradient>
);
}

/* =========================================================
   ESTILOS
========================================================= */

const styles = StyleSheet.create({
screen: {
  flex: 1,
  backgroundColor: '#08090C',
},

  flex: {
    flex: 1,
  },

page: {
  flex: 1,
  backgroundColor: 'transparent',
},

homeScreen: {
  flex: 1,
  backgroundColor: 'transparent',
},

  container: {
    flex: 1,
    paddingHorizontal: 22,
    paddingTop: 22,
  },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 28,
  },

  hello: {
    color: COLORS.text,
    fontSize: 31,
    fontWeight: '900',
    letterSpacing: -0.7,
  },

  subtitle: {
    color: COLORS.muted,
    fontSize: 14,
    marginTop: 5,
  },

  avatarDepth: {
    width: 50,
    height: 52,
    borderRadius: 25,
    backgroundColor: COLORS.darkOrange,
    shadowColor: COLORS.orange,
    shadowOffset: {
      width: 0,
      height: 6,
    },
    shadowOpacity: 0.10,
    shadowRadius: 4,
    elevation: 3,
  },

  avatarDepthPressed: {
    transform: [{ translateY: 3 }],
  },

  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: COLORS.orange,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0,
    borderColor: 'rgba(255,213,74,0.35)',
  },

  avatarPressed: {
    backgroundColor: '#EFA500',
  },

  avatarText: {
    color: '#704900',
    fontSize: 26,
    fontWeight: '900',
  },

  pointsCard: {
    overflow: 'hidden',
    backgroundColor: '#11120F',
    borderRadius: 28,
    borderWidth: 1,
    borderColor: '#2E291B',
    padding: 22,
    marginBottom: 24,
  },

  glow: {
    position: 'absolute',
    width: 190,
    height: 190,
    borderRadius: 95,
    backgroundColor: '#3A2A08',
    right: -75,
    top: -110,
    opacity: 0.38,
  },

  pointsLabel: {
    color: COLORS.orange,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.4,
  },

  pointsMessage: {
    color: COLORS.muted,
    fontSize: 12,
    marginTop: 3,
  },

  nextAchievementRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 18,
  },

  nextAchievementTitle: {
    color: COLORS.text,
    fontSize: 23,
    fontWeight: '900',
  },

  medalWrap: {
    width: 46,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },

  medalWrapLarge: {
    width: 66,
    height: 66,
    marginRight: 15,
  },

  medalImage: {
    width: 46,
    height: 46,
  },

  medalImageLarge: {
    width: 66,
    height: 66,
  },

  medalImageLocked: {
    opacity: 0.2,
  },

  progressBackground: {
    height: 7,
    backgroundColor: '#292B32',
    borderRadius: 10,
    overflow: 'hidden',
  },

  progressFill: {
    height: '100%',
    backgroundColor: COLORS.orange,
  },

  positionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 13,
  },

  positionText: {
    color: COLORS.muted,
    fontSize: 12,
  },

  positionNumber: {
    color: COLORS.yellow,
    fontSize: 13,
    fontWeight: '900',
  },

  sectionTitle: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: '900',
    marginBottom: 13,
  },

  weekCard: {
    backgroundColor: '#111318',
    borderWidth: 1,
    borderColor: '#23262D',
    borderRadius: 24,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
  },

  weekNumber: {
    color: COLORS.text,
    fontSize: 19,
    fontWeight: '900',
  },

  weekLabel: {
    color: COLORS.muted,
    fontSize: 11,
    marginTop: 4,
  },

  weekBadge: {
    backgroundColor: '#302707',
    borderRadius: 13,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
  },

  weekBadgeText: {
    color: COLORS.yellow,
    fontSize: 17,
    fontWeight: '900',
  },

  weekBadgeLabel: {
    color: '#C8A846',
    fontSize: 9,
  },

  trainingDots: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 18,
  },

  completedDot: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: COLORS.orange,
    alignItems: 'center',
    justifyContent: 'center',
  },

  pendingDot: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#2C2F37',
    alignItems: 'center',
    justifyContent: 'center',
  },

  activeDayText: {
    color: COLORS.orange,
    fontWeight: '900',
  },

  pendingText: {
    color: '#555A65',
    fontWeight: '800',
  },

  buttonShadow: {
    borderRadius: 22,
    shadowColor: COLORS.orange,
    shadowOffset: {
      width: 0,
      height: 10,
    },
    shadowOpacity: 0.25,
    shadowRadius: 17,
    elevation: 10,
  },

  mainButton: {
    minHeight: 76,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.orange,
    borderRadius: 22,
    paddingHorizontal: 19,
  },

  buttonShine: {
    position: 'absolute',
    top: 0,
    left: 2,
    right: 2,
    height: 31,
    backgroundColor: COLORS.yellow,
    opacity: 0.22,
  },

  mainButtonIcon: {
    color: COLORS.darkText,
    fontSize: 29,
    marginRight: 14,
  },

  mainButtonText: {
    color: COLORS.darkText,
    fontSize: 16,
    fontWeight: '900',
  },

  mainButtonSubtext: {
    color: '#5F4000',
    fontSize: 10,
    fontWeight: '700',
    marginTop: 3,
  },
comingSoonRoutineCard: {
  marginTop: 14,
  minHeight: 78,
  borderRadius: 22,
  borderWidth: 1,
  borderColor: '#24272F',
  backgroundColor: '#111318',
  paddingHorizontal: 15,
  paddingVertical: 12,
  flexDirection: 'row',
  alignItems: 'center',
},

comingSoonRoutineIcon: {
  width: 44,
  height: 44,
  borderRadius: 14,
  backgroundColor: 'rgba(255,176,0,0.10)',
  alignItems: 'center',
  justifyContent: 'center',
  marginRight: 12,
},

comingSoonRoutineContent: {
  flex: 1,
  paddingRight: 8,
},

comingSoonRoutineTitle: {
  color: COLORS.text,
  fontSize: 14,
  fontWeight: '900',
  letterSpacing: 0.2,
},

comingSoonRoutineSubtitle: {
  color: COLORS.muted,
  fontSize: 10,
  fontWeight: '600',
  marginTop: 3,
  lineHeight: 14,
},

comingSoonRoutineBadge: {
  borderRadius: 999,
  borderWidth: 1,
  borderColor: 'rgba(255,176,0,0.30)',
  backgroundColor: 'rgba(255,176,0,0.08)',
  paddingHorizontal: 8,
  paddingVertical: 5,
},

comingSoonRoutineBadgeText: {
  color: COLORS.orange,
  fontSize: 8,
  fontWeight: '900',
  letterSpacing: 0.4,
},
  secondaryButton: {
    marginTop: 18,
    minHeight: 68,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#24272E',
    backgroundColor: '#111318',
    paddingHorizontal: 15,
    flexDirection: 'row',
    alignItems: 'center',
  },

  secondaryText: {
    color: COLORS.text,
    fontWeight: '900',
    fontSize: 15,
  },

  achievementButtonSubtext: {
    color: COLORS.muted,
    fontSize: 10,
    marginTop: 3,
  },

  arrow: {
    color: COLORS.orange,
    fontSize: 27,
  },

  navigation: {
    height: 80,
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,176,0,0.28)',
    paddingBottom: 5,
  },

  navItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  navIcon: {
    color: '#5C5D61',
    fontSize: 20,
    height: 27,
  },

  navVectorIcon: {
    height: 27,
  },

  navIconSelected: {
    color: COLORS.orange,
  },

  navText: {
    color: '#5C5D61',
    fontSize: 10,
    fontWeight: '700',
  },

  navTextSelected: {
    color: COLORS.orange,
  },

  navIndicator: {
    position: 'absolute',
    top: 0,
    width: 24,
    height: 3,
    backgroundColor: COLORS.orange,
    borderRadius: 3,
  },

  pageHeader: {
    minHeight: 80,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,176,0,0.10)',
  },

  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,176,0,0.20)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  backArrow: {
    color: COLORS.orange,
    fontSize: 34,
  },

  pageTitleBox: {
    flex: 1,
    alignItems: 'center',
  },

  pageTitle: {
    color: COLORS.text,
    fontSize: 21,
    fontWeight: '900',
  },

  pageSubtitle: {
    color: COLORS.muted,
    fontSize: 10,
    marginTop: 3,
  },

  headerSpace: {
    width: 44,
  },

  pageContent: {
    padding: 18,
    paddingBottom: 44,
  },

  /* =====================================================
     LIGA
  ===================================================== */

  leaguePage: {
    flex: 1,
    backgroundColor: 'transparent',
  },

  leagueContent: {
    paddingHorizontal: 18,
    paddingTop: 24,
    paddingBottom: 42,
  },

  leagueHero: {
    alignItems: 'center',
    marginBottom: 15,
  },

  leagueHeroSmall: {
    color: COLORS.orange,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 2.1,
  },

  leagueHeroBig: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: -1,
    marginTop: 6,
    textAlign: 'center',
  },

  leagueVsRow: {
    width: '100%',
    height: 58,
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
  },

  leagueVsLine: {
    flex: 1,
    height: 2,
    borderRadius: 2,
  },

  leagueVsCenter: {
    width: 78,
    alignItems: 'center',
    justifyContent: 'center',
  },

  leagueVsText: {
    color: '#FFFFFF',
    fontSize: 40,
    lineHeight: 45,
    fontWeight: '900',
    letterSpacing: -2,
    textShadowColor: 'rgba(255,176,0,0.18)',
    textShadowOffset: {
      width: 0,
      height: 0,
    },
    textShadowRadius: 8,
  },

  leagueMainCard: {
    minHeight: 88,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: 'rgba(255,176,0,0.25)',
    backgroundColor: 'rgba(11,13,16,0.96)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 11,
    marginBottom: 10,
  },

  leagueBadgeBox: {
    width: 58,
    height: 58,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 7,
  },

  leagueBadgeImage: {
    width: 58,
    height: 58,
  },

  leagueIdentity: {
    flex: 1,
    paddingRight: 4,
  },

  leagueNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  leagueNameTitle: {
    color: COLORS.text,
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.5,
    flexShrink: 1,
  },

  leagueEditNameButton: {
    width: 24,
    height: 24,
    marginLeft: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  leagueNameInput: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '900',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.orange,
  },
  leagueInviteCode: {
  marginTop: 2,
  fontSize: 8,
  fontWeight: '600',
  color: '#FFB000',
  letterSpacing: 0.8,
  opacity: 0.9,
},

  leagueMetaText: {
    color: '#858A94',
    fontSize: 7.5,
    marginTop: 4,
  },

  leaguePositionDivider: {
    width: 1,
    height: 51,
    backgroundColor: 'rgba(255,176,0,0.15)',
    marginHorizontal: 7,
  },

  leaguePositionBox: {
    width: 75,
    alignItems: 'flex-end',
  },

  leaguePositionLabel: {
    color: '#7D828C',
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 0.7,
  },

  leaguePositionNumber: {
    color: COLORS.orange,
    fontSize: 37,
    lineHeight: 38,
    fontWeight: '900',
    letterSpacing: -1.6,
  },

  leaguePositionPoints: {
    color: '#D0B15F',
    fontSize: 10.5,
    fontWeight: '900',
  },

  leagueChaseCard: {
    backgroundColor: 'rgba(11,13,16,0.95)',
    borderWidth: 1,
    borderColor: '#292C33',
    borderRadius: 17,
    padding: 14,
    marginBottom: 10,
  },

  leagueChaseTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  leagueChaseEyebrow: {
    color: '#777C85',
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 1,
  },

  leagueChaseTitle: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '900',
    marginTop: 4,
  },

  leagueChaseBar: {
    height: 7,
    borderRadius: 7,
    backgroundColor: '#292B32',
    overflow: 'hidden',
    marginTop: 13,
  },

  leagueChaseFill: {
    height: '100%',
    borderRadius: 7,
    backgroundColor: COLORS.orange,
  },

  leagueChaseBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 7,
  },

  leagueChaseValue: {
    color: COLORS.orange,
    fontSize: 8,
    fontWeight: '900',
  },

  leagueChaseTarget: {
    color: '#787D86',
    fontSize: 8,
    fontWeight: '700',
  },

  leagueTrainingCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#292C33',
    backgroundColor: 'rgba(11,13,16,0.96)',
    padding: 14,
    marginBottom: 10,
  },

  leagueTrainingHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },

  leagueTrainingExplanation: {
    color: '#777C85',
    fontSize: 8.5,
    lineHeight: 13,
    marginTop: 5,
    paddingRight: 14,
    maxWidth: 270,
  },

  leagueTrainingCounter: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginLeft: 8,
  },

  leagueTrainingCounterNumber: {
    color: COLORS.orange,
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: -1,
  },

  leagueTrainingCounterSlash: {
    color: '#797E87',
    fontSize: 12,
    fontWeight: '900',
    marginBottom: 4,
  },

  leagueTrainingProgressTrack: {
    width: '100%',
    height: 8,
    borderRadius: 8,
    backgroundColor: '#292B32',
    overflow: 'hidden',
    marginTop: 15,
  },

  leagueTrainingProgressFill: {
    height: '100%',
    borderRadius: 8,
    backgroundColor: COLORS.orange,
  },

  leagueTrainingProgressInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    marginBottom: 13,
  },

  leagueTrainingMessage: {
    color: '#969BA4',
    fontSize: 9,
    fontWeight: '700',
  },

  leagueTrainingMessageComplete: {
    color: '#C5A454',
  },

  leagueTrainingAutomatic: {
    color: '#60656E',
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },

  leagueAddWorkoutDepth: {
    width: '100%',
    borderRadius: 14,
  },

  leagueAddWorkoutButton: {
    minHeight: 58,
    borderRadius: 14,
    backgroundColor: COLORS.orange,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
  },

  leagueAddWorkoutButtonLimit: {
    backgroundColor: '#121419',
    borderWidth: 1,
    borderColor: 'rgba(255,176,0,0.48)',
  },

  leagueAddWorkoutTextBox: {
    flex: 1,
    marginLeft: 9,
  },

  leagueAddWorkoutText: {
    color: COLORS.darkText,
    fontSize: 11,
    fontWeight: '900',
  },

  leagueAddWorkoutTextLimit: {
    color: COLORS.orange,
  },

  leagueAddWorkoutSubtext: {
    color: '#654300',
    fontSize: 7.5,
    fontWeight: '700',
    marginTop: 2,
  },

  leagueAddWorkoutSubtextLimit: {
    color: '#838892',
  },

  leagueRankingCard: {
    borderRadius: 19,
    borderWidth: 1,
    borderColor: '#292C33',
    backgroundColor: 'rgba(11,13,16,0.96)',
    padding: 13,
    marginBottom: 10,
  },

  leagueSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },

  leagueSectionHeading: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  leagueSectionTitle: {
    color: COLORS.orange,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.25,
  },

  leagueSectionSubtitle: {
    color: '#666B74',
    fontSize: 8,
    marginTop: 2,
  },

  leagueMonthBadge: {
    color: '#9E8749',
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 0.7,
    borderWidth: 1,
    borderColor: '#34302A',
    backgroundColor: '#121316',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
  },

  leagueRankingLabels: {
    height: 25,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
  },

  leagueRankingLabelPosition: {
    width: 42,
    color: '#555A63',
    fontSize: 7,
    fontWeight: '900',
  },

  leagueRankingLabelName: {
    flex: 1,
    color: '#555A63',
    fontSize: 7,
    fontWeight: '900',
  },

  leagueRankingLabelPoints: {
    width: 50,
    textAlign: 'right',
    color: '#555A63',
    fontSize: 7,
    fontWeight: '900',
  },

  leaguePlayerRow: {
    position: 'relative',
    minHeight: 66,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#25282F',
    backgroundColor: '#101216',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    marginBottom: 7,
    overflow: 'hidden',
  },

  leaguePlayerRowFirst: {
    backgroundColor: 'rgba(255,176,0,0.16)',
    borderColor: 'rgba(255,176,0,0.72)',
    shadowColor: COLORS.orange,
    shadowOffset: {
      width: 0,
      height: 0,
    },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 3,
  },

  leaguePlayerRowSecond: {
    backgroundColor: 'rgba(255,176,0,0.095)',
    borderColor: 'rgba(255,176,0,0.42)',
  },

  leaguePlayerRowThird: {
    backgroundColor: 'rgba(255,176,0,0.045)',
    borderColor: 'rgba(255,176,0,0.22)',
  },

  leaguePlayerPosition: {
    width: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },

  leaguePlayerPositionText: {
    color: '#9A9EA7',
    fontSize: 17,
    fontWeight: '900',
  },

  leaguePlayerPositionMe: {
    color: COLORS.orange,
  },

  leaguePlayerInfo: {
    flex: 1,
    paddingLeft: 2,
  },

  leaguePlayerName: {
  color: COLORS.text,
  fontSize: 18,
  fontWeight: '900',
},

leaguePlayerNameMe: {
  color: COLORS.orange,
  fontSize: 19,
  fontWeight: '900',
},

  leaguePlayerStatus: {
    color: '#686D76',
    fontSize: 8,
    marginTop: 3,
  },

  leaguePlayerAwardBox: {
  justifyContent: 'center',
  alignItems: 'flex-end',
  marginLeft: 8,
  marginRight: 10,
},

leaguePlayerAward: {
  color: COLORS.orange,
  fontSize: 10,
  fontWeight: '900',
  letterSpacing: 0.4,
  backgroundColor: 'rgba(255,176,0,0.10)',
  borderWidth: 1,
  borderColor: 'rgba(255,176,0,0.35)',
  borderRadius: 8,
  paddingHorizontal: 8,
  paddingVertical: 4,
},
  leaguePlayerPointsBox: {
    width: 50,
    alignItems: 'flex-end',
  },

  leaguePlayerPoints: {
    color: '#D8DADF',
    fontSize: 16,
    fontWeight: '900',
  },

  leaguePlayerPointsMe: {
    color: COLORS.orange,
    fontSize: 18,
  },

  leaguePlayerPts: {
    color: '#686D76',
    fontSize: 7,
    fontWeight: '900',
    marginTop: 1,
  },

  leagueInviteWide: {
    height: 58,
    borderRadius: 15,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    marginBottom: 10,
  },

  leagueActionTextBox: {
    flex: 1,
    marginLeft: 9,
  },

  leagueInviteText: {
    color: COLORS.darkText,
    fontSize: 10,
    fontWeight: '900',
  },

  leagueInviteSubtext: {
    color: '#614000',
    fontSize: 7,
    fontWeight: '700',
    marginTop: 2,
  },

  leagueActivityCard: {
    borderRadius: 19,
    borderWidth: 1,
    borderColor: '#292C33',
    backgroundColor: 'rgba(11,13,16,0.96)',
    padding: 13,
  },

  leagueActivityRow: {
    minHeight: 57,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#22252B',
  },

  leagueActivityRowLast: {
    borderBottomWidth: 0,
  },

  leagueActivityDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: COLORS.orange,
    marginRight: 10,
    opacity: 0.8,
  },

  leagueActivityInfo: {
    flex: 1,
  },

  leagueActivityText: {
    color: '#A9ADB5',
    fontSize: 10,
    lineHeight: 15,
  },

  leagueActivityName: {
    color: COLORS.text,
    fontSize: 11,
    fontWeight: '900',
  },

  leagueActivityTime: {
    color: '#626771',
    fontSize: 8,
    marginLeft: 8,
  },

  /* PERFIL */

  profileContent: {
    padding: 18,
    paddingBottom: 50,
  },

  friendCodeButton: {
    alignSelf: 'flex-start',
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(17,19,24,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(255,176,0,0.18)',
  },

  friendCodeText: {
    color: '#B8BBC3',
    fontSize: 10,
    fontWeight: '800',
    marginLeft: 6,
  },

  profileIdentity: {
    alignItems: 'center',
    marginBottom: 20,
  },

  profileAvatarDepth: {
    width: 68,
    height: 73,
    borderRadius: 34,
    backgroundColor: COLORS.darkOrange,
  },

  profileAvatar: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: COLORS.orange,
    alignItems: 'center',
    justifyContent: 'center',
  },

  profileAvatarText: {
    color: '#704900',
    fontSize: 34,
    fontWeight: '900',
  },

  profileNameLabel: {
    color: COLORS.orange,
    fontSize: 8,
    fontWeight: '900',
    marginTop: 16,
    marginBottom: 6,
  },

  nameEditBox: {
    minWidth: 170,
    maxWidth: 250,
    height: 43,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,176,0,0.32)',
    flexDirection: 'row',
    alignItems: 'center',
  },

  nameInput: {
    flex: 1,
    color: COLORS.text,
    fontSize: 21,
    fontWeight: '900',
    textAlign: 'center',
  },

  profileStatsCard: {
    minHeight: 80,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#2C2920',
    backgroundColor: 'rgba(17,19,24,0.90)',
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 25,
  },

  profileStat: {
    flex: 1,
    alignItems: 'center',
  },

  profileStatNumber: {
    color: COLORS.yellow,
    fontSize: 22,
    fontWeight: '900',
  },

  profileStatLabel: {
    color: COLORS.muted,
    fontSize: 9,
    marginTop: 4,
  },

  profileStatDivider: {
    width: 1,
    height: 36,
    backgroundColor: '#353128',
  },

  profileTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 11,
  },

  profileSectionTitle: {
    color: COLORS.text,
    fontSize: 19,
    fontWeight: '900',
  },

  weightCard: {
    backgroundColor: 'rgba(17,18,15,0.94)',
    borderWidth: 1,
    borderColor: '#3D341B',
    borderRadius: 20,
    padding: 15,
  },

  weightTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },

  weightColumn: {
    flex: 1,
  },

  weightLabel: {
    color: COLORS.orange,
    fontSize: 8,
    fontWeight: '900',
    marginBottom: 6,
  },

  weightInputBox: {
    height: 52,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: '#343630',
    backgroundColor: '#0D0F13',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 11,
  },

  weightInputValue: {
    flex: 1,
    color: COLORS.text,
    fontSize: 20,
    fontWeight: '900',
  },

  weightKg: {
    color: COLORS.muted,
    fontSize: 10,
  },

  weightArrow: {
    width: 40,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },

  weightProgressTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 17,
    marginBottom: 7,
  },

  weightProgressLabel: {
    color: COLORS.muted,
    fontSize: 8,
    fontWeight: '900',
  },

  weightProgressPercent: {
    color: COLORS.yellow,
    fontSize: 11,
    fontWeight: '900',
  },

  weightProgressTrack: {
    height: 6,
    borderRadius: 6,
    backgroundColor: '#292B32',
    overflow: 'hidden',
  },

  weightProgressFill: {
    height: '100%',
    backgroundColor: COLORS.orange,
  },

  weightFooter: {
    marginTop: 8,
  },

  weightFooterText: {
    color: '#9B9FA8',
    fontSize: 9,
  },

  settingsTitle: {
    color: COLORS.muted,
    fontSize: 9,
    fontWeight: '900',
    marginTop: 27,
    marginBottom: 9,
  },

  settingsCard: {
    overflow: 'hidden',
    borderRadius: 19,
    borderWidth: 1,
    borderColor: '#292B30',
    backgroundColor: 'rgba(17,19,24,0.90)',
  },

  settingRow: {
    minHeight: 65,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
  },

  settingDisabled: {
    opacity: 0.38,
  },

  settingIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#181812',
    marginRight: 11,
  },

  settingInfo: {
    flex: 1,
  },

  settingName: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '800',
  },

  settingDescription: {
    color: COLORS.muted,
    fontSize: 9,
    marginTop: 3,
  },

  settingDivider: {
    height: 1,
    backgroundColor: '#25272D',
    marginLeft: 59,
  },

  miniSwitch: {
    width: 38,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#30333A',
    padding: 2,
  },

  miniSwitchActive: {
    backgroundColor: COLORS.orange,
  },

  miniSwitchCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#8A8E96',
  },

  miniSwitchCircleActive: {
    backgroundColor: '#FFF4D4',
    transform: [{ translateX: 16 }],
  },

  notificationTestButton: {
    minWidth: 49,
    height: 27,
    borderRadius: 9,
    backgroundColor: 'rgba(255,176,0,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,176,0,0.38)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },

  notificationTestButtonText: {
    color: COLORS.orange,
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 0.5,
  },

  notificationTestStatus: {
    color: '#8D929B',
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 0.5,
  },

  profileSaveDepth: {
    marginTop: 16,
  },

  profileSaveButton: {
    minHeight: 50,
    borderRadius: 15,
    backgroundColor: COLORS.orange,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },

  profileSaveText: {
    color: COLORS.darkText,
    fontSize: 11,
    fontWeight: '900',
    marginLeft: 7,
  },

  /* RUTINAS */

  emptyCard: {
    backgroundColor: '#111318',
    borderRadius: 26,
    borderWidth: 1,
    borderColor: '#24272E',
    padding: 30,
    alignItems: 'center',
    marginBottom: 18,
  },

  emptyIcon: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#17150E',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },

  emptyTitle: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: '900',
    textAlign: 'center',
  },

  emptyText: {
    color: COLORS.muted,
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 19,
    marginTop: 8,
  },

  routineCard: {
    backgroundColor: '#111318',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#28271F',
    padding: 17,
    marginBottom: 16,
  },

  routineTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 13,
  },

  routineIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#17150E',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 11,
  },

  routineInfo: {
    flex: 1,
  },

  routineName: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: '900',
  },

  routineCount: {
    color: COLORS.muted,
    fontSize: 11,
    marginTop: 3,
  },

  routineActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  editRoutineButton: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#191B20',
    borderWidth: 1,
    borderColor: '#2C3038',
    marginRight: 5,
  },

  deleteButton: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#211719',
    borderWidth: 1,
    borderColor: '#342326',
    alignItems: 'center',
    justifyContent: 'center',
  },

  savedExercise: {
    minHeight: 56,
    backgroundColor: '#14161B',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    marginBottom: 8,
  },

  savedExerciseName: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '700',
  },

  savedExerciseMuscle: {
    color: COLORS.muted,
    fontSize: 8.5,
    marginTop: 4,
  },

  planBadge: {
    backgroundColor: '#302707',
    borderRadius: 9,
    paddingVertical: 6,
    paddingHorizontal: 9,
  },

  planBadgeText: {
    color: COLORS.yellow,
    fontSize: 10,
    fontWeight: '900',
  },

  /* EDITOR */

  fieldLabel: {
    color: COLORS.orange,
    fontSize: 11,
    fontWeight: '900',
    marginBottom: 8,
  },

  routineInput: {
    height: 54,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: '#4A3A17',
    borderRadius: 15,
    color: COLORS.text,
    fontSize: 16,
    paddingHorizontal: 15,
    marginBottom: 22,
  },

  editorHeading: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },

  editorTitle: {
    color: COLORS.text,
    fontSize: 19,
    fontWeight: '900',
  },

  editorHint: {
    color: COLORS.muted,
    fontSize: 10,
  },

  exerciseRow: {
    flexDirection: 'row',
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 9,
    marginBottom: 10,
  },

  exerciseNumber: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: '#302707',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 9,
  },

  exerciseNumberText: {
    color: COLORS.yellow,
    fontWeight: '900',
  },

  exerciseFields: {
    flex: 1,
  },

  exerciseNameInput: {
    height: 46,
    borderWidth: 1,
    borderColor: '#353943',
    borderRadius: 11,
    color: COLORS.text,
    paddingHorizontal: 10,
  },

  exerciseMetricsRow: {
    flexDirection: 'row',
    marginTop: 7,
  },

  metricInput: {
    flex: 1,
    height: 42,
    borderWidth: 1,
    borderColor: '#30333B',
    borderRadius: 11,
    color: COLORS.text,
    textAlign: 'center',
    marginRight: 6,
  },

  weightInput: {
    marginRight: 0,
    borderColor: '#4B3C17',
    color: COLORS.yellow,
  },

  muscleLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
  },

  muscleLabel: {
    color: COLORS.muted,
    fontSize: 9,
    fontWeight: '900',
  },

  muscleSelectedCount: {
    color: COLORS.orange,
    fontSize: 8,
    fontWeight: '900',
  },

  muscleHelper: {
    color: '#5F646D',
    fontSize: 8,
    marginTop: 3,
    marginBottom: 7,
  },

  muscleOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },

  muscleChip: {
    borderWidth: 1,
    borderColor: '#30333B',
    borderRadius: 11,
    paddingVertical: 7,
    paddingHorizontal: 9,
    marginRight: 6,
    marginBottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
  },

  muscleChipSelected: {
    backgroundColor: COLORS.orange,
    borderColor: COLORS.yellow,
  },

  muscleChipCheck: {
    marginRight: 3,
  },

  muscleChipText: {
    color: '#747A85',
    fontSize: 10,
  },

  muscleChipTextSelected: {
    color: COLORS.darkText,
    fontWeight: '900',
  },

  removeButton: {
    width: 30,
    alignItems: 'center',
  },

  removeText: {
    color: '#E47A71',
    fontSize: 23,
  },

  addExerciseButton: {
    height: 50,
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#5B491D',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },

  addExerciseIcon: {
    color: COLORS.orange,
    fontSize: 21,
    marginRight: 6,
  },

  addExerciseText: {
    color: COLORS.yellow,
    fontSize: 13,
    fontWeight: '800',
  },

  saveIcon: {
    color: COLORS.darkText,
    fontSize: 24,
    marginRight: 13,
  },

  /* LOGROS */

  achievementSummary: {
    backgroundColor: '#11120F',
    borderWidth: 1,
    borderColor: '#2E291B',
    borderRadius: 24,
    padding: 20,
    alignItems: 'center',
    marginBottom: 17,
  },

  achievementSummaryNumber: {
    color: COLORS.yellow,
    fontSize: 36,
    fontWeight: '900',
  },

  achievementSummaryText: {
    color: COLORS.muted,
    fontSize: 11,
  },

  achievementCard: {
    backgroundColor: '#111318',
    borderWidth: 1,
    borderColor: '#24272E',
    borderRadius: 22,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 11,
    opacity: 0.72,
  },

  achievementCardUnlocked: {
    borderColor: '#4B3C17',
    opacity: 1,
  },

  achievementIconBox: {
    width: 58,
    height: 58,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 13,
  },

  achievementInfo: {
    flex: 1,
  },

  achievementTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },

  achievementTitle: {
    color: COLORS.yellow,
    fontSize: 15,
    fontWeight: '900',
  },

  achievementTitleLocked: {
    color: COLORS.text,
  },

  achievementDescription: {
    color: COLORS.muted,
    fontSize: 10,
    marginTop: 5,
  },

  unlockedLabel: {
    color: COLORS.orange,
    fontSize: 8,
    fontWeight: '900',
  },

  progressLabel: {
    color: COLORS.muted,
    fontSize: 10,
  },

  smallProgressTrack: {
    height: 5,
    backgroundColor: '#292B32',
    marginTop: 10,
  },

  smallProgressFill: {
    height: '100%',
    backgroundColor: COLORS.orange,
  },

  /* QUICK */

  quickContent: {
    padding: 18,
    paddingBottom: 45,
  },

  quickLeagueBanner: {
    minHeight: 56,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: 'rgba(255,176,0,0.28)',
    backgroundColor: 'rgba(255,176,0,0.055)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 13,
    marginBottom: 12,
  },

  quickLeagueBannerTitle: {
    color: COLORS.orange,
    fontSize: 9,
    fontWeight: '900',
    marginLeft: 10,
  },

  quickLeagueBannerText: {
    color: '#8E939C',
    fontSize: 8,
    lineHeight: 12,
    marginLeft: 10,
    marginTop: 2,
  },

  quickHero: {
    minHeight: 220,
    backgroundColor: '#11120F',
    borderWidth: 1,
    borderColor: '#302A1B',
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 22,
    marginBottom: 26,
  },

  quickHeroIcon: {
    width: 88,
    height: 88,
    borderRadius: 28,
    backgroundColor: COLORS.orange,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 17,
  },

  quickEyebrow: {
    color: COLORS.orange,
    fontSize: 10,
    fontWeight: '900',
    marginBottom: 7,
  },

  quickHeroTitle: {
    color: COLORS.text,
    fontSize: 25,
    fontWeight: '900',
  },

  quickHeroText: {
    color: COLORS.muted,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 6,
  },

  quickFeaturedCard: {
    backgroundColor: '#14140F',
    borderWidth: 1,
    borderColor: '#4B3C17',
    borderRadius: 25,
    padding: 16,
    marginBottom: 15,
  },

  quickFeaturedTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  quickRoutineIcon: {
    width: 50,
    height: 50,
    borderRadius: 17,
    backgroundColor: '#26200E',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },

  quickRoutineName: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: '900',
  },

  quickRoutineMeta: {
    color: COLORS.muted,
    fontSize: 10,
    marginTop: 3,
  },

  quickFeaturedArrow: {
    color: COLORS.orange,
    fontSize: 31,
  },

  quickStartButton: {
    height: 48,
    borderRadius: 14,
    backgroundColor: COLORS.orange,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 15,
    marginTop: 15,
  },

  quickStartText: {
    color: COLORS.darkText,
    fontSize: 11,
    fontWeight: '900',
  },

  quickListCard: {
    minHeight: 82,
    backgroundColor: '#111318',
    borderWidth: 1,
    borderColor: '#252830',
    borderRadius: 20,
    padding: 13,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },

  quickListIcon: {
    width: 43,
    height: 43,
    borderRadius: 15,
    backgroundColor: '#1C190F',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 11,
  },

  quickListName: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '900',
  },

  quickListArrow: {
    color: COLORS.orange,
    fontSize: 28,
  },

  quickEmptyCard: {
    backgroundColor: '#111318',
    borderRadius: 26,
    padding: 26,
    alignItems: 'center',
  },

  quickEmptyTitle: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: '900',
    marginTop: 15,
  },

  quickEmptyText: {
    color: COLORS.muted,
    fontSize: 12,
    marginTop: 7,
  },

  /* HISTORIAL */

  historySummary: {
    backgroundColor: '#11120F',
    borderWidth: 1,
    borderColor: '#2E291B',
    borderRadius: 24,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    marginBottom: 25,
  },

  historySummaryNumber: {
    color: COLORS.yellow,
    fontSize: 32,
    fontWeight: '900',
    textAlign: 'center',
  },

  historySummaryLabel: {
    color: COLORS.muted,
    fontSize: 10,
    textAlign: 'center',
    marginTop: 3,
  },

  historySummaryDivider: {
    width: 1,
    height: 44,
    backgroundColor: '#302D25',
  },

  historySectionTitle: {
    color: COLORS.text,
    fontSize: 19,
    fontWeight: '900',
    letterSpacing: -0.3,
  },

  historySectionSubtitle: {
    color: COLORS.muted,
    fontSize: 9,
    marginTop: 4,
    marginBottom: 11,
  },

  historyWorkoutSectionTitle: {
    marginTop: 25,
    marginBottom: 11,
  },

  muscleStatsCard: {
    backgroundColor: '#111318',
    borderWidth: 1,
    borderColor: '#24272E',
    borderRadius: 20,
    paddingHorizontal: 15,
    paddingTop: 15,
    paddingBottom: 4,
  },

  muscleStatRow: {
    marginBottom: 14,
  },

  muscleStatTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 7,
  },

  muscleStatName: {
    color: COLORS.text,
    fontSize: 11,
    fontWeight: '800',
  },

  muscleStatDays: {
    color: COLORS.yellow,
    fontSize: 9,
    fontWeight: '900',
  },

  muscleBarTrack: {
    height: 6,
    borderRadius: 6,
    backgroundColor: '#282B32',
    overflow: 'hidden',
  },

  muscleBarFill: {
    height: '100%',
    borderRadius: 6,
    backgroundColor: COLORS.orange,
  },

  muscleStatsEmpty: {
    minHeight: 92,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 11,
  },

  historyEmptyText: {
    color: COLORS.muted,
    fontSize: 10,
    lineHeight: 15,
    textAlign: 'center',
    marginTop: 7,
    maxWidth: 245,
  },

  historyWorkoutCard: {
    backgroundColor: '#111318',
    borderWidth: 1,
    borderColor: '#28271F',
    borderRadius: 22,
    padding: 15,
    marginBottom: 13,
  },

  historyWorkoutTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },

  historyWorkoutName: {
    color: COLORS.text,
    fontSize: 17,
    fontWeight: '900',
  },

  historyWorkoutDate: {
    color: COLORS.muted,
    fontSize: 10,
    marginTop: 3,
    textTransform: 'capitalize',
  },

  deleteWorkoutButton: {
    width: 28,
    height: 28,
    borderRadius: 9,
    backgroundColor: '#25191B',
    alignItems: 'center',
    justifyContent: 'center',
  },

  deleteWorkoutText: {
    color: '#E47A71',
    fontSize: 21,
  },

  historyExerciseBlock: {
    backgroundColor: '#0D0F13',
    borderWidth: 1,
    borderColor: '#24272E',
    borderRadius: 13,
    padding: 11,
    marginBottom: 8,
  },

  historyExerciseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 7,
  },

  historyExerciseName: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: '800',
  },

  historyMuscleText: {
    color: COLORS.muted,
    fontSize: 8.5,
    marginTop: 3,
  },

  historyPRBadge: {
    backgroundColor: '#382B06',
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 7,
  },

  historyPRText: {
    color: COLORS.yellow,
    fontSize: 8,
    fontWeight: '900',
  },

  historySetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 30,
    borderTopWidth: 1,
    borderTopColor: '#1E2026',
  },

  historySetNumber: {
    width: 30,
    color: COLORS.muted,
    fontSize: 9,
  },

  historySetValue: {
    flex: 1,
    color: '#C7CBD2',
    fontSize: 10,
  },

  historySetPR: {
    color: COLORS.orange,
    fontSize: 8,
    fontWeight: '900',
  },

  legacyWorkoutText: {
    color: COLORS.muted,
    fontSize: 10,
  },

  /* WORKOUT */

  workoutContent: {
    padding: 18,
    paddingBottom: 50,
  },

  workoutProgressCard: {
    backgroundColor: '#11120F',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#2E291B',
    padding: 17,
    marginBottom: 22,
  },

  workoutProgressCardComplete: {
    borderColor: COLORS.yellow,
  },

  workoutProgressTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 13,
  },

  workoutProgressNumber: {
    color: COLORS.text,
    fontSize: 22,
    fontWeight: '900',
    marginTop: 4,
  },

  workoutPercentage: {
    color: COLORS.orange,
    fontSize: 20,
    fontWeight: '900',
  },

  workoutProgressTrack: {
    height: 7,
    backgroundColor: '#292B32',
    borderRadius: 7,
    overflow: 'hidden',
  },

  workoutProgressFill: {
    height: '100%',
    backgroundColor: COLORS.orange,
  },

  workoutSectionTitle: {
    color: COLORS.text,
    fontSize: 19,
    fontWeight: '900',
    marginBottom: 11,
  },

  liveExerciseCard: {
    backgroundColor: '#111318',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#292C34',
    marginBottom: 11,
    overflow: 'hidden',
  },

  liveExerciseCardComplete: {
    borderColor: 'rgba(255,176,0,0.45)',
  },

  liveExerciseHeader: {
    minHeight: 67,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 13,
  },

  liveExerciseIcon: {
    width: 37,
    height: 37,
    borderRadius: 12,
    backgroundColor: '#1A180F',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 11,
  },

  liveExerciseName: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '900',
  },

  liveExerciseMeta: {
    color: COLORS.muted,
    fontSize: 8.5,
    marginTop: 3,
  },

  exerciseProgressBadge: {
    minWidth: 37,
    height: 26,
    borderRadius: 9,
    backgroundColor: '#25282F',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 5,
  },

  exerciseProgressBadgeComplete: {
    backgroundColor: '#332806',
  },

  exerciseProgressText: {
    color: '#888D96',
    fontSize: 9,
    fontWeight: '900',
  },

  exerciseProgressTextComplete: {
    color: COLORS.yellow,
  },

  liveSetsContainer: {
    borderTopWidth: 1,
    borderTopColor: '#22252C',
    paddingHorizontal: 11,
    paddingTop: 10,
    paddingBottom: 11,
  },

  liveSetsLabels: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    marginBottom: 6,
  },

  liveSetLabel: {
    color: '#666B75',
    fontSize: 7,
    fontWeight: '900',
    textAlign: 'center',
  },

  setNumberColumn: {
    width: 38,
  },

  setFieldColumn: {
    flex: 1,
    marginHorizontal: 3,
  },

  setCheckColumn: {
    width: 42,
    alignItems: 'center',
  },

  liveSetWrapper: {
    marginBottom: 8,
  },

  liveSetRow: {
    position: 'relative',
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0D0F13',
    borderWidth: 1,
    borderColor: '#252830',
    borderRadius: 12,
    paddingHorizontal: 4,
  },

  liveSetRowDone: {
    backgroundColor: '#11130F',
  },

  liveSetRowPR: {
    borderWidth: 1.5,
    borderColor: COLORS.orange,
    backgroundColor: '#211A07',
    shadowColor: COLORS.orange,
    shadowOffset: {
      width: 0,
      height: 0,
    },
    shadowOpacity: 0.28,
    shadowRadius: 9,
    elevation: 5,
  },

  liveSetRowPRFlash: {
    borderColor: COLORS.yellow,
    backgroundColor: '#382B06',
    shadowColor: COLORS.orange,
    shadowOffset: {
      width: 0,
      height: 0,
    },
    shadowOpacity: 1,
    shadowRadius: 18,
    elevation: 12,
    transform: [
      {
        scale: 1.015,
      },
    ],
  },

  liveSetNumber: {
    color: '#868B94',
    fontSize: 11,
    fontWeight: '900',
    textAlign: 'center',
  },

  liveSetNumberPR: {
    color: COLORS.yellow,
    fontSize: 12,
  },

  liveSetInput: {
    height: 37,
    borderRadius: 9,
    backgroundColor: '#17191E',
    borderWidth: 1,
    borderColor: '#30333B',
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '900',
    textAlign: 'center',
    paddingVertical: 0,
  },

  liveSetInputPR: {
    backgroundColor: 'rgba(31,25,9,0.92)',
    borderColor: 'rgba(255,176,0,0.55)',
    color: '#FFF3C4',
  },

  liveSetCheck: {
    width: 31,
    height: 31,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#4A4F59',
    backgroundColor: '#181B21',
    alignItems: 'center',
    justifyContent: 'center',
  },

  liveSetCheckDone: {
    backgroundColor: COLORS.orange,
    borderColor: COLORS.yellow,
  },

  liveSetCheckPR: {
    backgroundColor: COLORS.yellow,
    borderColor: '#FFF0A0',
  },

  liveSetCheckText: {
    color: COLORS.darkText,
    fontSize: 16,
    fontWeight: '900',
  },

  removeLiveSet: {
    position: 'absolute',
    top: -5,
    right: -5,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#282A30',
    alignItems: 'center',
    justifyContent: 'center',
  },

  removeLiveSetText: {
    color: '#7E838C',
    fontSize: 13,
    lineHeight: 14,
  },

  prCelebrationRow: {
    minHeight: 49,
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    paddingHorizontal: 10,
    backgroundColor: 'rgba(31,24,6,0.94)',
    borderWidth: 1,
    borderColor: 'rgba(255,176,0,0.38)',
    borderRadius: 11,
  },

  prBadgeLarge: {
    minWidth: 52,
    height: 31,
    borderRadius: 9,
    backgroundColor: COLORS.orange,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 7,
    marginRight: 10,
  },

  prBadgeLargeText: {
    color: COLORS.darkText,
    fontSize: 11,
    fontWeight: '900',
    marginLeft: 3,
  },

  prCelebrationTitle: {
    color: COLORS.yellow,
    fontSize: 10,
    fontWeight: '900',
  },

  prCelebrationText: {
    color: '#D9C68A',
    fontSize: 9,
    fontWeight: '700',
    marginTop: 3,
  },

  addLiveSetButton: {
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#4A3A17',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 5,
  },

  addLiveSetText: {
    color: COLORS.orange,
    fontSize: 10,
    fontWeight: '800',
    marginLeft: 5,
  },

  prSummaryCard: {
    backgroundColor: '#151309',
    borderWidth: 1,
    borderColor: '#594517',
    borderRadius: 18,
    padding: 14,
    marginTop: 7,
    marginBottom: 3,
  },

  prSummaryTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 9,
  },

  prSummaryIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#2E250B',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },

  prSummaryTitle: {
    color: COLORS.yellow,
    fontSize: 14,
    fontWeight: '900',
  },

  prSummarySubtitle: {
    color: COLORS.muted,
    fontSize: 9,
    marginTop: 2,
  },

  prSummaryItem: {
    minHeight: 34,
    borderTopWidth: 1,
    borderTopColor: '#302A18',
    flexDirection: 'row',
    alignItems: 'center',
  },

  prSummaryExercise: {
    flex: 1,
    color: COLORS.text,
    fontSize: 10,
    fontWeight: '800',
  },

  prSummaryValue: {
    color: COLORS.orange,
    fontSize: 9,
    fontWeight: '800',
  },

  finishWorkoutButton: {
    minHeight: 70,
    borderRadius: 18,
    backgroundColor: '#777B83',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 17,
    marginTop: 15,
  },

  finishWorkoutButtonComplete: {
    backgroundColor: COLORS.orange,
  },

  finishWorkoutIcon: {
    color: COLORS.darkText,
    fontSize: 24,
    fontWeight: '900',
    marginRight: 13,
  },

  finishWorkoutText: {
    color: COLORS.darkText,
    fontSize: 14,
    fontWeight: '900',
  },

  finishWorkoutSubtext: {
    color: '#3F3B31',
    fontSize: 10,
    fontWeight: '700',
    marginTop: 3,
  },
});