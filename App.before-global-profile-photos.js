import {
  Ionicons } from "@expo/vector-icons";
import { useCallback,
  useEffect,
  useRef,
  useState } from 'react';

import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  InputAccessoryView,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  SafeAreaView,
  ScrollView,
  Share,
  StatusBar,
  StyleSheet,
  Text,
  TextInput as RNTextInput,
  TouchableOpacity,
  View,
  Modal,
  RefreshControl
} from 'react-native';

import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import Svg, { Path, Circle, Ellipse, Rect, Defs, RadialGradient, Stop } from 'react-native-svg';
import Body from 'react-native-body-highlighter';
import mobileAds, {
  BannerAd,
  BannerAdSize,
  TestIds,
  InterstitialAd,
  AdEventType,
} from 'react-native-google-mobile-ads';

import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { supabase } from './supabase';
import * as WebBrowser from 'expo-web-browser';
import * as ImagePicker from 'expo-image-picker';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Modal as BarcodeModal } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useVideoPlayer, VideoView } from 'expo-video';
const GLOBAL_INPUT_ACCESSORY_ID = 'rivalset_input_done';

const TextInput = (props) => {
  const {
    onSubmitEditing,
    returnKeyType,
    blurOnSubmit,
    ...rest
  } = props;

  return (
    <RNTextInput
      {...rest}
      returnKeyType={returnKeyType || 'done'}
      blurOnSubmit={blurOnSubmit ?? true}
      inputAccessoryViewID={
        Platform.OS === 'ios'
          ? GLOBAL_INPUT_ACCESSORY_ID
          : undefined
      }
      onSubmitEditing={(event) => {
        if (onSubmitEditing) {
          onSubmitEditing(event);
        }

        Keyboard.dismiss();
      }}
    />
  );
};
const GlobalInputAccessory = () => {
  if (Platform.OS !== 'ios') return null;

  return (
    <InputAccessoryView nativeID={GLOBAL_INPUT_ACCESSORY_ID}>
      <View
        style={{
          backgroundColor: '#111318',
          borderTopWidth: 1,
          borderTopColor: '#24272E',
          paddingHorizontal: 14,
          paddingVertical: 8,
          alignItems: 'flex-end',
        }}
      >
        <TouchableOpacity
          onPress={() => Keyboard.dismiss()}
          activeOpacity={0.7}
          style={{
            backgroundColor: '#08090C',
            width: 42,
            height: 34,
            borderRadius: 10,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text
            style={{
              color: '#FFFFFF',
              fontSize: 20,
              fontWeight: '900',
            }}
          >
            ✓
          </Text>
        </TouchableOpacity>
      </View>
    </InputAccessoryView>
  );
};
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

/* RIVALSET_PUSH_TOKEN_REGISTRATION */
const registerRivalSetPushToken = async () => {
  if (Platform.OS === 'web') return;

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    let permissions =
      await Notifications.getPermissionsAsync();

    let finalStatus = permissions.status;

    if (finalStatus !== 'granted') {
      const requested =
        await Notifications.requestPermissionsAsync();

      finalStatus = requested.status;
    }

    if (finalStatus !== 'granted') {
      console.log(
        'RIVALSET PUSH: permiso de notificaciones no concedido'
      );
      return;
    }

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(
        'rivalset-league',
        {
          name: 'Actividad de Liga',
          importance:
            Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 150, 250],
          sound: 'default',
        }
      );
    }

    const projectId =
      Constants?.expoConfig?.extra?.eas?.projectId ??
      Constants?.easConfig?.projectId;

    if (!projectId) {
      console.log(
        'RIVALSET PUSH: no encuentro EAS projectId'
      );
      return;
    }

    const tokenData =
      await Notifications.getExpoPushTokenAsync({
        projectId,
      });

    const expoPushToken = tokenData.data;

    if (!expoPushToken) return;

    const { error } = await supabase
      .from('push_tokens')
      .upsert(
        {
          user_id: user.id,
          expo_push_token: expoPushToken,
          platform: Platform.OS,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'user_id,expo_push_token',
        }
      );

    if (error) {
      throw error;
    }

    console.log(
      '✅ RIVALSET PUSH TOKEN REGISTRADO:',
      expoPushToken
    );
  } catch (error) {
    console.log(
      '❌ ERROR REGISTRANDO RIVALSET PUSH:',
      error
    );
  }
};

const leagueInterstitial = InterstitialAd.createForAdRequest(
  TestIds.INTERSTITIAL,
  {
    requestNonPersonalizedAdsOnly: true,
  }
);
const LEAGUE_AD_COOLDOWN_MS = 10 * 60 * 1000;
let lastLeagueAdShownAt = 0;
/* =========================================================
   STORAGE
========================================================= */

const ROUTINES_KEY = '@app_gym_routines';
const WORKOUTS_KEY = '@app_gym_workouts';
const WEEK_CHECKS_KEY = '@app_gym_week_checks';
const PROFILE_KEY = '@app_gym_profile';
const SETTINGS_KEY = '@app_gym_settings';
const APPEARANCE_KEY = '@rivalset_appearance';
const ACCENT_COLOR_KEY = '@rivalset_accent_color';
const LEAGUE_KEY = '@app_gym_league';
const NUTRITION_KEY = '@rivalset_nutrition';
const NUTRITION_GOALS_KEY = '@rivalset_nutrition_goals';
const ACTIVE_WORKOUT_KEY = '@rivalset_active_workout';
const getNutritionDateKey = () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
};
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

const MUSCLE_GROUPS = ["Trapecio","Dorsal","Espalda alta","Pecho","Lumbar","Hombro","Bíceps","Tríceps","Cuádriceps","Femoral","Glúteo","Aductor","Abductor","Gemelo","Abdomen","Cardio","Otro"];




const RivalSetMuscleIcon = ({ type, size = 24, color = '#FF9D00' }) => {
  if (type === 'chest') {
    return (
      <Svg
        width={size}
        height={size}
        viewBox="0 0 48 48"
        fill="none"
      >
        {/* Silueta frontal */}
        <Path
          d="M17 8
             C18.5 5.8 20.8 4.5 24 4.5
             C27.2 4.5 29.5 5.8 31 8
             C33.5 8.8 36.1 10.2 38 12.2
             C39.6 14 40.5 16.3 40.8 19
             L37.2 20.3
             C36.7 18.3 35.8 16.8 34.4 15.7
             L33.6 23.5
             L34.8 40
             L13.2 40
             L14.4 23.5
             L13.6 15.7
             C12.2 16.8 11.3 18.3 10.8 20.3
             L7.2 19
             C7.5 16.3 8.4 14 10 12.2
             C11.9 10.2 14.5 8.8 17 8Z"
          stroke="rgba(255,255,255,0.38)"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Pectoral izquierdo */}
        <Path
          d="M15.4 14.5
             C17.8 12.3 20.7 11.8 23.2 13
             L23.2 20.4
             C20.3 20.9 17.5 20.1 15.3 18.3
             C14.7 17.1 14.8 15.7 15.4 14.5Z"
          fill={color}
          fillOpacity="0.9"
        />

        {/* Pectoral derecho */}
        <Path
          d="M32.6 14.5
             C30.2 12.3 27.3 11.8 24.8 13
             L24.8 20.4
             C27.7 20.9 30.5 20.1 32.7 18.3
             C33.3 17.1 33.2 15.7 32.6 14.5Z"
          fill={color}
          fillOpacity="0.9"
        />

        {/* Línea central */}
        <Path
          d="M24 12.8V22.5"
          stroke="rgba(8,9,12,0.55)"
          strokeWidth="1"
          strokeLinecap="round"
        />
      </Svg>
    );
  }

  if (type === 'back') {
    return (
      <Svg
        width={size}
        height={size}
        viewBox="0 0 48 48"
        fill="none"
      >
        {/* Silueta posterior */}
        <Path
          d="M17 8
             C18.5 5.8 20.8 4.5 24 4.5
             C27.2 4.5 29.5 5.8 31 8
             C33.5 8.8 36.1 10.2 38 12.2
             C39.6 14 40.5 16.3 40.8 19
             L37.2 20.3
             C36.7 18.3 35.8 16.8 34.4 15.7
             L33.6 23.5
             L34.8 40
             L13.2 40
             L14.4 23.5
             L13.6 15.7
             C12.2 16.8 11.3 18.3 10.8 20.3
             L7.2 19
             C7.5 16.3 8.4 14 10 12.2
             C11.9 10.2 14.5 8.8 17 8Z"
          stroke="rgba(255,255,255,0.38)"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Dorsal izquierdo */}
        <Path
          d="M16.2 13
             C18.4 11.8 20.6 11.4 22.8 12.3
             L22.8 29
             C20.2 27.7 18.1 25.5 16.8 22.8
             C15.6 20.2 15.3 16.2 16.2 13Z"
          fill={color}
          fillOpacity="0.88"
        />

        {/* Dorsal derecho */}
        <Path
          d="M31.8 13
             C29.6 11.8 27.4 11.4 25.2 12.3
             L25.2 29
             C27.8 27.7 29.9 25.5 31.2 22.8
             C32.4 20.2 32.7 16.2 31.8 13Z"
          fill={color}
          fillOpacity="0.88"
        />

        {/* Columna */}
        <Path
          d="M24 11.5V32"
          stroke="rgba(255,255,255,0.32)"
          strokeWidth="1.1"
          strokeLinecap="round"
        />
      </Svg>
    );
  }

  return null;
};

const EXERCISE_ZONES = [
  {
    id: 'chest',
    name: 'Pecho',
    anatomicalIcon: 'chest',
    icon: 'arm-flex-outline',
    muscles: ['Pecho'],
  },
  {
    id: 'back',
    name: 'Espalda',
    anatomicalIcon: 'back',
    icon: 'human-handsup',
    muscles: ["Dorsal","Espalda alta","Trapecio","Lumbar"],
  },
  {
    id: 'arms',
    name: 'Brazos',
    icon: 'arm-flex',
    muscles: ['Hombro', 'Bíceps', 'Tríceps'],
  },
  {
    id: 'legs',
    name: 'Piernas',
    icon: 'run',
    muscles: [
      'Cuádriceps',
      'Femoral',
      'Glúteo',
      'Aductor',
      'Abductor',
      'Gemelo',
    ],
  },
  {
    id: 'core',
    name: 'Core',
    icon: 'human',
    muscles: ['Abdomen'],
  },
  {
    id: 'cardio',
    name: 'Cardio',
    icon: 'heart-pulse',
    muscles: ['Cardio'],
  },
];

const EXERCISE_LIBRARY = [
  // CARDIO · RIVALSET
  { id: 'cardio_treadmill', name: 'Cinta', variant: 'Gimnasio', equipment: 'treadmill', primaryMuscles: ['Cardio'] },
  { id: 'cardio_static_bike', name: 'Bicicleta estática', variant: 'Gimnasio', equipment: 'bike', primaryMuscles: ['Cardio'] },
  { id: 'cardio_elliptical', name: 'Elíptica', variant: 'Gimnasio', equipment: 'elliptical', primaryMuscles: ['Cardio'] },
  { id: 'cardio_rower', name: 'Remo', variant: 'Gimnasio', equipment: 'rowing', primaryMuscles: ['Cardio'] },
  { id: 'cardio_stairs', name: 'Escaladora', variant: 'Gimnasio', equipment: 'stairs', primaryMuscles: ['Cardio'] },

  { id: 'cardio_running', name: 'Correr', variant: 'Aire libre', equipment: 'outdoor', primaryMuscles: ['Cardio'] },
  { id: 'cardio_walking', name: 'Caminar', variant: 'Aire libre', equipment: 'outdoor', primaryMuscles: ['Cardio'] },
  { id: 'cardio_cycling', name: 'Bicicleta', variant: 'Aire libre', equipment: 'outdoor', primaryMuscles: ['Cardio'] },
  { id: 'cardio_hiking', name: 'Senderismo', variant: 'Aire libre', equipment: 'outdoor', primaryMuscles: ['Cardio'] },


  // PECHO
  { id: 'bench_press_barbell', name: 'Press banca', variant: 'Barra', equipment: 'barbell', primaryMuscles: ['Pecho'] },
  { id: 'bench_press_dumbbell', name: 'Press banca', variant: 'Mancuernas', equipment: 'dumbbell', primaryMuscles: ['Pecho'] },
  { id: 'bench_press_smith', name: 'Press banca', variant: 'Smith', equipment: 'smith', primaryMuscles: ['Pecho'] },
  { id: 'incline_press_barbell', name: 'Press inclinado', variant: 'Barra', equipment: 'barbell', primaryMuscles: ['Pecho'] },
  { id: 'incline_press_dumbbell', name: 'Press inclinado', variant: 'Mancuernas', equipment: 'dumbbell', primaryMuscles: ['Pecho'] },
  { id: 'incline_press_smith', name: 'Press inclinado', variant: 'Smith', equipment: 'smith', primaryMuscles: ['Pecho'] },
  { id: 'chest_press_machine', name: 'Press de pecho', variant: 'Máquina', equipment: 'machine', primaryMuscles: ['Pecho'] },
  { id: 'chest_fly_cable', name: 'Aperturas', variant: 'Polea', equipment: 'cable', primaryMuscles: ['Pecho'] },
  { id: 'chest_fly_dumbbell', name: 'Aperturas', variant: 'Mancuernas', equipment: 'dumbbell', primaryMuscles: ['Pecho'] },
  { id: 'pec_deck', name: 'Contractora', variant: 'Máquina', equipment: 'machine', primaryMuscles: ['Pecho'] },
  { id: 'dips_chest', name: 'Fondos', variant: 'Peso corporal', equipment: 'bodyweight', primaryMuscles: ['Pecho'] },

  // DORSAL / ESPALDA
  { id: 'pullup', name: 'Dominadas', variant: 'Peso corporal', equipment: 'bodyweight', primaryMuscles: ['Dorsal'] },
  { id: 'lat_pulldown', name: 'Jalón al pecho', variant: 'Polea', equipment: 'cable', primaryMuscles: ['Dorsal'] },
  { id: 'lat_pulldown_unilateral', name: 'Jalón unilateral', variant: 'Polea', equipment: 'cable', primaryMuscles: ['Dorsal'] },
  { id: 'barbell_row', name: 'Remo', variant: 'Barra', equipment: 'barbell', primaryMuscles: ["Dorsal","Espalda alta"] },
  { id: 'dumbbell_row', name: 'Remo', variant: 'Mancuerna', equipment: 'dumbbell', primaryMuscles: ["Dorsal","Espalda alta"] },
  { id: 'cable_row', name: 'Remo sentado', variant: 'Polea', equipment: 'cable', primaryMuscles: ["Dorsal","Espalda alta"] },
  { id: 'machine_row', name: 'Remo', variant: 'Máquina', equipment: 'machine', primaryMuscles: ["Dorsal","Espalda alta"] },
  { id: 'tbar_row', name: 'Remo T', variant: 'Barra', equipment: 'barbell', primaryMuscles: ["Dorsal","Espalda alta"] },
  { id: 'pullover_cable', name: 'Pullover', variant: 'Polea', equipment: 'cable', primaryMuscles: ['Dorsal'] },

  // HOMBRO
  { id: 'shoulder_press_barbell', name: 'Press militar', variant: 'Barra', equipment: 'barbell', primaryMuscles: ['Hombro'] },
  { id: 'shoulder_press_dumbbell', name: 'Press militar', variant: 'Mancuernas', equipment: 'dumbbell', primaryMuscles: ['Hombro'] },
  { id: 'shoulder_press_smith', name: 'Press militar', variant: 'Smith', equipment: 'smith', primaryMuscles: ['Hombro'] },
  { id: 'shoulder_press_machine', name: 'Press de hombro', variant: 'Máquina', equipment: 'machine', primaryMuscles: ['Hombro'] },
  { id: 'lateral_raise_dumbbell', name: 'Elevaciones laterales', variant: 'Mancuernas', equipment: 'dumbbell', primaryMuscles: ['Hombro'] },
  { id: 'lateral_raise_cable', name: 'Elevaciones laterales', variant: 'Polea', equipment: 'cable', primaryMuscles: ['Hombro'] },
  { id: 'lateral_raise_machine', name: 'Elevaciones laterales', variant: 'Máquina', equipment: 'machine', primaryMuscles: ['Hombro'] },
  { id: 'reverse_fly', name: 'Pájaros', variant: 'Máquina', equipment: 'machine', primaryMuscles: ['Hombro'] },
  { id: 'face_pull', name: 'Face pull', variant: 'Polea', equipment: 'cable', primaryMuscles: ['Hombro'] },

  // BÍCEPS
  { id: 'curl_barbell', name: 'Curl de bíceps', variant: 'Barra', equipment: 'barbell', primaryMuscles: ['Bíceps'] },
  { id: 'curl_dumbbell', name: 'Curl de bíceps', variant: 'Mancuernas', equipment: 'dumbbell', primaryMuscles: ['Bíceps'] },
  { id: 'curl_cable', name: 'Curl de bíceps', variant: 'Polea', equipment: 'cable', primaryMuscles: ['Bíceps'] },
  { id: 'hammer_curl', name: 'Curl martillo', variant: 'Mancuernas', equipment: 'dumbbell', primaryMuscles: ['Bíceps'] },
  { id: 'preacher_curl', name: 'Curl predicador', variant: 'Barra', equipment: 'barbell', primaryMuscles: ['Bíceps'] },
  { id: 'preacher_machine', name: 'Curl predicador', variant: 'Máquina', equipment: 'machine', primaryMuscles: ['Bíceps'] },

  // TRÍCEPS
  { id: 'triceps_pushdown', name: 'Extensión de tríceps', variant: 'Polea', equipment: 'cable', primaryMuscles: ['Tríceps'] },
  { id: 'overhead_triceps_cable', name: 'Extensión sobre cabeza', variant: 'Polea', equipment: 'cable', primaryMuscles: ['Tríceps'] },
  { id: 'skullcrusher', name: 'Press francés', variant: 'Barra', equipment: 'barbell', primaryMuscles: ['Tríceps'] },
  { id: 'close_grip_bench', name: 'Press cerrado', variant: 'Barra', equipment: 'barbell', primaryMuscles: ['Tríceps'] },
  { id: 'dips_triceps', name: 'Fondos de tríceps', variant: 'Peso corporal', equipment: 'bodyweight', primaryMuscles: ['Tríceps'] },

  // CUÁDRICEPS
  { id: 'squat_barbell', name: 'Sentadilla', variant: 'Barra libre', equipment: 'barbell', primaryMuscles: ['Cuádriceps'] },
  { id: 'squat_smith', name: 'Sentadilla', variant: 'Smith', equipment: 'smith', primaryMuscles: ['Cuádriceps'] },
  { id: 'hack_squat', name: 'Hack squat', variant: 'Máquina', equipment: 'machine', primaryMuscles: ['Cuádriceps'] },
  { id: 'leg_press', name: 'Prensa', variant: 'Máquina', equipment: 'machine', primaryMuscles: ['Cuádriceps'] },
  { id: 'leg_extension', name: 'Extensión de cuádriceps', variant: 'Máquina', equipment: 'machine', primaryMuscles: ['Cuádriceps'] },
  { id: 'bulgarian_dumbbell', name: 'Sentadilla búlgara', variant: 'Mancuernas', equipment: 'dumbbell', primaryMuscles: ['Cuádriceps'] },

  // FEMORAL
  { id: 'romanian_deadlift_barbell', name: 'Peso muerto rumano', variant: 'Barra', equipment: 'barbell', primaryMuscles: ['Femoral'] },
  { id: 'romanian_deadlift_dumbbell', name: 'Peso muerto rumano', variant: 'Mancuernas', equipment: 'dumbbell', primaryMuscles: ['Femoral'] },
  { id: 'leg_curl_lying', name: 'Curl femoral tumbado', variant: 'Máquina', equipment: 'machine', primaryMuscles: ['Femoral'] },
  { id: 'leg_curl_seated', name: 'Curl femoral sentado', variant: 'Máquina', equipment: 'machine', primaryMuscles: ['Femoral'] },

  // GLÚTEO
  { id: 'hip_thrust_barbell', name: 'Hip thrust', variant: 'Barra', equipment: 'barbell', primaryMuscles: ['Glúteo'] },
  { id: 'hip_thrust_smith', name: 'Hip thrust', variant: 'Smith', equipment: 'smith', primaryMuscles: ['Glúteo'] },
  { id: 'hip_thrust_machine', name: 'Hip thrust', variant: 'Máquina', equipment: 'machine', primaryMuscles: ['Glúteo'] },
  { id: 'glute_kickback', name: 'Patada de glúteo', variant: 'Polea', equipment: 'cable', primaryMuscles: ['Glúteo'] },
  { id: 'abductor_machine', name: 'Abducción', variant: 'Máquina', equipment: 'machine', primaryMuscles: ['Abductor'], secondaryMuscles: ['Glúteo'] },
  { id: 'adductor_machine', name: 'Aducción', variant: 'Máquina', equipment: 'machine', primaryMuscles: ['Aductor'] },

  // GEMELO
  { id: 'calf_raise_standing', name: 'Elevación de gemelos', variant: 'Máquina', equipment: 'machine', primaryMuscles: ['Gemelo'] },
  { id: 'calf_raise_smith', name: 'Elevación de gemelos', variant: 'Smith', equipment: 'smith', primaryMuscles: ['Gemelo'] },
  { id: 'calf_raise_seated', name: 'Gemelo sentado', variant: 'Máquina', equipment: 'machine', primaryMuscles: ['Gemelo'] },

  // TRAPECIO
  { id: 'shrug_barbell', name: 'Encogimientos', variant: 'Barra', equipment: 'barbell', primaryMuscles: ['Trapecio'] },
  { id: 'shrug_dumbbell', name: 'Encogimientos', variant: 'Mancuernas', equipment: 'dumbbell', primaryMuscles: ['Trapecio'] },

  // ABDOMEN
  { id: 'crunch', name: 'Crunch', variant: 'Peso corporal', equipment: 'bodyweight', primaryMuscles: ['Abdomen'] },
  { id: 'cable_crunch', name: 'Crunch', variant: 'Polea', equipment: 'cable', primaryMuscles: ['Abdomen'] },
  { id: 'leg_raise', name: 'Elevación de piernas', variant: 'Peso corporal', equipment: 'bodyweight', primaryMuscles: ['Abdomen'] },

  // LUMBAR
  { id: 'deadlift_barbell', name: 'Peso muerto convencional', variant: 'Barra', equipment: 'barbell', primaryMuscles: ['Lumbar'] },
  { id: 'back_extension', name: 'Hiperextensiones', variant: 'Peso corporal', equipment: 'bodyweight', primaryMuscles: ['Lumbar'] },

  // CARDIO
  { id: 'treadmill', name: 'Cinta', variant: 'Cardio', equipment: 'cardio', primaryMuscles: ['Cardio'] },
  { id: 'stationary_bike', name: 'Bicicleta', variant: 'Cardio', equipment: 'cardio', primaryMuscles: ['Cardio'] },
  { id: 'elliptical', name: 'Elíptica', variant: 'Cardio', equipment: 'cardio', primaryMuscles: ['Cardio'] },
  { id: 'rowing_machine', name: 'Remo ergómetro', variant: 'Cardio', equipment: 'cardio', primaryMuscles: ['Cardio'] },
  { id: 'stair_climber', name: 'Escaladora', variant: 'Cardio', equipment: 'cardio', primaryMuscles: ['Cardio'] },
];


/* =========================================================
   GUÍAS TÉCNICAS DE EJERCICIOS
   La animación se gestiona por separado.
========================================================= */

const EXERCISE_GUIDES = {
"Aducción": {
  "muscles": [
    "Aductores"
  ],
  "technique": [
    "Siéntate con la espalda apoyada y la pelvis estable.",
    "Coloca las almohadillas en la cara interna de los muslos, según los ajustes de la máquina.",
    "Empieza con una apertura cómoda y junta las piernas de forma controlada.",
    "Regresa lentamente a la posición inicial."
  ],
  "keyPoints": [
    "Mantén el tronco estable durante todo el movimiento.",
    "Usa una carga que te permita controlar la apertura y el cierre.",
    "Trabaja en un recorrido cómodo, sin dolor."
  ],
  "avoid": [
    "Cerrar las piernas con golpes o rebotes.",
    "Forzar una apertura excesiva.",
    "Balancear el cuerpo para mover el peso.",
    "Dejar caer las placas al volver."
  ]
},

"Abducción": {
    muscles: ['Glúteo medio', 'Glúteo menor'],
    technique: [
      'Siéntate estable con espalda y pelvis apoyadas.',
      'Coloca las piernas correctamente contra los apoyos.',
      'Separa las rodillas de forma controlada.',
      'Mantén una breve contracción en la apertura.',
      'Vuelve lentamente sin dejar que las placas golpeen.'
    ],
    keyPoints: [
      'Mantén la pelvis estable.',
      'Controla tanto apertura como cierre.',
      'Usa un rango cómodo.'
    ],
    avoid: [
      'Rebotar al abrir.',
      'Cerrar las piernas bruscamente.',
      'Mover todo el torso para generar impulso.'
    ]
  },

  'Press banca': {
    muscles: ['Pectoral', 'Tríceps', 'Hombro anterior'],
    technique: [
      'Apoya pies, glúteos y espalda alta de forma estable y coloca los ojos aproximadamente bajo la barra.',
      'Retrae y desciende las escápulas antes de sacar la barra.',
      'Mantén las muñecas alineadas y baja la barra de forma controlada hacia la zona media-baja del pecho.',
      'Mantén los antebrazos aproximadamente verticales en la parte baja.',
      'Empuja la barra hacia arriba manteniendo estable el torso hasta completar la repetición.'
    ],
    keyPoints: [
      'Mantén las escápulas estables durante toda la serie.',
      'Controla la bajada y mantén los pies firmes.',
      'Utiliza un agarre que permita mantener muñeca y antebrazo bien alineados.'
    ],
    avoid: [
      'Rebotar la barra contra el pecho.',
      'Levantar los glúteos del banco.',
      'Abrir excesivamente los codos o perder la posición de los hombros.'
    ]
  },

  'Press inclinado': {
    muscles: ['Pectoral superior', 'Tríceps', 'Hombro anterior'],
    technique: [
      'Ajusta el banco con una inclinación moderada y apoya completamente la espalda.',
      'Retrae las escápulas y mantén los pies firmes.',
      'Baja la carga de forma controlada hacia la parte superior del pecho.',
      'Mantén los antebrazos alineados con la carga.',
      'Empuja sin perder la posición del hombro ni despegar el torso.'
    ],
    keyPoints: [
      'Una inclinación moderada mantiene mayor participación del pectoral.',
      'Mantén pecho elevado y escápulas estables.',
      'Controla especialmente la parte baja del recorrido.'
    ],
    avoid: [
      'Usar una inclinación tan alta que convierta el ejercicio en un press de hombro.',
      'Encoger los hombros hacia las orejas.',
      'Rebotar o perder el control de la carga.'
    ]
  },

  'Press de pecho': {
    muscles: ['Pectoral', 'Tríceps', 'Hombro anterior'],
    technique: [
      'Ajusta el asiento para que las empuñaduras queden aproximadamente a la altura media del pecho.',
      'Apoya espalda y pies y estabiliza las escápulas.',
      'Empuja las empuñaduras hacia delante siguiendo la trayectoria de la máquina.',
      'Extiende los brazos sin bloquear agresivamente los codos.',
      'Regresa de forma controlada hasta un estiramiento cómodo.'
    ],
    keyPoints: [
      'Ajusta correctamente el asiento antes de cargar peso.',
      'Mantén la espalda apoyada.',
      'Controla tanto el empuje como el regreso.'
    ],
    avoid: [
      'Despegar los hombros del respaldo.',
      'Dejar que el peso vuelva bruscamente.',
      'Forzar una profundidad que moleste al hombro.'
    ]
  },

  'Aperturas': {
    muscles: ['Pectoral', 'Hombro anterior'],
    technique: [
      'Coloca los brazos abiertos con una ligera flexión de codos.',
      'Mantén el pecho estable y los hombros controlados.',
      'Acerca los brazos mediante un movimiento de abrazo.',
      'Contrae el pectoral al acercar las manos.',
      'Regresa lentamente hasta notar un estiramiento cómodo.'
    ],
    keyPoints: [
      'Mantén prácticamente constante la flexión del codo.',
      'Piensa en juntar los brazos, no en empujar.',
      'Prioriza recorrido controlado sobre peso.'
    ],
    avoid: [
      'Convertir el movimiento en un press flexionando demasiado los codos.',
      'Buscar un estiramiento excesivo del hombro.',
      'Usar impulso.'
    ]
  },

  'Contractora': {
    muscles: ['Pectoral', 'Hombro anterior'],
    technique: [
      'Ajusta el asiento para que los brazos queden alineados con el pecho.',
      'Mantén espalda y cabeza apoyadas.',
      'Cierra los brazos contrayendo el pectoral.',
      'Haz una breve contracción al frente sin adelantar los hombros.',
      'Vuelve lentamente a la posición inicial.'
    ],
    keyPoints: [
      'Mantén el torso inmóvil.',
      'Busca tensión continua en el pectoral.',
      'Controla la apertura.'
    ],
    avoid: [
      'Despegar la espalda del respaldo.',
      'Golpear los topes de la máquina.',
      'Llevar los brazos excesivamente atrás.'
    ]
  },

  'Fondos': {
    muscles: ['Pectoral', 'Tríceps', 'Hombro anterior'],
    technique: [
      'Sujeta las paralelas y estabiliza los hombros antes de descender.',
      'Inclina ligeramente el torso hacia delante si buscas mayor participación del pecho.',
      'Desciende flexionando los codos hasta una profundidad cómoda.',
      'Mantén el movimiento controlado y el tronco estable.',
      'Empuja las barras hasta volver a la posición inicial.'
    ],
    keyPoints: [
      'Mantén los hombros alejados de las orejas.',
      'Usa únicamente una profundidad que puedas controlar.',
      'Mantén estable el balanceo del cuerpo.'
    ],
    avoid: [
      'Caer rápidamente en la parte baja.',
      'Forzar profundidad con molestias en hombros.',
      'Balancearse para completar repeticiones.'
    ]
  },

  'Dominadas': {
    muscles: ['Dorsal', 'Bíceps', 'Espalda alta'],
    technique: [
      'Cuélgate con un agarre firme y estabiliza el tronco.',
      'Inicia el movimiento descendiendo las escápulas.',
      'Lleva los codos hacia abajo mientras elevas el cuerpo.',
      'Acerca el pecho a la barra dentro de tu rango controlado.',
      'Desciende lentamente hasta extender de nuevo los brazos.'
    ],
    keyPoints: [
      'Inicia el tirón desde la espalda, no solo desde los brazos.',
      'Mantén el abdomen activo.',
      'Controla completamente la bajada.'
    ],
    avoid: [
      'Balancearte para generar impulso.',
      'Encoger los hombros.',
      'Dejarte caer en la fase descendente.'
    ]
  },

  'Jalón al pecho': {
    muscles: ['Dorsal', 'Bíceps', 'Espalda alta'],
    technique: [
      'Sujeta la barra y fija correctamente las piernas bajo los apoyos.',
      'Eleva ligeramente el pecho y estabiliza el torso.',
      'Inicia el movimiento bajando las escápulas.',
      'Lleva los codos hacia abajo hasta acercar la barra a la parte superior del pecho.',
      'Regresa lentamente hasta extender los brazos.'
    ],
    keyPoints: [
      'Mantén una inclinación ligera y estable del torso.',
      'Dirige el movimiento con los codos.',
      'Permite un estiramiento controlado del dorsal arriba.'
    ],
    avoid: [
      'Llevar la barra detrás de la nuca.',
      'Balancear excesivamente el torso.',
      'Tirar únicamente con los bíceps.'
    ]
  },

  'Jalón unilateral': {
    muscles: ['Dorsal', 'Bíceps'],
    technique: [
      'Colócate estable frente a la polea y sujeta el agarre con un brazo.',
      'Mantén el torso firme y el hombro controlado.',
      'Lleva el codo hacia abajo y hacia el costado.',
      'Contrae el dorsal al final del recorrido.',
      'Extiende lentamente el brazo sin girar el tronco.'
    ],
    keyPoints: [
      'Mantén ambos lados del torso estables.',
      'Piensa en mover el codo, no la mano.',
      'Iguala recorrido y control entre ambos brazos.'
    ],
    avoid: [
      'Rotar el torso para mover más peso.',
      'Encoger el hombro.',
      'Acortar excesivamente la fase de estiramiento.'
    ]
  },

  'Remo': {
    muscles: ['Dorsal', 'Espalda alta', 'Bíceps'],
    technique: [
      'Adopta una posición estable y mantén la columna neutra.',
      'Inicia el tirón controlando las escápulas.',
      'Lleva los codos hacia atrás sin elevar los hombros.',
      'Acerca la carga al torso manteniendo la posición corporal.',
      'Extiende los brazos lentamente sin perder estabilidad.'
    ],
    keyPoints: [
      'Mantén el torso estable durante la repetición.',
      'Dirige el movimiento con los codos.',
      'Controla el estiramiento de la espalda.'
    ],
    avoid: [
      'Usar un balanceo excesivo.',
      'Redondear la zona lumbar.',
      'Encoger los hombros durante el tirón.'
    ]
  },

  'Remo sentado': {
    muscles: ['Dorsal', 'Espalda alta', 'Bíceps'],
    technique: [
      'Siéntate estable con pies apoyados y columna neutra.',
      'Extiende los brazos manteniendo control del torso.',
      'Lleva los codos hacia atrás acercando el agarre al abdomen.',
      'Contrae la espalda sin hiperextender la zona lumbar.',
      'Vuelve lentamente hasta el estiramiento inicial.'
    ],
    keyPoints: [
      'Mantén el pecho estable.',
      'Lleva el agarre hacia el abdomen, no hacia el cuello.',
      'Controla la fase de retorno.'
    ],
    avoid: [
      'Balancear el torso hacia delante y atrás.',
      'Tirar con los hombros encogidos.',
      'Redondear excesivamente la espalda.'
    ]
  },

  'Remo T': {
    muscles: ['Dorsal', 'Espalda alta', 'Bíceps'],
    technique: [
      'Colócate estable sobre la máquina o barra y fija el tronco.',
      'Mantén la columna neutra y el abdomen activo.',
      'Tira llevando los codos hacia atrás.',
      'Acerca el agarre al torso sin elevar los hombros.',
      'Desciende la carga de forma controlada.'
    ],
    keyPoints: [
      'Mantén una posición sólida del tronco.',
      'Busca contracción de la espalda, no impulso.',
      'Controla la carga durante todo el recorrido.'
    ],
    avoid: [
      'Hiperextender la zona lumbar al tirar.',
      'Usar rebotes.',
      'Encoger los hombros.'
    ]
  },

  'Pullover': {
    muscles: ['Dorsal', 'Pectoral', 'Serrato'],
    technique: [
      'Mantén el torso estable y los brazos con una ligera flexión.',
      'Comienza con los brazos elevados dentro de un rango cómodo.',
      'Lleva los brazos hacia el torso mediante extensión del hombro.',
      'Contrae los dorsales en la parte final.',
      'Regresa lentamente sin perder la posición del tronco.'
    ],
    keyPoints: [
      'Mantén prácticamente fijo el ángulo del codo.',
      'Piensa en bajar los brazos utilizando el dorsal.',
      'Usa un recorrido cómodo para el hombro.'
    ],
    avoid: [
      'Convertirlo en una extensión de tríceps.',
      'Arquear excesivamente la espalda.',
      'Forzar el hombro en la posición superior.'
    ]
  },

  'Press militar': {
    muscles: ['Hombro', 'Tríceps', 'Trapecio'],
    technique: [
      'Coloca la carga aproximadamente a la altura de los hombros.',
      'Activa abdomen y glúteos para estabilizar el tronco.',
      'Empuja verticalmente permitiendo que la cabeza deje paso a la carga.',
      'Extiende los brazos sobre la cabeza manteniendo el torso estable.',
      'Baja de forma controlada hasta la posición inicial.'
    ],
    keyPoints: [
      'Mantén las costillas controladas.',
      'Busca una trayectoria vertical de la carga.',
      'Mantén muñecas y codos bien alineados.'
    ],
    avoid: [
      'Arquear excesivamente la zona lumbar.',
      'Empujar la barra muy por delante del cuerpo.',
      'Usar impulso de piernas salvo que el ejercicio lo requiera.'
    ]
  },

  'Press de hombro': {
    muscles: ['Hombro', 'Tríceps'],
    technique: [
      'Ajusta el asiento y coloca la carga a la altura de los hombros.',
      'Mantén espalda y pies firmemente apoyados.',
      'Empuja hacia arriba siguiendo una trayectoria cómoda.',
      'Extiende los brazos sin perder la posición del torso.',
      'Desciende lentamente hasta un rango cómodo.'
    ],
    keyPoints: [
      'Mantén abdomen activo.',
      'Coloca los codos en una posición natural respecto al torso.',
      'Controla la bajada.'
    ],
    avoid: [
      'Arquear excesivamente la espalda.',
      'Bajar más allá de un rango cómodo para el hombro.',
      'Golpear las mancuernas o topes arriba.'
    ]
  },

  'Elevaciones laterales': {
    muscles: ['Deltoides lateral'],
    technique: [
      'Colócate estable con los brazos ligeramente flexionados.',
      'Eleva los brazos lateralmente guiando el movimiento con los codos.',
      'Sube hasta aproximadamente la altura de los hombros o tu rango cómodo.',
      'Mantén el torso quieto.',
      'Desciende lentamente manteniendo tensión.'
    ],
    keyPoints: [
      'Prioriza control sobre carga.',
      'Mantén los hombros alejados de las orejas.',
      'Guía el movimiento con los codos.'
    ],
    avoid: [
      'Balancear el cuerpo.',
      'Encoger excesivamente los trapecios.',
      'Lanzar la carga hacia arriba.'
    ]
  },

  'Pájaros': {
    muscles: ['Deltoides posterior', 'Espalda alta'],
    technique: [
      'Inclina el torso o apóyalo según la variante manteniendo la espalda estable.',
      'Mantén una ligera flexión de codos.',
      'Abre los brazos hacia los lados.',
      'Contrae la parte posterior del hombro sin encogerlos.',
      'Regresa lentamente.'
    ],
    keyPoints: [
      'Mantén el torso quieto.',
      'Utiliza una carga que permita aislar el hombro posterior.',
      'Controla la fase descendente.'
    ],
    avoid: [
      'Convertir el movimiento en un remo.',
      'Usar impulso.',
      'Encoger los hombros.'
    ]
  },

  'Face pull': {
    muscles: ['Deltoides posterior', 'Trapecio', 'Rotadores externos'],
    technique: [
      'Coloca la polea aproximadamente a la altura de la cara.',
      'Sujeta la cuerda y estabiliza el torso.',
      'Tira hacia la cara separando las manos.',
      'Lleva los codos hacia fuera y realiza una rotación externa controlada.',
      'Regresa lentamente a la posición inicial.'
    ],
    keyPoints: [
      'Mantén el pecho estable.',
      'Termina con las manos a ambos lados de la cara.',
      'Usa una carga que permita controlar la rotación.'
    ],
    avoid: [
      'Tirar hacia el pecho en lugar de hacia la cara.',
      'Arquear la espalda para mover más peso.',
      'Encoger los hombros.'
    ]
  },

  'Curl de bíceps': {
    muscles: ['Bíceps', 'Braquial'],
    technique: [
      'Mantén el torso estable y los codos cerca del cuerpo.',
      'Flexiona los codos elevando la carga.',
      'Mantén las muñecas estables.',
      'Contrae el bíceps en la parte superior sin adelantar excesivamente el hombro.',
      'Baja lentamente hasta extender el codo.'
    ],
    keyPoints: [
      'Mantén los codos estables.',
      'Controla especialmente la bajada.',
      'Utiliza todo el recorrido que puedas controlar.'
    ],
    avoid: [
      'Balancear el torso.',
      'Adelantar mucho los codos para terminar la repetición.',
      'Dejar caer la carga.'
    ]
  },

  'Curl martillo': {
    muscles: ['Braquial', 'Braquiorradial', 'Bíceps'],
    technique: [
      'Sujeta las mancuernas con agarre neutro.',
      'Mantén los codos cerca del torso.',
      'Flexiona los codos sin girar las muñecas.',
      'Sube hasta una contracción cómoda.',
      'Desciende lentamente hasta la extensión.'
    ],
    keyPoints: [
      'Mantén las palmas enfrentadas.',
      'Evita mover el hombro.',
      'Controla ambos brazos por igual.'
    ],
    avoid: [
      'Balancear las mancuernas.',
      'Flexionar las muñecas.',
      'Acortar la bajada.'
    ]
  },

  'Curl predicador': {
    muscles: ['Bíceps', 'Braquial'],
    technique: [
      'Ajusta el asiento para apoyar completamente la parte posterior de los brazos.',
      'Comienza con los codos extendidos de forma controlada.',
      'Flexiona los codos manteniendo los brazos contra el banco.',
      'Contrae el bíceps sin despegar los codos.',
      'Baja lentamente evitando perder tensión.'
    ],
    keyPoints: [
      'Mantén el brazo apoyado durante toda la repetición.',
      'Controla especialmente la posición inferior.',
      'Usa una carga moderada.'
    ],
    avoid: [
      'Rebotar desde la extensión.',
      'Despegar los brazos del apoyo.',
      'Dejar caer rápidamente la carga.'
    ]
  },

  'Extensión de tríceps': {
    muscles: ['Tríceps'],
    technique: [
      'Colócate estable frente a la polea con los codos cerca del torso.',
      'Mantén hombros y torso quietos.',
      'Extiende los codos llevando el agarre hacia abajo.',
      'Contrae el tríceps al final.',
      'Regresa lentamente sin permitir que los codos se adelanten demasiado.'
    ],
    keyPoints: [
      'El movimiento principal ocurre en el codo.',
      'Mantén los brazos pegados al cuerpo.',
      'Controla el regreso.'
    ],
    avoid: [
      'Usar el peso del cuerpo para empujar.',
      'Separar excesivamente los codos.',
      'Mover los hombros para completar la repetición.'
    ]
  },

  'Extensión sobre cabeza': {
    muscles: ['Tríceps'],
    technique: [
      'Coloca la carga por detrás o encima de la cabeza con los codos flexionados.',
      'Mantén el torso y abdomen estables.',
      'Extiende los codos llevando la carga hacia arriba o delante según la variante.',
      'Mantén los brazos relativamente estables.',
      'Regresa lentamente hasta notar un estiramiento cómodo del tríceps.'
    ],
    keyPoints: [
      'Mantén los codos orientados de forma estable.',
      'Controla la posición estirada.',
      'Evita compensaciones del tronco.'
    ],
    avoid: [
      'Arquear excesivamente la espalda.',
      'Abrir y cerrar los codos de forma exagerada.',
      'Forzar una profundidad dolorosa.'
    ]
  },

  'Press francés': {
    muscles: ['Tríceps'],
    technique: [
      'Túmbate estable y coloca la carga sobre los hombros.',
      'Mantén los brazos superiores relativamente fijos.',
      'Flexiona los codos llevando la carga hacia la frente o ligeramente detrás.',
      'Extiende los codos contrayendo el tríceps.',
      'Mantén el movimiento controlado durante todo el recorrido.'
    ],
    keyPoints: [
      'Controla la carga cerca de la cabeza.',
      'Mantén estable el brazo superior.',
      'Utiliza un agarre cómodo para muñecas y codos.'
    ],
    avoid: [
      'Abrir excesivamente los codos.',
      'Convertir el ejercicio en un press.',
      'Dejar caer la carga rápidamente.'
    ]
  },

  'Press cerrado': {
    muscles: ['Tríceps', 'Pectoral', 'Hombro anterior'],
    technique: [
      'Túmbate estable y utiliza un agarre algo más estrecho que en el press banca convencional.',
      'Mantén muñecas y antebrazos alineados.',
      'Baja la barra de forma controlada manteniendo los codos relativamente próximos al torso.',
      'Toca o aproxima la barra al pecho dentro de un rango cómodo.',
      'Empuja hasta extender los brazos.'
    ],
    keyPoints: [
      'No necesitas juntar las manos excesivamente.',
      'Mantén las muñecas neutras.',
      'Controla la trayectoria de la barra.'
    ],
    avoid: [
      'Utilizar un agarre extremadamente estrecho.',
      'Abrir bruscamente los codos.',
      'Rebotar la barra.'
    ]
  },

  'Fondos de tríceps': {
    muscles: ['Tríceps', 'Hombro anterior', 'Pectoral'],
    technique: [
      'Sujeta las paralelas y mantén el torso más vertical que en los fondos orientados al pecho.',
      'Estabiliza los hombros antes de bajar.',
      'Flexiona los codos de forma controlada.',
      'Desciende únicamente hasta un rango cómodo.',
      'Empuja hasta volver a la posición inicial.'
    ],
    keyPoints: [
      'Mantén el torso relativamente vertical.',
      'Controla la profundidad.',
      'Mantén los hombros estables.'
    ],
    avoid: [
      'Forzar una profundidad excesiva.',
      'Balancear las piernas.',
      'Dejar caer el cuerpo en la bajada.'
    ]
  },

  'Sentadilla': {
    muscles: ['Cuádriceps', 'Glúteo', 'Femoral', 'Core'],
    technique: [
      'Coloca los pies en una posición estable y crea tensión en el tronco antes de descender.',
      'Flexiona caderas y rodillas manteniendo el pie completamente apoyado.',
      'Permite que las rodillas sigan la dirección de los pies.',
      'Desciende hasta la profundidad que puedas mantener con buena posición.',
      'Empuja el suelo y extiende caderas y rodillas para volver arriba.'
    ],
    keyPoints: [
      'Mantén presión sobre todo el pie.',
      'Mantén el abdomen activo.',
      'Las rodillas pueden avanzar mientras permanezcan controladas y alineadas.'
    ],
    avoid: [
      'Dejar que las rodillas colapsen hacia dentro.',
      'Perder el apoyo del talón.',
      'Forzar una profundidad que haga perder el control de la columna.'
    ]
  },

  'Hack squat': {
    muscles: ['Cuádriceps', 'Glúteo'],
    technique: [
      'Apoya completamente espalda y hombros en la máquina.',
      'Coloca los pies en una posición estable sobre la plataforma.',
      'Desbloquea la máquina y desciende flexionando rodillas y caderas.',
      'Alcanza una profundidad controlada manteniendo los pies apoyados.',
      'Empuja la plataforma hasta volver arriba sin bloquear agresivamente las rodillas.'
    ],
    keyPoints: [
      'Mantén la espalda apoyada.',
      'Alinea rodillas y pies.',
      'Controla la parte baja del recorrido.'
    ],
    avoid: [
      'Despegar la cadera del respaldo.',
      'Rebotar abajo.',
      'Bloquear violentamente las rodillas.'
    ]
  },

  'Prensa': {
    muscles: ['Cuádriceps', 'Glúteo', 'Femoral'],
    technique: [
      'Apoya completamente espalda y pelvis en el respaldo.',
      'Coloca los pies firmemente en la plataforma.',
      'Desbloquea y baja la plataforma flexionando rodillas y caderas.',
      'Detén el descenso antes de que la pelvis pierda contacto con el respaldo.',
      'Empuja la plataforma manteniendo las rodillas alineadas con los pies.'
    ],
    keyPoints: [
      'Mantén la pelvis apoyada.',
      'Utiliza una profundidad que puedas controlar.',
      'Distribuye la presión por todo el pie.'
    ],
    avoid: [
      'Redondear la zona lumbar al bajar demasiado.',
      'Juntar las rodillas hacia dentro.',
      'Bloquear agresivamente las rodillas arriba.'
    ]
  },

  'Extensión de cuádriceps': {
    muscles: ['Cuádriceps'],
    technique: [
      'Ajusta el asiento para alinear aproximadamente la rodilla con el eje de giro de la máquina.',
      'Coloca el rodillo sobre la parte baja de la tibia.',
      'Mantén espalda y cadera apoyadas.',
      'Extiende las rodillas de forma controlada.',
      'Desciende lentamente hasta la posición inicial.'
    ],
    keyPoints: [
      'Ajusta correctamente la máquina antes de empezar.',
      'Mantén la cadera estable.',
      'Controla la fase descendente.'
    ],
    avoid: [
      'Lanzar el peso con impulso.',
      'Despegar la cadera del asiento.',
      'Golpear los topes de la máquina.'
    ]
  },

  'Sentadilla búlgara': {
    muscles: ['Cuádriceps', 'Glúteo', 'Femoral'],
    technique: [
      'Apoya el pie trasero en un banco y coloca el delantero a una distancia estable.',
      'Mantén la mayor parte del control sobre la pierna delantera.',
      'Desciende flexionando cadera y rodilla de la pierna de apoyo.',
      'Mantén la rodilla alineada con el pie.',
      'Empuja a través del pie delantero para volver arriba.'
    ],
    keyPoints: [
      'Busca primero equilibrio antes de añadir carga.',
      'Mantén el pie delantero completamente apoyado.',
      'Controla el descenso.'
    ],
    avoid: [
      'Colocar los pies demasiado juntos y perder estabilidad.',
      'Impulsarte excesivamente con la pierna trasera.',
      'Dejar que la rodilla colapse hacia dentro.'
    ]
  },

  'Peso muerto rumano': {
    muscles: ['Femoral', 'Glúteo', 'Lumbar'],
    technique: [
      'Comienza erguido con la carga cerca de los muslos.',
      'Mantén una ligera flexión de rodillas y el abdomen activo.',
      'Lleva la cadera hacia atrás manteniendo la carga cerca de las piernas.',
      'Desciende hasta notar tensión en los isquios sin perder la posición de la columna.',
      'Extiende la cadera para volver arriba contrayendo glúteos.'
    ],
    keyPoints: [
      'Es una bisagra de cadera, no una sentadilla.',
      'Mantén la carga cerca del cuerpo.',
      'La profundidad depende de tu movilidad manteniendo una columna estable.'
    ],
    avoid: [
      'Redondear la espalda para bajar más.',
      'Flexionar demasiado las rodillas.',
      'Alejar la carga del cuerpo.'
    ]
  },

  'Curl femoral tumbado': {
    muscles: ['Femoral', 'Gemelo'],
    technique: [
      'Ajusta la máquina para alinear las rodillas con su eje.',
      'Apoya la pelvis y el torso en el banco.',
      'Flexiona las rodillas llevando el rodillo hacia los glúteos.',
      'Contrae los femorales en la parte superior.',
      'Extiende lentamente las piernas.'
    ],
    keyPoints: [
      'Mantén la pelvis pegada al banco.',
      'Controla la extensión.',
      'Utiliza un recorrido cómodo para la rodilla.'
    ],
    avoid: [
      'Levantar la cadera para mover más peso.',
      'Rebotar al final del recorrido.',
      'Dejar caer el peso.'
    ]
  },

  'Curl femoral sentado': {
    muscles: ['Femoral'],
    technique: [
      'Ajusta asiento, respaldo y rodillos a tu cuerpo.',
      'Mantén la espalda y cadera apoyadas.',
      'Flexiona las rodillas llevando el rodillo hacia abajo y atrás.',
      'Contrae los femorales al final.',
      'Regresa lentamente hasta extender las piernas.'
    ],
    keyPoints: [
      'Mantén el muslo sujeto por el apoyo.',
      'Controla el estiramiento arriba.',
      'No pierdas contacto con el respaldo.'
    ],
    avoid: [
      'Levantar la cadera.',
      'Usar rebotes.',
      'Soltar rápidamente la fase de extensión.'
    ]
  },

  'Hip thrust': {
    muscles: ['Glúteo', 'Femoral'],
    technique: [
      'Apoya la parte alta de la espalda sobre el banco y coloca los pies firmes.',
      'Sitúa la carga de forma segura sobre la cadera.',
      'Eleva la cadera empujando a través de los pies.',
      'Alcanza una extensión de cadera con el torso estable y las costillas controladas.',
      'Desciende lentamente manteniendo tensión.'
    ],
    keyPoints: [
      'Busca extensión de cadera, no hiperextensión lumbar.',
      'Mantén barbilla y costillas controladas.',
      'Ajusta los pies para que la posición superior sea estable.'
    ],
    avoid: [
      'Arquear excesivamente la espalda arriba.',
      'Empujar principalmente con las puntas de los pies.',
      'Rebotar la carga.'
    ]
  },

  'Patada de glúteo': {
    muscles: ['Glúteo'],
    technique: [
      'Colócate estable en la máquina o polea y fija el tronco.',
      'Mantén una ligera flexión de la pierna de trabajo.',
      'Extiende la cadera llevando la pierna hacia atrás.',
      'Contrae el glúteo sin girar la pelvis.',
      'Regresa lentamente.'
    ],
    keyPoints: [
      'Mantén la pelvis orientada al frente.',
      'El movimiento debe venir de la cadera.',
      'Usa un recorrido que no requiera arquear la espalda.'
    ],
    avoid: [
      'Hiperextender la zona lumbar.',
      'Girar la pelvis.',
      'Usar impulso.'
    ]
  },

  'Abductores': {
    muscles: ['Glúteo medio', 'Glúteo menor'],
    technique: [
      'Siéntate estable con espalda y pelvis apoyadas.',
      'Coloca las piernas correctamente contra los apoyos.',
      'Separa las rodillas de forma controlada.',
      'Mantén una breve contracción en la apertura.',
      'Vuelve lentamente sin dejar que las placas golpeen.'
    ],
    keyPoints: [
      'Mantén la pelvis estable.',
      'Controla tanto apertura como cierre.',
      'Usa un rango cómodo.'
    ],
    avoid: [
      'Rebotar al abrir.',
      'Cerrar las piernas bruscamente.',
      'Mover todo el torso para generar impulso.'
    ]
  },

  'Elevación de gemelos': {
    muscles: ['Gemelo', 'Sóleo'],
    technique: [
      'Apoya la parte delantera del pie de forma estable.',
      'Desciende los talones lentamente hasta un estiramiento cómodo.',
      'Empuja a través del antepié elevando los talones.',
      'Alcanza una contracción controlada arriba.',
      'Vuelve lentamente a la posición inferior.'
    ],
    keyPoints: [
      'Utiliza todo el recorrido que puedas controlar.',
      'Mantén tobillos y pies alineados.',
      'Haz una pausa controlada arriba.'
    ],
    avoid: [
      'Rebotar en la parte inferior.',
      'Hacer repeticiones muy cortas por exceso de peso.',
      'Dejar que los tobillos colapsen hacia los lados.'
    ]
  },

  'Gemelo sentado': {
    muscles: ['Sóleo', 'Gemelo'],
    technique: [
      'Ajusta el apoyo sobre los muslos y coloca el antepié en la plataforma.',
      'Desciende los talones lentamente.',
      'Eleva los talones mediante flexión plantar.',
      'Contrae los gemelos arriba.',
      'Regresa de forma controlada al estiramiento.'
    ],
    keyPoints: [
      'Mantén el antepié firmemente apoyado.',
      'Busca recorrido completo.',
      'Controla cada repetición.'
    ],
    avoid: [
      'Rebotar abajo.',
      'Utilizar únicamente recorridos parciales.',
      'Mover las rodillas para generar impulso.'
    ]
  },

  'Encogimientos': {
    muscles: ['Trapecio superior'],
    technique: [
      'Mantén el torso erguido y la carga a los lados o delante.',
      'Mantén los brazos relajados y prácticamente extendidos.',
      'Eleva los hombros hacia arriba de forma controlada.',
      'Contrae el trapecio brevemente.',
      'Desciende los hombros lentamente.'
    ],
    keyPoints: [
      'El movimiento principal es vertical.',
      'Mantén cuello y cabeza neutros.',
      'Controla la bajada.'
    ],
    avoid: [
      'Hacer círculos con los hombros.',
      'Flexionar los codos para ayudar.',
      'Usar rebotes con todo el cuerpo.'
    ]
  },

  'Crunch': {
    muscles: ['Abdomen'],
    technique: [
      'Colócate con la zona lumbar estable y las rodillas flexionadas según la variante.',
      'Activa el abdomen antes de iniciar.',
      'Acerca las costillas hacia la pelvis mediante flexión controlada del tronco.',
      'Contrae el abdomen sin tirar del cuello.',
      'Regresa lentamente sin perder tensión.'
    ],
    keyPoints: [
      'Busca flexión del tronco, no tirar de la cabeza.',
      'Exhala durante la contracción.',
      'Utiliza un recorrido controlado.'
    ],
    avoid: [
      'Tirar del cuello con las manos.',
      'Usar impulso.',
      'Convertirlo en un movimiento dominante de cadera.'
    ]
  },

  'Elevación de piernas': {
    muscles: ['Abdomen', 'Flexores de cadera'],
    technique: [
      'Estabiliza el tronco y la pelvis antes de mover las piernas.',
      'Eleva las piernas de forma controlada.',
      'Al final del recorrido, realiza una ligera retroversión de pelvis si puedes mantener el control.',
      'Mantén el abdomen activo.',
      'Desciende lentamente sin perder la posición lumbar.'
    ],
    keyPoints: [
      'Controla especialmente la bajada.',
      'Mantén la pelvis estable.',
      'Reduce el recorrido si la espalda comienza a arquearse.'
    ],
    avoid: [
      'Balancear las piernas.',
      'Arquear excesivamente la zona lumbar.',
      'Dejar caer las piernas.'
    ]
  },

  'Peso muerto convencional': {
    muscles: ['Glúteo', 'Femoral', 'Lumbar', 'Cuádriceps', 'Espalda'],
    technique: [
      'Coloca los pies bajo la barra y mantenla cerca de las tibias.',
      'Agarra la barra y crea tensión en el tronco y la espalda antes de despegarla.',
      'Empuja el suelo manteniendo la barra cerca del cuerpo.',
      'Extiende rodillas y cadera de forma coordinada hasta quedar erguido.',
      'Desciende llevando primero la cadera atrás y después flexionando las rodillas.'
    ],
    keyPoints: [
      'Crea tensión antes de iniciar el levantamiento.',
      'Mantén la barra cerca del cuerpo.',
      'Finaliza erguido, sin inclinarte hacia atrás.'
    ],
    avoid: [
      'Tirar bruscamente de la barra sin crear tensión.',
      'Alejar la barra del cuerpo.',
      'Hiperextender la zona lumbar al finalizar.'
    ]
  },

  'Hiperextensiones': {
    muscles: ['Lumbar', 'Glúteo', 'Femoral'],
    technique: [
      'Ajusta el banco para permitir movimiento libre de la cadera.',
      'Mantén el tronco estable y los pies bien sujetos.',
      'Desciende de forma controlada mediante flexión de cadera.',
      'Extiende la cadera para elevar el torso.',
      'Termina con el cuerpo alineado sin sobrepasar la posición neutra.'
    ],
    keyPoints: [
      'Mantén el movimiento controlado.',
      'Utiliza glúteos y femorales además de la musculatura lumbar.',
      'Finaliza en posición neutra.'
    ],
    avoid: [
      'Hiperextender la espalda arriba.',
      'Usar rebotes.',
      'Añadir carga antes de dominar el movimiento.'
    ]
  }
};

const templateExercise = (
  name,
  series,
  repRange,
  primaryMuscles,
  secondaryMuscles = []
) => ({
  name,
  series: String(series),
  reps: String(repRange).split('-')[0],
  repRange: String(repRange),
  weight: '',
  duration: '',
  distance: '',
  heartRate: '',
  primaryMuscles,
  secondaryMuscles,
  muscles: [
    ...new Set([
      ...primaryMuscles,
      ...secondaryMuscles,
    ]),
  ],
});

const ROUTINE_TEMPLATES = [
  {
    id: 'full-body-2',
    daysPerWeek: 2,
    title: 'Full Body',
    level: 'Principiante · Intermedio inicial',
    objective: 'Fuerza + hipertrofia',
    schedule: '2 días no consecutivos',
    description:
      'Dos sesiones de cuerpo completo con básicos y accesorios bien repartidos.',
    days: [
      {
        name: 'Full Body A',
        exercises: [
          templateExercise(
            'Sentadilla',
            3,
            '6-8',
            ['Cuádriceps'],
            ['Glúteo', 'Femoral']
          ),
          templateExercise(
            'Press banca',
            3,
            '6-10',
            ['Pecho'],
            ['Tríceps', 'Hombro']
          ),
          templateExercise(
            'Jalón al pecho',
            3,
            '8-12',
            ['Dorsal'],
            ['Bíceps']
          ),
          templateExercise(
            'Peso muerto rumano',
            3,
            '8-10',
            ['Femoral', 'Glúteo'],
            ['Lumbar']
          ),
          templateExercise(
            'Elevaciones laterales',
            2,
            '12-20',
            ['Hombro']
          ),
          templateExercise(
            'Curl de bíceps con mancuernas',
            2,
            '10-15',
            ['Bíceps']
          ),
          templateExercise(
            'Extensión de tríceps en polea',
            2,
            '10-15',
            ['Tríceps']
          ),
        ],
      },
      {
        name: 'Full Body B',
        exercises: [
          templateExercise(
            'Prensa',
            3,
            '8-12',
            ['Cuádriceps'],
            ['Glúteo']
          ),
          templateExercise(
            'Remo sentado con apoyo de pecho',
            3,
            '8-12',
            ['Dorsal'],
            ['Bíceps', 'Trapecio']
          ),
          templateExercise(
            'Press inclinado con mancuernas',
            2,
            '10-15',
            ['Pecho'],
            ['Hombro', 'Tríceps']
          ),
          templateExercise(
            'Curl femoral',
            3,
            '10-15',
            ['Femoral']
          ),
          templateExercise(
            'Press de hombro con mancuernas',
            2,
            '8-12',
            ['Hombro'],
            ['Tríceps']
          ),
          templateExercise(
            'Curl martillo',
            2,
            '10-15',
            ['Bíceps']
          ),
          templateExercise(
            'Extensión de tríceps sobre cabeza en polea',
            2,
            '10-15',
            ['Tríceps']
          ),
        ],
      },
    ],
  },
  {
    id: 'full-body-machines-2',
    daysPerWeek: 2,
    title: 'Full Body Máquinas',
    level: 'Principiante',
    objective: 'Hipertrofia',
    schedule: '2 días no consecutivos',
    description:
      'Una opción estable y sencilla técnicamente, basada en máquinas y poleas.',
    days: [
      {
        name: 'Full Body Máquinas A',
        exercises: [
          templateExercise(
            'Prensa',
            3,
            '8-12',
            ['Cuádriceps'],
            ['Glúteo']
          ),
          templateExercise(
            'Press de pecho en máquina',
            3,
            '8-12',
            ['Pecho'],
            ['Hombro', 'Tríceps']
          ),
          templateExercise(
            'Remo sentado',
            3,
            '8-12',
            ['Dorsal'],
            ['Bíceps', 'Trapecio']
          ),
          templateExercise(
            'Curl femoral',
            3,
            '10-15',
            ['Femoral']
          ),
          templateExercise(
            'Elevaciones laterales en máquina o polea',
            2,
            '12-20',
            ['Hombro']
          ),
          templateExercise(
            'Curl de bíceps en polea',
            2,
            '10-15',
            ['Bíceps']
          ),
          templateExercise(
            'Extensión de tríceps en polea',
            2,
            '10-15',
            ['Tríceps']
          ),
        ],
      },
      {
        name: 'Full Body Máquinas B',
        exercises: [
          templateExercise(
            'Hack squat',
            3,
            '8-12',
            ['Cuádriceps'],
            ['Glúteo']
          ),
          templateExercise(
            'Jalón al pecho agarre neutro',
            3,
            '8-12',
            ['Dorsal'],
            ['Bíceps']
          ),
          templateExercise(
            'Press inclinado en máquina',
            2,
            '10-15',
            ['Pecho'],
            ['Hombro', 'Tríceps']
          ),
          templateExercise(
            'Hip thrust en máquina',
            3,
            '8-12',
            ['Glúteo']
          ),
          templateExercise(
            'Pájaros en máquina',
            2,
            '12-20',
            ['Hombro'],
            ['Trapecio']
          ),
          templateExercise(
            'Curl martillo en polea',
            2,
            '10-15',
            ['Bíceps']
          ),
          templateExercise(
            'Extensión de tríceps sobre cabeza en polea',
            2,
            '10-15',
            ['Tríceps']
          ),
        ],
      },
    ],
  },

  {
    id: 'full-body-3',
    daysPerWeek: 3,
    title: 'Full Body A/B/C',
    level: 'Principiante · Intermedio',
    objective: 'Fuerza + hipertrofia',
    schedule: '3 días no consecutivos',
    description:
      'Tres sesiones de cuerpo completo con ejercicios y énfasis diferentes.',
    days: [
      {
        name: 'Full Body A',
        exercises: [
          templateExercise('Sentadilla', 3, '6-8', ['Cuádriceps'], ['Glúteo', 'Femoral']),
          templateExercise('Press banca', 3, '6-10', ['Pecho'], ['Tríceps', 'Hombro']),
          templateExercise('Jalón al pecho', 3, '8-12', ['Dorsal'], ['Bíceps']),
          templateExercise('Peso muerto rumano', 3, '8-10', ['Femoral', 'Glúteo'], ['Lumbar']),
          templateExercise('Elevaciones laterales', 2, '12-20', ['Hombro']),
          templateExercise('Curl bíceps', 2, '10-15', ['Bíceps']),
          templateExercise('Tríceps polea', 2, '10-15', ['Tríceps']),
        ],
      },
      {
        name: 'Full Body B',
        exercises: [
          templateExercise('Prensa', 3, '8-12', ['Cuádriceps'], ['Glúteo']),
          templateExercise('Remo con apoyo de pecho', 3, '8-12', ['Dorsal'], ['Bíceps', 'Trapecio']),
          templateExercise('Press inclinado con mancuernas', 2, '10-15', ['Pecho'], ['Hombro', 'Tríceps']),
          templateExercise('Curl femoral', 3, '10-15', ['Femoral']),
          templateExercise('Press hombro con mancuernas', 2, '8-12', ['Hombro'], ['Tríceps']),
          templateExercise('Curl martillo', 2, '10-15', ['Bíceps']),
          templateExercise('Gemelo en prensa', 3, '10-15', ['Gemelo']),
        ],
      },
      {
        name: 'Full Body C',
        exercises: [
          templateExercise('Hack squat', 3, '8-12', ['Cuádriceps'], ['Glúteo']),
          templateExercise('Dominadas o jalón neutro', 3, '6-10', ['Dorsal'], ['Bíceps']),
          templateExercise('Press pecho en máquina', 2, '8-12', ['Pecho'], ['Tríceps', 'Hombro']),
          templateExercise('Hip thrust', 3, '8-12', ['Glúteo'], ['Femoral']),
          templateExercise('Remo sentado', 2, '10-12', ['Dorsal'], ['Bíceps', 'Trapecio']),
          templateExercise('Elevaciones laterales', 2, '12-20', ['Hombro']),
          templateExercise('Extensión tríceps sobre cabeza', 2, '10-15', ['Tríceps']),
        ],
      },
    ],
  },

  {
    id: 'ppl-3',
    daysPerWeek: 3,
    title: 'Push / Pull / Legs',
    level: 'Intermedio',
    objective: 'Hipertrofia',
    schedule: '3 días semanales',
    description:
      'Una sesión de empuje, una de tirón y una de pierna.',
    days: [
      {
        name: 'Push',
        exercises: [
          templateExercise('Press banca', 3, '6-10', ['Pecho'], ['Tríceps', 'Hombro']),
          templateExercise('Press inclinado con mancuernas', 3, '8-12', ['Pecho'], ['Hombro', 'Tríceps']),
          templateExercise('Press hombro en máquina o mancuernas', 2, '8-12', ['Hombro'], ['Tríceps']),
          templateExercise('Elevaciones laterales', 3, '12-20', ['Hombro']),
          templateExercise('Aperturas en máquina o polea', 2, '12-15', ['Pecho']),
          templateExercise('Extensión tríceps en polea', 3, '10-15', ['Tríceps']),
          templateExercise('Extensión tríceps sobre cabeza', 2, '10-15', ['Tríceps']),
        ],
      },
      {
        name: 'Pull',
        exercises: [
          templateExercise('Dominadas o jalón al pecho', 3, '6-10', ['Dorsal'], ['Bíceps']),
          templateExercise('Remo con apoyo de pecho', 3, '8-12', ['Dorsal'], ['Bíceps', 'Trapecio']),
          templateExercise('Jalón unilateral', 2, '10-15', ['Dorsal'], ['Bíceps']),
          templateExercise('Remo sentado', 2, '10-12', ['Dorsal'], ['Bíceps', 'Trapecio']),
          templateExercise('Pájaros / deltoide posterior', 3, '12-20', ['Hombro'], ['Trapecio']),
          templateExercise('Curl bíceps', 3, '8-12', ['Bíceps']),
          templateExercise('Curl martillo', 2, '10-15', ['Bíceps']),
        ],
      },
      {
        name: 'Legs',
        exercises: [
          templateExercise('Sentadilla o hack squat', 3, '6-10', ['Cuádriceps'], ['Glúteo']),
          templateExercise('Prensa', 3, '10-15', ['Cuádriceps'], ['Glúteo']),
          templateExercise('Peso muerto rumano', 3, '8-12', ['Femoral', 'Glúteo'], ['Lumbar']),
          templateExercise('Curl femoral', 3, '10-15', ['Femoral']),
          templateExercise('Extensión de cuádriceps', 2, '12-15', ['Cuádriceps']),
          templateExercise('Gemelo en prensa', 3, '10-15', ['Gemelo']),
          templateExercise('Abdominales', 3, '10-20', ['Abdomen']),
        ],
      },
    ],
  },

  {
    id: 'upper-lower-4',
    daysPerWeek: 4,
    title: 'Upper / Lower x2',
    level: 'Intermedio',
    objective: 'Hipertrofia + fuerza',
    schedule: '4 días · Upper / Lower / descanso / Upper / Lower',
    description:
      'Dos sesiones de tren superior y dos de tren inferior.',
    days: [
      {
        name: 'Upper A',
        exercises: [
          templateExercise('Press banca', 3, '6-10', ['Pecho'], ['Tríceps', 'Hombro']),
          templateExercise('Remo con apoyo de pecho', 3, '8-12', ['Dorsal'], ['Bíceps', 'Trapecio']),
          templateExercise('Press inclinado con mancuernas', 2, '8-12', ['Pecho'], ['Hombro', 'Tríceps']),
          templateExercise('Jalón al pecho', 3, '8-12', ['Dorsal'], ['Bíceps']),
          templateExercise('Elevaciones laterales', 3, '12-20', ['Hombro']),
          templateExercise('Curl bíceps', 2, '10-15', ['Bíceps']),
          templateExercise('Extensión tríceps en polea', 2, '10-15', ['Tríceps']),
        ],
      },
      {
        name: 'Lower A',
        exercises: [
          templateExercise('Sentadilla', 3, '6-8', ['Cuádriceps'], ['Glúteo', 'Femoral']),
          templateExercise('Prensa', 3, '10-15', ['Cuádriceps'], ['Glúteo']),
          templateExercise('Peso muerto rumano', 3, '8-10', ['Femoral', 'Glúteo'], ['Lumbar']),
          templateExercise('Curl femoral', 2, '10-15', ['Femoral']),
          templateExercise('Gemelo', 3, '10-15', ['Gemelo']),
          templateExercise('Abdominales', 3, '10-20', ['Abdomen']),
        ],
      },
      {
        name: 'Upper B',
        exercises: [
          templateExercise('Dominadas o jalón neutro', 3, '6-10', ['Dorsal'], ['Bíceps']),
          templateExercise('Press inclinado en máquina', 3, '8-12', ['Pecho'], ['Hombro', 'Tríceps']),
          templateExercise('Remo sentado', 3, '8-12', ['Dorsal'], ['Bíceps', 'Trapecio']),
          templateExercise('Press hombro', 2, '8-12', ['Hombro'], ['Tríceps']),
          templateExercise('Aperturas en máquina o polea', 2, '12-15', ['Pecho']),
          templateExercise('Curl martillo', 2, '10-15', ['Bíceps']),
          templateExercise('Extensión tríceps sobre cabeza', 2, '10-15', ['Tríceps']),
        ],
      },
      {
        name: 'Lower B',
        exercises: [
          templateExercise('Hack squat', 3, '8-12', ['Cuádriceps'], ['Glúteo']),
          templateExercise('Hip thrust', 3, '8-12', ['Glúteo'], ['Femoral']),
          templateExercise('Curl femoral', 3, '10-15', ['Femoral']),
          templateExercise('Extensión de cuádriceps', 2, '12-15', ['Cuádriceps']),
          templateExercise('Hiperextensiones', 2, '10-15', ['Lumbar'], ['Glúteo', 'Femoral']),
          templateExercise('Gemelo sentado', 3, '12-20', ['Gemelo']),
          templateExercise('Abdominales', 3, '10-20', ['Abdomen']),
        ],
      },
    ],
  },

  {
    id: 'ppl-upper-4',
    daysPerWeek: 4,
    title: 'PPL + Upper',
    level: 'Intermedio',
    objective: 'Hipertrofia',
    schedule: '4 días · Push / Pull / Legs / Upper',
    description:
      'Tres días especializados y un segundo estímulo general de tren superior.',
    days: [
      {
        name: 'Push',
        exercises: [
          templateExercise('Press banca', 3, '6-10', ['Pecho'], ['Tríceps', 'Hombro']),
          templateExercise('Press inclinado mancuernas', 3, '8-12', ['Pecho'], ['Hombro', 'Tríceps']),
          templateExercise('Press hombro', 2, '8-12', ['Hombro'], ['Tríceps']),
          templateExercise('Elevaciones laterales', 3, '12-20', ['Hombro']),
          templateExercise('Aperturas', 2, '12-15', ['Pecho']),
          templateExercise('Tríceps polea', 3, '10-15', ['Tríceps']),
        ],
      },
      {
        name: 'Pull',
        exercises: [
          templateExercise('Dominadas o jalón', 3, '6-10', ['Dorsal'], ['Bíceps']),
          templateExercise('Remo con apoyo de pecho', 3, '8-12', ['Dorsal'], ['Bíceps', 'Trapecio']),
          templateExercise('Jalón unilateral', 2, '10-15', ['Dorsal'], ['Bíceps']),
          templateExercise('Pájaros', 3, '12-20', ['Hombro'], ['Trapecio']),
          templateExercise('Curl bíceps', 3, '8-12', ['Bíceps']),
          templateExercise('Curl martillo', 2, '10-15', ['Bíceps']),
        ],
      },
      {
        name: 'Legs',
        exercises: [
          templateExercise('Sentadilla o hack squat', 3, '6-10', ['Cuádriceps'], ['Glúteo']),
          templateExercise('Prensa', 3, '10-15', ['Cuádriceps'], ['Glúteo']),
          templateExercise('Peso muerto rumano', 3, '8-12', ['Femoral', 'Glúteo'], ['Lumbar']),
          templateExercise('Curl femoral', 3, '10-15', ['Femoral']),
          templateExercise('Extensión cuádriceps', 2, '12-15', ['Cuádriceps']),
          templateExercise('Gemelo', 3, '10-15', ['Gemelo']),
        ],
      },
      {
        name: 'Upper',
        exercises: [
          templateExercise('Press inclinado máquina', 3, '8-12', ['Pecho'], ['Hombro', 'Tríceps']),
          templateExercise('Remo sentado', 3, '8-12', ['Dorsal'], ['Bíceps', 'Trapecio']),
          templateExercise('Jalón al pecho', 2, '10-12', ['Dorsal'], ['Bíceps']),
          templateExercise('Press hombro ligero', 2, '10-12', ['Hombro'], ['Tríceps']),
          templateExercise('Elevaciones laterales', 2, '12-20', ['Hombro']),
          templateExercise('Curl bíceps', 2, '10-15', ['Bíceps']),
          templateExercise('Tríceps sobre cabeza', 2, '10-15', ['Tríceps']),
        ],
      },
    ],
  },

  {
    id: 'ppl-upper-lower-5',
    daysPerWeek: 5,
    title: 'PPL + Upper / Lower',
    level: 'Intermedio',
    objective: 'Hipertrofia + fuerza',
    schedule: '5 días · Push / Pull / Legs / descanso / Upper / Lower',
    description:
      'PPL para el primer estímulo y Upper/Lower para completar la segunda frecuencia.',
    days: [
      {
        name: 'Push',
        exercises: [
          templateExercise('Press banca', 3, '6-10', ['Pecho'], ['Tríceps', 'Hombro']),
          templateExercise('Press inclinado con mancuernas', 3, '8-12', ['Pecho'], ['Hombro', 'Tríceps']),
          templateExercise('Press hombro', 2, '8-12', ['Hombro'], ['Tríceps']),
          templateExercise('Elevaciones laterales', 3, '12-20', ['Hombro']),
          templateExercise('Aperturas en polea o máquina', 2, '12-15', ['Pecho']),
          templateExercise('Extensión tríceps en polea', 3, '10-15', ['Tríceps']),
        ],
      },
      {
        name: 'Pull',
        exercises: [
          templateExercise('Dominadas o jalón al pecho', 3, '6-10', ['Dorsal'], ['Bíceps']),
          templateExercise('Remo con apoyo de pecho', 3, '8-12', ['Dorsal'], ['Bíceps', 'Trapecio']),
          templateExercise('Jalón unilateral', 2, '10-15', ['Dorsal'], ['Bíceps']),
          templateExercise('Remo sentado', 2, '10-12', ['Dorsal'], ['Bíceps', 'Trapecio']),
          templateExercise('Pájaros / deltoide posterior', 3, '12-20', ['Hombro'], ['Trapecio']),
          templateExercise('Curl bíceps', 3, '8-12', ['Bíceps']),
          templateExercise('Curl martillo', 2, '10-15', ['Bíceps']),
        ],
      },
      {
        name: 'Legs',
        exercises: [
          templateExercise('Sentadilla o hack squat', 3, '6-10', ['Cuádriceps'], ['Glúteo']),
          templateExercise('Prensa', 3, '10-15', ['Cuádriceps'], ['Glúteo']),
          templateExercise('Peso muerto rumano', 3, '8-12', ['Femoral', 'Glúteo'], ['Lumbar']),
          templateExercise('Curl femoral', 3, '10-15', ['Femoral']),
          templateExercise('Extensión cuádriceps', 2, '12-15', ['Cuádriceps']),
          templateExercise('Gemelo', 3, '10-15', ['Gemelo']),
        ],
      },
      {
        name: 'Upper',
        exercises: [
          templateExercise('Press inclinado en máquina', 3, '8-12', ['Pecho'], ['Hombro', 'Tríceps']),
          templateExercise('Remo sentado', 3, '8-12', ['Dorsal'], ['Bíceps', 'Trapecio']),
          templateExercise('Jalón al pecho', 2, '10-12', ['Dorsal'], ['Bíceps']),
          templateExercise('Press hombro ligero', 2, '10-12', ['Hombro'], ['Tríceps']),
          templateExercise('Elevaciones laterales', 2, '12-20', ['Hombro']),
          templateExercise('Curl bíceps', 2, '10-15', ['Bíceps']),
          templateExercise('Tríceps sobre cabeza', 2, '10-15', ['Tríceps']),
        ],
      },
      {
        name: 'Lower',
        exercises: [
          templateExercise('Hack squat', 3, '8-12', ['Cuádriceps'], ['Glúteo']),
          templateExercise('Hip thrust', 3, '8-12', ['Glúteo'], ['Femoral']),
          templateExercise('Curl femoral', 3, '10-15', ['Femoral']),
          templateExercise('Extensión cuádriceps', 2, '12-15', ['Cuádriceps']),
          templateExercise('Peso muerto rumano ligero', 2, '10-12', ['Femoral', 'Glúteo'], ['Lumbar']),
          templateExercise('Gemelo sentado', 3, '12-20', ['Gemelo']),
          templateExercise('Abdominales', 3, '10-20', ['Abdomen']),
        ],
      },
    ],
  },

  {
    id: 'torso-legs-specialization-5',
    daysPerWeek: 5,
    title: 'Torso / Pierna + Especialización',
    level: 'Intermedio',
    objective: 'Hipertrofia',
    schedule:
      '5 días · Torso / Pierna / descanso / Pecho+Espalda / Pierna / Hombros+Brazos',
    description:
      'Dos estímulos de pierna y torso con un día específico de hombros y brazos.',
    days: [
      {
        name: 'Torso',
        exercises: [
          templateExercise('Press banca', 3, '6-10', ['Pecho'], ['Tríceps', 'Hombro']),
          templateExercise('Jalón al pecho', 3, '8-12', ['Dorsal'], ['Bíceps']),
          templateExercise('Press inclinado mancuernas', 2, '8-12', ['Pecho'], ['Hombro', 'Tríceps']),
          templateExercise('Remo con apoyo de pecho', 3, '8-12', ['Dorsal'], ['Bíceps', 'Trapecio']),
          templateExercise('Elevaciones laterales', 3, '12-20', ['Hombro']),
          templateExercise('Curl bíceps', 2, '10-15', ['Bíceps']),
          templateExercise('Tríceps polea', 2, '10-15', ['Tríceps']),
        ],
      },
      {
        name: 'Pierna A',
        exercises: [
          templateExercise('Sentadilla', 3, '6-8', ['Cuádriceps'], ['Glúteo', 'Femoral']),
          templateExercise('Prensa', 3, '10-15', ['Cuádriceps'], ['Glúteo']),
          templateExercise('Peso muerto rumano', 3, '8-12', ['Femoral', 'Glúteo'], ['Lumbar']),
          templateExercise('Curl femoral', 3, '10-15', ['Femoral']),
          templateExercise('Gemelo', 3, '10-15', ['Gemelo']),
          templateExercise('Abdominales', 3, '10-20', ['Abdomen']),
        ],
      },
      {
        name: 'Pecho + Espalda',
        exercises: [
          templateExercise('Press inclinado en máquina', 3, '8-12', ['Pecho'], ['Hombro', 'Tríceps']),
          templateExercise('Dominadas o jalón neutro', 3, '6-10', ['Dorsal'], ['Bíceps']),
          templateExercise('Press pecho en máquina', 2, '10-15', ['Pecho'], ['Hombro', 'Tríceps']),
          templateExercise('Remo sentado', 3, '8-12', ['Dorsal'], ['Bíceps', 'Trapecio']),
          templateExercise('Aperturas en polea', 2, '12-15', ['Pecho']),
          templateExercise('Jalón unilateral', 2, '10-15', ['Dorsal'], ['Bíceps']),
        ],
      },
      {
        name: 'Pierna B',
        exercises: [
          templateExercise('Hack squat', 3, '8-12', ['Cuádriceps'], ['Glúteo']),
          templateExercise('Hip thrust', 3, '8-12', ['Glúteo'], ['Femoral']),
          templateExercise('Curl femoral', 3, '10-15', ['Femoral']),
          templateExercise('Extensión cuádriceps', 3, '12-15', ['Cuádriceps']),
          templateExercise('Gemelo sentado', 3, '12-20', ['Gemelo']),
          templateExercise('Abdominales', 3, '10-20', ['Abdomen']),
        ],
      },
      {
        name: 'Hombros + Brazos',
        exercises: [
          templateExercise('Press hombro', 3, '8-12', ['Hombro'], ['Tríceps']),
          templateExercise('Elevaciones laterales', 3, '12-20', ['Hombro']),
          templateExercise('Pájaros / deltoide posterior', 3, '12-20', ['Hombro'], ['Trapecio']),
          templateExercise('Curl bíceps', 3, '8-12', ['Bíceps']),
          templateExercise('Curl martillo', 2, '10-15', ['Bíceps']),
          templateExercise('Tríceps polea', 3, '10-15', ['Tríceps']),
          templateExercise('Tríceps sobre cabeza', 2, '10-15', ['Tríceps']),
        ],
      },
    ],
  },

  {
    id: 'ppl-6',
    daysPerWeek: 6,
    title: 'Push / Pull / Legs x2',
    level: 'Intermedio · Avanzado',
    objective: 'Hipertrofia',
    schedule: '6 sesiones · PPL / descanso / PPL',
    description:
      'Dos vueltas de Push, Pull y Legs con variantes A y B.',
    days: [
      {
        name: 'Push A',
        exercises: [
          templateExercise('Press banca', 3, '6-10', ['Pecho'], ['Tríceps', 'Hombro']),
          templateExercise('Press inclinado mancuernas', 3, '8-12', ['Pecho'], ['Hombro', 'Tríceps']),
          templateExercise('Press hombro', 2, '8-12', ['Hombro'], ['Tríceps']),
          templateExercise('Elevaciones laterales', 3, '12-20', ['Hombro']),
          templateExercise('Tríceps polea', 3, '10-15', ['Tríceps']),
          templateExercise('Tríceps sobre cabeza', 2, '10-15', ['Tríceps']),
        ],
      },
      {
        name: 'Pull A',
        exercises: [
          templateExercise('Dominadas o jalón', 3, '6-10', ['Dorsal'], ['Bíceps']),
          templateExercise('Remo con apoyo de pecho', 3, '8-12', ['Dorsal'], ['Bíceps', 'Trapecio']),
          templateExercise('Jalón unilateral', 2, '10-15', ['Dorsal'], ['Bíceps']),
          templateExercise('Pájaros', 3, '12-20', ['Hombro'], ['Trapecio']),
          templateExercise('Curl bíceps', 3, '8-12', ['Bíceps']),
          templateExercise('Curl martillo', 2, '10-15', ['Bíceps']),
        ],
      },
      {
        name: 'Legs A',
        exercises: [
          templateExercise('Sentadilla', 3, '6-8', ['Cuádriceps'], ['Glúteo', 'Femoral']),
          templateExercise('Prensa', 3, '10-15', ['Cuádriceps'], ['Glúteo']),
          templateExercise('Peso muerto rumano', 3, '8-12', ['Femoral', 'Glúteo'], ['Lumbar']),
          templateExercise('Curl femoral', 3, '10-15', ['Femoral']),
          templateExercise('Gemelo', 3, '10-15', ['Gemelo']),
        ],
      },
      {
        name: 'Push B',
        exercises: [
          templateExercise('Press inclinado máquina', 3, '8-12', ['Pecho'], ['Hombro', 'Tríceps']),
          templateExercise('Press pecho máquina', 3, '8-12', ['Pecho'], ['Hombro', 'Tríceps']),
          templateExercise('Press hombro ligero', 2, '10-12', ['Hombro'], ['Tríceps']),
          templateExercise('Elevaciones laterales', 3, '12-20', ['Hombro']),
          templateExercise('Aperturas', 2, '12-15', ['Pecho']),
          templateExercise('Tríceps polea', 3, '10-15', ['Tríceps']),
        ],
      },
      {
        name: 'Pull B',
        exercises: [
          templateExercise('Jalón neutro', 3, '8-12', ['Dorsal'], ['Bíceps']),
          templateExercise('Remo sentado', 3, '8-12', ['Dorsal'], ['Bíceps', 'Trapecio']),
          templateExercise('Remo unilateral', 2, '10-15', ['Dorsal'], ['Bíceps', 'Trapecio']),
          templateExercise('Pájaros', 2, '12-20', ['Hombro'], ['Trapecio']),
          templateExercise('Curl inclinado', 3, '10-15', ['Bíceps']),
          templateExercise('Curl martillo', 2, '10-15', ['Bíceps']),
        ],
      },
      {
        name: 'Legs B',
        exercises: [
          templateExercise('Hack squat', 3, '8-12', ['Cuádriceps'], ['Glúteo']),
          templateExercise('Hip thrust', 3, '8-12', ['Glúteo'], ['Femoral']),
          templateExercise('Curl femoral', 3, '10-15', ['Femoral']),
          templateExercise('Extensión cuádriceps', 2, '12-15', ['Cuádriceps']),
          templateExercise('Gemelo sentado', 3, '12-20', ['Gemelo']),
          templateExercise('Abdominales', 3, '10-20', ['Abdomen']),
        ],
      },
    ],
  },

  {
    id: 'arnold-6',
    daysPerWeek: 6,
    title: 'Arnold Split adaptado',
    level: 'Intermedio · Avanzado',
    objective: 'Hipertrofia',
    schedule: '6 sesiones · 3 días / descanso / 3 días',
    description:
      'Pecho y espalda, pierna, hombros y brazos; después se repite con variantes.',
    days: [
      {
        name: 'Pecho + Espalda A',
        exercises: [
          templateExercise('Press banca', 3, '6-10', ['Pecho'], ['Tríceps', 'Hombro']),
          templateExercise('Jalón al pecho', 3, '8-12', ['Dorsal'], ['Bíceps']),
          templateExercise('Press inclinado mancuernas', 3, '8-12', ['Pecho'], ['Hombro', 'Tríceps']),
          templateExercise('Remo con apoyo de pecho', 3, '8-12', ['Dorsal'], ['Bíceps', 'Trapecio']),
          templateExercise('Aperturas en polea', 2, '12-15', ['Pecho']),
          templateExercise('Remo sentado', 2, '10-12', ['Dorsal'], ['Bíceps', 'Trapecio']),
        ],
      },
      {
        name: 'Pierna A',
        exercises: [
          templateExercise('Sentadilla', 3, '6-8', ['Cuádriceps'], ['Glúteo', 'Femoral']),
          templateExercise('Prensa', 3, '10-15', ['Cuádriceps'], ['Glúteo']),
          templateExercise('Peso muerto rumano', 3, '8-12', ['Femoral', 'Glúteo'], ['Lumbar']),
          templateExercise('Curl femoral', 3, '10-15', ['Femoral']),
          templateExercise('Gemelo', 3, '10-15', ['Gemelo']),
          templateExercise('Abdominales', 3, '10-20', ['Abdomen']),
        ],
      },
      {
        name: 'Hombros + Brazos A',
        exercises: [
          templateExercise('Press hombro', 3, '8-12', ['Hombro'], ['Tríceps']),
          templateExercise('Elevaciones laterales', 3, '12-20', ['Hombro']),
          templateExercise('Pájaros', 3, '12-20', ['Hombro'], ['Trapecio']),
          templateExercise('Curl bíceps', 3, '8-12', ['Bíceps']),
          templateExercise('Curl martillo', 2, '10-15', ['Bíceps']),
          templateExercise('Tríceps polea', 3, '10-15', ['Tríceps']),
          templateExercise('Extensión tríceps sobre cabeza', 2, '10-15', ['Tríceps']),
        ],
      },
      {
        name: 'Pecho + Espalda B',
        exercises: [
          templateExercise('Press inclinado máquina', 3, '8-12', ['Pecho'], ['Hombro', 'Tríceps']),
          templateExercise('Dominadas o jalón neutro', 3, '6-10', ['Dorsal'], ['Bíceps']),
          templateExercise('Press pecho máquina', 2, '10-15', ['Pecho'], ['Hombro', 'Tríceps']),
          templateExercise('Remo unilateral', 3, '8-12', ['Dorsal'], ['Bíceps', 'Trapecio']),
          templateExercise('Aperturas máquina', 2, '12-15', ['Pecho']),
          templateExercise('Jalón unilateral', 2, '10-15', ['Dorsal'], ['Bíceps']),
        ],
      },
      {
        name: 'Pierna B',
        exercises: [
          templateExercise('Hack squat', 3, '8-12', ['Cuádriceps'], ['Glúteo']),
          templateExercise('Hip thrust', 3, '8-12', ['Glúteo'], ['Femoral']),
          templateExercise('Curl femoral', 3, '10-15', ['Femoral']),
          templateExercise('Extensión cuádriceps', 2, '12-15', ['Cuádriceps']),
          templateExercise('Gemelo sentado', 3, '12-20', ['Gemelo']),
          templateExercise('Abdominales', 3, '10-20', ['Abdomen']),
        ],
      },
      {
        name: 'Hombros + Brazos B',
        exercises: [
          templateExercise('Press hombro en máquina', 2, '8-12', ['Hombro'], ['Tríceps']),
          templateExercise('Elevaciones laterales', 3, '12-20', ['Hombro']),
          templateExercise('Pájaros', 2, '12-20', ['Hombro'], ['Trapecio']),
          templateExercise('Curl inclinado', 3, '10-15', ['Bíceps']),
          templateExercise('Curl en polea', 2, '10-15', ['Bíceps']),
          templateExercise('Tríceps polea', 3, '10-15', ['Tríceps']),
          templateExercise('Extensión sobre cabeza', 2, '10-15', ['Tríceps']),
        ],
      },
    ],
  },

];

const ACHIEVEMENTS = [
  // INICIO
  {
    id: 'first_workout',
    tier: 'bronze',
    category: 'Inicio',
    difficulty: 'Fácil',
    xp: 10,
    title: 'Primer paso',
    description: 'Completa tu primer entrenamiento',
    type: 'workouts',
    target: 1,
  },
  {
    id: 'first_pr',
    tier: 'bronze',
    category: 'Récords',
    difficulty: 'Fácil',
    xp: 10,
    title: 'Primera marca',
    description: 'Consigue tu primer récord personal',
    type: 'totalPRs',
    target: 1,
  },
  {
    id: 'three_workouts',
    tier: 'bronze',
    category: 'Inicio',
    difficulty: 'Fácil',
    xp: 10,
    title: 'Cogiendo ritmo',
    description: 'Completa 3 entrenamientos',
    type: 'workouts',
    target: 3,
  },
  {
    id: 'first_active_week',
    tier: 'bronze',
    category: 'Constancia',
    difficulty: 'Fácil',
    xp: 10,
    title: 'Primera semana',
    description: 'Registra entrenamientos durante tu primera semana activa',
    type: 'activeWeeks',
    target: 1,
  },
  {
    id: 'five_workouts',
    tier: 'bronze',
    category: 'Inicio',
    difficulty: 'Fácil',
    xp: 10,
    title: 'Ya es rutina',
    description: 'Completa 5 entrenamientos',
    type: 'workouts',
    target: 5,
  },
  {
    id: 'double_pr',
    tier: 'bronze',
    category: 'Récords',
    difficulty: 'Fácil',
    xp: 10,
    title: 'Doble golpe',
    description: 'Consigue 2 récords personales en un entrenamiento',
    type: 'prsInWorkout',
    target: 2,
  },
  {
    id: 'ten_workouts',
    tier: 'bronze',
    category: 'Inicio',
    difficulty: 'Media',
    xp: 20,
    title: 'Diez dentro',
    description: 'Completa 10 entrenamientos',
    type: 'workouts',
    target: 10,
  },
  {
    id: 'five_prs',
    tier: 'bronze',
    category: 'Récords',
    difficulty: 'Media',
    xp: 20,
    title: 'Cazador de marcas',
    description: 'Acumula 5 récords personales',
    type: 'totalPRs',
    target: 5,
  },
  {
    id: 'two_active_weeks',
    tier: 'bronze',
    category: 'Constancia',
    difficulty: 'Media',
    xp: 20,
    title: 'Creando el hábito',
    description: 'Mantente activo durante 2 semanas diferentes',
    type: 'activeWeeks',
    target: 2,
  },
  {
    id: 'three_pr_session',
    tier: 'bronze',
    category: 'Récords',
    difficulty: 'Media',
    xp: 20,
    title: 'Día de récords',
    description: 'Consigue 3 récords personales en un entrenamiento',
    type: 'prsInWorkout',
    target: 3,
  },

  // PROGRESIÓN
  {
    id: 'five_pr_exercises',
    tier: 'silver',
    category: 'Récords',
    difficulty: 'Media',
    xp: 20,
    title: 'Todo terreno',
    description: 'Consigue récords en 5 ejercicios diferentes',
    type: 'exercisesWithPR',
    target: 5,
  },
  {
    id: 'twenty_workouts',
    tier: 'silver',
    category: 'Constancia',
    difficulty: 'Media',
    xp: 20,
    title: 'Sin aflojar',
    description: 'Completa 20 entrenamientos',
    type: 'workouts',
    target: 20,
  },
  {
    id: 'four_active_weeks',
    tier: 'silver',
    category: 'Constancia',
    difficulty: 'Media',
    xp: 20,
    title: 'Mes sólido',
    description: 'Registra entrenamientos durante 4 semanas diferentes',
    type: 'activeWeeks',
    target: 4,
  },
  {
    id: 'three_pr_streak',
    tier: 'silver',
    category: 'Especiales',
    difficulty: 'Media',
    xp: 20,
    title: 'En llamas',
    description: 'Consigue algún PR en 3 entrenamientos consecutivos',
    type: 'prWorkoutStreak',
    target: 3,
  },
  {
    id: 'perfect_week',
    tier: 'silver',
    category: 'Especiales',
    difficulty: 'Difícil',
    xp: 30,
    title: 'Semana perfecta',
    description: 'Consigue algún PR en 4 días de entrenamiento de una misma semana',
    type: 'perfectWeek',
    target: 4,
  },
  {
    id: 'twentyfive_workouts',
    tier: 'silver',
    category: 'Constancia',
    difficulty: 'Media',
    xp: 20,
    title: '25 dentro',
    description: 'Completa 25 entrenamientos',
    type: 'workouts',
    target: 25,
  },
  {
    id: 'ten_prs',
    tier: 'silver',
    category: 'Récords',
    difficulty: 'Media',
    xp: 20,
    title: 'Rompiendo marcas',
    description: 'Acumula 10 récords personales',
    type: 'totalPRs',
    target: 10,
  },
  {
    id: 'ten_pr_workouts',
    tier: 'silver',
    category: 'Récords',
    difficulty: 'Media',
    xp: 20,
    title: 'Progreso real',
    description: 'Completa 10 entrenamientos en los que hayas conseguido algún PR',
    type: 'workoutsWithPR',
    target: 10,
  },
  {
    id: 'eight_active_weeks',
    tier: 'silver',
    category: 'Constancia',
    difficulty: 'Difícil',
    xp: 30,
    title: 'Disciplina',
    description: 'Registra entrenamientos durante 8 semanas diferentes',
    type: 'activeWeeks',
    target: 8,
  },
  {
    id: 'five_pr_streak',
    tier: 'silver',
    category: 'Especiales',
    difficulty: 'Difícil',
    xp: 30,
    title: 'Imparable',
    description: 'Consigue algún PR en 5 entrenamientos consecutivos',
    type: 'prWorkoutStreak',
    target: 5,
  },

  // AVANZADOS
  {
    id: 'fifty_workouts',
    tier: 'gold',
    category: 'Constancia',
    difficulty: 'Difícil',
    xp: 30,
    title: 'Medio centenar',
    description: 'Completa 50 entrenamientos',
    type: 'workouts',
    target: 50,
  },
  {
    id: 'twentyfive_prs',
    tier: 'gold',
    category: 'Récords',
    difficulty: 'Difícil',
    xp: 30,
    title: 'Rompiendo límites',
    description: 'Acumula 25 récords personales',
    type: 'totalPRs',
    target: 25,
  },
  {
    id: 'ten_pr_exercises',
    tier: 'gold',
    category: 'Récords',
    difficulty: 'Difícil',
    xp: 30,
    title: 'Diversificado',
    description: 'Consigue récords en 10 ejercicios diferentes',
    type: 'exercisesWithPR',
    target: 10,
  },
  {
    id: 'five_pr_session',
    tier: 'gold',
    category: 'Especiales',
    difficulty: 'Difícil',
    xp: 30,
    title: 'Día histórico',
    description: 'Consigue 5 récords personales en un solo entrenamiento',
    type: 'prsInWorkout',
    target: 5,
  },
  {
    id: 'twelve_active_weeks',
    tier: 'gold',
    category: 'Constancia',
    difficulty: 'Difícil',
    xp: 30,
    title: 'Trimestre de hierro',
    description: 'Registra entrenamientos durante 12 semanas diferentes',
    type: 'activeWeeks',
    target: 12,
  },
  {
    id: 'twentyfive_pr_workouts',
    tier: 'gold',
    category: 'Récords',
    difficulty: 'Difícil',
    xp: 30,
    title: 'Siempre mejorando',
    description: 'Consigue algún PR en 25 entrenamientos diferentes',
    type: 'workoutsWithPR',
    target: 25,
  },
  {
    id: 'seventyfive_workouts',
    tier: 'gold',
    category: 'Constancia',
    difficulty: 'Difícil',
    xp: 30,
    title: '75 sesiones',
    description: 'Completa 75 entrenamientos',
    type: 'workouts',
    target: 75,
  },
  {
    id: 'fifty_prs',
    tier: 'gold',
    category: 'Récords',
    difficulty: 'Élite',
    xp: 50,
    title: 'Cincuenta marcas',
    description: 'Acumula 50 récords personales',
    type: 'totalPRs',
    target: 50,
  },
  {
    id: 'hundred_workouts',
    tier: 'gold',
    category: 'Constancia',
    difficulty: 'Élite',
    xp: 50,
    title: 'Centenario',
    description: 'Completa 100 entrenamientos',
    type: 'workouts',
    target: 100,
  },
  {
    id: 'sixteen_active_weeks',
    tier: 'gold',
    category: 'Constancia',
    difficulty: 'Élite',
    xp: 50,
    title: 'Inquebrantable',
    description: 'Registra entrenamientos durante 16 semanas diferentes',
    type: 'activeWeeks',
    target: 16,
  },

  // ÉLITE
  {
    id: 'twenty_pr_exercises',
    tier: 'diamond',
    category: 'Récords',
    difficulty: 'Élite',
    xp: 50,
    title: 'Arsenal completo',
    description: 'Consigue récords en 20 ejercicios diferentes',
    type: 'exercisesWithPR',
    target: 20,
  },
  {
    id: 'fifty_pr_workouts',
    tier: 'diamond',
    category: 'Récords',
    difficulty: 'Élite',
    xp: 50,
    title: 'Máquina de progreso',
    description: 'Consigue algún PR en 50 entrenamientos diferentes',
    type: 'workoutsWithPR',
    target: 50,
  },
  {
    id: 'hundred_prs',
    tier: 'diamond',
    category: 'Récords',
    difficulty: 'Legendaria',
    xp: 75,
    title: 'Cien barreras',
    description: 'Acumula 100 récords personales',
    type: 'totalPRs',
    target: 100,
  },
  {
    id: 'twentyfour_active_weeks',
    tier: 'diamond',
    category: 'Constancia',
    difficulty: 'Legendaria',
    xp: 75,
    title: 'Medio año',
    description: 'Registra entrenamientos durante 24 semanas diferentes',
    type: 'activeWeeks',
    target: 24,
  },
  {
    id: 'onefifty_workouts',
    tier: 'diamond',
    category: 'Constancia',
    difficulty: 'Élite',
    xp: 50,
    title: '150 sesiones',
    description: 'Completa 150 entrenamientos',
    type: 'workouts',
    target: 150,
  },
  {
    id: 'seventyfive_prs',
    tier: 'diamond',
    category: 'Récords',
    difficulty: 'Élite',
    xp: 50,
    title: 'Sin techo',
    description: 'Acumula 75 récords personales',
    type: 'totalPRs',
    target: 75,
  },
  {
    id: 'twohundred_workouts',
    tier: 'diamond',
    category: 'Constancia',
    difficulty: 'Legendaria',
    xp: 75,
    title: 'Veterano',
    description: 'Completa 200 entrenamientos',
    type: 'workouts',
    target: 200,
  },
  {
    id: 'onefifty_prs',
    tier: 'diamond',
    category: 'Récords',
    difficulty: 'Legendaria',
    xp: 75,
    title: 'Máquina de PR',
    description: 'Acumula 150 récords personales',
    type: 'totalPRs',
    target: 150,
  },
  {
    id: 'twofifty_workouts',
    tier: 'diamond',
    category: 'Constancia',
    difficulty: 'Legendaria',
    xp: 75,
    title: '250 sesiones',
    description: 'Completa 250 entrenamientos',
    type: 'workouts',
    target: 250,
  },
  {
    id: 'fivehundred_workouts',
    tier: 'diamond',
    category: 'Especiales',
    difficulty: 'Legendaria',
    xp: 100,
    title: 'Leyenda RivalSet',
    description: 'Completa 500 entrenamientos',
    type: 'workouts',
    target: 500,
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
  muted: ('#858A95'),
  darkText: '#181205',
};

/* =========================================================
   RIVALSET · COLOR DINÁMICO GLOBAL
========================================================= */

const hexToRgb = (hex) => {
  const clean = String(hex || '#FFB000').replace('#', '');

  const value =
    clean.length === 3
      ? clean.split('').map((c) => c + c).join('')
      : clean;

  const number = parseInt(value, 16);

  return {
    r: (number >> 16) & 255,
    g: (number >> 8) & 255,
    b: number & 255,
  };
};

const accentRgba = (alpha = 1) => {
  const { r, g, b } = hexToRgb(COLORS.orange);
  return `rgba(${r},${g},${b},${alpha})`;
};

const darkenAccent = (hex, amount = 0.28) => {
  const { r, g, b } = hexToRgb(hex);

  const factor = 1 - amount;

  return `rgb(${Math.round(r * factor)},${Math.round(
    g * factor
  )},${Math.round(b * factor)})`;
};

const mixAccent = (hex, targetHex, amount) => {
  const source = hexToRgb(hex);
  const target = hexToRgb(targetHex);

  const mix = (a, b) =>
    Math.round(a + (b - a) * amount);

  return `rgb(${mix(source.r, target.r)},${mix(
    source.g,
    target.g
  )},${mix(source.b, target.b)})`;
};

const getAccentBackground = (color, light = false) => {
  if (light) {
    return [
      '#F7F6F2',
      '#F5F3EE',
      '#F3F1EC',
      '#F1EFEA',
      '#EEECE7',
      '#ECEAE5',
    ];
  }

  return [
    '#0B0C10',
    '#0A0B0F',
    '#090A0E',
    '#090A0D',
    '#08090C',
    '#08090C',
  ];
};

/* =========================================================
   RIVALSET · AMBIENT GLOW
   Halo muy amplio, sin bordes ni círculos visibles.
========================================================= */

const RivalSetAmbientGlow = ({
  color = COLORS.orange,
}) => {
  const { r, g, b } = hexToRgb(
    color || '#FFB000'
  );

  const glowColor = `rgb(${r},${g},${b})`;

  return (
    <Svg
      pointerEvents="none"
      width="100%"
      height="100%"
      style={[
        StyleSheet.absoluteFillObject,
        {
          zIndex: -1,
        },
      ]}
    >
      <Defs>

        {/* Halo principal: enorme y horizontal */}
        <RadialGradient
          id="rivalsetAmbientMain"
          cx="50%"
          cy="43%"
          rx="92%"
          ry="31%"
        >
          <Stop
            offset="0%"
            stopColor={glowColor}
            stopOpacity="0.26"
          />

          <Stop
            offset="32%"
            stopColor={glowColor}
            stopOpacity="0.21"
          />

          <Stop
            offset="58%"
            stopColor={glowColor}
            stopOpacity="0.12"
          />

          <Stop
            offset="78%"
            stopColor={glowColor}
            stopOpacity="0.045"
          />

          <Stop
            offset="100%"
            stopColor={glowColor}
            stopOpacity="0"
          />
        </RadialGradient>

        {/* Segunda difusión para romper cualquier
            sensación de círculo definido */}
        <RadialGradient
          id="rivalsetAmbientSoft"
          cx="43%"
          cy="39%"
          rx="110%"
          ry="40%"
        >
          <Stop
            offset="0%"
            stopColor={glowColor}
            stopOpacity="0.10"
          />

          <Stop
            offset="48%"
            stopColor={glowColor}
            stopOpacity="0.055"
          />

          <Stop
            offset="100%"
            stopColor={glowColor}
            stopOpacity="0"
          />
        </RadialGradient>

      </Defs>

      <Rect
        x="0"
        y="0"
        width="100%"
        height="100%"
        fill="url(#rivalsetAmbientSoft)"
      />

      <Rect
        x="0"
        y="0"
        width="100%"
        height="100%"
        fill="url(#rivalsetAmbientMain)"
      />

    </Svg>
  );
};


const applyAccentColor = (color) => {
  if (!color) return;

  COLORS.orange = color;
  COLORS.yellow = color;
  COLORS.darkOrange = darkenAccent(color, 0.28);
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

const uniqueMuscles = (muscles = []) =>
  [...new Set(muscles.filter(Boolean))];

const getPrimaryMuscles = (exercise = {}) => {
  if (
    Array.isArray(exercise.primaryMuscles) &&
    exercise.primaryMuscles.length > 0
  ) {
    return uniqueMuscles(exercise.primaryMuscles);
  }

  // Compatibilidad con rutinas y entrenamientos antiguos.
  if (Array.isArray(exercise.muscles)) {
    return uniqueMuscles(exercise.muscles);
  }

  if (exercise.muscle) {
    return [exercise.muscle];
  }

  return [];
};

const getSecondaryMuscles = (exercise = {}) => {
  if (!Array.isArray(exercise.secondaryMuscles)) {
    return [];
  }

  const primary = new Set(
    getPrimaryMuscles(exercise)
  );

  return uniqueMuscles(
    exercise.secondaryMuscles
  ).filter((muscle) => !primary.has(muscle));
};

const getExerciseMuscles = (exercise = {}) =>
  uniqueMuscles([
    ...getPrimaryMuscles(exercise),
    ...getSecondaryMuscles(exercise),
  ]);

const muscleText = (exercise = {}) => {
  const muscles = getExerciseMuscles(exercise);

  return muscles.length > 0 ? muscles.join(' · ') : 'Sin grupo';
};

const isCardioExercise = (exercise = {}) =>
  getExerciseMuscles(exercise).includes('Cardio');

const emptyExercise = () => ({
  id: Date.now() + Math.random(),
  name: '',
  series: '',
  reps: '',
  weight: '',
  duration: '',
  distance: '',
  heartRate: '',
  cardioEnvironment: '',
  cardioActivity: '',
  muscles: [],
  primaryMuscles: [],
  secondaryMuscles: [],
});

const getCardioMetricType = (exercise = {}) => {
  const name = String(exercise.name || '')
    .trim()
    .toLowerCase();

  // Actividades basadas en ritmo min/km
  if (
    [
      'correr',
      'caminar',
      'senderismo',
      'cinta',
    ].includes(name)
  ) {
    return 'pace';
  }

  // Actividades basadas en velocidad km/h
  if (
    [
      'bicicleta',
      'bicicleta estática',
    ].includes(name)
  ) {
    return 'speed';
  }

  // Elíptica, remo, escaladora y cualquier
  // cardio sin distancia relevante.
  return 'duration';
};

const getCardioCalculatedMetric = (exercise = {}) => {
  const type = getCardioMetricType(exercise);

  const duration = parseNumber(exercise.duration);
  const distance = parseNumber(exercise.distance);

  if (
    type === 'duration' ||
    duration === null ||
    duration <= 0 ||
    distance === null ||
    distance <= 0
  ) {
    return null;
  }

  if (type === 'speed') {
    const speed = distance / (duration / 60);

    return {
      type: 'speed',
      value: speed.toFixed(1),
      unit: 'km/h',
      label: 'VELOCIDAD MEDIA',
    };
  }

  const totalSeconds = Math.round(
    (duration / distance) * 60
  );

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return {
    type: 'pace',
    value: `${minutes}:${String(seconds).padStart(
      2,
      '0'
    )}`,
    unit: 'min/km',
    label: 'RITMO MEDIO',
  };
};

const exercisePlan = (exercise) => {
  if (isCardioExercise(exercise)) {
    const duration = parseNumber(exercise.duration);
    const distance = parseNumber(exercise.distance);
    const heartRate = parseNumber(exercise.heartRate);

    const parts = [];

    if (duration !== null && duration > 0) {
      parts.push(`${duration} min`);
    }

    if (
      getCardioMetricType(exercise) !== 'duration' &&
      distance !== null &&
      distance > 0
    ) {
      parts.push(`${distance} km`);
    }

    if (
      duration !== null &&
      duration > 0 &&
      distance !== null &&
      distance > 0
    ) {
      const calculated =
        getCardioCalculatedMetric(exercise);

      if (calculated) {
        parts.push(
          `${calculated.value} ${calculated.unit}`
        );
      }
    }

    if (heartRate !== null && heartRate > 0) {
      parts.push(`${Math.round(heartRate)} PPM`);
    }

    return parts.join(' · ');
  }

  if (exercise.series && exercise.reps) {
    const repsText =
      exercise.repRange || exercise.reps;

    return `${exercise.series} series · ${repsText} rep${
      exercise.weight ? ` · ${exercise.weight} kg` : ''
    }`;
  }

  return exercise.plan || '';
};
const buildWorkoutSets = (exercise) => {
  const savedTemplate = Array.isArray(exercise.setsTemplate)
    ? exercise.setsTemplate
    : [];

  if (savedTemplate.length > 0) {
    return savedTemplate.map((set, index) => {
      if (isCardioExercise(exercise)) {
        return {
          id: `${exercise.id}-cardio-${Date.now()}-${index}-${Math.random()}`,
          duration: set.duration ?? exercise.duration ?? '',
          distance: set.distance ?? exercise.distance ?? '',
          heartRate: set.heartRate ?? exercise.heartRate ?? '',
          completed: false,
          prType: null,
          prText: '',
          prData: null,
        };
      }

      return {
        id: `${exercise.id}-set-${Date.now()}-${index}-${Math.random()}`,
        weight: set.weight ?? exercise.weight ?? '',
        reps: set.reps || exercise.reps || '',
        completed: false,
        prType: null,
        prText: '',
        prData: null,
      };
    });
  }

  if (isCardioExercise(exercise)) {
    return [
      {
        id: `${exercise.id}-cardio-${Date.now()}-${Math.random()}`,
        duration: exercise.duration || '',
        distance: exercise.distance || '',
        heartRate: exercise.heartRate || '',
        completed: false,
        prType: null,
        prText: '',
        prData: null,
      },
    ];
  }

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

const routineExerciseFromWorkout = (exercise) => {
  const { expanded, sets = [], ...baseExercise } = exercise;

  if (isCardioExercise(exercise)) {
    const cardioSet = sets[0] || {};

    const duration = String(
      cardioSet.duration ?? baseExercise.duration ?? ''
    );
    const distance = String(
      cardioSet.distance ?? baseExercise.distance ?? ''
    );
    const heartRate = String(
      cardioSet.heartRate ?? baseExercise.heartRate ?? ''
    );

    return {
      ...baseExercise,
      duration,
      distance,
      heartRate,
      setsTemplate: [
        {
          duration,
          distance,
          heartRate,
        },
      ],
    };
  }

  const setsTemplate = sets.map((set) => ({
    weight: String(set.weight ?? ''),
    reps: String(set.reps ?? ''),
  }));

  const firstSet =
    setsTemplate[0] || {
      weight: String(baseExercise.weight ?? ''),
      reps: String(baseExercise.reps ?? ''),
    };

  return {
    ...baseExercise,
    series: String(Math.max(1, setsTemplate.length)),
    weight: firstSet.weight,
    reps: firstSet.reps,
    setsTemplate:
      setsTemplate.length > 0
        ? setsTemplate
        : [
            {
              weight: firstSet.weight,
              reps: firstSet.reps,
            },
          ],
  };
};
/* =========================================================
   DEGRADADO GENERAL
========================================================= */


/* =========================================================
   RIVALSET · CARDIO LIVE TIMER
========================================================= */

const RivalSetCardioLiveTimer = ({
  exercise,
  set,
  onUpdate,
}) => {
  const [seconds, setSeconds] = useState(
    Number(set?.timerSeconds || 0)
  );
  const [running, setRunning] = useState(false);

  const startRef = useRef(null);
  const baseRef = useRef(
    Number(set?.timerSeconds || 0)
  );

  useEffect(() => {
    if (!running) return;

    const interval = setInterval(() => {
      if (!startRef.current) return;

      const extra = Math.floor(
        (Date.now() - startRef.current) / 1000
      );

      setSeconds(baseRef.current + extra);
    }, 250);

    return () => clearInterval(interval);
  }, [running]);

  const formatTimer = (totalSeconds) => {
    const total = Math.max(
      0,
      Math.floor(Number(totalSeconds) || 0)
    );

    const hours = Math.floor(total / 3600);
    const minutes = Math.floor(
      (total % 3600) / 60
    );
    const secs = total % 60;

    if (hours > 0) {
      return `${String(hours).padStart(2, '0')}:${String(
        minutes
      ).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }

    return `${String(minutes).padStart(
      2,
      '0'
    )}:${String(secs).padStart(2, '0')}`;
  };

  const start = async () => {
    baseRef.current = seconds;
    startRef.current = Date.now();
    setRunning(true);
  };

  const pause = async () => {
    if (!running) return;

    const extra = startRef.current
      ? Math.floor(
          (Date.now() - startRef.current) / 1000
        )
      : 0;

    const next = baseRef.current + extra;

    setSeconds(next);
    baseRef.current = next;
    startRef.current = null;
    setRunning(false);

    onUpdate('timerSeconds', next);
  };

  const finish = async () => {
    let finalSeconds = seconds;

    if (running && startRef.current) {
      finalSeconds =
        baseRef.current +
        Math.floor(
          (Date.now() - startRef.current) / 1000
        );
    }

    setSeconds(finalSeconds);
    baseRef.current = finalSeconds;
    startRef.current = null;
    setRunning(false);

    onUpdate('timerSeconds', finalSeconds);

    // Guardamos el tiempo real en minutos.
    // 12:30 -> 12.5 min
    if (finalSeconds > 0) {
      const realMinutes =
        Math.round(
          (finalSeconds / 60) * 10
        ) / 10;

      onUpdate(
        'duration',
        String(realMinutes)
      );
    }
  };

  const targetMinutes =
    parseNumber(set?.duration) ||
    parseNumber(exercise?.duration) ||
    0;

  const targetSeconds =
    targetMinutes > 0
      ? targetMinutes * 60
      : 0;

  const progress =
    targetSeconds > 0
      ? Math.min(
          1,
          seconds / targetSeconds
        )
      : 0;

  const progressWidth =
    `${Math.round(progress * 100)}%`;

  const exerciseName = String(
    exercise?.name || ''
  ).toLowerCase();

  let activityIcon = 'run';

  if (exerciseName.includes('bici')) {
    activityIcon = 'bike';
  } else if (
    exerciseName.includes('caminar') ||
    exerciseName.includes('sender')
  ) {
    activityIcon = 'walk';
  } else if (exerciseName.includes('remo')) {
    activityIcon = 'rowing';
  } else if (exerciseName.includes('escal')) {
    activityIcon = 'stairs';
  } else if (exerciseName.includes('elípt')) {
    activityIcon = 'run';
  }

  const hasStarted =
    seconds > 0 || running;

  return (
    <View style={styles.cardioLiveTimer}>
      <View style={styles.cardioLiveTimerTop}>
        <Text style={styles.cardioLiveTimerLabel}>
          CRONÓMETRO
        </Text>

        {running && (
          <View style={styles.cardioLiveStatus}>
            <View style={styles.cardioLiveDot} />

            <Text style={styles.cardioLiveStatusText}>
              EN CURSO
            </Text>
          </View>
        )}
      </View>

      <Text style={styles.cardioLiveTime}>
        {formatTimer(seconds)}
      </Text>

      {targetSeconds > 0 && (
        <Text style={styles.cardioLiveObjective}>
          Objetivo · {formatTimer(targetSeconds)}
        </Text>
      )}

      <View style={styles.cardioLiveButtons}>
        {!running ? (
          <TouchableOpacity
            activeOpacity={0.8}
            style={styles.cardioLivePrimary}
            onPress={start}
          >
            <MaterialCommunityIcons
              name={
                hasStarted
                  ? 'play'
                  : 'timer-play-outline'
              }
              size={18}
              color="#1A1200"
            />

            <Text style={styles.cardioLivePrimaryText}>
              {hasStarted
                ? 'REANUDAR'
                : 'INICIAR'}
            </Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            activeOpacity={0.8}
            style={styles.cardioLivePause}
            onPress={pause}
          >
            <MaterialCommunityIcons
              name="pause"
              size={18}
              color={COLORS.orange}
            />

            <Text style={styles.cardioLivePauseText}>
              PAUSAR
            </Text>
          </TouchableOpacity>
        )}

        {hasStarted && (
          <TouchableOpacity
            activeOpacity={0.8}
            style={styles.cardioLiveFinish}
            onPress={finish}
          >
            <MaterialCommunityIcons
              name="check"
              size={17}
              color="#F4F4F5"
            />

            <Text style={styles.cardioLiveFinishText}>
              FINALIZAR
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* PISTA */}
      <View style={styles.cardioLiveTrackArea}>
        <View style={styles.cardioLiveTrack}>
          <View style={styles.cardioLiveTrackBase} />

          <View
            style={[
              styles.cardioLiveTrackProgress,
              {
                width:
                  targetSeconds > 0
                    ? progressWidth
                    : running
                    ? '35%'
                    : '0%',
              },
            ]}
          />

          <View
            style={[
              styles.cardioLivePerson,
              {
                left:
                  targetSeconds > 0
                    ? progressWidth
                    : running
                    ? '35%'
                    : '0%',
              },
            ]}
          >
            <View style={styles.cardioLivePersonGlow}>
              <MaterialCommunityIcons
                name={activityIcon}
                size={24}
                color={COLORS.orange}
              />
            </View>
          </View>

          <View style={styles.cardioLiveGoal}>
            <MaterialCommunityIcons
              name="flag-checkered"
              size={25}
              color={COLORS.orange}
            />
          </View>
        </View>

        <View style={styles.cardioLiveTrackFooter}>
          <Text style={styles.cardioLiveTrackText}>
            {targetSeconds > 0
              ? `${Math.round(
                  progress * 100
                )}% completado`
              : running
              ? 'Entrenamiento en curso'
              : 'Preparado'}
          </Text>

          {targetSeconds > 0 && (
            <Text style={styles.cardioLiveTrackText}>
              {formatTimer(seconds)}
              {' / '}
              {formatTimer(targetSeconds)}
            </Text>
          )}
        </View>
      </View>
    </View>
  );
};

const AppGradient = () => (<LinearGradient
colors={["rgb(102,72,7)","rgb(75,54,9)","rgb(43,32,10)","rgb(20,17,11)","rgb(8,9,12)"]}
locations={[0, 0.18, 0.40, 0.58, 0.70]}
start={{ x: 0.5, y: 0 }}
end={{ x: 0.5, y: 1 }}
style={StyleSheet.absoluteFillObject} pointerEvents="none" />);






/* =========================================================
   RIVALSET · LUZ DIAGONAL
   Solo color oficial #FF9D00
========================================================= */

const RivalSetDiagonalLight = () => (
  <LinearGradient
    pointerEvents="none"

    colors={[
      'rgba(255,179,0,0.00)',
      'rgba(255,179,0,0.08)',
      'rgba(255,179,0,0.035)',
      'rgba(255,179,0,0.00)',
    ]}

    locations={[0, 0.30, 0.62, 1]}

    start={{ x: 0.05, y: 0 }}
    end={{ x: 0.95, y: 1 }}

    style={StyleSheet.absoluteFillObject}
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
  vibrationEnabled = true,
  isLightTheme = false,
  accentColor = '#FFB300',
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

  const innerBackground = isLightTheme
    ? 'rgba(255,255,255,0.92)'
    : 'rgba(255,255,255,0.12)';

  const innerBorder = isLightTheme
    ? 'rgba(20,22,28,0.12)'
    : 'rgba(255,255,255,0.18)';

  const iconColor = isLightTheme
    ? '#17191F'
    : '#F7F8FA';

  return (
    <TouchableOpacity
      activeOpacity={1}
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={() => setPressed(false)}
      style={{
        width: 52,
        height: 52,
        borderRadius: 26,

        alignItems: 'center',
        justifyContent: 'center',

        borderWidth: 2.5,
        borderColor: accentColor,

        backgroundColor: 'rgba(255,179,0,0.04)',

        shadowColor: accentColor,
        shadowOffset: {
          width: 0,
          height: 3,
        },
        shadowOpacity: isLightTheme ? 0.12 : 0.20,
        shadowRadius: 7,
        elevation: 4,

        transform: [
          { scale: pressed ? 0.94 : 1 }
        ],
      }}
    >
      <View
        style={{
          width: 42,
          height: 42,
          borderRadius: 21,

          alignItems: 'center',
          justifyContent: 'center',

          backgroundColor: innerBackground,

          borderWidth: 1,
          borderColor: innerBorder,
        }}
      >
        <MaterialCommunityIcons
          name="account"
          size={27}
          color={iconColor}
        />
      </View>
    </TouchableOpacity>
  );
};

/* =========================================================
   APP
========================================================= */
const MuscleBodyMap = ({
  muscleIntensity = {},
  selectedMuscle = null,
  onSelectMuscle = () => {},
}) => {
  const [selectedBodySlug, setSelectedBodySlug] = useState(null);
  const muscleConfig = {


    chest: 'Pecho',
    deltoids: 'Hombro',
    biceps: 'Bíceps',
    triceps: 'Tríceps',
    abs: 'Abdomen',
obliques: 'Abdomen',
    quadriceps: 'Cuádriceps',
    calves: 'Gemelo',
    trapezius: 'Trapecio',
    'lower-back': 'Lumbar',
    gluteal: 'Glúteo',
    hamstring: 'Femoral',
    'upper-back': 'Dorsal',
    'high-back': 'Espalda alta',
  };

  const getColor = (muscle) => {
    let value = muscleIntensity[muscle] || 0;

    // upper-back del muñeco = Espalda alta.
    // Conservamos también la actividad de Dorsal en esta región
    // hasta separar visualmente ambos músculos.
    if (muscle === 'Espalda alta') {
      value = Math.max(
        muscleIntensity['Espalda alta'] || 0,
        muscleIntensity['Dorsal'] || 0
      );
    }

    if (value >= 0.75) return '#FFB000';
    if (value >= 0.45) return '#A86C00';
    if (value > 0) return '#554015';

    return '#292C32';
  };

  const bodyData = Object.entries(muscleConfig).map(
    ([slug, muscle]) => {
      const isSelected =
        selectedMuscle === muscle &&
        selectedBodySlug === slug;

      return {
        slug,
        intensity: 1,
        styles: {
          fill: getColor(muscle),
          stroke: isSelected
            ? '#FFFFFF'
            : '#16191F',
          strokeWidth: isSelected
            ? 2
            : 0.8,
        },
      };
    }
  );

const handlePress = (bodyPart) => {
  const rawSlug = bodyPart?.slug || '';

  const normalizedSlug = rawSlug
    .replace('-left-front', '')
    .replace('-right-front', '')
    .replace('-left-back', '')
    .replace('-right-back', '')
    .replace('-left', '')
    .replace('-right', '');

  const muscle =
    muscleConfig[rawSlug] ||
    muscleConfig[normalizedSlug];

  if (muscle) {
    setSelectedBodySlug(
      muscleConfig[rawSlug] ? rawSlug : normalizedSlug
    );
    onSelectMuscle(muscle);
  }
};
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'flex-start',
        gap: 18,
      }}
    >
      {/* FRONTAL */}
      <View
        style={{
          alignItems: 'center',
          width: 140,
        }}
      >
        <Text
          style={{
            color: '#FFFFFF',
            fontSize: 10,
            fontWeight: '900',
            letterSpacing: 1.2,
            marginBottom: 6,
          }}
        >
          FRONTAL
        </Text>

        <Body
          data={bodyData}
          gender="male"
          side="front"
          scale={0.80}
          border="#444A55"
          defaultFill="#292C32"
          defaultStroke="#16191F"
          defaultStrokeWidth={0.8}
          onBodyPartPress={handlePress}
        />
      </View>

      {/* TRASERO */}
      <View
        style={{
          alignItems: 'center',
          width: 140,
        }}
      >
        <Text
          style={{
            color: '#FFFFFF',
            fontSize: 10,
            fontWeight: '900',
            letterSpacing: 1.2,
            marginBottom: 6,
          }}
        >
          TRASERO
        </Text>

        <Body
          data={bodyData}
          gender="male"
          side="back"
          scale={0.80}
          border="#444A55"
          defaultFill="#292C32"
          defaultStroke="#16191F"
          defaultStrokeWidth={0.8}
          onBodyPartPress={handlePress}
        />
      </View>
    </View>
  );
};
// ============================================================
// RIVALSET ANIMATED SPLASH
// ============================================================

const RivalSetSplash = ({ onFinish }) => {
  const finishedRef = useRef(false);
  const hapticRef = useRef(false);

  const player = useVideoPlayer(
    require('./assets/rivalset-splash.mp4')
  );

  useEffect(() => {
    if (!player) return;

    player.loop = false;
    player.muted = true;
    player.currentTime = 0;

    const endSubscription = player.addListener(
      'playToEnd',
      () => {
        if (finishedRef.current) return;
        finishedRef.current = true;
        onFinish();
      }
    );

    // Arrancamos cuando VideoPlayer ya está montado.
    const playTimer = setTimeout(() => {
      try {
        player.play();
      } catch (error) {
        console.log('RIVALSET SPLASH PLAY ERROR:', error);
      }
    }, 150);

    // Seguridad.
    const fallback = setTimeout(() => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      onFinish();
    }, 5500);

    return () => {
      clearTimeout(playTimer);
      clearTimeout(fallback);
      endSubscription?.remove?.();

      try {
        player.pause();
      } catch {}
    };
  }, [player, onFinish]);

  useEffect(() => {
    const hapticTimer = setTimeout(() => {
      if (hapticRef.current) return;

      hapticRef.current = true;

      Haptics.impactAsync(
        Haptics.ImpactFeedbackStyle.Heavy
      ).catch(() => {});
    }, 1300);

    return () => clearTimeout(hapticTimer);
  }, []);

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: '#000000',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <VideoView
        player={player}
        nativeControls={false}
        contentFit="cover"
        style={{
          width: '85%',
          height: '85%',
          alignSelf: 'center',
          backgroundColor: '#000000',
        }}
      />
    </View>
  );
};

export default function App() {
  const [showRivalSetSplash, setShowRivalSetSplash] =
    useState(true);


  /* RIVALSET_PUSH_AUTH_LISTENER */
  useEffect(() => {
    // Intenta registrar el dispositivo si ya existe sesión.
    registerRivalSetPushToken();

    // Y vuelve a intentarlo cuando Supabase detecta login,
    // incluido Google / Apple / email.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (
          session?.user &&
          (
            event === 'SIGNED_IN' ||
            event === 'INITIAL_SESSION' ||
            event === 'TOKEN_REFRESHED'
          )
        ) {
          setTimeout(() => {
            registerRivalSetPushToken();
          }, 500);
        }
      }
    );

    return () => {
      subscription?.unsubscribe();
    };
  }, []);


useEffect(() => {
  mobileAds().initialize().then(() => {
    leagueInterstitial.load();
  });
}, []);  const [selectedTab, setSelectedTab] = useState('Inicio');
  const [showLeagueInfo, setShowLeagueInfo] = useState(false);
  
  const [screen, setScreen] = useState('home');
const [realLeagueId, setRealLeagueId] = useState(null);
  const [routines, setRoutines] = useState([]);
  const [routineName, setRoutineName] = useState('');
  const [editingRoutineId, setEditingRoutineId] = useState(null);
  const [templateDays, setTemplateDays] = useState(2);
  const [expandedTemplateId, setExpandedTemplateId] = useState(null);
const [showNutritionManual, setShowNutritionManual] = useState(false);

const [nutritionDraft, setNutritionDraft] = useState({
  meal: 'Comida',
  name: '',
  grams: '',
  calories: '',
  protein: '',
  carbs: '',
  fats: '',
});
const [nutritionEntries, setNutritionEntries] = useState([]);
const [foodSearchQuery, setFoodSearchQuery] = useState('');
  const foodSearchInputRef = useRef(null);
  const [foodBrandQuery, setFoodBrandQuery] = useState('');

const [foodSearchResults, setFoodSearchResults] = useState([]);
const [foodSearchLoading, setFoodSearchLoading] = useState(false);
const [selectedFood, setSelectedFood] = useState(null);
const [nutritionUnit, setNutritionUnit] = useState('g');

  const [barcodeScannerVisible, setBarcodeScannerVisible] = useState(false);
  const [barcodeScannerLocked, setBarcodeScannerLocked] = useState(false);
  const [lastScannedBarcode, setLastScannedBarcode] = useState('');
  const [barcodePermission, requestBarcodePermission] = useCameraPermissions();

  const openBarcodeScanner = async () => {
    try {
      let permission = barcodePermission;

      if (!permission?.granted) {
        permission = await requestBarcodePermission();
      }

      if (!permission?.granted) {
        Alert.alert(
          'Permiso necesario',
          'Necesitas permitir el acceso a la cámara para escanear códigos de barras.'
        );
        return;
      }

      setBarcodeScannerLocked(false);
      setBarcodeScannerVisible(true);
    } catch (error) {
      console.log('Error abriendo escáner:', error);
      Alert.alert('Error', 'No se pudo abrir el escáner.');
    }
  };

  const closeBarcodeScanner = () => {
    setBarcodeScannerVisible(false);
    setBarcodeScannerLocked(false);
  };

  const fillNutritionFromExactProduct = (product) => {
    const unit = product?.basisUnit === 'ml' ? 'ml' : 'g';

    const displayName = [product?.brand, product?.name]
      .filter(Boolean)
      .join(' · ');

    setNutritionUnit(unit);

    setNutritionDraft((previous) => ({
      ...previous,
      name: displayName || product?.name || 'Producto',
      grams: '100',
      calories: String(Number(product?.calories100 ?? 0)),
      protein: String(Number(product?.protein100 ?? 0)),
      carbs: String(Number(product?.carbs100 ?? 0)),
      fats: String(Number(product?.fats100 ?? 0)),
    }));

    setFoodSearchQuery(displayName || product?.name || '');

    setSelectedFood({
      id: product?.id || product?.barcode || 'barcode-product',
      name: displayName || product?.name || 'Producto',
      brand: product?.brand || '',
      servingSize: `100 ${unit}`,
      quantity: `100 ${unit}`,
      calories100: Number(product?.calories100 ?? 0),
      protein100: Number(product?.protein100 ?? 0),
      carbs100: Number(product?.carbs100 ?? 0),
      fats100: Number(product?.fats100 ?? 0),
      source: product?.source || 'verified_product',
      barcode: product?.barcode || '',
    });

    setShowNutritionManual(true);
  };

  const scanNutritionLabel = async () => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();

      if (!permission.granted) {
        Alert.alert(
          'Permiso necesario',
          'Necesitas permitir el acceso a la cámara para leer la etiqueta.'
        );
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: false,
        quality: 1,
        base64: true,
      });

      if (result.canceled) return;

      const asset = result.assets?.[0];

      if (!asset?.base64) {
        Alert.alert('Error', 'No se pudo leer la fotografía.');
        return;
      }

      const mimeType = asset.mimeType || 'image/jpeg';

      const { data, error } = await supabase.functions.invoke(
        'read-nutrition-label',
        {
          body: {
            image: `data:${mimeType};base64,${asset.base64}`,
          },
        }
      );

      if (error) throw error;

      if (data?.status !== 'read' || !data?.normalized) {
        Alert.alert(
          'No se pudo leer con seguridad',
          'Haz otra foto donde se vea completa y nítida la tabla nutricional.'
        );
        return;
      }

      const nutrition = data.normalized;
      const extracted = data.extracted || {};
      const unit = nutrition.basisUnit === 'ml' ? 'ml' : 'g';

      setNutritionUnit(unit);

      setNutritionDraft((previous) => ({
        ...previous,
        name:
          [extracted.brand, extracted.product_name]
            .filter(Boolean)
            .join(' · ') ||
          previous.name ||
          'Producto escaneado',
        grams: '100',
        calories: String(nutrition.calories100),
        protein: String(nutrition.protein100),
        carbs: String(nutrition.carbs100),
        fats: String(nutrition.fats100),
      }));

      setShowNutritionManual(true);

      Alert.alert(
        'Etiqueta leída',
        'He copiado únicamente los valores visibles de la etiqueta. Revísalos antes de guardar.'
      );
    } catch (error) {
      console.log('Error leyendo etiqueta:', error);
      Alert.alert(
        'Error',
        'No se pudo analizar la etiqueta nutricional.'
      );
    }
  };

  const handleBarcodeScanned = async ({ data }) => {
    if (barcodeScannerLocked) return;

    const barcode = String(data || '').replace(/\D/g, '');

    if (!barcode) return;

    setBarcodeScannerLocked(true);
    setLastScannedBarcode(barcode);

    try {
      const { data: result, error } = await supabase.functions.invoke(
        'resolve-product-barcode',
        {
          body: { barcode },
        }
      );

      if (error) throw error;

      if (result?.status === 'found' && result?.product) {
        closeBarcodeScanner();
        fillNutritionFromExactProduct(result.product);
        return;
      }

      closeBarcodeScanner();

      Alert.alert(
        'Producto no encontrado',
        'No hay una ficha nutricional suficientemente fiable para este código. No voy a inventar los macros.',
        [
          {
            text: 'Cancelar',
            style: 'cancel',
          },
          {
            text: 'Escanear etiqueta',
            onPress: scanNutritionLabel,
          },
        ]
      );
    } catch (error) {
      console.log('Error resolviendo código de barras:', error);
      closeBarcodeScanner();

      Alert.alert(
        'No se pudo consultar el producto',
        'Puedes leer directamente su etiqueta nutricional.',
        [
          {
            text: 'Cancelar',
            style: 'cancel',
          },
          {
            text: 'Escanear etiqueta',
            onPress: scanNutritionLabel,
          },
        ]
      );
    }
  };

const [nutritionPhoto, setNutritionPhoto] = useState(null);
const [nutritionPhotoLoading, setNutritionPhotoLoading] = useState(false);
const [nutritionPhotoResult, setNutritionPhotoResult] = useState(null);
const pickNutritionPhoto = () => {
  Alert.alert(
    'Escanear comida',
    'Elige de dónde quieres obtener la foto',
    [
      {
        text: 'Cámara',
        onPress: async () => {
          const permission =
            await ImagePicker.requestCameraPermissionsAsync();

          if (!permission.granted) {
            Alert.alert(
              'Permiso necesario',
              'Necesitas permitir el acceso a la cámara para hacer una foto.'
            );
            return;
          }

          const result =
            await ImagePicker.launchCameraAsync({
              mediaTypes: ['images'],
              allowsEditing: false,
              quality: 0.85,
base64: true,
            });

          if (!result.canceled) {
            setNutritionPhoto(result.assets[0]);
            setNutritionPhotoResult(null);
          }
        },
      },
      {
        text: 'Galería',
        onPress: async () => {
          const permission =
            await ImagePicker.requestMediaLibraryPermissionsAsync();

          if (!permission.granted) {
            Alert.alert(
              'Permiso necesario',
              'Necesitas permitir el acceso a tus fotos.'
            );
            return;
          }

          const result =
            await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ['images'],
              allowsEditing: false,
              quality: 0.85,
base64: true,
            });

          if (!result.canceled) {
            setNutritionPhoto(result.assets[0]);
            setNutritionPhotoResult(null);
          }
        },
      },
      {
        text: 'Cancelar',
        style: 'cancel',
      },
    ]
  );
};
const analyzeNutritionPhoto = async () => {
  if (!nutritionPhoto?.base64) {
    Alert.alert(
      'Sin foto',
      'Primero haz una foto o elige una de la galería.'
    );
    return;
  }

  setNutritionPhotoLoading(true);
  setNutritionPhotoResult(null);

  try {
const { data, error } = await supabase.functions.invoke('smooth-api', {
  body: {
    imageBase64: nutritionPhoto.base64,
    mimeType: nutritionPhoto.mimeType || 'image/jpeg',
  },
});
    if (error) {
      console.log('Error analizando foto:', error);
      Alert.alert(
        'Error',
        'No se ha podido analizar la comida.'
      );
      return;
    }

    if (!data?.foods?.length) {
      Alert.alert(
        'No se detectaron alimentos',
        'Prueba con una foto más clara y con la comida bien visible.'
      );
      return;
    }

    setNutritionPhotoResult(data);
  } catch (error) {
    console.log('Error analizando foto:', error);

    Alert.alert(
      'Error',
      'No se ha podido analizar la comida.'
    );
  } finally {
    setNutritionPhotoLoading(false);
  }
};
const updateNutritionPhotoFoodGrams = (index, value) => {
  const grams = Math.max(
    Number(String(value).replace(',', '.')) || 0,
    0
  );

  setNutritionPhotoResult((prev) => {
    if (!prev?.foods) return prev;

    const foods = prev.foods.map((food, foodIndex) => {
      if (foodIndex !== index) return food;

      const nutrition = food.nutrition;

      if (!nutrition) {
        return {
          ...food,
          grams,
        };
      }

      const ratio = grams / 100;

      return {
        ...food,
        grams,
        nutrition: {
          ...nutrition,
          calories: Math.round(
            (nutrition.calories100 || 0) * ratio
          ),
          protein:
            Math.round(
              (nutrition.protein100 || 0) *
                ratio *
                10
            ) / 10,
          carbs:
            Math.round(
              (nutrition.carbs100 || 0) *
                ratio *
                10
            ) / 10,
          fats:
            Math.round(
              (nutrition.fats100 || 0) *
                ratio *
                10
            ) / 10,
        },
      };
    });

    const totals = foods.reduce(
      (total, food) => {
        if (!food.nutrition) return total;

        total.calories +=
          Number(food.nutrition.calories) || 0;
        total.protein +=
          Number(food.nutrition.protein) || 0;
        total.carbs +=
          Number(food.nutrition.carbs) || 0;
        total.fats +=
          Number(food.nutrition.fats) || 0;

        return total;
      },
      {
        calories: 0,
        protein: 0,
        carbs: 0,
        fats: 0,
      }
    );

    return {
      ...prev,
      foods,
      totals: {
        calories: Math.round(totals.calories),
        protein:
          Math.round(totals.protein * 10) / 10,
        carbs:
          Math.round(totals.carbs * 10) / 10,
        fats:
          Math.round(totals.fats * 10) / 10,
      },
    };
  });
};
const searchFoodProducts = async (query, brandValue = foodBrandQuery) => {
  const cleanQuery = query.trim();

  if (cleanQuery.length < 2) {
    setFoodSearchResults([]);
    return;
  }

  setFoodSearchLoading(true);

  try {
    const normalizedQuery = cleanQuery
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

    // OPEN FOOD FACTS
    const openFoodPromise = Promise.resolve([]);

    const usdaPromise = (async () => {
      try {
        const { data, error } =
          await supabase.functions.invoke(
            'search-usda-foods',
            {
              body: {
                query: cleanQuery,
                brand: String(brandValue || '').trim(),
              },
            }
          );

        if (error) {
          console.log('Error USDA:', error);
          return [];
        }

        const products = data?.products || [];

        const q = cleanQuery
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '');

        const isGenericMeatBurger =
          (q.includes('hamburguesa') || q.includes('burger')) &&
          ['pollo', 'chicken', 'ternera', 'vacuno', 'beef', 'pavo', 'turkey', 'cerdo', 'pork']
            .some((x) => q.includes(x)) &&
          !['pan', 'bun', 'empanad', 'rebozad', 'breaded', 'battered', 'crispy']
            .some((x) => q.includes(x));

        if (isGenericMeatBurger) {
          return products.filter((product) => {
            const name = `${product?.name || ''} ${product?.originalName || ''}`
              .toLowerCase();

            const carbs = Number(product?.carbs100) || 0;

            return (
              carbs <= 8 &&
              !['sandwich', 'with bun', 'breaded', 'battered']
                .some((x) => name.includes(x))
            );
          });
        }

        return products;
      } catch (error) {
        console.log('Error USDA:', error);
        return [];
      }
    })();

    const [openFoodProducts, usdaProducts] =
      await Promise.all([
        openFoodPromise,
        usdaPromise,
      ]);

    const combinedProducts = [
      ...usdaProducts,
      ...openFoodProducts,
    ];

    const uniqueProducts = [];
    const seen = new Set();

    combinedProducts.forEach((product) => {
      const key = `${product.name}-${product.brand || ''}`
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');

      if (!seen.has(key)) {
        seen.add(key);
        uniqueProducts.push(product);
      }
    });

    uniqueProducts.sort(
      (a, b) => (b.score || 0) - (a.score || 0)
    );

    setFoodSearchResults(uniqueProducts);
  } catch (error) {
    console.log('Error buscando alimentos:', error);
    setFoodSearchResults([]);
  } finally {
    setFoodSearchLoading(false);
  }
};const [nutritionGoals, setNutritionGoals] = useState({
  calories: 2100,
  protein: 160,
  carbs: 220,
  fats: 70,
});
const [showNutritionGoals, setShowNutritionGoals] = useState(false);
const [nutritionLoaded, setNutritionLoaded] = useState(false);
useEffect(() => {
  const loadNutrition = async () => {
    try {
      const saved = await AsyncStorage.getItem(NUTRITION_KEY);
      const allNutrition = saved ? JSON.parse(saved) : {};
      const todayKey = getNutritionDateKey();
const savedGoals = await AsyncStorage.getItem(NUTRITION_GOALS_KEY);

if (savedGoals) {
  setNutritionGoals(JSON.parse(savedGoals));
}
      setNutritionEntries(allNutrition[todayKey] || []);
    } catch (error) {
      console.log('Error cargando nutrición:', error);
    } finally {
      setNutritionLoaded(true);
    }
  };

  loadNutrition();
}, []);
useEffect(() => {
  if (!nutritionLoaded) return;

  const saveNutrition = async () => {
    try {
      const saved = await AsyncStorage.getItem(NUTRITION_KEY);
      const allNutrition = saved ? JSON.parse(saved) : {};
      const todayKey = getNutritionDateKey();

      allNutrition[todayKey] = nutritionEntries;

      await AsyncStorage.setItem(
        NUTRITION_KEY,
        JSON.stringify(allNutrition)
      );
    } catch (error) {
      console.log('Error guardando nutrición:', error);
    }
  };

  saveNutrition();
}, [nutritionEntries, nutritionLoaded]);
useEffect(() => {
  if (!nutritionLoaded) return;

  const saveNutritionGoals = async () => {
    try {
      await AsyncStorage.setItem(
        NUTRITION_GOALS_KEY,
        JSON.stringify(nutritionGoals)
      );
    } catch (error) {
      console.log('Error guardando objetivos nutricionales:', error);
    }
  };

  saveNutritionGoals();
}, [nutritionGoals, nutritionLoaded]);
const [editingNutritionEntryId, setEditingNutritionEntryId] = useState(null);
const [expandedNutritionMeal, setExpandedNutritionMeal] = useState(null);
  const [draftExercises, setDraftExercises] = useState([]);
  const [exercisePickerOpen, setExercisePickerOpen] = useState(false);
  const [exercisePickerZone, setExercisePickerZone] = useState(null);
  const [exercisePickerMuscle, setExercisePickerMuscle] = useState(null);
  const [exercisePickerName, setExercisePickerName] = useState(null);

  const [
    exercisePickerCardioType,
    setExercisePickerCardioType,
  ] = useState(null);

  const [exerciseGuideName, setExerciseGuideName] = useState(null);
  const [exerciseGuideHoldingName, setExerciseGuideHoldingName] = useState(null);
  const exerciseGuideProgress = useRef(new Animated.Value(0)).current;
  const exerciseGuideLongPressDone = useRef(false);

  const startExerciseGuideProgress = (name) => {
    if (!EXERCISE_GUIDES[name]) return;

    exerciseGuideLongPressDone.current = false;
    setExerciseGuideHoldingName(name);

    exerciseGuideProgress.stopAnimation();
    exerciseGuideProgress.setValue(0);

    Animated.timing(exerciseGuideProgress, {
      toValue: 1,
      duration: 1500,
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (!finished) return;

      exerciseGuideLongPressDone.current = true;

      Haptics.impactAsync(
        Haptics.ImpactFeedbackStyle.Medium
      ).catch(() => {});

      setExerciseGuideName(name);
      setExerciseGuideHoldingName(null);
    });
  };

  const cancelExerciseGuideProgress = () => {
    if (exerciseGuideLongPressDone.current) return;

    exerciseGuideProgress.stopAnimation();
    exerciseGuideProgress.setValue(0);
    setExerciseGuideHoldingName(null);
  };

  const openExerciseGuide = (name) => {
    if (!EXERCISE_GUIDES[name]) return;

    exerciseGuideLongPressDone.current = true;

    Haptics.impactAsync(
      Haptics.ImpactFeedbackStyle.Medium
    ).catch(() => {});

    setExerciseGuideName(name);
    setExerciseGuideHoldingName(null);
  };

  const [activeRoutine, setActiveRoutine] = useState(null);

  const [workoutExercises, setWorkoutExercises] = useState([]);
  const [workouts, setWorkouts] = useState([]);
  const [musclePeriod, setMusclePeriod] = useState(7);
const [selectedMuscle, setSelectedMuscle] = useState(null);
  const [checkedDays, setCheckedDays] = useState([]);
  const [workoutOrigin, setWorkoutOrigin] = useState('home');

  // RIVALSET · RESUMEN FINAL DEL ENTRENAMIENTO
  const [workoutSummary, setWorkoutSummary] = useState(null);

const [activeWorkoutLoaded, setActiveWorkoutLoaded] = useState(false);
useEffect(() => {
  const loadActiveWorkout = async () => {
    try {
      const savedWorkout = await AsyncStorage.getItem(ACTIVE_WORKOUT_KEY);

      if (savedWorkout) {
        const parsedWorkout = JSON.parse(savedWorkout);

        if (
          parsedWorkout?.activeRoutine &&
          Array.isArray(parsedWorkout?.workoutExercises) &&
          parsedWorkout.workoutExercises.length > 0
        ) {
          setActiveRoutine(parsedWorkout.activeRoutine);
          setWorkoutExercises(parsedWorkout.workoutExercises);
          setWorkoutOrigin(parsedWorkout.workoutOrigin || 'home');
          
        }
      }
    } catch (error) {
      console.log('Error cargando entrenamiento activo:', error);
    } finally {
      setActiveWorkoutLoaded(true);
    }
  };

  loadActiveWorkout();
}, []);
useEffect(() => {
  if (!activeWorkoutLoaded) return;
  if (!activeRoutine) return;
  if (!Array.isArray(workoutExercises) || workoutExercises.length === 0) return;

  const saveActiveWorkout = async () => {
    try {
      await AsyncStorage.setItem(
        ACTIVE_WORKOUT_KEY,
        JSON.stringify({
          activeRoutine,
          workoutExercises,
          workoutOrigin,
          savedAt: Date.now(),
        })
      );
    } catch (error) {
      console.log('Error guardando entrenamiento activo:', error);
    }
  };

  saveActiveWorkout();
}, [
  activeRoutine,
  workoutExercises,
  workoutOrigin,
  activeWorkoutLoaded,
]);
  const [profileName, setProfileName] = useState('');
  const [currentWeight, setCurrentWeight] = useState('');
  const [targetWeight, setTargetWeight] = useState('');
  const [startWeight, setStartWeight] = useState('');

  const [notificationsEnabled, setNotificationsEnabled] =
    useState(true);
const [settingsLoaded, setSettingsLoaded] =
  useState(false);
  const [vibrationEnabled, setVibrationEnabled] =
    useState(true);

  /* =====================================================
     APARIENCIA RIVALSET
  ===================================================== */

  const [appearanceMode, setAppearanceMode] =
    useState('dark');

  const [accentColor, setAccentColor] =
    useState(COLORS.orange);

  const isLightTheme = appearanceMode === 'light';

  // RIVALSET · textos secundarios del tema claro
  const lightSmallText = 'rgba(255,255,255,0.92)';

  const lightTextStyle = isLightTheme
    ? { color: lightSmallText }
    : null;

  const lightSecondaryText = isLightTheme
    ? 'rgba(255,255,255,0.88)'
    : null;

  const lightTertiaryText = isLightTheme
    ? 'rgba(255,255,255,0.72)'
    : null;

  const themeMutedText = isLightTheme
    ? 'rgba(255,255,255,0.82)'
    : COLORS.muted;

  const themeSoftText = isLightTheme
    ? 'rgba(255,255,255,0.68)'
    : '#626873';

  const LIGHT_THEME = {
    background: '#F5F3EE',
    backgroundTop: '#FFF1D6',
    card: 'rgba(255,255,255,0.78)',
    cardBorder: 'rgba(20,20,20,0.08)',
    text: '#171717',
    textSecondary: '#6F6F73',
    orange: accentColor,
  };

  const changeAccentColor = async (color) => {
    if (!color) return;

    applyAccentColor(color);
    styles = createRivalSetStyles();
    setAccentColor(color);

    try {
      await AsyncStorage.setItem(
        ACCENT_COLOR_KEY,
        color
      );
    } catch (error) {
      console.log(
        'Error guardando color de RivalSet:',
        error
      );
    }
  };

  const changeAppearance = async (mode) => {
    if (mode !== 'dark' && mode !== 'light') return;

    setAppearanceMode(mode);

    try {
      await AsyncStorage.setItem(
        APPEARANCE_KEY,
        mode
      );
    } catch (error) {
      console.log(
        'Error guardando apariencia:',
        error
      );
    }
  };

  useEffect(() => {
    const loadAppearance = async () => {
      try {
        const saved =
          await AsyncStorage.getItem(
            APPEARANCE_KEY
          );

        if (
          saved === 'dark' ||
          saved === 'light'
        ) {
          setAppearanceMode(saved);
        }
      } catch (error) {
        console.log(
          'Error cargando apariencia:',
          error
        );
      }
    };

    loadAppearance();
  }, []);

  useEffect(() => {
    const loadAccentColor = async () => {
      try {
        const savedColor =
          await AsyncStorage.getItem(
            ACCENT_COLOR_KEY
          );

        if (savedColor) {
          applyAccentColor(savedColor);
          styles = createRivalSetStyles();
          setAccentColor(savedColor);
        }
      } catch (error) {
        console.log(
          'Error cargando color de RivalSet:',
          error
        );
      }
    };

    loadAccentColor();
  }, []);



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
const [profilePhoto, photoBusy, editProfilePhoto, clearProfilePhoto] =
  useRivalSetPhoto(session?.user?.id);

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
      setSettingsLoaded(true);
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

  if (next) {
    if (Platform.OS !== 'web') {
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
          'Necesitas permitir las notificaciones para recibir los recordatorios.'
        );
        return;
      }
    }

    setNotificationsEnabled(true);

    await saveSettings(
      true,
      vibrationEnabled
    );

    await scheduleDailyNotifications();
  } else {
    setNotificationsEnabled(false);

    await saveSettings(
      false,
      vibrationEnabled
    );

    if (Platform.OS !== 'web') {
      await Notifications.cancelScheduledNotificationAsync(
        'rivalset-morning'
      ).catch(() => {});

      await Notifications.cancelScheduledNotificationAsync(
        'rivalset-evening'
      ).catch(() => {});
    }
  }

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
          'rivalset-default',
          {
            name: 'RivalSet',
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
          title: 'RivalSet',
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
const scheduleDailyNotifications = async () => {
  if (Platform.OS === 'web') return;

  try {
    const currentPermissions =
      await Notifications.getPermissionsAsync();

    let finalStatus = currentPermissions.status;

    if (finalStatus !== 'granted') {
      const requestedPermissions =
        await Notifications.requestPermissionsAsync();

      finalStatus = requestedPermissions.status;
    }

    if (finalStatus !== 'granted') {
      return;
    }

    await Notifications.cancelScheduledNotificationAsync(
      'rivalset-morning'
    ).catch(() => {});

    await Notifications.cancelScheduledNotificationAsync(
      'rivalset-evening'
    ).catch(() => {});

    await Notifications.scheduleNotificationAsync({
      identifier: 'rivalset-morning',
      content: {
        title:
          'Nuevo día, nueva oportunidad para seguir creciendo. 💪',
        sound: 'default',
        data: {
          type: 'morning-reminder',
        },
      },
      trigger: {
        type:
          Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: 8,
        minute: 0,
      },
    });

    await Notifications.scheduleNotificationAsync({
      identifier: 'rivalset-evening',
      content: {
        title: 'RivalSet',
        body:
          '🔥 ¿Listo para entrenar? Tu próxima sesión puede acercarte al primer puesto.',
        sound: 'default',
        data: {
          type: 'evening-reminder',
        },
      },
      trigger: {
        type:
          Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: 19,
        minute: 0,
      },
    });
  } catch (error) {
    console.log(
      'ERROR PROGRAMANDO NOTIFICACIONES:',
      error
    );
  }
};
useEffect(() => {
  if (!settingsLoaded) return;
  if (!notificationsEnabled) return;

  scheduleDailyNotifications();
}, [settingsLoaded, notificationsEnabled]);
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
  setLeagueName('');
  setRealLeaguePlayers([]);
  setCurrentLeagueId(null);
  setInviteCode('');
  await AsyncStorage.removeItem(LEAGUE_KEY);
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
    if (!inviteCode) {
      Alert.alert('Sin código', 'No se ha podido obtener el código de invitación.');
      return;
    }

    try {
      await impact(Haptics.ImpactFeedbackStyle.Medium);
      await Share.share({
        message: `Te invito a mi liga ${leagueName} en RivalSet. Código: ${inviteCode}`,
      });
    } catch (error) {
      Alert.alert('No se pudo compartir', `Código de tu liga: ${inviteCode}`);
    }
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

  /* =====================================================
     MOTOR DE PROGRESIÓN RIVALSET
  ===================================================== */

  const totalWorkouts = workouts.length;

  const workoutPRCount = (workout) =>
    (workout.exercises || []).reduce(
      (total, exercise) =>
        total +
        (exercise.sets || []).filter(
          (set) => !!set.prType
        ).length,
      0
    );

  const totalPRs = workouts.reduce(
    (total, workout) =>
      total + workoutPRCount(workout),
    0
  );

  const workoutsWithPR = workouts.filter(
    (workout) => workoutPRCount(workout) > 0
  ).length;

  const maxPRsInWorkout = workouts.reduce(
    (max, workout) =>
      Math.max(max, workoutPRCount(workout)),
    0
  );

  const prExerciseNames = new Set();

  workouts.forEach((workout) => {
    (workout.exercises || []).forEach((exercise) => {
      const hasPR = (exercise.sets || []).some(
        (set) => !!set.prType
      );

      if (hasPR && exercise.name) {
        prExerciseNames.add(
          normalizeExerciseName(exercise.name)
        );
      }
    });
  });

  const exercisesWithPR = prExerciseNames.size;

  const sortedWorkouts = [...workouts].sort(
    (a, b) =>
      new Date(a.finishedAt) -
      new Date(b.finishedAt)
  );

  let currentPRWorkoutStreak = 0;
  let maxPRWorkoutStreak = 0;

  sortedWorkouts.forEach((workout) => {
    if (workoutPRCount(workout) > 0) {
      currentPRWorkoutStreak += 1;
      maxPRWorkoutStreak = Math.max(
        maxPRWorkoutStreak,
        currentPRWorkoutStreak
      );
    } else {
      currentPRWorkoutStreak = 0;
    }
  });

  const perfectWeekProgress = (() => {
    const weeks = {};

    workouts.forEach((workout) => {
      const weekKey = localDayKey(
        mondayFor(workout.finishedAt)
      );

      if (!weeks[weekKey]) {
        weeks[weekKey] = new Set();
      }

      if (workoutPRCount(workout) > 0) {
        weeks[weekKey].add(
          localDayKey(workout.finishedAt)
        );
      }
    });

    return Math.max(
      0,
      ...Object.values(weeks).map(
        (days) => days.size
      )
    );
  })();

  const achievementProgress = (achievement) => {
    switch (achievement.type) {
      case 'uniqueDays':
        return uniqueTrainingDays;

      case 'elapsedWeeks':
        return elapsedWeeks;

      case 'activeWeeks':
        return activeWeeks;

      case 'workouts':
        return totalWorkouts;

      case 'totalPRs':
        return totalPRs;

      case 'prsInWorkout':
        return maxPRsInWorkout;

      case 'exercisesWithPR':
        return exercisesWithPR;

      case 'prWorkoutStreak':
        return maxPRWorkoutStreak;

      case 'perfectWeek':
        return perfectWeekProgress;

      case 'workoutsWithPR':
        return workoutsWithPR;

      default:
        return 0;
    }
  };

  const unlockedAchievementItems = ACHIEVEMENTS.filter(
    (item) =>
      achievementProgress(item) >= item.target
  );

  const unlockedAchievements =
    unlockedAchievementItems.length;

  const achievementXP =
    unlockedAchievementItems.reduce(
      (total, item) => total + (item.xp || 0),
      0
    );

  const xpNeededForLevel = (level) => {
    if (level <= 20) return 20;
    if (level <= 40) return 30;
    if (level <= 60) return 40;
    return 50;
  };

  const calculateRivalSetLevel = (xp) => {
    let level = 1;
    let remainingXP = xp;

    while (
      level < 80 &&
      remainingXP >= xpNeededForLevel(level)
    ) {
      remainingXP -= xpNeededForLevel(level);
      level += 1;
    }

    const needed =
      level >= 80
        ? 0
        : xpNeededForLevel(level);

    return {
      level,
      currentXP:
        level >= 80 ? 0 : remainingXP,
      neededXP: needed,
      percent:
        level >= 80
          ? 100
          : Math.min(
              100,
              (remainingXP / needed) * 100
            ),
    };
  };

  const rivalSetLevel =
    calculateRivalSetLevel(achievementXP);

  const levelTier =
    rivalSetLevel.level <= 20
      ? 'bronze'
      : rivalSetLevel.level <= 40
      ? 'silver'
      : rivalSetLevel.level <= 60
      ? 'gold'
      : 'diamond';

  const levelTierName =
    levelTier === 'bronze'
      ? 'BRONCE'
      : levelTier === 'silver'
      ? 'PLATA'
      : levelTier === 'gold'
      ? 'ORO'
      : 'DIAMANTE';

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

          const currentVariant =
            String(
              exercise.variant ||
              exercise.equipment ||
              ''
            )
              .trim()
              .toLowerCase();

          const historicalVariant =
            String(
              historicalExercise.variant ||
              historicalExercise.equipment ||
              ''
            )
              .trim()
              .toLowerCase();

          const sameVariant =
            currentVariant === historicalVariant;

          if (
            (!sameId && !sameName) ||
            !sameVariant
          ) {
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


  /* =====================================================
     RIVALSET · ÚLTIMA SESIÓN DE FUERZA
     Valores anteriores para cada serie
  ===================================================== */

  const getPreviousStrengthExerciseSets = (exercise) => {
    const normalized = normalizeExerciseName(
      exercise.name
    );

    const exerciseId = exercise.id;

    const currentVariant = String(
      exercise.variant ||
      exercise.equipment ||
      ''
    )
      .trim()
      .toLowerCase();

    const ordered = [...workouts].sort(
      (a, b) =>
        new Date(b.finishedAt || 0).getTime() -
        new Date(a.finishedAt || 0).getTime()
    );

    for (const workout of ordered) {
      const historicalExercise =
        (workout.exercises || []).find(
          (item) => {
            const sameId =
              exerciseId !== undefined &&
              exerciseId !== null &&
              item.id !== undefined &&
              item.id !== null &&
              item.id === exerciseId;

            const sameName =
              normalizeExerciseName(
                item.name
              ) === normalized;

            const historicalVariant = String(
              item.variant ||
              item.equipment ||
              ''
            )
              .trim()
              .toLowerCase();

            return (
              (sameId || sameName) &&
              historicalVariant === currentVariant
            );
          }
        );

      if (!historicalExercise) continue;

      const historicalSets = Array.isArray(
        historicalExercise.sets
      )
        ? historicalExercise.sets
            .filter(
              (set) =>
                set.completed !== false
            )
            .map((set) => ({
              weight: parseNumber(set.weight),
              reps: parseNumber(set.reps),
            }))
            .filter(
              (set) =>
                set.weight !== null &&
                set.reps !== null
            )
        : [];

      if (historicalSets.length > 0) {
        return historicalSets;
      }
    }

    return [];
  };


  /* =====================================================
     RIVALSET · RÉCORDS CARDIO
     +3 puntos mediante el mismo sistema de PR de fuerza
  ===================================================== */

  const getHistoricalCardioSets = (exercise) => {
    const normalized =
      normalizeExerciseName(exercise.name);

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

          const currentVariant = String(
            exercise.variant ||
            exercise.equipment ||
            ''
          )
            .trim()
            .toLowerCase();

          const historicalVariant = String(
            historicalExercise.variant ||
            historicalExercise.equipment ||
            ''
          )
            .trim()
            .toLowerCase();

          const sameVariant =
            currentVariant === historicalVariant;

          if (
            (!sameId && !sameName) ||
            !sameVariant
          ) {
            return;
          }

          (historicalExercise.sets || []).forEach(
            (set) => {
              if (set.completed === false) {
                return;
              }

              const duration =
                parseNumber(set.duration);

              const distance =
                parseNumber(set.distance);

              if (
                duration !== null &&
                duration > 0 &&
                distance !== null &&
                distance > 0
              ) {
                result.push({
                  duration,
                  distance,
                });
              }
            }
          );
        }
      );
    });

    return result;
  };

  const formatCardioDuration = (minutes) => {
    const totalSeconds = Math.round(
      Number(minutes) * 60
    );

    const hours = Math.floor(
      totalSeconds / 3600
    );

    const mins = Math.floor(
      (totalSeconds % 3600) / 60
    );

    const secs = totalSeconds % 60;

    if (hours > 0) {
      return `${hours}:${String(mins).padStart(
        2,
        '0'
      )}:${String(secs).padStart(2, '0')}`;
    }

    return `${mins}:${String(secs).padStart(
      2,
      '0'
    )}`;
  };

  const formatCardioPace = (
    duration,
    distance
  ) => {
    if (
      !duration ||
      !distance ||
      distance <= 0
    ) {
      return null;
    }

    const secondsPerKm =
      Math.round(
        (duration * 60) / distance
      );

    const mins = Math.floor(
      secondsPerKm / 60
    );

    const secs =
      secondsPerKm % 60;

    return `${mins}:${String(secs).padStart(
      2,
      '0'
    )}/km`;
  };

  const detectCardioPR = (
    exercise,
    targetSet
  ) => {
    const duration =
      parseNumber(targetSet.duration);

    const distance =
      parseNumber(targetSet.distance);

    if (
      duration === null ||
      duration <= 0 ||
      distance === null ||
      distance <= 0
    ) {
      return null;
    }

    const historical =
      getHistoricalCardioSets(exercise);

    /*
     * Igual que fuerza:
     * la primera sesión crea referencia,
     * pero NO da +3.
     */
    if (historical.length === 0) {
      return null;
    }

    const currentCompleted =
      (exercise.sets || [])
        .filter(
          (set) =>
            set.id !== targetSet.id &&
            set.completed
        )
        .map((set) => ({
          duration:
            parseNumber(set.duration),
          distance:
            parseNumber(set.distance),
        }))
        .filter(
          (set) =>
            set.duration !== null &&
            set.duration > 0 &&
            set.distance !== null &&
            set.distance > 0
        );

    const comparison = [
      ...historical,
      ...currentCompleted,
    ];

    /*
     * Tolerancia de distancia:
     * evita que 5 km y 5.01 km dejen de ser
     * comparables por pequeñas diferencias.
     *
     * 1% con mínimo de 0.05 km.
     */
    const distanceTolerance =
      Math.max(
        0.05,
        distance * 0.01
      );

    // --------------------------------------------------
    // PR 1:
    // MISMA DISTANCIA EN MENOS TIEMPO
    // --------------------------------------------------

    const sameDistance =
      comparison.filter(
        (old) =>
          Math.abs(
            old.distance - distance
          ) <= distanceTolerance
      );

    if (sameDistance.length > 0) {
      const previousBest =
        Math.min(
          ...sameDistance.map(
            (old) => old.duration
          )
        );

      if (
        duration <
        previousBest - 0.01
      ) {
        const previousPace =
          formatCardioPace(
            previousBest,
            distance
          );

        const newPace =
          formatCardioPace(
            duration,
            distance
          );

        return {
          type: 'cardio_time',
          distance,
          previousDuration:
            previousBest,
          newDuration: duration,
          previousPace,
          newPace,
          text:
            `${distance} km · ` +
            `${formatCardioDuration(
              previousBest
            )} → ` +
            `${formatCardioDuration(
              duration
            )}` +
            (newPace
              ? ` · ${newPace}`
              : ''),
        };
      }
    }

    // --------------------------------------------------
    // PR 2:
    // MISMO TIEMPO, MÁS DISTANCIA
    // --------------------------------------------------

    const durationTolerance =
      Math.max(
        0.1,
        duration * 0.01
      );

    const sameDuration =
      comparison.filter(
        (old) =>
          Math.abs(
            old.duration - duration
          ) <= durationTolerance
      );

    if (sameDuration.length > 0) {
      const previousDistance =
        Math.max(
          ...sameDuration.map(
            (old) => old.distance
          )
        );

      if (
        distance >
        previousDistance + 0.01
      ) {
        const newPace =
          formatCardioPace(
            duration,
            distance
          );

        return {
          type: 'cardio_distance',
          duration,
          previousDistance,
          newDistance: distance,
          newPace,
          text:
            `${formatCardioDuration(
              duration
            )} · ` +
            `${previousDistance} → ` +
            `${distance} km` +
            (newPace
              ? ` · ${newPace}`
              : ''),
        };
      }
    }

    return null;
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

  const [expandedHistoryWorkoutId, setExpandedHistoryWorkoutId] =
    useState(null);

  const [expandedRoutineCardId, setExpandedRoutineCardId] =
    useState(null);

  /* =====================================================
     NAVEGACIÓN
  ===================================================== */

const startWorkout = async () => {
  await impact(
    Haptics.ImpactFeedbackStyle.Medium
  );

  if (routines.length === 0) {
    setSelectedTab('Rutinas');
    setScreen('routines');
    return;
  }

  setWorkoutOrigin('home');
  setScreen('quickStart');
};
  const openProfile = () => {
    setScreen('profile');
  };

  const openPrivateLeagues = () => {
    setScreen('league');
  };

  const openTab = (tab) => {
    setSelectedTab(tab);

    if (tab === 'Inicio') {
      setScreen('home');
    }

if (tab === 'Liga') {
    setScreen('globalLeague');
    return;
  }    if (tab === 'Historial') {
      setScreen('history');
    }

    if (tab === 'Rutinas') {
      setScreen('routines');
    }
    if (tab === 'Nutrición') {
  setScreen('nutrition');
}
  };


  const goBack = async () => {
    await impact();

    if (screen === 'editor') {
      setEditingRoutineId(null);
      setScreen('routines');
      } else if (screen === 'templates') {
        setExpandedTemplateId(null);
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

  const analyzeImportedRoutine = async (asset) => {
    if (!asset?.base64) {
      Alert.alert(
        'Error',
        'No se ha podido leer la imagen seleccionada.'
      );
      return;
    }

    try {
      const exerciseCatalog = [
        ...new Set(
          EXERCISE_LIBRARY.map((exercise) => exercise.name)
        ),
      ];

      const { data, error } = await supabase.functions.invoke(
        'analyze-routine',
        {
          body: {
            imageBase64: asset.base64,
            mimeType: asset.mimeType || 'image/jpeg',
            exerciseCatalog,
          },
        }
      );

      if (error) {
        console.log('Error importando rutina:', error);

        Alert.alert(
          'No se pudo analizar',
          'No hemos podido leer la rutina de esta imagen.'
        );
        return;
      }

      if (!data?.exercises?.length) {
        Alert.alert(
          'No se encontró una rutina',
          'Prueba con una imagen donde los ejercicios, series y repeticiones se vean con claridad.'
        );
        return;
      }

      const importedExercises = data.exercises.map(
        (detected, index) => {
          const detectedName =
            String(detected.matchedName || detected.detectedName || '')
              .trim();

          const normalizedDetectedName = detectedName
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase();

          const libraryExercise =
            EXERCISE_LIBRARY.find((exercise) => {
              const normalizedLibraryName = exercise.name
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .toLowerCase();

              return normalizedLibraryName === normalizedDetectedName;
            }) || null;

          const series = String(
            Math.max(1, Number(detected.sets) || 1)
          );

          const reps = String(detected.reps || '');
          const weight = String(detected.weight || '');

          const base = {
            ...emptyExercise(),
            id: Date.now() + index + Math.random(),
            name: libraryExercise?.name || detectedName,
            series,
            reps,
            weight,
          };

          if (!libraryExercise) {
            return base;
          }

          return {
            ...base,
            exerciseId: libraryExercise.id,
            name: libraryExercise.name,
            variant: libraryExercise.variant,
            equipment: libraryExercise.equipment,
            primaryMuscles: [
              ...(libraryExercise.primaryMuscles || []),
            ],
            secondaryMuscles: [
              ...(libraryExercise.secondaryMuscles || []),
            ],
            muscles: [
              ...(libraryExercise.primaryMuscles || []),
              ...(libraryExercise.secondaryMuscles || []),
            ],
          };
        }
      );

      setEditingRoutineId(null);
      setRoutineName(
        String(data.routineName || 'Rutina importada')
      );
      setDraftExercises(importedExercises);
      setScreen('editor');

      const reviewCount = data.exercises.filter(
        (exercise) => exercise.needsReview
      ).length;

      if (reviewCount > 0) {
        setTimeout(() => {
          Alert.alert(
            'Rutina importada',
            `Se han detectado ${importedExercises.length} ejercicios. ${reviewCount} necesitan revisión antes de guardar.`
          );
        }, 350);
      }
    } catch (error) {
      console.log('Error analizando rutina:', error);

      Alert.alert(
        'Error',
        'No se ha podido analizar la rutina.'
      );
    }
  };

  const beginCreate = async () => {
    await impact(
      Haptics.ImpactFeedbackStyle.Medium
    );

    setEditingRoutineId(null);
    setRoutineName('');
    setDraftExercises([]);
    setScreen('editor');
  };


  const openTemplates = async () => {
    await impact(
      Haptics.ImpactFeedbackStyle.Medium
    );

    setTemplateDays(2);
    setExpandedTemplateId(null);
    setScreen('templates');
  };

  const installRoutineTemplate = async (
    template
  ) => {
    const alreadyInstalled = routines.some(
      (routine) =>
        routine.templateId === template.id
    );

    if (alreadyInstalled) {
      Alert.alert(
        'Plantilla ya añadida',
        'Ya tienes esta plantilla entre tus rutinas.'
      );
      return;
    }

    const baseId = Date.now();

    const createdRoutines = template.days.map(
      (day, dayIndex) => ({
        id: baseId + dayIndex,
        name: day.name,
        templateId: template.id,
        exercises: day.exercises.map(
          (exercise, exerciseIndex) => {
            const seriesCount = Math.max(
              1,
              parseInt(exercise.series, 10) || 1
            );

            return {
              ...exercise,
              id:
                baseId +
                (dayIndex + 1) * 1000 +
                exerciseIndex +
                Math.random(),
              muscles: [...exercise.muscles],
              primaryMuscles: [
                ...exercise.primaryMuscles,
              ],
              secondaryMuscles: [
                ...exercise.secondaryMuscles,
              ],
              setsTemplate: Array.from(
                { length: seriesCount },
                () => ({
                  weight: '',
                  reps: exercise.reps,
                })
              ),
            };
          }
        ),
      })
    );

    await persistRoutines([
      ...routines,
      ...createdRoutines,
    ]);

    await notificationHaptic(
      Haptics.NotificationFeedbackType.Success
    );

    setExpandedTemplateId(null);
    setScreen('routines');

    Alert.alert(
      'Plantilla añadida',
      `${template.title} se ha añadido a tus rutinas.`
    );
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
    const templateFields = [
      'series',
      'reps',
      'weight',
      'duration',
      'distance',
      'heartRate',
      'cardioEnvironment',
      'cardioActivity',
    ];

    setDraftExercises((items) =>
      items.map((item) =>
        item.id === id
          ? {
              ...item,
              [field]: value,
              repRange:
                field === 'reps'
                  ? undefined
                  : item.repRange,
              setsTemplate: templateFields.includes(field)
                ? undefined
                : item.setsTemplate,
            }
          : item
      )
    );
  };

const addLibraryExercise = async (libraryExercise) => {
  await impact();

  const newExercise = {
    ...emptyExercise(),
    exerciseId: libraryExercise.id,
    name: libraryExercise.name,
    variant: libraryExercise.variant,
    equipment: libraryExercise.equipment,
    primaryMuscles: [...(libraryExercise.primaryMuscles || [])],
    secondaryMuscles: [...(libraryExercise.secondaryMuscles || [])],
    muscles: [
      ...(libraryExercise.primaryMuscles || []),
      ...(libraryExercise.secondaryMuscles || []),
    ],
  };

  if (screen === 'workout') {
    const liveExercise = {
      ...newExercise,
      isExtraWorkoutExercise: true,
      expanded: true,
      sets: buildWorkoutSets(newExercise),
    };

    setWorkoutExercises((items) => [
      ...items,
      liveExercise,
    ]);
  } else {
    setDraftExercises((items) => {
      const isInitialEmpty =
        items.length === 1 &&
        !items[0].name &&
        !items[0].series &&
        !items[0].reps &&
        !items[0].weight;

      return isInitialEmpty
        ? [newExercise]
        : [...items, newExercise];
    });
  }

  setExercisePickerOpen(false);
  setExercisePickerZone(null);
  setExercisePickerMuscle(null);
  setExercisePickerName(null);
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

      if (muscle === 'Cardio') {
        const selectingCardio =
          !current.includes('Cardio');

        const nextMuscles = selectingCardio
          ? ['Cardio']
          : [];

        return {
          ...exercise,
          setsTemplate: undefined,
          muscles: nextMuscles,
          primaryMuscles: nextMuscles,
          secondaryMuscles: [],
          muscle: undefined,
          series: selectingCardio ? '' : exercise.series,
          reps: selectingCardio ? '' : exercise.reps,
          weight: selectingCardio ? '' : exercise.weight,
        };
      }

      const withoutCardio = current.filter(
        (item) => item !== 'Cardio'
      );

      const next = withoutCardio.includes(muscle)
        ? withoutCardio.filter(
            (item) => item !== muscle
          )
        : [...withoutCardio, muscle];

      return {
        ...exercise,
        setsTemplate: undefined,
        muscles: next,
        primaryMuscles: next,
        secondaryMuscles: [],
        muscle: undefined,
        duration: '',
        distance: '',
        heartRate: '',
        cardioEnvironment: '',
        cardioActivity: '',
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
    duration: (item.duration || '').trim(),
    distance: (item.distance || '').trim(),
    heartRate: (item.heartRate || '').trim(),
    cardioEnvironment: item.cardioEnvironment || '',
    cardioActivity: item.cardioActivity || '',
    muscles: getExerciseMuscles(item),
  }))
  .filter(
    (item) =>
      item.name ||
      item.series ||
      item.reps ||
      item.weight ||
      item.duration ||
      item.distance ||
      item.heartRate ||
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
  clean.some((item) => {
    const isCardio = isCardioExercise(item);

    if (!item.name || item.muscles.length === 0) {
      return true;
    }

    if (isCardio) {
      const duration = parseNumber(item.duration);

      return duration === null || duration <= 0;
    }

    return !item.series || !item.reps;
  })
) {
  Alert.alert(
    'Revisa los ejercicios',
    'Los ejercicios de fuerza necesitan nombre, series, repeticiones y grupo muscular. Cardio necesita nombre y duración.'
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
      setDraftExercises([]);
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
    setDraftExercises([]);
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
  origin = workoutOrigin || 'home',
  replaceActive = false
) => {
  const hasActiveWorkout =
    activeWorkoutLoaded &&
    activeRoutine &&
    Array.isArray(workoutExercises) &&
    workoutExercises.length > 0;

  if (hasActiveWorkout && !replaceActive) {
    if (String(activeRoutine.id) === String(routine.id)) {
      setScreen('workout');
      return;
    }

    Alert.alert(
      'Entrenamiento en curso',
      `Tienes «${activeRoutine.name}» abierto. ¿Qué quieres hacer?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Seguir el anterior',
          onPress: () => setScreen('workout'),
        },
        {
          text: 'Empezar la nueva rutina',
          style: 'destructive',
          onPress: () => openWorkout(routine, origin, true),
        },
      ]
    );
    return;
  }

  await impact(Haptics.ImpactFeedbackStyle.Heavy);

  setActiveRoutine(routine);
  setWorkoutExercises(
    routine.exercises.map((exercise, index) => ({
      ...exercise,
      muscles: getExerciseMuscles(exercise),
      expanded: index === 0,
      sets: buildWorkoutSets(exercise),
    }))
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

const isCardio = isCardioExercise(exercise);

const duration = parseNumber(
  targetSet.duration
);

const weight = parseNumber(
  targetSet.weight
);

const reps = parseNumber(
  targetSet.reps
);

if (isCardio) {
  if (
    duration === null ||
    duration <= 0
  ) {
    Alert.alert(
      'Revisa la duración',
      'Introduce los minutos realizados para completar el cardio.'
    );

    return;
  }
} else {
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
}
const pr = isCardio
  ? detectCardioPR(
      exercise,
      targetSet
    )
  : detectPR(
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

  const updateRoutineFromWorkout = async (
    exerciseSnapshot = workoutExercises
  ) => {
    if (activeRoutine?.id == null) return;

    let baseRoutines = routines;

    try {
      const storedRoutines =
        await AsyncStorage.getItem(ROUTINES_KEY);

      const parsedRoutines = storedRoutines
        ? JSON.parse(storedRoutines)
        : null;

      if (Array.isArray(parsedRoutines)) {
        baseRoutines = parsedRoutines;
      }
    } catch {}

    const routineExists = baseRoutines.some(
      (routine) =>
        String(routine.id) ===
        String(activeRoutine.id)
    );

    if (!routineExists) return;

    const updatedExercises =
      exerciseSnapshot.map(
        routineExerciseFromWorkout
      );

    const nextRoutines = baseRoutines.map(
      (routine) =>
        String(routine.id) ===
        String(activeRoutine.id)
          ? {
              ...routine,
              exercises: updatedExercises,
            }
          : routine
    );

    await persistRoutines(nextRoutines);
  };

  const recordWorkout = async () => {
    if (workoutSaved.current) {
      return 0;
    }

    workoutSaved.current = true;

    let awardedLeaguePoints = 0;

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
   }

    /*
     * ==========================================
     * RIVALSET · GLOBAL LEAGUE
     * ==========================================
     *
     * Se ejecuta SIEMPRE al terminar un entreno,
     * aunque el usuario no pertenezca a una
     * liga privada.
     *
     * El servidor controla:
     * - 1 entrenamiento puntuable al día
     * - máximo 7 por semana
     * - duplicados
     * - +10 entrenamiento
     * - +3 por récord
     */

    const workoutKey =
      `${finishedAt}-${activeRoutine?.id || 'quick'}`;

    const recordPoints =
      totalCurrentPRs * 3;

    try {
      const {
        data: globalPointsAwarded,
        error: globalScoreError,
      } = await supabase.rpc(
        'score_global_workout',
        {
          target_workout_key: workoutKey,
          target_record_points: recordPoints,
        }
      );

      if (globalScoreError) {
        throw globalScoreError;
      }

      console.log(
        'RIVALSET · GLOBAL:',
        Number(globalPointsAwarded) || 0,
        'PTS'
      );

    } catch (error) {
      console.log(
        'ERROR PUNTUANDO GLOBAL:',
        error
      );
    }


    /*
     * ==========================================
     * RIVALSET · LIGA DE AMIGOS
     * ==========================================
     *
     * Conservamos la lógica existente.
     * El servidor sigue controlando el máximo
     * de 4 entrenamientos puntuables/semana.
     */

    if (currentLeagueId) {
  try {
    const { data: pointsAwarded, error: scoreError } = await supabase.rpc(
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

    awardedLeaguePoints =
      Number(pointsAwarded) || 0;

    console.log(
      'RIVALSET · PUNTOS ENTRENAMIENTO:',
      awardedLeaguePoints
    );

    // RIVALSET: avisar al resto de la liga solo si este entreno ha puntuado.
    if (awardedLeaguePoints > 0) {
      const { error: pushError } = await supabase.functions.invoke(
        'notify-league-workout',
        {
          body: {
            league_id: currentLeagueId,
            workout_key: workoutKey,
          },
        }
      );

      if (pushError) {
        console.log(
          'ERROR ENVIANDO NOTIFICACIÓN DE LIGA:',
          pushError
        );
      }
    }

    await loadRealLeaguePlayers();
  } catch (error) {
    console.log('ERROR PUNTUANDO ENTRENAMIENTO:', error);
  }
}

    return awardedLeaguePoints;
  };

  const finishWorkout = () => {
    const allSets = workoutExercises.flatMap(
      (exercise) => exercise.sets || []
    );

    const pending = allSets.filter(
      (set) => !set.completed
    ).length;

    const finish = async () => {
      /*
       * IMPORTANTE:
       * capturamos todo ANTES de vaciar workoutExercises.
       */
      const exerciseSnapshot =
        workoutExercises.map((exercise) => ({
          ...exercise,
          sets: (exercise.sets || []).map(
            (set) => ({ ...set })
          ),
        }));

      const routineSnapshot = activeRoutine
        ? { ...activeRoutine }
        : null;

      const originSnapshot = workoutOrigin;

      const prListSnapshot =
        exerciseSnapshot.flatMap((exercise) =>
          (exercise.sets || [])
            .filter((set) => !!set.prType)
            .map((set) => ({
              id: set.id,
              exercise: exercise.name,
              type: set.prType,
              text: set.prText || '',
            }))
        );

      const completedSets =
        exerciseSnapshot.flatMap(
          (exercise) => exercise.sets || []
        ).filter((set) => set.completed).length;

      await updateRoutineFromWorkout(
        exerciseSnapshot
      );

      /*
       * Aquí obtenemos EXACTAMENTE lo que Supabase
       * haya concedido: 0, 10, 13, 16...
       */
      const pointsAwarded =
        await recordWorkout();

      const cardioExercises =
        exerciseSnapshot.filter(
          (exercise) =>
            isCardioExercise(exercise)
        );

      const isCardioWorkout =
        cardioExercises.length > 0;

      let cardioSummary = null;

      if (isCardioWorkout) {
        /*
         * Si hay varios ejercicios de cardio,
         * acumulamos tiempo y distancia.
         */
        let totalDuration = 0;
        let totalDistance = 0;
        let heartRateTotal = 0;
        let heartRateCount = 0;

        cardioExercises.forEach((exercise) => {
          (exercise.sets || []).forEach(
            (set) => {
              if (!set.completed) return;

              const duration =
                parseNumber(set.duration);

              const distance =
                parseNumber(set.distance);

              const heartRate =
                parseNumber(set.heartRate);

              if (
                duration !== null &&
                duration > 0
              ) {
                totalDuration += duration;
              }

              if (
                distance !== null &&
                distance > 0
              ) {
                totalDistance += distance;
              }

              if (
                heartRate !== null &&
                heartRate > 0
              ) {
                heartRateTotal += heartRate;
                heartRateCount += 1;
              }
            }
          );
        });

        const paceSeconds =
          totalDuration > 0 &&
          totalDistance > 0
            ? Math.round(
                (totalDuration * 60) /
                  totalDistance
              )
            : null;

        const paceText =
          paceSeconds !== null
            ? `${Math.floor(
                paceSeconds / 60
              )}:${String(
                paceSeconds % 60
              ).padStart(2, '0')}/km`
            : '—';

        const durationSeconds =
          Math.round(totalDuration * 60);

        const durationText =
          durationSeconds >= 3600
            ? `${Math.floor(
                durationSeconds / 3600
              )}:${String(
                Math.floor(
                  (durationSeconds % 3600) /
                    60
                )
              ).padStart(2, '0')}:${String(
                durationSeconds % 60
              ).padStart(2, '0')}`
            : `${Math.floor(
                durationSeconds / 60
              )}:${String(
                durationSeconds % 60
              ).padStart(2, '0')}`;

        cardioSummary = {
          distance:
            totalDistance > 0
              ? Number(
                  totalDistance.toFixed(2)
                )
              : null,

          duration:
            totalDuration > 0
              ? durationText
              : '—',

          pace: paceText,

          heartRate:
            heartRateCount > 0
              ? Math.round(
                  heartRateTotal /
                    heartRateCount
                )
              : null,
        };
      }

      const recordPoints =
        prListSnapshot.length * 3;

      /*
       * Los puntos reales son los que manda Supabase.
       * Calculamos qué parte corresponde al entrenamiento
       * sin asumir que siempre sean 10.
       */
      const realPoints =
        Number(pointsAwarded) || 0;

      const realRecordPoints =
        Math.min(
          recordPoints,
          realPoints
        );

      const basePoints =
        Math.max(
          0,
          realPoints - realRecordPoints
        );

      setWorkoutSummary({
        routineName:
          routineSnapshot?.name ||
          'Entrenamiento',

        origin: originSnapshot,

        exercises: exerciseSnapshot,

        exerciseCount:
          exerciseSnapshot.length,

        completedSets,

        prList: prListSnapshot,

        prCount:
          prListSnapshot.length,

        cardio:
          cardioSummary,

        isCardio:
          isCardioWorkout,

        points: {
          total: realPoints,
          base: basePoints,
          records: realRecordPoints,
        },
      });

      await AsyncStorage.removeItem(
        ACTIVE_WORKOUT_KEY
      );

      setActiveRoutine(null);
      setWorkoutExercises([]);

      await notificationHaptic(
        Haptics.NotificationFeedbackType.Success
      );

      /*
       * Ya no mostramos el Alert antiguo de PR.
       * Toda la información aparece en el resumen.
       */
      setScreen('workoutSummary');
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
        'rgba(46,34,15,0.72)',
        'rgba(44,33,15,0.72)',
        'rgba(42,32,15,0.72)',
      ]}
      locations={[0, 0.5, 1]}
      style={styles.navigation}
    >
      {[
        'Inicio',
        'Liga',
        'Historial',
        'Rutinas',
        'Nutrición',
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
                  ? accentColor
                  : '#A8ABB2'
              }
              style={styles.navVectorIcon}
            />
            ) : tab === 'Nutrición' ? (
  <MaterialCommunityIcons
    name="silverware-fork-knife"
    size={22}
    color={
      selectedTab === tab
        ? accentColor
        : '#A8ABB2'
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
          ? accentColor
          : ('#A8ABB2'),
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
              ? accentColor
              : ('#A8ABB2'),
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
      ? accentColor
      : '#A8ABB2'
  }
  style={styles.navVectorIcon}
/>
)}

          <Text
            style={[
              styles.navText,
              selectedTab === tab &&
                styles.navTextSelected,
              selectedTab === tab && {
                color: accentColor,
              },
            ]}
          >
            {tab}
          </Text>

          {selectedTab === tab && (
            <View
              style={[
                styles.navIndicator,
                { backgroundColor: accentColor },
              ]}
            />
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

        <Text style={[styles.pageSubtitle, lightTextStyle]}>
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
        

        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.homeScrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <View>
              <Text
                style={[
                  styles.hello,
                  {
                    color: COLORS.orange,
                    fontStyle: 'italic',
                    fontWeight: '900',
                    letterSpacing: -1.2,
                  },
                  {
                    fontSize: 30,
                    fontWeight: '900',
                    letterSpacing: -1.25,
                    lineHeight: 32,
                  },
                ]}
              >
                RivalSet
              </Text>

              <Text
                style={[
                  styles.subtitle,
                  lightTextStyle,
                  {
                    fontSize: 10,
                    fontWeight: '800',
                    letterSpacing: 1.65,
                    marginTop: 5,
                  },
                ]}
              >
                SUPÉRATE DÍA A DÍA
              </Text>
            </View>

            <View style={{
    flexDirection: 'row', alignItems: 'center', gap: 10
  }}>
<RivalSetSideMenu
              photoUri={profilePhoto}
              profileName={profileName}
              onPress={openProfile}
              onLeaguesPress={openPrivateLeagues}
              vibrationEnabled={vibrationEnabled}
              isLightTheme={isLightTheme}
              accentColor={accentColor}
            /></View>
          </View>

          <View style={styles.gameLevelCard}>

            <View style={styles.gameLevelMain}>

              <View style={styles.gameMedalZone}>
                <View style={styles.gameMedalRing}>
                  <View style={styles.gameMedalScale}>
                    <Medal
                      tier={levelTier}
                      size="large"
                      unlocked
                    />
                  </View>
                </View>

                <View style={styles.gameRankPill}>
                  <Text style={styles.gameRankPillText}>
                    {levelTierName}
                  </Text>
                </View>
              </View>

              <View style={styles.gameLevelData}>

                <View style={styles.gameLevelHeader}>
                  <View>
                    <Text style={styles.gameLevelOverline}>
                      TU NIVEL
                    </Text>

                    <View style={styles.gameLevelNumberRow}>
                      <Text style={styles.gameLevelNumber}>
                        {rivalSetLevel.level}
                      </Text>

                      <Text style={styles.gameLevelMax}>
                        /80
                      </Text>
                    </View>
                  </View>

                  <TouchableOpacity
                    activeOpacity={0.75}
                    onPress={() => setScreen('achievements')}
                    style={styles.gameTrophyButton}
                  >
                    <MaterialCommunityIcons
                      name="trophy-outline"
                      size={17}
                      color={COLORS.orange}
                    />
                  </TouchableOpacity>
                </View>

                <View style={styles.gameXPTop}>
                  <Text style={styles.gameXPText}>
                    {rivalSetLevel.level >= 80
                      ? `${achievementXP} XP`
                      : `${rivalSetLevel.currentXP} XP`}
                  </Text>

                  <Text style={styles.gameXPPercent}>
                    {Math.round(rivalSetLevel.percent)}%
                  </Text>
                </View>

                <View style={styles.gameXPTrack}>
                  <View
                    style={[
                      styles.gameXPFill,
                      {
                        width: `${rivalSetLevel.percent}%`,
                      },
                    ]}
                  />
                </View>

                <Text style={styles.gameXPRemaining}>
                  {rivalSetLevel.level >= 80
                    ? 'NIVEL MÁXIMO'
                    : `${Math.max(
                        0,
                        rivalSetLevel.neededXP -
                          rivalSetLevel.currentXP
                      )} XP PARA NIVEL ${rivalSetLevel.level + 1}`}
                </Text>

              </View>
            </View>

            <TouchableOpacity
              activeOpacity={0.78}
              onPress={() => setScreen('achievements')}
              style={styles.gameMission}
            >
              <View style={styles.gameMissionIcon}>
                <MaterialCommunityIcons
                  name="target"
                  size={16}
                  color={COLORS.orange}
                />
              </View>

              <View style={styles.gameMissionContent}>
                <Text style={styles.gameMissionLabel}>
                  PRÓXIMO RETO
                </Text>

                <Text
                  numberOfLines={1}
                  style={styles.gameMissionTitle}
                >
                  {nextAchievement.title}
                </Text>
              </View>

              <View style={styles.gameMissionProgress}>
                <Text style={styles.gameMissionValue}>
                  {nextValue}/{nextAchievement.target}
                </Text>

                <MaterialCommunityIcons
                  name="chevron-right"
                  size={16}
                  color="#6D727A"
                />
              </View>
            </TouchableOpacity>

          </View>

          {/* RIVALSET_HOME_WEEK_RING */}
          <View
            style={{
              borderRadius: 22,
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.11)',
              backgroundColor: 'rgba(13,15,20,0.76)',
              paddingHorizontal: 17,
              paddingTop: 18,
              paddingBottom: 16,
              marginBottom: 18,
              overflow: 'hidden',
              shadowColor: '#000000',
              shadowOffset: {
                width: 0,
                height: 10,
              },
              shadowOpacity: 0.20,
              shadowRadius: 18,
              elevation: 8,
            }}
          >
            {/* BRILLO SUPERIOR */}
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                top: 0,
                left: 24,
                right: 24,
                height: 1,
                backgroundColor:
                  'rgba(255,255,255,0.14)',
              }}
            />

            {/* CABECERA */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
              }}
            >
              <View
                style={{
                  flex: 1,
                  paddingRight: 14,
                }}
              >
                {/* TITULAR */}
                <Text
                  style={{
                    color: accentColor,
                    fontSize: 22,
                    lineHeight: 27,
                    fontWeight: '900',
                    letterSpacing: -0.45,
                    marginBottom: 7,
                  }}
                >
                  Esta semana
                </Text>

                <Text
                  style={{
                    color: 'rgba(255,255,255,0.56)',
                    fontSize: 11,
                    lineHeight: 16,
                    fontWeight: '600',
                  }}
                >
                  {activeWeekDays === 0
                    ? 'Empieza a construir tu semana'
                    : activeWeekDays === 1
                    ? '1 día de entrenamiento registrado'
                    : `${activeWeekDays} días de entrenamiento registrados`}
                </Text>
              </View>

              {/* CONTADOR X/7 */}
              <View
                style={{
                  minWidth: 64,
                  height: 54,
                  borderRadius: 15,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor:
                    `${accentColor}12`,
                  borderWidth: 1,
                  borderColor:
                    `${accentColor}30`,
                }}
              >
                <Text
                  style={{
                    color: accentColor,
                    fontSize: 22,
                    lineHeight: 24,
                    fontWeight: '900',
                    letterSpacing: -0.6,
                  }}
                >
                  {activeWeekDays}
                  <Text
                    style={{
                      color:
                        'rgba(255,255,255,0.40)',
                      fontSize: 13,
                      fontWeight: '800',
                    }}
                  >
                    /7
                  </Text>
                </Text>

                <Text
                  style={{
                    color:
                      'rgba(255,255,255,0.38)',
                    fontSize: 7,
                    fontWeight: '900',
                    letterSpacing: 0.8,
                    marginTop: 2,
                  }}
                >
                  DÍAS
                </Text>
              </View>
            </View>

            {/* DÍAS DE LA SEMANA */}
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                marginTop: 21,
              }}
            >
              {weekDays.map((day) => {
                const done =
                  checkedDays.includes(day.key);

                return (
                  <TouchableOpacity
                    key={day.key}
                    activeOpacity={0.72}
                    onPress={() =>
                      toggleWeekDay(day.key)
                    }
                    style={{
                      alignItems: 'center',
                      width: 34,
                    }}
                  >
                    <Text
                      style={{
                        color: done
                          ? accentColor
                          : 'rgba(255,255,255,0.34)',
                        fontSize: 10.5,
                        fontWeight: '900',
                        marginBottom: 7,
                      }}
                    >
                      {day.label}
                    </Text>

                    <View
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 14,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: done
                          ? accentColor
                          : 'rgba(255,255,255,0.035)',
                        borderWidth: 1,
                        borderColor: done
                          ? accentColor
                          : 'rgba(255,255,255,0.09)',
                      }}
                    >
                      {done ? (
                        <MaterialCommunityIcons
                          name="check"
                          size={15}
                          color="#16110A"
                        />
                      ) : (
                        <View
                          style={{
                            width: 4,
                            height: 4,
                            borderRadius: 2,
                            backgroundColor:
                              'rgba(255,255,255,0.22)',
                          }}
                        />
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* BARRA DE PROGRESO */}
            <View
              style={{
                marginTop: 19,
              }}
            >
              <View
                style={{
                  height: 5,
                  borderRadius: 999,
                  overflow: 'hidden',
                  backgroundColor:
                    'rgba(255,255,255,0.07)',
                }}
              >
                <View
                  style={{
                    height: '100%',
                    width: `${Math.min(
                      (activeWeekDays / 7) * 100,
                      100
                    )}%`,
                    borderRadius: 999,
                    backgroundColor: accentColor,
                  }}
                />
              </View>

              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginTop: 8,
                }}
              >
                <Text
                  style={{
                    color:
                      'rgba(255,255,255,0.34)',
                    fontSize: 10.5,
                    fontWeight: '800',
                    letterSpacing: 0.35,
                  }}
                >
                  PROGRESO SEMANAL
                </Text>

                <Text
                  style={{
                    color: accentColor,
                    fontSize: 9,
                    fontWeight: '900',
                  }}
                >
                  {Math.min(
                    Math.round(
                      (activeWeekDays / 7) * 100
                    ),
                    100
                  )}%
                </Text>
              </View>
            </View>

            {/* CONSTANCIA */}
            {activeWeekDays > 0 && (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  marginTop: 14,
                  paddingTop: 13,
                  borderTopWidth: 1,
                  borderTopColor:
                    'rgba(255,255,255,0.065)',
                }}
              >
                <View
                  style={{
                    width: 27,
                    height: 27,
                    borderRadius: 9,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor:
                      `${accentColor}12`,
                  }}
                >
                  <MaterialCommunityIcons
                    name="fire"
                    size={15}
                    color={accentColor}
                  />
                </View>

                <View
                  style={{
                    marginLeft: 9,
                    flex: 1,
                  }}
                >
                  <Text
                    style={{
                      color: '#FFFFFF',
                      fontSize: 13,
                      lineHeight: 17,
                      fontWeight: '800',
                    }}
                  >
                    Sigue construyendo constancia
                  </Text>

                  <Text
                    style={{
                      color:
                        'rgba(255,255,255,0.38)',
                      fontSize: 11,
                      lineHeight: 15,
                      marginTop: 3,
                    }}
                  >
                    Cada día entrenado suma a tu semana
                  </Text>
                </View>

                <MaterialCommunityIcons
                  name="trending-up"
                  size={17}
                  color={accentColor}
                />
              </View>
            )}
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

              <Text style={[styles.achievementButtonSubtext, lightTextStyle]}>
                Descubre tus próximos desafíos
              </Text>
            </View>

            <Text style={styles.arrow}>›</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
<View
  style={{
    alignItems: 'center',
    marginTop: 14,
    marginBottom: 8,
  }}
>
  <BannerAd
    unitId={TestIds.BANNER}
    size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
    requestOptions={{
      requestNonPersonalizedAdsOnly: true,
    }}
  />
</View>
      {BottomNavigation()}
    </>
  );

  /* =====================================================
     LIGA
  ===================================================== */


  const GlobalLeague = () => {
    const [globalRanking, setGlobalRanking] = useState([]);
    const [globalLoading, setGlobalLoading] = useState(true);
    const [globalError, setGlobalError] = useState('');

    const now = new Date();

    const monthNames = [
      'ENERO',
      'FEBRERO',
      'MARZO',
      'ABRIL',
      'MAYO',
      'JUNIO',
      'JULIO',
      'AGOSTO',
      'SEPTIEMBRE',
      'OCTUBRE',
      'NOVIEMBRE',
      'DICIEMBRE',
    ];

    const seasonName = monthNames[now.getMonth()];

    const loadGlobalRanking = async () => {
      try {
        setGlobalLoading(true);
        setGlobalError('');

        const { data, error } = await supabase.rpc(
          'get_global_league'
        );

        if (error) {
          console.log('Error Liga Global:', error);
          setGlobalError(
            'No se ha podido cargar la clasificación.'
          );
          return;
        }

        setGlobalRanking(
          Array.isArray(data) ? data : []
        );
      } catch (error) {
        console.log('Error Liga Global:', error);

        setGlobalError(
          'No se ha podido cargar la clasificación.'
        );
      } finally {
        setGlobalLoading(false);
      }
    };

    useEffect(() => {
      loadGlobalRanking();
    }, []);

    const top20 = globalRanking.filter(
      item => Number(item.rank_position) <= 20
    );

    const myPosition = globalRanking.find(
      item => item.is_me
    );

    const meOutsideTop20 =
      myPosition &&
      Number(myPosition.rank_position) > 20;

    const getRankColor = position => {
      if (position === 1) return '#E8BD4D';
      if (position === 2) return '#B8BDC6';
      if (position === 3) return '#B97A45';

      return '#F2F3F5';
    };

    const getRankBackground = position => {
      if (position === 1)
        return 'rgba(232,189,77,0.055)';

      if (position === 2)
        return 'rgba(184,189,198,0.04)';

      if (position === 3)
        return 'rgba(185,122,69,0.045)';

      return 'transparent';
    };

    const getInitial = name =>
      String(name || 'R')
        .trim()
        .charAt(0)
        .toUpperCase();

    const RankingRow = ({ item }) => {
      const position =
        Number(item.rank_position) || 0;

      const isMe = !!item.is_me;

      return (
        <View
          style={{
            minHeight: 61,
            flexDirection: 'row',
            alignItems: 'center',

            paddingHorizontal: 14,

            backgroundColor: isMe
              ? 'rgba(255,132,0,0.09)'
              : getRankBackground(position),

            borderBottomWidth: 1,

            borderBottomColor:
              'rgba(255,255,255,0.055)',
          }}
        >

          {/* POSICIÓN */}

          <View
            style={{
              width: 42,
              alignItems: 'flex-start',
            }}
          >
            <Text
              style={{
                fontSize:
                  position <= 3 ? 20 : 16,

                fontWeight: '900',

                fontStyle:
                  position <= 3
                    ? 'italic'
                    : 'normal',

                color: getRankColor(position),

                letterSpacing: -0.5,
              }}
            >
              {position}
            </Text>
          </View>


          {/* FOTO / AVATAR */}

          <View
            style={{
              width: 38,
              height: 38,

              borderRadius: 19,

              alignItems: 'center',
              justifyContent: 'center',

              marginRight: 12,

              backgroundColor:
                'rgba(255,255,255,0.075)',

              borderWidth: 1.2,

              borderColor:
                position === 1
                  ? '#E8BD4D'
                  : position === 2
                  ? '#B8BDC6'
                  : position === 3
                  ? '#B97A45'
                  : isMe
                  ? COLORS.orange
                  : 'rgba(255,255,255,0.10)',
            }}
          >
            <Text
              style={{
                color: isMe
                  ? COLORS.orange
                  : '#FFFFFF',

                fontSize: 14,
                fontWeight: '900',
              }}
            >
              {getInitial(item.username)}
            </Text>
          </View>


          {/* NOMBRE */}

          <View
            style={{
              flex: 1,
              justifyContent: 'center',
            }}
          >
            <Text
              numberOfLines={1}
              style={{
                color: '#FFFFFF',

                fontSize: 15,

                fontWeight:
                  isMe ? '900' : '700',
              }}
            >
              {item.username || 'Rival'}
            </Text>

            {isMe && (
              <Text
                style={{
                  marginTop: 2,

                  color: COLORS.orange,

                  fontSize: 8,
                  fontWeight: '900',

                  letterSpacing: 1.2,
                }}
              >
                TÚ
              </Text>
            )}
          </View>


          {/* PUNTOS */}

          <View
            style={{
              width: 72,
              alignItems: 'flex-end',
            }}
          >
            <Text
              style={{
                color: isMe
                  ? COLORS.orange
                  : '#FFFFFF',

                fontSize: 16,
                fontWeight: '900',

                letterSpacing: -0.4,
              }}
            >
              {Number(item.points || 0)}
            </Text>
          </View>

        </View>
      );
    };


    return (
      <View style={{ flex: 1 }}>

        <ScrollView
          style={{ flex: 1 }}

          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingTop: 16,
            paddingBottom: 35,
          }}

          showsVerticalScrollIndicator={false}

          refreshControl={
            <RefreshControl
              refreshing={globalLoading}
              onRefresh={loadGlobalRanking}
              tintColor={COLORS.orange}
            />
          }
        >

          {/* =========================
              CABECERA
          ========================= */}

          <View
            style={{
              marginBottom: 20,
            }}
          >

            <Text
              style={{
                color: COLORS.orange,

                fontSize: 11,
                fontWeight: '900',

                letterSpacing: 3.2,

                marginBottom: 3,
              }}
            >
              RIVALSET
            </Text>

            <Text
              style={{
                color: '#FFFFFF',

                fontSize: 32,
                lineHeight: 34,

                fontWeight: '900',
                fontStyle: 'italic',

                letterSpacing: -1.7,
              }}
            >
              GLOBAL LEAGUE
            </Text>

            <Text
              style={{
                marginTop: 6,

                color: '#777A82',

                fontSize: 12,
                fontWeight: '600',
              }}
            >
              La clasificación de toda la comunidad
            </Text>


            {/* TEMPORADA */}

            <View
              style={{
                alignSelf: 'flex-start',

                marginTop: 13,

                paddingHorizontal: 12,
                paddingVertical: 6,

                borderRadius: 100,

                backgroundColor:
                  'rgba(255,132,0,0.10)',

                borderWidth: 1,

                borderColor:
                  'rgba(255,132,0,0.25)',
              }}
            >
              <Text
                style={{
                  color: COLORS.orange,

                  fontSize: 9,
                  fontWeight: '900',

                  letterSpacing: 1.4,
                }}
              >
                TEMPORADA {seasonName}
              </Text>
            </View>

          </View>


          {/* =========================
              TÍTULO CLASIFICACIÓN
          ========================= */}

          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',

              marginBottom: 10,
              paddingHorizontal: 2,
            }}
          >

            <Text
              style={{
                color: '#FFFFFF',

                fontSize: 18,
                fontWeight: '900',

                fontStyle: 'italic',

                letterSpacing: -0.5,
              }}
            >
              CLASIFICACIÓN GLOBAL
            </Text>

            <MaterialCommunityIcons
              name="earth"
              size={19}
              color={COLORS.orange}
            />

          </View>


          {/* =========================
              TABLA
          ========================= */}

          <View
            style={{
              overflow: 'hidden',

              borderRadius: 16,

              backgroundColor:
                'rgba(255,255,255,0.025)',

              borderWidth: 1,

              borderColor:
                'rgba(255,255,255,0.075)',
            }}
          >

            {/* CABECERA */}

            <View
              style={{
                height: 38,

                flexDirection: 'row',
                alignItems: 'center',

                paddingHorizontal: 14,

                backgroundColor:
                  'rgba(255,255,255,0.04)',

                borderBottomWidth: 1,

                borderBottomColor:
                  'rgba(255,255,255,0.075)',
              }}
            >

              <Text
                style={{
                  width: 42,

                  color: '#666971',

                  fontSize: 9,
                  fontWeight: '900',

                  letterSpacing: 1.1,
                }}
              >
                POS
              </Text>

              <Text
                style={{
                  flex: 1,

                  marginLeft: 50,

                  color: '#666971',

                  fontSize: 9,
                  fontWeight: '900',

                  letterSpacing: 1.1,
                }}
              >
                RIVAL
              </Text>

              <Text
                style={{
                  width: 72,

                  textAlign: 'right',

                  color: '#666971',

                  fontSize: 9,
                  fontWeight: '900',

                  letterSpacing: 1.1,
                }}
              >
                PTS
              </Text>

            </View>


            {/* CONTENIDO */}

            {globalLoading &&
            globalRanking.length === 0 ? (

              <View
                style={{
                  height: 150,

                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >

                <ActivityIndicator
                  color={COLORS.orange}
                />

                <Text
                  style={{
                    marginTop: 10,

                    color: '#6D7077',

                    fontSize: 11,
                    fontWeight: '700',
                  }}
                >
                  ACTUALIZANDO CLASIFICACIÓN
                </Text>

              </View>

            ) : globalError ? (

              <TouchableOpacity
                activeOpacity={0.8}

                onPress={loadGlobalRanking}

                style={{
                  minHeight: 140,

                  alignItems: 'center',
                  justifyContent: 'center',

                  paddingHorizontal: 20,
                }}
              >

                <Text
                  style={{
                    color: '#FFFFFF',

                    fontSize: 13,
                    fontWeight: '700',

                    textAlign: 'center',
                  }}
                >
                  {globalError}
                </Text>

                <Text
                  style={{
                    marginTop: 8,

                    color: COLORS.orange,

                    fontSize: 10,
                    fontWeight: '900',

                    letterSpacing: 1,
                  }}
                >
                  REINTENTAR
                </Text>

              </TouchableOpacity>

            ) : (

              <>
                {top20.map(item => (
                  <RankingRow
                    key={item.user_id}
                    item={item}
                  />
                ))}
              </>

            )}

          </View>


          {/* =========================
              TU POSICIÓN
              SI ESTÁS FUERA TOP 20
          ========================= */}

          {meOutsideTop20 && (

            <View
              style={{
                marginTop: 22,
              }}
            >

              <Text
                style={{
                  marginBottom: 8,
                  marginLeft: 3,

                  color: COLORS.orange,

                  fontSize: 9,
                  fontWeight: '900',

                  letterSpacing: 1.5,
                }}
              >
                TU POSICIÓN
              </Text>

              <View
                style={{
                  overflow: 'hidden',

                  borderRadius: 15,

                  backgroundColor:
                    'rgba(255,132,0,0.055)',

                  borderWidth: 1,

                  borderColor:
                    'rgba(255,132,0,0.30)',
                }}
              >

                <RankingRow
                  item={myPosition}
                />

              </View>

            </View>

          )}


          {/* =========================
              REGLAS
          ========================= */}

          <View
            style={{
              marginTop: 19,

              paddingTop: 15,

              borderTopWidth: 1,

              borderTopColor:
                'rgba(255,255,255,0.055)',

              alignItems: 'center',
            }}
          >

            <Text
              style={{
                color: '#62656C',

                fontSize: 10,
                fontWeight: '700',
              }}
            >
              +10 entrenamiento · +3 récord
            </Text>

            <Text
              style={{
                marginTop: 4,

                color: '#53565D',

                fontSize: 10,
                fontWeight: '700',
              }}
            >
              1 entrenamiento al día · Máximo 7 por semana
            </Text>

          </View>

        </ScrollView>

        <BottomNavigation />

      </View>
    );
  };


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

isMonthlyMvp: monthlyAwards.some(
  (award) =>
    award.user_id === player.user_id &&
    award.award_type === 'mvp'
),

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
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  }}
>
  <TextInput
    value={joinLeagueCode}
    onChangeText={setJoinLeagueCode}
    placeholder="Código de liga"
    placeholderTextColor={'#626873'}
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
            {/* RIVALSET_LEAGUE_PRO_V2 */}
            <View
              style={{
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 18,
                paddingTop: 4,
              }}
            >
              <Text
                style={{
                  color: '#FFFFFF',
                  fontSize: 28,
                  lineHeight: 33,
                  fontWeight: '900',
                  fontStyle: 'italic',
                  letterSpacing: -1.2,
                  textAlign: 'center',
                }}
              >
                RIVALSET LEAGUE
              </Text>

              <Text
                style={{
                  color: COLORS.orange,
                  fontSize: 11,
                  lineHeight: 15,
                  fontWeight: '800',
                  letterSpacing: 1.05,
                  textAlign: 'center',
                  marginTop: 5,
                }}
              >
                DEMUESTRA DE QUÉ ERES CAPAZ
              </Text>
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
                    placeholderTextColor={'#626873'}
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
              </View>

</View>

            <TouchableOpacity
              activeOpacity={0.8}
              style={styles.leagueInviteWide}
              onPress={inviteFriends}
            >
              <MaterialCommunityIcons
                name="account-multiple-plus-outline"
                size={20}
                color={COLORS.orange}
              />
              <View style={styles.leagueActionTextBox}>
                <Text style={styles.leagueInviteText}>Invita a tus amigos</Text>
                <Text style={styles.leagueInviteSubtext}>Comparte el código de tu liga</Text>
              </View>
              <MaterialCommunityIcons
                name="share-variant"
                size={19}
                color={COLORS.orange}
              />
            </TouchableOpacity>

            <View style={styles.leagueTrainingCard}>
              <View style={styles.leagueTrainingHeader}>
                <View style={styles.flex}>
                  <Text style={styles.leagueSectionTitle}>
                    ENTRENAMIENTOS PUNTUABLES
                  </Text>

                  <Text style={styles.leagueTrainingExplanation}>
                    Hasta 4 entrenamientos por semana pueden sumar puntos.
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
                      ENTRENAR
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
                        : `+10 pts base · ${remainingLeagueWorkouts} disponibles`}
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

                    <Text style={[styles.leagueSectionSubtitle, lightTextStyle]}>
                      Ranking mensual
                    </Text>
                  </View>
                </View>

              <View
  style={{
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  }}
>
  <TouchableOpacity
    onPress={() => setShowLeagueInfo(true)}
    activeOpacity={0.7}
    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
    style={{
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(255,176,0,0.08)',
      borderWidth: 1,
      borderColor: 'rgba(255,176,0,0.28)',
    }}
  >
    <MaterialCommunityIcons
      name="information-outline"
      size={18}
      color={COLORS.orange}
    />
  </TouchableOpacity>

  <Text style={styles.leagueMonthBadge}>
    {leagueDaysRemaining}{' '}
    {leagueDaysRemaining === 1 ? 'DÍA' : 'DÍAS'}
  </Text>
</View>
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

                      player.me &&
                        styles.leaguePlayerRowMe,
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
                      <View style={styles.leaguePlayerNameLine}>
                        <Text
                          style={[
                            styles.leaguePlayerName,
                            player.me &&
                              styles.leaguePlayerNameMe,
                          ]}
                          numberOfLines={1}
                        >
                          {player.name}
                        </Text>

                        {player.me && (
                          <Text style={styles.leaguePlayerMeBadge}>
                            TÚ
                          </Text>
                        )}
                      </View>
                    </View>

                    <View style={styles.leaguePlayerAwardColumn}>
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

            
            {/* RIVALSET_LEAGUE_INFO_PRO */}
            <Modal
              visible={showLeagueInfo}
              transparent
              animationType="fade"
              onRequestClose={() => setShowLeagueInfo(false)}
            >
              <View
                style={{
                  flex: 1,
                  backgroundColor: 'rgba(3,4,7,0.76)',
                  justifyContent: 'center',
                  paddingHorizontal: 18,
                  paddingVertical: 45,
                }}
              >
                <View
                  style={{
                    flex: 1,
                    maxHeight: 690,
                    backgroundColor: 'rgba(10,12,17,0.72)',
                    borderRadius: 24,
                    borderWidth: 1,
                    borderColor: 'rgba(255,255,255,0.18)',
                    overflow: 'hidden',
                    shadowColor: '#000000',
                    shadowOffset: {
                      width: 0,
                      height: 14,
                    },
                    shadowOpacity: 0.42,
                    shadowRadius: 26,
                    elevation: 16,
                    shadowColor: '#000000',
                    shadowOffset: {
                      width: 0,
                      height: 14,
                    },
                    shadowOpacity: 0.42,
                    shadowRadius: 26,
                    elevation: 16,
                  }}
                >

                  {/* RIVALSET_LEAGUE_GLASS_REAL */}
                  <BlurView
                    intensity={60}
                    tint="dark"
                    pointerEvents="none"
                    style={StyleSheet.absoluteFillObject}
                  />

                  <View
                    pointerEvents="none"
                    style={[
                      StyleSheet.absoluteFillObject,
                      {
                        backgroundColor:
                          'rgba(8,10,15,0.84)',
                      },
                    ]}
                  />

                  <LinearGradient
                    pointerEvents="none"
                    colors={[
                      'rgba(255,255,255,0.10)',
                      'rgba(255,255,255,0.025)',
                      'rgba(255,255,255,0.00)',
                    ]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFillObject}
                  />

                  <View
                    pointerEvents="none"
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 20,
                      right: 20,
                      height: 1,
                      backgroundColor:
                        'rgba(255,255,255,0.24)',
                    }}
                  />


                  {/* CABECERA */}
                  <View
                    style={{
                      paddingHorizontal: 20,
                      paddingTop: 20,
                      paddingBottom: 17,
                      borderBottomWidth: 1,
                      borderBottomColor: 'rgba(255,255,255,0.08)',
                      backgroundColor: 'rgba(255,255,255,0.018)',
                    }}
                  >
                    <View
                      style={{
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                      }}
                    >
                      <View style={{ flex: 1, paddingRight: 15 }}>
                        <Text
                          style={{
                            color: COLORS.orange,
                            fontSize: 11,
                            fontWeight: '900',
                            letterSpacing: 1.3,
                            marginBottom: 7,
                          }}
                        >
                          RIVALSET LEAGUE
                        </Text>

                        <Text
                          style={{
                            color: '#FFFFFF',
                            fontSize: 22,
                            lineHeight: 27,
                            fontWeight: '900',
                          }}
                        >
                          Una liga donde gana la constancia
                        </Text>
                      </View>

                      <TouchableOpacity
                        onPress={() => setShowLeagueInfo(false)}
                        activeOpacity={0.7}
                        style={{
                          width: 35,
                          height: 35,
                          borderRadius: 18,
                          backgroundColor: 'rgba(255,255,255,0.11)',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <MaterialCommunityIcons
                          name="close"
                          size={20}
                          color="#FFFFFF"
                        />
                      </TouchableOpacity>
                    </View>

                    <Text
                      style={{
                        color: 'rgba(255,255,255,0.84)',
                        fontSize: 13,
                        lineHeight: 20,
                        marginTop: 13,
                      }}
                    >
                      RivalSet no premia a quien levanta más peso. Cada persona
                      parte de un nivel diferente.
                    </Text>

                    <Text
                      style={{
                        color: 'rgba(255,255,255,0.94)',
                        fontSize: 13,
                        lineHeight: 20,
                        marginTop: 8,
                      }}
                    >
                      La Liga premia entrenar, progresar y mantener la disciplina.
                      Compites contra tus propias marcas mientras luchas por subir
                      en la clasificación.
                    </Text>
                  </View>

                  <ScrollView
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{
                      paddingHorizontal: 20,
                      paddingTop: 19,
                      paddingBottom: 22,
                    }}
                  >

                    {/* DISCIPLINA */}
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        marginBottom: 12,
                      }}
                    >
                      <MaterialCommunityIcons
                        name="calendar-check-outline"
                        size={17}
                        color={COLORS.orange}
                      />

                      <Text
                        style={{
                          color: COLORS.orange,
                          fontSize: 11,
                          fontWeight: '900',
                          letterSpacing: 1.1,
                          marginLeft: 7,
                        }}
                      >
                        DISCIPLINA
                      </Text>
                    </View>

                    <View
                      style={{
                        backgroundColor: 'rgba(255,255,255,0.055)',
                        borderRadius: 15,
                        borderWidth: 1,
                        borderColor: 'rgba(255,255,255,0.10)',
                        padding: 14,
                      }}
                    >
                      <Text
                        style={{
                          color: '#FFFFFF',
                          fontSize: 15,
                          fontWeight: '800',
                        }}
                      >
                        +10 pts · Entrenamiento
                      </Text>

                      <Text
                        style={{
                          color: 'rgba(255,255,255,0.82)',
                          fontSize: 12,
                          lineHeight: 18,
                          marginTop: 5,
                        }}
                      >
                        Cada entrenamiento puntuable suma 10 puntos. La constancia
                        es la base de la competición.
                      </Text>

                      <View
                        style={{
                          height: 1,
                          backgroundColor: 'rgba(255,255,255,0.08)',
                          marginVertical: 13,
                        }}
                      />

                      <Text
                        style={{
                          color: '#D7D9DD',
                          fontSize: 12,
                          fontWeight: '800',
                        }}
                      >
                        Máximo 4 entrenamientos puntuables por semana
                      </Text>

                      <Text
                        style={{
                          color: 'rgba(255,255,255,0.72)',
                          fontSize: 11,
                          lineHeight: 17,
                          marginTop: 5,
                        }}
                      >
                        Así alguien que entrena 4 días puede competir en igualdad
                        con alguien que entrena 5 o 6. Puedes seguir entrenando:
                        simplemente no sumará más puntos base esa semana.
                      </Text>
                    </View>


                    {/* PROGRESO */}
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        marginTop: 22,
                        marginBottom: 12,
                      }}
                    >
                      <MaterialCommunityIcons
                        name="trending-up"
                        size={18}
                        color={COLORS.orange}
                      />

                      <Text
                        style={{
                          color: COLORS.orange,
                          fontSize: 11,
                          fontWeight: '900',
                          letterSpacing: 1.1,
                          marginLeft: 7,
                        }}
                      >
                        PROGRESO
                      </Text>
                    </View>

                    <View
                      style={{
                        backgroundColor: 'rgba(255,255,255,0.055)',
                        borderRadius: 15,
                        borderWidth: 1,
                        borderColor: 'rgba(255,255,255,0.10)',
                        overflow: 'hidden',
                      }}
                    >

                      <View style={{ padding: 14 }}>
                        <View
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                          }}
                        >
                          <View
                            style={{
                              width: 35,
                              height: 35,
                              borderRadius: 11,
                              backgroundColor: 'rgba(255,176,0,0.10)',
                              alignItems: 'center',
                              justifyContent: 'center',
                              marginRight: 11,
                            }}
                          >
                            <MaterialCommunityIcons
                              name="trophy-outline"
                              size={18}
                              color={COLORS.orange}
                            />
                          </View>

                          <View style={{ flex: 1 }}>
                            <Text
                              style={{
                                color: '#FFFFFF',
                                fontSize: 14,
                                fontWeight: '800',
                              }}
                            >
                              +3 pts · Nuevo peso
                            </Text>

                            <Text
                              style={{
                                color: 'rgba(255,255,255,0.80)',
                                fontSize: 11,
                                lineHeight: 16,
                                marginTop: 3,
                              }}
                            >
                              Supera tu mejor peso anterior.
                            </Text>
                          </View>
                        </View>
                      </View>

                      <View
                        style={{
                          height: 1,
                          backgroundColor: 'rgba(255,255,255,0.08)',
                          marginHorizontal: 14,
                        }}
                      />

                      <View style={{ padding: 14 }}>
                        <View
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                          }}
                        >
                          <View
                            style={{
                              width: 35,
                              height: 35,
                              borderRadius: 11,
                              backgroundColor: 'rgba(255,176,0,0.10)',
                              alignItems: 'center',
                              justifyContent: 'center',
                              marginRight: 11,
                            }}
                          >
                            <MaterialCommunityIcons
                              name="lightning-bolt-outline"
                              size={19}
                              color={COLORS.orange}
                            />
                          </View>

                          <View style={{ flex: 1 }}>
                            <Text
                              style={{
                                color: '#FFFFFF',
                                fontSize: 14,
                                fontWeight: '800',
                              }}
                            >
                              +3 pts · Más repeticiones
                            </Text>

                            <Text
                              style={{
                                color: 'rgba(255,255,255,0.80)',
                                fontSize: 11,
                                lineHeight: 16,
                                marginTop: 3,
                              }}
                            >
                              Mantén el peso y supera tu mejor número de repeticiones.
                            </Text>
                          </View>
                        </View>
                      </View>
                    </View>


                    {/* COMPETICIÓN */}
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        marginTop: 22,
                        marginBottom: 12,
                      }}
                    >
                      <MaterialCommunityIcons
                        name="podium"
                        size={18}
                        color={COLORS.orange}
                      />

                      <Text
                        style={{
                          color: COLORS.orange,
                          fontSize: 11,
                          fontWeight: '900',
                          letterSpacing: 1.1,
                          marginLeft: 7,
                        }}
                      >
                        COMPETICIÓN MENSUAL
                      </Text>
                    </View>

                    <Text
                      style={{
                        color: 'rgba(255,255,255,0.82)',
                        fontSize: 12,
                        lineHeight: 19,
                      }}
                    >
                      Cada mes empieza una nueva competición. Al finalizar el mes
                      se cierra la clasificación, se determinan los resultados y
                      todos comienzan una nueva oportunidad por el primer puesto.
                    </Text>


                    {/* RECONOCIMIENTOS */}
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        marginTop: 22,
                        marginBottom: 12,
                      }}
                    >
                      <MaterialCommunityIcons
                        name="medal-outline"
                        size={18}
                        color={COLORS.orange}
                      />

                      <Text
                        style={{
                          color: COLORS.orange,
                          fontSize: 11,
                          fontWeight: '900',
                          letterSpacing: 1.1,
                          marginLeft: 7,
                        }}
                      >
                        RECONOCIMIENTOS
                      </Text>
                    </View>

                    <View
                      style={{
                        backgroundColor: 'rgba(255,255,255,0.055)',
                        borderRadius: 15,
                        borderWidth: 1,
                        borderColor: 'rgba(255,255,255,0.10)',
                        padding: 14,
                      }}
                    >
                      <Text
                        style={{
                          color: '#FFFFFF',
                          fontSize: 14,
                          fontWeight: '800',
                        }}
                      >
                        👑 MVP DEL MES
                      </Text>

                      <Text
                        style={{
                          color: 'rgba(255,255,255,0.80)',
                          fontSize: 11,
                          lineHeight: 17,
                          marginTop: 4,
                        }}
                      >
                        Se otorga al jugador que terminó primero en el último
                        mes cerrado.
                      </Text>

                      <View
                        style={{
                          height: 1,
                          backgroundColor: 'rgba(255,255,255,0.08)',
                          marginVertical: 13,
                        }}
                      />

                      <Text
                        style={{
                          color: '#FFFFFF',
                          fontSize: 14,
                          fontWeight: '800',
                        }}
                      >
                        🔥 ÚLTIMO DEL MES
                      </Text>

                      <Text
                        style={{
                          color: 'rgba(255,255,255,0.80)',
                          fontSize: 11,
                          lineHeight: 17,
                          marginTop: 4,
                        }}
                      >
                        Identifica a quien terminó último en el mes anterior.
                        El nuevo mes es su oportunidad de revancha.
                      </Text>

                      <Text
                        style={{
                          color: 'rgba(255,255,255,0.64)',
                          fontSize: 10,
                          lineHeight: 15,
                          marginTop: 12,
                        }}
                      >
                        Las etiquetas solo se asignan cuando termina el mes.
                        No cambian según la posición provisional actual.
                      </Text>
                    </View>


                    {/* MENSAJE FINAL */}
                    <View
                      style={{
                        marginTop: 22,
                        paddingVertical: 18,
                        paddingHorizontal: 16,
                        borderRadius: 16,
                        backgroundColor: 'rgba(255,176,0,0.075)',
                        borderWidth: 1,
                        borderColor: 'rgba(255,176,0,0.24)',
                        alignItems: 'center',
                      }}
                    >
                      <MaterialCommunityIcons
                        name="arm-flex-outline"
                        size={25}
                        color={COLORS.orange}
                      />

                      <Text
                        style={{
                          color: '#FFFFFF',
                          fontSize: 15,
                          fontWeight: '900',
                          textAlign: 'center',
                          marginTop: 9,
                        }}
                      >
                        No importa cuánto levantas.
                      </Text>

                      <Text
                        style={{
                          color: COLORS.orange,
                          fontSize: 15,
                          fontWeight: '900',
                          textAlign: 'center',
                          marginTop: 2,
                        }}
                      >
                        Importa cuánto avanzas.
                      </Text>
                    </View>

                  </ScrollView>

                  <View
                    style={{
                      padding: 15,
                      borderTopWidth: 1,
                      borderTopColor: 'rgba(255,255,255,0.06)',
                    }}
                  >
                    <TouchableOpacity
                      onPress={() => setShowLeagueInfo(false)}
                      activeOpacity={0.85}
                      style={{
                        height: 48,
                        borderRadius: 14,
                        backgroundColor: COLORS.orange,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Text
                        style={{
                          color: COLORS.darkText,
                          fontSize: 13,
                          fontWeight: '900',
                          letterSpacing: 0.4,
                        }}
                      >
                        ENTENDIDO
                      </Text>
                    </TouchableOpacity>
                  </View>

                </View>
              </View>
            </Modal>

            <View style={styles.leagueActivityCard}>
              <View style={styles.leagueSectionHeader}>
                <View>
                  <Text style={styles.leagueSectionTitle}>
                    ACTIVIDAD GRUPAL
                  </Text>

                  <Text style={[styles.leagueSectionSubtitle, lightTextStyle]}>
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
    ? 'ha completado un entrenamiento y conseguido récords'
    : 'ha completado un entrenamiento';

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
        <View style={styles.leagueActivityIcon}>
          <MaterialCommunityIcons
            name={
              isJoined
                ? 'account-plus-outline'
                : hasRecord
                ? 'trophy-outline'
                : 'dumbbell'
            }
            size={16}
            color={COLORS.orange}
          />
        </View>

        <View style={styles.leagueActivityInfo}>
          <Text style={styles.leagueActivityText}>
            <Text style={styles.leagueActivityName}>
              {activity.username || 'Miembro'}{' '}
            </Text>

            {activityText}
          </Text>
        </View>

        <View style={styles.leagueActivitySide}>
          {!isJoined && (
            <Text style={styles.leagueActivityPoints}>
              +{activity.total_points} PTS
            </Text>
          )}

          <Text
            style={[
              styles.leagueActivityTime,
              lightTextStyle,
            ]}
          >
            {timeText}
          </Text>
        </View>
      </View>
    );
  })
) : (
  <Text style={[styles.leagueSectionSubtitle, lightTextStyle]}>
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
    setLeagueName('');
    await AsyncStorage.removeItem(LEAGUE_KEY);
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

const deleteAccount = () => {
  Alert.alert(
    'Eliminar cuenta',
    '¿Seguro que quieres eliminar tu cuenta? Esta acción es permanente y eliminará tus datos de RivalSet.',
    [
      {
        text: 'Cancelar',
        style: 'cancel',
      },
      {
        text: 'Eliminar cuenta',
        style: 'destructive',
        onPress: async () => {
          try {
            await clearProfilePhoto();
const { data, error } = await supabase.functions.invoke(
              'delete-account',
              {
                body: { confirm: true },
              }
            );

            if (error) throw error;

            if (!data?.ok) {
              throw new Error(
                data?.error || 'No se pudo eliminar la cuenta.'
              );
            }

            await AsyncStorage.multiRemove([
              ROUTINES_KEY,
              WORKOUTS_KEY,
              WEEK_CHECKS_KEY,
              PROFILE_KEY,
              SETTINGS_KEY,
              APPEARANCE_KEY,
              ACCENT_COLOR_KEY,
              LEAGUE_KEY,
              NUTRITION_KEY,
              NUTRITION_GOALS_KEY,
              ACTIVE_WORKOUT_KEY,
            ]);

            setCurrentUserId(null);
            setLeagueName('');
            setRealLeaguePlayers([]);
            setLeagueActivity([]);
            setCurrentLeagueId(null);
            setInviteCode('');
            setWeeklyScoredWorkouts(0);

            try {
              await supabase.auth.signOut({ scope: 'local' });
            } catch (_) {}

            Alert.alert(
              'Cuenta eliminada',
              'Tu cuenta de RivalSet se ha eliminado correctamente.'
            );
          } catch (error) {
            console.log('ERROR ELIMINANDO CUENTA:', error);

            Alert.alert(
              'No se pudo eliminar la cuenta',
              error?.message || 'Inténtalo de nuevo.'
            );
          }
        },
      },
    ]
  );
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
        barStyle={isLightTheme ? "dark-content" : "light-content"}
        backgroundColor={isLightTheme ? "#FF9D00" : "#08090C"}
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
          placeholderTextColor={'#626873'}
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
          placeholderTextColor={'#626873'}
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
const ProfileLogin = () => (
  <View style={styles.page}>
    <PageHeader
      title="Perfil"
      subtitle="Inicia sesión para acceder a tu cuenta"
    />

    <ScrollView
      contentContainerStyle={[
        styles.profileContent,
        {
          paddingTop: 28,
          gap: 12,
        },
      ]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {Platform.OS === 'ios' && (
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={
            AppleAuthentication
              .AppleAuthenticationButtonType
              .SIGN_IN
          }
          buttonStyle={
            AppleAuthentication
              .AppleAuthenticationButtonStyle
              .BLACK
          }
          cornerRadius={14}
          style={{
            width: '100%',
            height: 50,
          }}
          onPress={loginWithApple}
        />
      )}

      <TouchableOpacity
        activeOpacity={0.85}
        onPress={loginWithGoogle}
        style={{
          width: '100%',
          height: 50,
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
        onPress={() =>
          setShowEmailAuth((current) => !current)
        }
        style={{
          width: '100%',
          height: 50,
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
            gap: 10,
            marginTop: 4,
          }}
        >
          <TextInput
            value={authEmail}
            onChangeText={setAuthEmail}
            placeholder="Email"
            placeholderTextColor={'#626873'}
            autoCapitalize="none"
            keyboardType="email-address"
            style={{
              height: 50,
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
            placeholderTextColor={'#626873'}
            secureTextEntry
            style={{
              height: 50,
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
                height: 50,
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
                height: 50,
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
    </ScrollView>
  </View>
);
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
          <View style={{alignItems:'center',marginBottom:12}}>
    
<RivalSetPhoto
  uri={profilePhoto}
  busy={photoBusy}
  size={78}
  color={accentColor}
  onPress={session?.user ? editProfilePhoto : openProfile}
/>
    <Text style={{color:accentColor,fontSize:12,marginTop:8}}>
      Toca para cambiar tu foto
    </Text>
  </View>

          <Text style={styles.profileNameLabel}>
            TU NOMBRE
          </Text>

          <View style={styles.nameEditBox}>
          <TextInput
  value={profileName}
  onChangeText={setProfileName}
  placeholder="Tu nombre"
  placeholderTextColor={'#626873'}
  style={styles.nameInput}
  maxLength={20}
  returnKeyType="done"
  onSubmitEditing={saveProfile}
  onBlur={saveProfile}
/>

            <MaterialCommunityIcons
              name="pencil-outline"
              size={18}
              color="#FFFFFF"
            />
          </View>
        </View>

        {/* =================================================
            TU ACTIVIDAD
        ================================================= */}

        <Text style={styles.profileGlassSectionLabel}>
          TU ACTIVIDAD
        </Text>

        <View style={styles.profileActivityGlass}>

          <View style={styles.profileActivityTop}>
            <View>
              <Text style={styles.profileActivityHeadline}>
                Tu progreso
              </Text>

              <Text style={styles.profileActivitySubheadline}>
                Todo lo que llevas en RivalSet
              </Text>
            </View>

            <View style={styles.profileActivityActivePill}>
              <MaterialCommunityIcons
                name="lightning-bolt"
                size={13}
                color={COLORS.orange}
              />

              <Text style={styles.profileActivityActiveText}>
                ACTIVO
              </Text>
            </View>
          </View>


          <View style={styles.profileActivityContent}>

            <View style={styles.profileActivityCircle}>
              <View style={styles.profileActivityCircleInner}>
                <Text style={styles.profileActivityBigNumber}>
                  {workouts.length}
                </Text>

                <Text style={styles.profileActivityBigLabel}>
                  ENTRENOS
                </Text>
              </View>
            </View>


            <View style={styles.profileActivityRight}>

              <View style={styles.profileActivityMiniStat}>
                <View style={styles.profileActivityMiniIcon}>
                  <MaterialCommunityIcons
                    name="calendar-check-outline"
                    size={18}
                    color={COLORS.orange}
                  />
                </View>

                <View>
                  <Text style={styles.profileActivityMiniNumber}>
                    {uniqueTrainingDays}
                  </Text>

                  <Text style={styles.profileActivityMiniLabel}>
                    Días activos
                  </Text>
                </View>
              </View>


              <View style={styles.profileActivityDivider} />


              <View style={styles.profileActivityMiniStat}>
                <View style={styles.profileActivityMiniIcon}>
                  <MaterialCommunityIcons
                    name="trophy-outline"
                    size={18}
                    color={COLORS.orange}
                  />
                </View>

                <View>
                  <Text style={styles.profileActivityMiniNumber}>
                    {unlockedAchievements}
                  </Text>

                  <Text style={styles.profileActivityMiniLabel}>
                    Logros
                  </Text>
                </View>
              </View>

            </View>
          </View>


          <View style={styles.profileActivityBottom}>
            <MaterialCommunityIcons
              name="chart-line"
              size={15}
              color={COLORS.orange}
            />

            <Text style={styles.profileActivityBottomText}>
              Cada entrenamiento cuenta
            </Text>
          </View>

        </View>


        {/* =================================================
            PERSONALIZACIÓN
        ================================================= */}

        <Text style={styles.profileGlassSectionLabel}>
          PERSONALIZACIÓN
        </Text>

        <View style={styles.profileSettingsGlass}>

          <TouchableOpacity
            activeOpacity={0.72}
            style={styles.settingRow}
            onPress={() =>
              Alert.alert(
                'Apariencia',
                'Elige el estilo de RivalSet.',
                [
                  {
                    text: 'Oscuro',
                    onPress: () => changeAppearance('dark'),
                  },
                  {
                    text: 'Claro',
                    onPress: () => changeAppearance('light'),
                  },
                  {
                    text: 'Cancelar',
                    style: 'cancel',
                  },
                ]
              )
            }
          >
            <View style={styles.profileSettingGlassIcon}>
              <MaterialCommunityIcons
                name="theme-light-dark"
                size={19}
                color={COLORS.orange}
              />
            </View>

            <View style={styles.settingInfo}>
              <Text style={styles.settingName}>
                Apariencia
              </Text>

              <Text style={[styles.settingDescription, isLightTheme && { color: lightSecondaryText }]}>
                Tema de RivalSet
              </Text>
            </View>

            <View style={styles.profileSettingValue}>
              <Text style={styles.profileSettingValueText}>
                {appearanceMode === 'light' ? 'Claro' : 'Oscuro'}
              </Text>

              <MaterialCommunityIcons
                name="chevron-right"
                size={20}
                color="#777C86"
              />
            </View>
          </TouchableOpacity>


          <View style={styles.settingDivider} />

          {/* COLOR DE LA APP */}
          <TouchableOpacity
            activeOpacity={0.72}
            style={styles.settingRow}
            onPress={() =>
              Alert.alert(
                'Color de la app',
                'Elige el color principal de RivalSet.',
            [
              {
                text: 'RivalSet',
                onPress: () => changeAccentColor('#FF9D00'),
              },
              {
                text: 'Rosa',
                onPress: () => changeAccentColor('#FF8FB8'),
              },
              {
                text: 'Azul',
                onPress: () => changeAccentColor('#35C8FF'),
              },
              {
                text: 'Plata',
                onPress: () => changeAccentColor('#C4C6CA'),
              },
              {
                text: 'Cancelar',
                style: 'cancel',
              },
            ]
              )
            }
          >
            <View style={styles.profileSettingGlassIcon}>
              <MaterialCommunityIcons
                name="palette-outline"
                size={19}
                color={accentColor}
              />
            </View>

            <View style={styles.settingInfo}>
              <Text style={styles.settingName}>
                Color de la app
              </Text>

              <Text
                style={[
                  styles.settingDescription,
                  {
                    fontSize: 11,
                    fontWeight: '600',
                  },
                  isLightTheme && {
                    color: '#FFFFFF',
                  },
                ]}
              >
                Personaliza el color de RivalSet
              </Text>
            </View>

            <View style={styles.profileSettingValue}>
              <View
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 9,
                  backgroundColor: accentColor,
                  borderWidth: 2,
                  borderColor: 'rgba(255,255,255,0.45)',
                  marginRight: 8,
                }}
              />

              <MaterialCommunityIcons
                name="chevron-right"
                size={20}
                color="#777C86"
              />
            </View>
          </TouchableOpacity>

          <View style={styles.settingDivider} />


          

        </View>


        {/* =================================================
            PREFERENCIAS
        ================================================= */}

        <Text style={styles.profileGlassSectionLabel}>
          PREFERENCIAS
        </Text>

        <View style={styles.profileSettingsGlass}>

          <View style={styles.settingRow}>
            <View style={styles.profileSettingGlassIcon}>
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

              <Text style={[styles.settingDescription, isLightTheme && { color: lightSecondaryText }]}>
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


          <View style={styles.settingRow}>
            <View style={styles.profileSettingGlassIcon}>
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

              <Text style={[styles.settingDescription, isLightTheme && { color: lightSecondaryText }]}>
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

<TouchableOpacity
  activeOpacity={0.85}
  onPress={deleteAccount}
  style={{
    marginTop: 10,
    marginBottom: 10,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,90,95,0.35)',
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
    ELIMINAR CUENTA
  </Text>
</TouchableOpacity>
      </ScrollView>
    </View>
  );

  /* =====================================================
     RUTINAS
  ===================================================== */

  // RIVALSET_NUTRITION_COMING_SOON
  const NutritionComingSoon = () => (
    <View style={styles.page}>
      <AppGradient />

      <PageHeader
        title="Nutrición"
        subtitle="El siguiente paso de tu progreso"
        showBack={false}
      />

      <View
        style={{
          flex: 1,
          paddingHorizontal: 22,
          justifyContent: 'center',
          paddingBottom: 95,
        }}
      >
        <View
          style={{
            alignSelf: 'center',
            width: 78,
            height: 78,
            borderRadius: 24,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: isLightTheme
              ? 'rgba(24,20,14,0.34)'
              : `${accentColor}22`,
            borderWidth: 1,
            borderColor: isLightTheme
              ? 'rgba(255,255,255,0.55)'
              : `${accentColor}70`,
            marginBottom: 24,
          }}
        >
          <MaterialCommunityIcons
            name="silverware-fork-knife"
            size={38}
            color="#FFFFFF"
          />
        </View>

        <View
          style={{
            alignSelf: 'center',
            paddingHorizontal: 13,
            paddingVertical: 6,
            borderRadius: 20,
            backgroundColor: `${accentColor}22`,
            borderWidth: 1,
            borderColor: `${accentColor}60`,
            marginBottom: 15,
          }}
        >
          <Text
            style={{
              color: '#FFFFFF',
              fontSize: 12,
              fontWeight: '900',
              letterSpacing: 1.1,
            }}
          >
            PRÓXIMAMENTE
          </Text>
        </View>

        <Text
          style={{
            color: '#FFFFFF',
            fontSize: 28,
            lineHeight: 34,
            fontWeight: '900',
            textAlign: 'center',
            letterSpacing: -0.8,
          }}
        >
          Tu nutrición, integrada en RivalSet
        </Text>

        <Text
          style={{
            color: '#FFFFFF',
            fontSize: 15,
            lineHeight: 22,
            fontWeight: '600',
            textAlign: 'center',
            marginTop: 13,
            paddingHorizontal: 8,
          }}
        >
          Estamos preparando una nueva experiencia para controlar tus calorías,
          macros y objetivos de forma rápida, precisa y conectada con tu progreso.
        </Text>

        <View
          style={{
            marginTop: 28,
            padding: 18,
            borderRadius: 20,
            backgroundColor: isLightTheme
              ? 'rgba(24,20,14,0.14)'
              : 'rgba(255,255,255,0.055)',
            borderWidth: 1,
            borderColor: isLightTheme
              ? 'rgba(255,255,255,0.38)'
              : 'rgba(255,255,255,0.10)',
          }}
        >
          {[
            ['target', 'Objetivos personalizados'],
            ['chart-donut', 'Calorías y macros de un vistazo'],
            ['camera-outline', 'Registro inteligente de alimentos'],
          ].map(([icon, label], index) => (
            <View
              key={label}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                marginBottom: index === 2 ? 0 : 16,
              }}
            >
              <View
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 11,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: 13,
                  backgroundColor: isLightTheme
                    ? 'rgba(24,20,14,0.28)'
                    : `${accentColor}18`,
                  borderWidth: 1,
                  borderColor: isLightTheme
                    ? 'rgba(255,255,255,0.40)'
                    : `${accentColor}30`,
                }}
              >
                <MaterialCommunityIcons
                  name={icon}
                  size={20}
                  color={isLightTheme ? '#FFFFFF' : accentColor}
                />
              </View>

              <Text
                style={{
                  color: '#F2F2F3',
                  fontSize: 14,
                  fontWeight: '700',
                }}
              >
                {label}
              </Text>
            </View>
          ))}
        </View>

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            marginTop: 22,
          }}
        >
          <MaterialCommunityIcons
            name="bell-outline"
            size={15}
            color={isLightTheme ? '#FFFFFF' : '#A8ABB2'}
          />

          <Text
            style={{
              color: isLightTheme ? '#FFFFFF' : '#A8ABB2',
              fontSize: 12,
              fontWeight: '600',
              marginLeft: 6,
            }}
          >
            Te avisaremos cuando esté disponible
          </Text>
        </View>
      </View>

      <BottomNavigation />
    </View>
  );

  const Nutrition = () => {

  // Estado local del buscador.
  // IMPORTANTE: escribir aquí NO debe actualizar App en cada pulsación.
  const [localFoodSearch, setLocalFoodSearch] = useState(foodSearchQuery || '');
  const [localFoodBrand, setLocalFoodBrand] = useState(foodBrandQuery || '');

  // RIVALSET_NUTRITION_ONBOARDING_V1
  const [nutritionProfile, setNutritionProfile] = useState(undefined);
  const [nutritionSetupLoading, setNutritionSetupLoading] = useState(true);
  const [nutritionSetupSaving, setNutritionSetupSaving] = useState(false);
  const [nutritionSetupStep, setNutritionSetupStep] = useState(0);
  const [nutritionSetupError, setNutritionSetupError] = useState('');

  const [nutritionSetupSex, setNutritionSetupSex] = useState('male');
  const [nutritionSetupAge, setNutritionSetupAge] = useState('');
  const [nutritionSetupHeight, setNutritionSetupHeight] = useState('');
  const [nutritionSetupWeight, setNutritionSetupWeight] = useState('');
  const [nutritionSetupActivity, setNutritionSetupActivity] = useState('moderate');
  const [nutritionSetupSteps, setNutritionSetupSteps] = useState('');
  const [nutritionSetupTrainingDays, setNutritionSetupTrainingDays] = useState(3);

  const [nutritionSetupGoal, setNutritionSetupGoal] = useState('lose');
  const [nutritionSetupTargetWeight, setNutritionSetupTargetWeight] = useState('');
  const [nutritionSetupWeeks, setNutritionSetupWeeks] = useState(16);
  const [nutritionSliderWidth, setNutritionSliderWidth] = useState(1);

  const nutritionNumber = (value) => {
    const n = Number(String(value ?? '').replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
  };

  const getNutritionBaseEstimate = () => {
    const age = nutritionNumber(nutritionSetupAge);
    const height = nutritionNumber(nutritionSetupHeight);
    const weight = nutritionNumber(nutritionSetupWeight);

    if (!age || !height || !weight) {
      return { bmr: 0, tdee: 0 };
    }

    const bmr =
      nutritionSetupSex === 'female'
        ? 10 * weight + 6.25 * height - 5 * age - 161
        : 10 * weight + 6.25 * height - 5 * age + 5;

    const activityFactors = {
      very_low: 1.20,
      low: 1.30,
      moderate: 1.40,
      high: 1.50,
      very_high: 1.60,
    };

    let factor = activityFactors[nutritionSetupActivity] || 1.40;

    const trainingDays = Math.max(
      0,
      Math.min(7, Number(nutritionSetupTrainingDays) || 0)
    );

    factor += Math.min(trainingDays * 0.025, 0.15);

    const steps = nutritionNumber(nutritionSetupSteps);

    if (steps > 0) {
      if (steps >= 13000) factor += 0.10;
      else if (steps >= 10000) factor += 0.07;
      else if (steps >= 7500) factor += 0.04;
      else if (steps < 4000) factor -= 0.04;
    }

    factor = Math.max(1.18, Math.min(factor, 1.85));

    return {
      bmr: Math.round(bmr),
      tdee: Math.round(bmr * factor),
    };
  };

  const getNutritionWeekBounds = () => {
    const currentWeight = nutritionNumber(nutritionSetupWeight);
    const targetWeight = nutritionNumber(nutritionSetupTargetWeight);
    const { tdee } = getNutritionBaseEstimate();

    if (
      nutritionSetupGoal === 'maintain' ||
      !currentWeight ||
      !targetWeight ||
      !tdee
    ) {
      return { min: 1, max: 1 };
    }

    const delta = Math.abs(targetWeight - currentWeight);

    if (!delta) {
      return { min: 1, max: 1 };
    }

    const losing = nutritionSetupGoal === 'lose';

    const fastestKgWeek = currentWeight * (losing ? 0.01 : 0.005);
    const slowestKgWeek = currentWeight * (losing ? 0.0025 : 0.001);

    const minByBodyRate = Math.ceil(delta / Math.max(fastestKgWeek, 0.01));

    const maxDailyAdjustment = tdee * (losing ? 0.25 : 0.15);

    const minByCalories = Math.ceil(
      (delta * 7700) / Math.max(maxDailyAdjustment * 7, 1)
    );

    let min = Math.max(4, minByBodyRate, minByCalories);
    let max = Math.ceil(delta / Math.max(slowestKgWeek, 0.01));

    max = Math.min(Math.max(max, min + 4), 104);

    return { min, max };
  };

  const calculateNutritionPlan = (weeksOverride = nutritionSetupWeeks) => {
    const currentWeight = nutritionNumber(nutritionSetupWeight);
    const targetWeight =
      nutritionSetupGoal === 'maintain'
        ? currentWeight
        : nutritionNumber(nutritionSetupTargetWeight);

    const { bmr, tdee } = getNutritionBaseEstimate();

    if (!currentWeight || !targetWeight || !bmr || !tdee) {
      return {
        bmr: 0,
        tdee: 0,
        calories: 0,
        protein: 0,
        carbs: 0,
        fats: 0,
        rateKgWeek: 0,
        ratePctWeek: 0,
        weeks: 0,
      };
    }

    let calories = tdee;
    let rateKgWeek = 0;
    let ratePctWeek = 0;
    let weeks = 0;

    if (nutritionSetupGoal !== 'maintain') {
      const bounds = getNutritionWeekBounds();

      weeks = Math.max(
        bounds.min,
        Math.min(bounds.max, Math.round(Number(weeksOverride) || bounds.min))
      );

      const delta = Math.abs(targetWeight - currentWeight);
      const rawDailyAdjustment = (delta * 7700) / (weeks * 7);

      const losing = nutritionSetupGoal === 'lose';
      const maxAdjustment = tdee * (losing ? 0.25 : 0.15);

      const dailyAdjustment = Math.min(
        rawDailyAdjustment,
        maxAdjustment
      );

      calories = Math.round(
        losing
          ? tdee - dailyAdjustment
          : tdee + dailyAdjustment
      );

      const sign = losing ? -1 : 1;
      rateKgWeek = sign * (delta / weeks);
      ratePctWeek =
        currentWeight > 0
          ? (rateKgWeek / currentWeight) * 100
          : 0;
    }

    calories = Math.max(1000, Math.round(calories));

    const referenceWeight =
      nutritionSetupGoal === 'lose'
        ? Math.min(currentWeight, targetWeight)
        : currentWeight;

    let protein = Math.round(
      referenceWeight *
        (nutritionSetupGoal === 'maintain' ? 1.6 : 1.8)
    );

    let fats = Math.round(referenceWeight * 0.8);

    if (protein * 4 + fats * 9 > calories * 0.8) {
      fats = Math.max(30, Math.round(referenceWeight * 0.6));
    }

    const carbs = Math.max(
      0,
      Math.round((calories - protein * 4 - fats * 9) / 4)
    );

    return {
      bmr,
      tdee,
      calories,
      protein,
      carbs,
      fats,
      rateKgWeek,
      ratePctWeek,
      weeks,
    };
  };

  useEffect(() => {
    let cancelled = false;

    const loadNutritionProfile = async () => {
      if (!session?.user?.id) {
        if (!cancelled) {
          setNutritionProfile(null);
          setNutritionSetupLoading(false);
        }
        return;
      }

      setNutritionSetupLoading(true);

      const { data, error } = await supabase
        .from('nutrition_profiles')
        .select('*')
        .eq('user_id', session.user.id)
        .maybeSingle();

      if (cancelled) return;

      if (error) {
        console.log('nutrition profile error:', error);
        setNutritionProfile(null);
        setNutritionSetupLoading(false);
        return;
      }

      setNutritionProfile(data || null);

      if (data) {
        if (data.sex_for_equation) {
          setNutritionSetupSex(data.sex_for_equation);
        }

        if (data.age) {
          setNutritionSetupAge(String(data.age));
        }

        if (data.height_cm) {
          setNutritionSetupHeight(String(data.height_cm));
        }

        if (data.current_weight_kg) {
          setNutritionSetupWeight(String(data.current_weight_kg));
        }

        if (data.activity_level) {
          setNutritionSetupActivity(data.activity_level);
        }

        if (data.steps_per_day != null) {
          setNutritionSetupSteps(String(data.steps_per_day));
        }

        if (data.training_days_per_week != null) {
          setNutritionSetupTrainingDays(
            Number(data.training_days_per_week)
          );
        }

        if (data.goal) {
          setNutritionSetupGoal(data.goal);
        }

        if (data.target_weight_kg) {
          setNutritionSetupTargetWeight(
            String(data.target_weight_kg)
          );
        }

        if (data.target_weeks) {
          setNutritionSetupWeeks(Number(data.target_weeks));
        }
      }

      setNutritionSetupLoading(false);
    };

    loadNutritionProfile();

    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

  const validateNutritionSetupStep = () => {
    setNutritionSetupError('');

    const age = nutritionNumber(nutritionSetupAge);
    const height = nutritionNumber(nutritionSetupHeight);
    const weight = nutritionNumber(nutritionSetupWeight);

    if (nutritionSetupStep === 0) {
      if (age < 18 || age > 100) {
        setNutritionSetupError(
          'Introduce una edad válida. Esta estimación está preparada para adultos.'
        );
        return false;
      }

      if (height < 120 || height > 230) {
        setNutritionSetupError('Introduce una altura válida.');
        return false;
      }

      if (weight < 35 || weight > 350) {
        setNutritionSetupError('Introduce un peso válido.');
        return false;
      }
    }

    if (nutritionSetupStep === 2) {
      const targetWeight = nutritionNumber(
        nutritionSetupTargetWeight
      );

      if (nutritionSetupGoal === 'lose') {
        if (!targetWeight || targetWeight >= weight) {
          setNutritionSetupError(
            'Para perder peso, el peso objetivo debe ser inferior al actual.'
          );
          return false;
        }
      }

      if (nutritionSetupGoal === 'gain') {
        if (!targetWeight || targetWeight <= weight) {
          setNutritionSetupError(
            'Para ganar peso, el peso objetivo debe ser superior al actual.'
          );
          return false;
        }
      }
    }

    return true;
  };

  const goNextNutritionSetup = () => {
    if (!validateNutritionSetupStep()) return;

    if (nutritionSetupStep === 2) {
      if (nutritionSetupGoal !== 'maintain') {
        const bounds = getNutritionWeekBounds();
        const middle = Math.round((bounds.min + bounds.max) / 2);
        setNutritionSetupWeeks(middle);
      }
    }

    setNutritionSetupStep((prev) => Math.min(prev + 1, 3));
  };

  const saveNutritionSetup = async () => {
    if (!session?.user?.id) {
      Alert.alert('Error', 'No hay una sesión de usuario activa.');
      return;
    }

    setNutritionSetupSaving(true);
    setNutritionSetupError('');

    const plan = calculateNutritionPlan();
    const currentWeight = nutritionNumber(nutritionSetupWeight);
    const targetWeight =
      nutritionSetupGoal === 'maintain'
        ? currentWeight
        : nutritionNumber(nutritionSetupTargetWeight);

    if (!plan.calories) {
      Alert.alert(
        'No se pudo calcular',
        'Revisa los datos de tu configuración.'
      );
      return;
    }

    setNutritionSetupSaving(true);

    const payload = {
      user_id: session.user.id,
      sex_for_equation: nutritionSetupSex,
      age: Math.round(nutritionNumber(nutritionSetupAge)),
      height_cm: nutritionNumber(nutritionSetupHeight),
      current_weight_kg: currentWeight,
      target_weight_kg: targetWeight,
      activity_level: nutritionSetupActivity,
      steps_per_day:
        nutritionNumber(nutritionSetupSteps) > 0
          ? Math.round(nutritionNumber(nutritionSetupSteps))
          : null,
      training_days_per_week: Number(
        nutritionSetupTrainingDays
      ),
      goal: nutritionSetupGoal,
      target_weeks:
        nutritionSetupGoal === 'maintain'
          ? null
          : plan.weeks,
      target_rate_kg_week: Number(
        plan.rateKgWeek.toFixed(3)
      ),
      target_rate_pct_week: Number(
        plan.ratePctWeek.toFixed(3)
      ),
      estimated_bmr: plan.bmr,
      estimated_tdee: plan.tdee,
      target_calories: plan.calories,
      protein_g: plan.protein,
      carbs_g: plan.carbs,
      fat_g: plan.fats,
      setup_completed: true,
      algorithm_version: 'v1',
      updated_at: new Date().toISOString(),
    };

    try {
      const saveRequest = supabase
        .from('nutrition_profiles')
        .upsert(payload, { onConflict: 'user_id' })
        .select()
        .single();

      const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('TIMEOUT_NUTRITION_SAVE')), 10000)
      );

      const { data, error } = await Promise.race([saveRequest, timeout]);

      if (error) throw error;
      if (!data) throw new Error('NUTRITION_PROFILE_WITHOUT_DATA');

      setNutritionProfile(data);
      setNutritionSetupError('');
      console.log('nutrition profile saved:', data);
    } catch (error) {
      console.log('save nutrition profile error:', error);
      setNutritionSetupError(
        error?.message === 'TIMEOUT_NUTRITION_SAVE'
          ? 'El servidor ha tardado demasiado. Inténtalo de nuevo.'
          : 'No se pudo guardar tu objetivo nutricional.'
      );
      Alert.alert(
        'Error',
        error?.message === 'TIMEOUT_NUTRITION_SAVE'
          ? 'El servidor ha tardado demasiado. Inténtalo de nuevo.'
          : 'No se pudo guardar tu objetivo nutricional.'
      );
    } finally {
      setNutritionSetupSaving(false);
    }
  };

  const nutritionChoice = (
    selected,
    title,
    subtitle,
    onPress
  ) => (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      style={{
        borderWidth: 1,
        borderColor: selected
          ? COLORS.orange
          : 'rgba(255,255,255,0.10)',
        backgroundColor: selected
          ? 'rgba(255,140,0,0.10)'
          : '#15171C',
        borderRadius: 14,
        paddingHorizontal: 14,
        paddingVertical: 13,
        marginBottom: 9,
      }}
    >
      <Text
        style={{
          color: '#FFFFFF',
          fontSize: 14,
          fontWeight: '900',
        }}
      >
        {title}
      </Text>

      {!!subtitle && (
        <Text
          style={{
            color: '#8D9098',
            fontSize: 11,
            fontWeight: '600',
            marginTop: 3,
            lineHeight: 16,
          }}
        >
          {subtitle}
        </Text>
      )}
    </TouchableOpacity>
  );

  if (sessionLoading || nutritionSetupLoading) {
    return (
      <View style={styles.page}>
        <AppGradient />

        <PageHeader
          title="Nutrición"
          subtitle="Preparando tus objetivos"
          showBack={selectedTab !== 'Nutrición'}
        />

        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ActivityIndicator
            size="large"
            color={COLORS.orange}
          />

          <Text
            style={{
              color: '#9A9DA5',
              marginTop: 14,
              fontWeight: '700',
            }}
          >
            Cargando...
          </Text>
        </View>
      </View>
    );
  }

  if (!session?.user?.id) {
    return (
      <View style={styles.page}>
        <AppGradient />

        <PageHeader
          title="Nutrición"
          subtitle="Tu alimentación y objetivos"
          showBack={selectedTab !== 'Nutrición'}
        />

        <View
          style={{
            flex: 1,
            paddingHorizontal: 20,
            justifyContent: 'center',
          }}
        >
          <View
            style={{
              backgroundColor: 'rgba(72,62,42,0.42)',
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.18)',
              borderRadius: 20,
              padding: 22,
            }}
          >
            <MaterialCommunityIcons
              name="account-lock-outline"
              size={34}
              color={COLORS.orange}
            />

            <Text
              style={{
                color: '#FFFFFF',
                fontSize: 22,
                fontWeight: '900',
                marginTop: 14,
              }}
            >
              Inicia sesión
            </Text>

            <Text
              style={{
                color: '#9A9DA5',
                fontSize: 13,
                lineHeight: 19,
                marginTop: 7,
              }}
            >
              Necesitamos guardar tus objetivos y tu progreso en tu cuenta.
            </Text>

            <TouchableOpacity
              onPress={openProfile}
              activeOpacity={0.85}
              style={{
                backgroundColor: COLORS.orange,
                borderRadius: 14,
                paddingVertical: 15,
                alignItems: 'center',
                marginTop: 20,
              }}
            >
              <Text
                style={{
                  color: '#111111',
                  fontSize: 13,
                  fontWeight: '900',
                }}
              >
                IR A PERFIL
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  if (!nutritionProfile?.setup_completed) {
    const plan = calculateNutritionPlan();
    const weekBounds = getNutritionWeekBounds();

    const safeWeeks =
      nutritionSetupGoal === 'maintain'
        ? 0
        : Math.max(
            weekBounds.min,
            Math.min(
              weekBounds.max,
              Number(nutritionSetupWeeks) || weekBounds.min
            )
          );

    const sliderProgress =
      nutritionSetupGoal === 'maintain' ||
      weekBounds.max === weekBounds.min
        ? 0
        : (safeWeeks - weekBounds.min) /
          (weekBounds.max - weekBounds.min);

    const updateWeeksFromPosition = (x) => {
      if (
        nutritionSetupGoal === 'maintain' ||
        nutritionSliderWidth <= 1
      ) {
        return;
      }

      const clampedX = Math.max(
        0,
        Math.min(x, nutritionSliderWidth)
      );

      const progress = clampedX / nutritionSliderWidth;

      const weeks = Math.round(
        weekBounds.min +
          progress * (weekBounds.max - weekBounds.min)
      );

      setNutritionSetupWeeks(weeks);
    };

    return (
      <View style={styles.page}>
        <AppGradient />

        <PageHeader
          title="Configura tu nutrición"
          subtitle={`Paso ${nutritionSetupStep + 1} de 4`}
          showBack={false}
        />

        <View
          style={{
            height: 4,
            backgroundColor: '#22252B',
            marginHorizontal: 20,
            borderRadius: 99,
            overflow: 'hidden',
          }}
        >
          <View
            style={{
              height: 4,
              width: `${((nutritionSetupStep + 1) / 4) * 100}%`,
              backgroundColor: COLORS.orange,
              borderRadius: 99,
            }}
          />
        </View>

        <ScrollView
          contentContainerStyle={{
            padding: 20,
            paddingBottom: 130,
          }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {nutritionSetupStep === 0 && (
            <>
              <Text
                style={{
                  color: '#FFFFFF',
                  fontSize: 25,
                  fontWeight: '900',
                  marginBottom: 6,
                }}
              >
                Sobre ti
              </Text>

              <Text
                style={{
                  color: '#8F9299',
                  fontSize: 13,
                  lineHeight: 19,
                  marginBottom: 22,
                }}
              >
                Estos datos sirven para obtener una primera estimación de tu gasto energético.
              </Text>

              <Text
                style={{
                  color: '#FFFFFF',
                  fontWeight: '800',
                  marginBottom: 8,
                }}
              >
                Sexo para el cálculo metabólico
              </Text>

              <View
                style={{
                  flexDirection: 'row',
                  gap: 9,
                  marginBottom: 18,
                }}
              >
                <TouchableOpacity
                  onPress={() =>
                    setNutritionSetupSex('male')
                  }
                  style={{
                    flex: 1,
                    paddingVertical: 14,
                    borderRadius: 13,
                    alignItems: 'center',
                    borderWidth: 1,
                    borderColor:
                      nutritionSetupSex === 'male'
                        ? COLORS.orange
                        : '#2B2E35',
                    backgroundColor:
                      nutritionSetupSex === 'male'
                        ? 'rgba(255,140,0,0.10)'
                        : '#15171C',
                  }}
                >
                  <Text
                    style={{
                      color: '#FFFFFF',
                      fontWeight: '900',
                    }}
                  >
                    Hombre
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() =>
                    setNutritionSetupSex('female')
                  }
                  style={{
                    flex: 1,
                    paddingVertical: 14,
                    borderRadius: 13,
                    alignItems: 'center',
                    borderWidth: 1,
                    borderColor:
                      nutritionSetupSex === 'female'
                        ? COLORS.orange
                        : '#2B2E35',
                    backgroundColor:
                      nutritionSetupSex === 'female'
                        ? 'rgba(255,140,0,0.10)'
                        : '#15171C',
                  }}
                >
                  <Text
                    style={{
                      color: '#FFFFFF',
                      fontWeight: '900',
                    }}
                  >
                    Mujer
                  </Text>
                </TouchableOpacity>
              </View>

              {[
                ['Edad', nutritionSetupAge, setNutritionSetupAge, 'años'],
                ['Altura', nutritionSetupHeight, setNutritionSetupHeight, 'cm'],
                ['Peso actual', nutritionSetupWeight, setNutritionSetupWeight, 'kg'],
              ].map(([label, value, setter, unit]) => (
                <View
                  key={label}
                  style={{ marginBottom: 14 }}
                >
                  <Text
                    style={{
                      color: '#FFFFFF',
                      fontSize: 13,
                      fontWeight: '800',
                      marginBottom: 7,
                    }}
                  >
                    {label}
                  </Text>

                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      backgroundColor: '#15171C',
                      borderRadius: 13,
                      borderWidth: 1,
                      borderColor: '#292C33',
                      paddingHorizontal: 13,
                    }}
                  >
                    <TextInput
                      value={value}
                      onChangeText={setter}
                      keyboardType="decimal-pad"
                      placeholder="0"
                      placeholderTextColor="#60636B"
                      style={{
                        flex: 1,
                        height: 50,
                        color: '#FFFFFF',
                        fontWeight: '800',
                        fontSize: 16,
                      }}
                    />

                    <Text
                      style={{
                        color: '#777B84',
                        fontWeight: '800',
                      }}
                    >
                      {unit}
                    </Text>
                  </View>
                </View>
              ))}
            </>
          )}

          {nutritionSetupStep === 1 && (
            <>
              <Text
                style={{
                  color: '#FFFFFF',
                  fontSize: 25,
                  fontWeight: '900',
                  marginBottom: 6,
                }}
              >
                Tu actividad
              </Text>

              <Text
                style={{
                  color: '#8F9299',
                  fontSize: 13,
                  lineHeight: 19,
                  marginBottom: 20,
                }}
              >
                Piensa en tu actividad diaria fuera del gimnasio.
              </Text>

              {nutritionChoice(
                nutritionSetupActivity === 'very_low',
                'Muy baja',
                'Trabajo principalmente sentado y poco movimiento.',
                () => setNutritionSetupActivity('very_low')
              )}

              {nutritionChoice(
                nutritionSetupActivity === 'low',
                'Baja',
                'Te mueves algo durante el día.',
                () => setNutritionSetupActivity('low')
              )}

              {nutritionChoice(
                nutritionSetupActivity === 'moderate',
                'Moderada',
                'Caminas y te mantienes activo con frecuencia.',
                () => setNutritionSetupActivity('moderate')
              )}

              {nutritionChoice(
                nutritionSetupActivity === 'high',
                'Alta',
                'Trabajo activo o muchas horas en movimiento.',
                () => setNutritionSetupActivity('high')
              )}

              {nutritionChoice(
                nutritionSetupActivity === 'very_high',
                'Muy alta',
                'Actividad física elevada durante gran parte del día.',
                () => setNutritionSetupActivity('very_high')
              )}

              <Text
                style={{
                  color: '#FFFFFF',
                  fontWeight: '900',
                  marginTop: 15,
                  marginBottom: 10,
                }}
              >
                Entrenamientos por semana
              </Text>

              <View
                style={{
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  gap: 8,
                }}
              >
                {[0,1,2,3,4,5,6,7].map((day) => (
                  <TouchableOpacity
                    key={day}
                    onPress={() =>
                      setNutritionSetupTrainingDays(day)
                    }
                    style={{
                      width: 42,
                      height: 42,
                      borderRadius: 12,
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderWidth: 1,
                      borderColor:
                        nutritionSetupTrainingDays === day
                          ? COLORS.orange
                          : '#292C33',
                      backgroundColor:
                        nutritionSetupTrainingDays === day
                          ? 'rgba(255,140,0,0.10)'
                          : '#15171C',
                    }}
                  >
                    <Text
                      style={{
                        color: '#FFFFFF',
                        fontWeight: '900',
                      }}
                    >
                      {day}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text
                style={{
                  color: '#FFFFFF',
                  fontWeight: '900',
                  marginTop: 22,
                  marginBottom: 8,
                }}
              >
                Pasos diarios aproximados
              </Text>

              <View
                style={{
                  backgroundColor: '#15171C',
                  borderRadius: 13,
                  borderWidth: 1,
                  borderColor: '#292C33',
                  paddingHorizontal: 13,
                }}
              >
                <TextInput
                  value={nutritionSetupSteps}
                  onChangeText={setNutritionSetupSteps}
                  keyboardType="number-pad"
                  placeholder="Opcional"
                  placeholderTextColor="#60636B"
                  style={{
                    height: 50,
                    color: '#FFFFFF',
                    fontWeight: '800',
                    fontSize: 16,
                  }}
                />
              </View>
            </>
          )}

          {nutritionSetupStep === 2 && (
            <>
              <Text
                style={{
                  color: '#FFFFFF',
                  fontSize: 25,
                  fontWeight: '900',
                  marginBottom: 6,
                }}
              >
                ¿Cuál es tu objetivo?
              </Text>

              <Text
                style={{
                  color: '#8F9299',
                  fontSize: 13,
                  lineHeight: 19,
                  marginBottom: 20,
                }}
              >
                RivalSet adaptará las calorías al objetivo que elijas.
              </Text>

              {nutritionChoice(
                nutritionSetupGoal === 'lose',
                'Perder grasa',
                'Crear un déficit calórico progresivo.',
                () => setNutritionSetupGoal('lose')
              )}

              {nutritionChoice(
                nutritionSetupGoal === 'maintain',
                'Mantener peso',
                'Mantenerte aproximadamente en tu gasto energético.',
                () => setNutritionSetupGoal('maintain')
              )}

              {nutritionChoice(
                nutritionSetupGoal === 'gain',
                'Ganar peso / músculo',
                'Crear un superávit calórico controlado.',
                () => setNutritionSetupGoal('gain')
              )}

              {nutritionSetupGoal !== 'maintain' && (
                <View style={{ marginTop: 17 }}>
                  <Text
                    style={{
                      color: '#FFFFFF',
                      fontWeight: '900',
                      marginBottom: 8,
                    }}
                  >
                    Peso objetivo
                  </Text>

                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      backgroundColor: '#15171C',
                      borderRadius: 13,
                      borderWidth: 1,
                      borderColor: '#292C33',
                      paddingHorizontal: 13,
                    }}
                  >
                    <TextInput
                      value={nutritionSetupTargetWeight}
                      onChangeText={setNutritionSetupTargetWeight}
                      keyboardType="decimal-pad"
                      placeholder="0"
                      placeholderTextColor="#60636B"
                      style={{
                        flex: 1,
                        height: 50,
                        color: '#FFFFFF',
                        fontWeight: '800',
                        fontSize: 16,
                      }}
                    />

                    <Text
                      style={{
                        color: '#777B84',
                        fontWeight: '800',
                      }}
                    >
                      kg
                    </Text>
                  </View>
                </View>
              )}
            </>
          )}

          {nutritionSetupStep === 3 && (
            <>
              <Text
                style={{
                  color: '#FFFFFF',
                  fontSize: 25,
                  fontWeight: '900',
                  marginBottom: 6,
                }}
              >
                Tu plan inicial
              </Text>

              <Text
                style={{
                  color: '#8F9299',
                  fontSize: 13,
                  lineHeight: 19,
                  marginBottom: 22,
                }}
              >
                Es una estimación inicial. RivalSet podrá ajustarla más adelante con tu evolución real.
              </Text>

              {nutritionSetupGoal !== 'maintain' && (
                <View
                  style={{
                    backgroundColor: 'rgba(72,62,42,0.42)',
                    borderWidth: 1,
                    borderColor: 'rgba(255,255,255,0.18)',
                    borderRadius: 18,
                    padding: 18,
                    marginBottom: 14,
                  }}
                >
                  <Text
                    style={{
                      color: '#8F9299',
                      fontSize: 12,
                      fontWeight: '800',
                    }}
                  >
                    DURACIÓN DEL OBJETIVO
                  </Text>

                  <Text
                    style={{
                      color: '#FFFFFF',
                      fontSize: 30,
                      fontWeight: '900',
                      marginTop: 5,
                    }}
                  >
                    {safeWeeks} semanas
                  </Text>

                  <View
                    onLayout={(e) =>
                      setNutritionSliderWidth(
                        e.nativeEvent.layout.width
                      )
                    }
                    onStartShouldSetResponder={() => true}
                    onMoveShouldSetResponder={() => true}
                    onResponderGrant={(e) =>
                      updateWeeksFromPosition(
                        e.nativeEvent.locationX
                      )
                    }
                    onResponderMove={(e) =>
                      updateWeeksFromPosition(
                        e.nativeEvent.locationX
                      )
                    }
                    style={{
                      height: 34,
                      justifyContent: 'center',
                      marginTop: 14,
                    }}
                  >
                    <View
                      style={{
                        height: 6,
                        borderRadius: 99,
                        backgroundColor: '#2B2E35',
                        overflow: 'hidden',
                      }}
                    >
                      <View
                        style={{
                          width: `${sliderProgress * 100}%`,
                          height: 6,
                          backgroundColor: COLORS.orange,
                        }}
                      />
                    </View>

                    <View
                      pointerEvents="none"
                      style={{
                        position: 'absolute',
                        left: `${sliderProgress * 100}%`,
                        marginLeft: -10,
                        width: 20,
                        height: 20,
                        borderRadius: 10,
                        backgroundColor: COLORS.orange,
                        borderWidth: 3,
                        borderColor: '#FFFFFF',
                      }}
                    />
                  </View>

                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                    }}
                  >
                    <Text
                      style={{
                        color: '#747780',
                        fontSize: 10,
                        fontWeight: '800',
                      }}
                    >
                      MÁS RÁPIDO
                    </Text>

                    <Text
                      style={{
                        color: '#747780',
                        fontSize: 10,
                        fontWeight: '800',
                      }}
                    >
                      MÁS GRADUAL
                    </Text>
                  </View>

                  <Text
                    style={{
                      color: '#A1A4AB',
                      fontSize: 12,
                      fontWeight: '700',
                      marginTop: 14,
                    }}
                  >
                    {Math.abs(plan.rateKgWeek).toFixed(2)} kg/semana · {Math.abs(plan.ratePctWeek).toFixed(2)}% de tu peso/semana
                  </Text>
                </View>
              )}

              <View
                style={{
                  backgroundColor: 'rgba(72,62,42,0.42)',
                  borderWidth: 1,
                  borderColor: COLORS.orange,
                  borderRadius: 20,
                  padding: 20,
                }}
              >
                <Text
                  style={{
                    color: '#8F9299',
                    fontSize: 11,
                    fontWeight: '900',
                  }}
                >
                  OBJETIVO DIARIO
                </Text>

                <Text
                  style={{
                    color: '#FFFFFF',
                    fontSize: 38,
                    fontWeight: '900',
                    marginTop: 4,
                  }}
                >
                  {plan.calories} kcal
                </Text>

                <Text
                  style={{
                    color: '#777B84',
                    fontSize: 11,
                    fontWeight: '700',
                    marginTop: 3,
                  }}
                >
                  Mantenimiento estimado: {plan.tdee} kcal
                </Text>

                <View
                  style={{
                    flexDirection: 'row',
                    marginTop: 20,
                    gap: 8,
                  }}
                >
                  {[
                    ['Proteína', `${plan.protein} g`],
                    ['Carbos', `${plan.carbs} g`],
                    ['Grasas', `${plan.fats} g`],
                  ].map(([name, value]) => (
                    <View
                      key={name}
                      style={{
                        flex: 1,
                        backgroundColor: '#181A20',
                        borderRadius: 12,
                        paddingVertical: 12,
                        alignItems: 'center',
                      }}
                    >
                      <Text
                        style={{
                          color: '#FFFFFF',
                          fontSize: 15,
                          fontWeight: '900',
                        }}
                      >
                        {value}
                      </Text>

                      <Text
                        style={{
                          color: '#757983',
                          fontSize: 9,
                          fontWeight: '800',
                          marginTop: 3,
                        }}
                      >
                        {name.toUpperCase()}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            </>
          )}

          {!!nutritionSetupError && (
            <Text
              style={{
                color: '#FF6B6B',
                fontSize: 12,
                fontWeight: '700',
                lineHeight: 17,
                marginTop: 16,
              }}
            >
              {nutritionSetupError}
            </Text>
          )}

          <View
            style={{
              flexDirection: 'row',
              gap: 10,
              marginTop: 24,
            }}
          >
            {nutritionSetupStep >= 0 && (
                <TouchableOpacity
                  onPress={() => {
                    setNutritionSetupError('');
                    if (nutritionSetupStep === 0) {
                      setScreen('home');
                    } else {
                      setNutritionSetupStep((prev) =>
                        Math.max(0, prev - 1)
                      );
                    }
                  }}
                style={{
                  width: 100,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: '#30333A',
                  paddingVertical: 15,
                  alignItems: 'center',
                }}
              >
                <Text
                  style={{
                    color: '#FFFFFF',
                    fontWeight: '900',
                  }}
                >{nutritionSetupStep === 0 ? 'SALIR' : 'ATRÁS'}</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              disabled={nutritionSetupSaving}
              onPress={
                nutritionSetupStep === 3
                  ? saveNutritionSetup
                  : goNextNutritionSetup
              }
              activeOpacity={0.85}
              style={{
                flex: 1,
                borderRadius: 14,
                paddingVertical: 15,
                alignItems: 'center',
                backgroundColor: COLORS.orange,
                opacity: nutritionSetupSaving ? 0.6 : 1,
              }}
            >
              <Text
                style={{
                  color: '#111111',
                  fontWeight: '900',
                }}
              >
                {nutritionSetupSaving
                  ? 'GUARDANDO...'
                  : nutritionSetupStep === 3
                    ? 'USAR ESTOS OBJETIVOS'
                    : 'CONTINUAR'}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    );
  }


const caloriesGoal =
  Number(nutritionProfile?.target_calories) ||
  nutritionGoals.calories;

const proteinGoal =
  Number(nutritionProfile?.protein_g) ||
  nutritionGoals.protein;

const carbsGoal =
  Number(nutritionProfile?.carbs_g) ||
  nutritionGoals.carbs;

const fatsGoal =
  Number(nutritionProfile?.fat_g) ||
  nutritionGoals.fats;
const nutritionTotals = nutritionEntries.reduce(
  (total, item) => ({
    calories: total.calories + (Number(item.calories) || 0),
    protein: total.protein + (Number(item.protein) || 0),
    carbs: total.carbs + (Number(item.carbs) || 0),
    fats: total.fats + (Number(item.fats) || 0),
  }),
  {
    calories: 0,
    protein: 0,
    carbs: 0,
    fats: 0,
  }
);

const caloriesConsumed = nutritionTotals.calories;

const caloriesRemaining = Math.max(
  caloriesGoal - caloriesConsumed,
  0
);

const calorieProgress = Math.min(
  caloriesConsumed / caloriesGoal,
  1
);  
const mealSummary = [
  ['Desayuno', 'coffee-outline'],
  ['Comida', 'silverware-fork-knife'],
  ['Cena', 'food-outline'],
  ['Snacks', 'food-apple-outline'],
].map(([name, icon]) => ({
  name,
  icon,
  calories: nutritionEntries
    .filter((item) => item.meal === name)
    .reduce(
      (total, item) => total + (Number(item.calories) || 0),
      0
    ),
  items: nutritionEntries.filter((item) => item.meal === name),
}));
const MacroRing = ({
    label,
    value,
    goal,
    unit = 'g',
    size = 82,
  }) => {
    const strokeWidth = 7;
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const progress = Math.min(value / goal, 1);
    const offset =
      circumference - progress * circumference;

    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
        }}
      >
        <View
          style={{
            width: size,
            height: size,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Svg
            width={size}
            height={size}
            style={{
              position: 'absolute',
              transform: [{ rotate: '-90deg' }],
            }}
          >
            <Circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke="#292C32"
              strokeWidth={strokeWidth}
              fill="none"
            />

            <Circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={COLORS.orange}
              strokeWidth={strokeWidth}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={`${circumference} ${circumference}`}
              strokeDashoffset={offset}
            />
          </Svg>

          <Text
            style={{
              color: '#FFFFFF',
              fontSize: 16,
              fontWeight: '900',
            }}
          >
            {Math.round(progress * 100)}%
          </Text>
        </View>

        <Text
          style={{
            color: '#FFFFFF',
            fontSize: 12,
            fontWeight: '800',
            marginTop: 8,
          }}
        >
          {label}
        </Text>

        <Text
          style={{
            color: '#8D9098',
            fontSize: 11,
            marginTop: 3,
          }}
        >
          {value} / {goal} {unit}
        </Text>
      </View>
    );
  };

  const calorieSize = 190;
  const calorieStroke = 12;
  const calorieRadius =
    (calorieSize - calorieStroke) / 2;
  const calorieCircumference =
    2 * Math.PI * calorieRadius;
  const calorieOffset =
    calorieCircumference -
    calorieProgress * calorieCircumference;

  return (
    <>
      <View style={styles.page}>
        <AppGradient />

        <PageHeader
          title="Nutrición"
          subtitle="Tu alimentación de hoy"
          showBack={selectedTab !== 'Nutrición'}
        />

        <ScrollView
          contentContainerStyle={[
            styles.pageContent,
            {
              paddingBottom: 120,
            },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {/* CALORÍAS */}
          <View
            style={{
              backgroundColor: 'rgba(72,62,42,0.42)',
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.18)',
              borderRadius: 20,
              padding: 18,
              marginBottom: 14,
              alignItems: 'center',
            }}
          >
            <Text
              style={{
                color: '#FFFFFF',
                fontSize: 16,
                fontWeight: '900',
                marginBottom: 16,
              }}
            >
              Calorías de hoy
            </Text>

            <View
              style={{
                width: calorieSize,
                height: calorieSize,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Svg
                width={calorieSize}
                height={calorieSize}
                style={{
                  position: 'absolute',
                  transform: [{ rotate: '-90deg' }],
                }}
              >
                <Circle
                  cx={calorieSize / 2}
                  cy={calorieSize / 2}
                  r={calorieRadius}
                  stroke="#292C32"
                  strokeWidth={calorieStroke}
                  fill="none"
                />

                <Circle
                  cx={calorieSize / 2}
                  cy={calorieSize / 2}
                  r={calorieRadius}
                  stroke={COLORS.orange}
                  strokeWidth={calorieStroke}
                  fill="none"
                  strokeLinecap="round"
                  strokeDasharray={`${calorieCircumference} ${calorieCircumference}`}
                  strokeDashoffset={calorieOffset}
                />
              </Svg>

              <Text
                style={{
                  color: '#FFFFFF',
                  fontSize: 30,
                  fontWeight: '900',
                }}
              >
                {caloriesConsumed}
              </Text>

              <Text
                style={{
                  color: '#8D9098',
                  fontSize: 12,
                  marginTop: 2,
                }}
              >
                de {caloriesGoal} kcal
              </Text>

              <Text
                style={{
                  color: COLORS.orange,
                  fontSize: 13,
                  fontWeight: '800',
                  marginTop: 7,
                }}
              >
                {caloriesRemaining} restantes
              </Text>
            </View>
          </View>

          {/* MACROS */}
          <View
            style={{
              backgroundColor: 'rgba(72,62,42,0.42)',
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.18)',
              borderRadius: 20,
              paddingVertical: 18,
              paddingHorizontal: 8,
              marginBottom: 14,
            }}
          >
            <View
              style={{
                flexDirection: 'row',
              }}
            >
              <MacroRing
                label="Proteína"
                value={nutritionTotals.protein}
goal={proteinGoal}
              />

              <MacroRing
                label="Carbohidratos"
                value={nutritionTotals.carbs}
goal={carbsGoal}
              />

              <MacroRing
                label="Grasas"
              value={nutritionTotals.fats}
goal={fatsGoal}
              />
            </View>
          </View>

          {/* ESCANEAR */}
          
        <BarcodeModal
          visible={barcodeScannerVisible}
          animationType="slide"
          presentationStyle="fullScreen"
          onRequestClose={closeBarcodeScanner}
        >
          <View
            style={{
              flex: 1,
              backgroundColor: '#000000',
            }}
          >
            <CameraView
              style={{ flex: 1 }}
              facing="back"
              barcodeScannerSettings={{
                barcodeTypes: [
                  'ean13',
                  'ean8',
                  'upc_a',
                  'upc_e',
                  'code128',
                ],
              }}
              onBarcodeScanned={
                barcodeScannerLocked ? undefined : handleBarcodeScanned
              }
            />

            <View
              pointerEvents="box-none"
              style={{
                position: 'absolute',
                top: 0,
                right: 0,
                bottom: 0,
                left: 0,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <TouchableOpacity
                onPress={closeBarcodeScanner}
                style={{
                  position: 'absolute',
                  top: 56,
                  right: 24,
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  backgroundColor: 'rgba(0,0,0,0.65)',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <MaterialCommunityIcons
                  name="close"
                  size={26}
                  color="#FFFFFF"
                />
              </TouchableOpacity>

              <View
                style={{
                  width: 290,
                  height: 180,
                  position: 'relative',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <View
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: 38,
                    height: 38,
                    borderTopWidth: 4,
                    borderLeftWidth: 4,
                    borderColor: '#F5A623',
                    borderTopLeftRadius: 10,
                  }}
                />
                <View
                  style={{
                    position: 'absolute',
                    top: 0,
                    right: 0,
                    width: 38,
                    height: 38,
                    borderTopWidth: 4,
                    borderRightWidth: 4,
                    borderColor: '#F5A623',
                    borderTopRightRadius: 10,
                  }}
                />
                <View
                  style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    width: 38,
                    height: 38,
                    borderBottomWidth: 4,
                    borderLeftWidth: 4,
                    borderColor: '#F5A623',
                    borderBottomLeftRadius: 10,
                  }}
                />
                <View
                  style={{
                    position: 'absolute',
                    bottom: 0,
                    right: 0,
                    width: 38,
                    height: 38,
                    borderBottomWidth: 4,
                    borderRightWidth: 4,
                    borderColor: '#F5A623',
                    borderBottomRightRadius: 10,
                  }}
                />

                <MaterialCommunityIcons
                  name="barcode-scan"
                  size={92}
                  color="rgba(255,255,255,0.88)"
                />
              </View>

              <View
                style={{
                  marginTop: 28,
                  backgroundColor: 'rgba(0,0,0,0.72)',
                  borderRadius: 14,
                  paddingHorizontal: 18,
                  paddingVertical: 11,
                }}
              >
                <Text
                  style={{
                    color: '#FFFFFF',
                    fontSize: 15,
                    fontWeight: '800',
                    textAlign: 'center',
                  }}
                >
                  Coloca el código dentro del recuadro
                </Text>
              </View>
            </View>
          </View>
        </BarcodeModal>

        <TouchableOpacity
          activeOpacity={0.82}
          onPress={openBarcodeScanner}
          style={{
            backgroundColor: 'rgba(72,62,42,0.42)',
            borderWidth: 1.5,
            borderColor: '#F5A623',
            borderRadius: 16,
            minHeight: 66,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 10,
          }}
        >
          <MaterialCommunityIcons
            name="barcode-scan"
            size={27}
            color="#F5A623"
          />

          <View style={{ marginLeft: 11 }}>
            <Text
              style={{
                color: '#F5A623',
                fontSize: 14,
                fontWeight: '900',
              }}
            >
              ESCANEAR CÓDIGO DE BARRAS
            </Text>

            <Text
              style={{
                color: '#A8ADB7',
                fontSize: 11,
                fontWeight: '600',
                marginTop: 2,
              }}
            >
              Producto envasado · máxima precisión
            </Text>
          </View>
        </TouchableOpacity>

<TouchableOpacity
            activeOpacity={0.8}
            onPress={pickNutritionPhoto}
            style={{
              backgroundColor: COLORS.orange,
              borderRadius: 16,
              minHeight: 64,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 10,
            }}
          >
            <MaterialCommunityIcons
              name="camera-outline"
              size={25}
              color="#08090C"
            />

            <Text
              style={{
                color: '#08090C',
                fontSize: 15,
                fontWeight: '900',
                marginLeft: 9,
              }}
            >
              ANALIZAR COMIDA
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.75}
            onPress={() => setShowNutritionManual(true)}
            style={{
              backgroundColor: 'rgba(72,62,42,0.42)',
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.18)',
              borderRadius: 14,
              minHeight: 52,
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 18,
            }}
          >
            <Text
              style={{
                color: '#FFFFFF',
                fontSize: 13,
                fontWeight: '800',
              }}
            >
              + Añadir manualmente
            </Text>
          </TouchableOpacity>

          {nutritionPhoto && (
            <View
              style={{
                marginBottom: 12,
                backgroundColor: 'rgba(72,62,42,0.42)',
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.18)',
                borderRadius: 14,
                padding: 10,
              }}
            >
              <Image
                source={{ uri: nutritionPhoto.uri }}
                style={{
                  width: '100%',
                  height: 220,
                  borderRadius: 10,
                  marginBottom: 10,
                }}
                resizeMode="cover"
              />

              <TouchableOpacity
                onPress={analyzeNutritionPhoto}
                disabled={nutritionPhotoLoading}
                activeOpacity={0.8}
                style={{
                  height: 46,
                  borderRadius: 11,
                  backgroundColor: COLORS.orange,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: nutritionPhotoLoading ? 0.6 : 1,
                }}
              >
                <Text
                  style={{
                    color: '#08090C',
                    fontSize: 13,
                    fontWeight: '900',
                  }}
                >
                  {nutritionPhotoLoading
                    ? 'ANALIZANDO COMIDA...'
                    : 'ANALIZAR FOTO'}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {nutritionPhotoResult && (
  <View
    style={{
      backgroundColor: 'rgba(72,62,42,0.42)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.18)',
      borderRadius: 14,
      padding: 14,
      marginBottom: 14,
    }}
  >
    <Text
      style={{
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '900',
        marginBottom: 4,
      }}
    >
      {nutritionPhotoResult.mealName || 'Comida detectada'}
    </Text>

    <Text
      style={{
        color: '#8D9098',
        fontSize: 12,
        marginBottom: 14,
      }}
    >
      Estimación IA · Confianza {nutritionPhotoResult.confidence || 'media'}
    </Text>

    {nutritionPhotoResult.foods?.map((food, index) => (
      <View
        key={`${food.name}-${index}`}
        style={{
          paddingVertical: 10,
          borderBottomWidth:
            index < nutritionPhotoResult.foods.length - 1 ? 1 : 0,
          borderBottomColor: '#24272E',
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <Text
            style={{
              color: '#FFFFFF',
              fontSize: 14,
              fontWeight: '800',
              flex: 1,
            }}
          >
            {food.name}
          </Text>

<View
  style={{
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  }}
>
  <TextInput
    value={
      food.gramsInput !== undefined
        ? String(food.gramsInput)
        : String(food.grams ?? '')
    }
    keyboardType="decimal-pad"
    blurOnSubmit={false}
    onChangeText={(value) => {
      setNutritionPhotoResult((prev) => {
        if (!prev) return prev;

        const foods = [...(prev.foods || [])];
        const current = foods[index];
        if (!current) return prev;

        foods[index] = {
          ...current,
          gramsInput: value,
        };

        return {
          ...prev,
          foods,
        };
      });
    }}
    onEndEditing={(event) => {
      const value = event.nativeEvent.text;
      updateNutritionPhotoFoodGrams(index, value);

      setNutritionPhotoResult((prev) => {
        if (!prev) return prev;

        const foods = [...(prev.foods || [])];
        const current = foods[index];
        if (!current) return prev;

        const { gramsInput, ...cleanFood } = current;
        foods[index] = cleanFood;

        return {
          ...prev,
          foods,
        };
      });
    }}
    style={{
      minWidth: 58,
      height: 34,
      paddingHorizontal: 8,
      borderRadius: 8,
      backgroundColor: '#1A1D23',
      borderWidth: 1,
      borderColor: '#343841',
      color: COLORS.orange,
      fontSize: 13,
      fontWeight: '900',
      textAlign: 'center',
    }}
  />

  <Text
    style={{
      color: COLORS.orange,
      fontSize: 13,
      fontWeight: '900',
    }}
  >
    g
  </Text>
</View>        </View>

        {food.nutrition && (
          <Text
            style={{
              color: '#8D9098',
              fontSize: 12,
              marginTop: 5,
            }}
          >
            {food.nutrition.calories} kcal · P {food.nutrition.protein} · C{' '}
            {food.nutrition.carbs} · G {food.nutrition.fats}
          </Text>
        )}
      </View>
    ))}

    <View
      style={{
        marginTop: 14,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: '#24272E',
      }}
    >
      <Text
        style={{
          color: '#FFFFFF',
          fontSize: 15,
          fontWeight: '900',
        }}
      >
        Total estimado: {nutritionPhotoResult.totals?.calories || 0} kcal
      </Text>

      <Text
        style={{
          color: '#8D9098',
          fontSize: 12,
          marginTop: 4,
        }}
      >
        Proteína {nutritionPhotoResult.totals?.protein || 0} g · Carbohidratos{' '}
        {nutritionPhotoResult.totals?.carbs || 0} g · Grasas{' '}
        {nutritionPhotoResult.totals?.fats || 0} g
      </Text>
    </View>
    <TouchableOpacity
  activeOpacity={0.8}
  onPress={() => {
    const entries = (nutritionPhotoResult.foods || []).map(
      (food, index) => ({
        id: Date.now() + index,
        meal: 'Comida',
        name: food.name,
        grams: Number(food.grams) || 0,
        unit: 'g',

        calories:
          Number(food.nutrition?.calories) || 0,
        protein:
          Number(food.nutrition?.protein) || 0,
        carbs:
          Number(food.nutrition?.carbs) || 0,
        fats:
          Number(food.nutrition?.fats) || 0,

        foodBase: food.nutrition
          ? {
              id: food.nutrition.usdaFdcId
                ? `usda-${food.nutrition.usdaFdcId}`
                : `ai-${Date.now()}-${index}`,
              name: food.name,
              brand: '',
              servingSize: '',
              quantity: '',
              calories100:
                Number(food.nutrition.calories100) || 0,
              protein100:
                Number(food.nutrition.protein100) || 0,
              carbs100:
                Number(food.nutrition.carbs100) || 0,
              fats100:
                Number(food.nutrition.fats100) || 0,
            }
          : null,
      })
    );

    setNutritionEntries((prev) => [
      ...prev,
      ...entries,
    ]);

    setNutritionPhoto(null);
    setNutritionPhotoResult(null);

    Alert.alert(
      'Comida añadida',
      'Los alimentos detectados se han añadido a Comidas de hoy.'
    );
  }}
  style={{
    height: 48,
    borderRadius: 11,
    backgroundColor: COLORS.orange,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
  }}
>
  <Text
    style={{
      color: '#08090C',
      fontSize: 13,
      fontWeight: '900',
    }}
  >
    AÑADIR COMIDA
  </Text>
</TouchableOpacity>
  </View>
)}
{showNutritionManual && (
  <View
    style={{
      backgroundColor: 'rgba(72,62,42,0.42)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.18)',
      borderRadius: 16,
      padding: 14,
      marginBottom: 18,
    }}
  >
    <Text
      style={{
        color: '#FFFFFF',
        fontSize: 15,
        fontWeight: '900',
        marginBottom: 12,
      }}
    >
      Añadir alimento
    </Text>

    {/* TIPO DE COMIDA */}
    <View
      style={{
        flexDirection: 'row',
        gap: 6,
        marginBottom: 10,
      }}
    >
      {['Desayuno', 'Comida', 'Cena', 'Snacks'].map((meal) => (
        <TouchableOpacity
          key={meal}
          onPress={() =>
            setNutritionDraft((prev) => ({
              ...prev,
              meal,
            }))
          }
          style={{
            flex: 1,
            minHeight: 42,
            borderRadius: 10,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor:
              nutritionDraft.meal === meal
                ? COLORS.orange
                : '#1B1D22',
          }}
        >
          <Text
            style={{
              color:
                nutritionDraft.meal === meal
                  ? '#08090C'
                  : '#FFFFFF',
              fontSize: 10,
              fontWeight: '800',
            }}
          >
            {meal}
          </Text>
        </TouchableOpacity>
      ))}
    </View>

<View style={{ marginBottom: 8 }}>
  <TextInput
    value={localFoodSearch}
    onChangeText={setLocalFoodSearch}
    placeholder="Buscar alimento..."
    placeholderTextColor={'#666A73'}
    returnKeyType="search"
    autoCapitalize="sentences"
    onSubmitEditing={() => {
      const query = localFoodSearch.trim();

      if (query.length < 2) {
        return;
      }

      setFoodSearchQuery(query);
      setFoodBrandQuery(localFoodBrand);
      setSelectedFood(null);

      setNutritionDraft((prev) => ({
        ...prev,
        name: query,
      }));

      searchFoodProducts(query, localFoodBrand);
    }}
    style={{
      height: 46,
      backgroundColor: '#1B1D22',
      borderRadius: 10,
      paddingHorizontal: 12,
      color: '#FFFFFF',
    }}
  />

  <TextInput
    value={localFoodBrand}
    onChangeText={setLocalFoodBrand}
    placeholder="Marca (opcional, recomendado)"
    placeholderTextColor={'#666A73'}
    autoCapitalize="words"
    returnKeyType="search"
    onSubmitEditing={() => {
      const query = localFoodSearch.trim();

      if (query.length < 2) {
        return;
      }

      setFoodSearchQuery(query);
      setFoodBrandQuery(localFoodBrand);
      setSelectedFood(null);

      setNutritionDraft((prev) => ({
        ...prev,
        name: query,
      }));

      searchFoodProducts(query, localFoodBrand);
    }}
    style={{
      height: 46,
      backgroundColor: '#1B1D22',
      borderRadius: 10,
      paddingHorizontal: 12,
      color: '#FFFFFF',
      marginTop: 8,
    }}
  />

  <Text
    style={{
      color: '#8D9098',
      fontSize: 11,
      fontWeight: '600',
      marginTop: 6,
      marginLeft: 2,
    }}
  >
    Añadir la marca mejora la precisión en productos comerciales.
  </Text>


  {foodSearchLoading && (
    <Text
      style={{
        color: '#8D9098',
        fontSize: 11,
        marginTop: 8,
      }}
    >
      Buscando alimentos...
    </Text>
  )}

  
              {!foodSearchLoading &&
                !selectedFood &&
                foodBrandQuery.trim().length > 0 &&
                foodSearchQuery.trim().length >= 2 &&
                foodSearchResults.length === 0 && (
                  <View
                    style={{
                      backgroundColor: '#16181D',
                      borderWidth: 1,
                      borderColor: '#42472E',
                      borderRadius: 10,
                      padding: 12,
                      marginTop: 8,
                    }}
                  >
                    <Text
                      style={{
                        color: '#FFFFFF',
                        fontSize: 12,
                        fontWeight: '800',
                      }}
                    >
                      No encontramos una ficha exacta de esa marca.
                    </Text>

                    <Text
                      style={{
                        color: '#9A9DA5',
                        fontSize: 11,
                        marginTop: 4,
                        lineHeight: 16,
                      }}
                    >
                      Escanea el código de barras o usa Foto de macros para obtener los valores exactos.
                    </Text>
                  </View>
                )}

{!selectedFood && foodSearchResults.length > 0 && (
    <View
      style={{
        backgroundColor: '#16181D',
        borderRadius: 10,
        marginTop: 6,
        overflow: 'hidden',
      }}
    >
      {foodSearchResults.slice(0, 6).map((product) => (
        <TouchableOpacity
          key={product.id}
          activeOpacity={0.7}
          onPress={() => {
            setSelectedFood(product);
            setFoodSearchQuery(product.name);
            setFoodSearchResults([]);
            const productInfo =
  `${product.name} ${product.quantity} ${product.servingSize}`.toLowerCase();

const isLiquid =
  /\b\d+(?:[.,]\d+)?\s*(ml|cl|l)\b/.test(productInfo) ||
  [
    'leche',
    'bebida',
    'zumo',
    'jugo',
    'agua',
    'refresco',
    'batido',
    'aceite',
    'caldo',
  ].some((word) => productInfo.includes(word));

setNutritionUnit(isLiquid ? 'ml' : 'g');

            setNutritionDraft((prev) => ({
              ...prev,
              name: product.name,
              grams: '100',
              calories: String(
                Math.round(product.calories100)
              ),
              protein: String(
                Math.round(product.protein100 * 10) / 10
              ),
              carbs: String(
                Math.round(product.carbs100 * 10) / 10
              ),
              fats: String(
                Math.round(product.fats100 * 10) / 10
              ),
            }));
          }}
          style={{
            paddingHorizontal: 12,
            paddingVertical: 10,
            borderBottomWidth: 1,
            borderBottomColor: '#24272E',
          }}
        >
          <Text
            style={{
              color: '#FFFFFF',
              fontSize: 12,
              fontWeight: '800',
            }}
            numberOfLines={1}
          >
            {product.name}
          </Text>

          <Text
            style={{
              color: '#8D9098',
              fontSize: 10,
              marginTop: 3,
            }}
            numberOfLines={1}
          >
{product.brand || 'Sin marca'}
{product.quantity ? ` · ${product.quantity}` : ''}
{product.servingSize ? ` · Ración ${product.servingSize}` : ''}
{'\n'}
{Math.round(product.calories100)} kcal / 100 {
  (
    /\b\d+(?:[.,]\d+)?\s*(ml|cl|l)\b/.test(
      `${product.name} ${product.quantity} ${product.servingSize}`.toLowerCase()
    ) ||
    [
      'leche',
      'bebida',
      'zumo',
      'jugo',
      'agua',
      'refresco',
      'batido',
      'aceite',
      'caldo',
    ].some((word) =>
      `${product.name} ${product.quantity} ${product.servingSize}`
        .toLowerCase()
        .includes(word)
    )
  )
    ? 'ml'
    : 'g'
}
{' · '}P {Math.round(product.protein100 * 10) / 10}
{' · '}C {Math.round(product.carbs100 * 10) / 10}
{' · '}G {Math.round(product.fats100 * 10) / 10}          </Text>
        </TouchableOpacity>
      ))}
    </View>
  )}
</View>
  
<View
  style={{
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  }}
>
  <TextInput
    value={nutritionDraft.grams}
    onChangeText={(value) => {
      const cleanValue = value.replace(',', '.');
      const amount = Number(cleanValue) || 0;

      setNutritionDraft((prev) => {
        if (!selectedFood) {
          return {
            ...prev,
            grams: value,
          };
        }

        const servingAmount =
  Number(
    String(selectedFood?.servingSize || '')
      .replace(',', '.')
      .match(/[\d.]+/)?.[0]
  ) || 0;

const baseAmount =
  nutritionUnit === 'porción' && servingAmount > 0
    ? amount * servingAmount
    : amount;

const ratio = baseAmount / 100;

        return {
          ...prev,
          grams: value,
          calories: String(
            Math.round(selectedFood.calories100 * ratio)
          ),
          protein: String(
            Math.round(selectedFood.protein100 * ratio * 10) / 10
          ),
          carbs: String(
            Math.round(selectedFood.carbs100 * ratio * 10) / 10
          ),
          fats: String(
            Math.round(selectedFood.fats100 * ratio * 10) / 10
          ),
        };
      });
    }}
    placeholder="Cantidad"
    placeholderTextColor={'#666A73'}
    keyboardType="decimal-pad"
    style={{
      flex: 1,
      height: 46,
      backgroundColor: '#1B1D22',
      borderRadius: 10,
      paddingHorizontal: 12,
      color: '#FFFFFF',
    }}
  />

  <View
    style={{
      flexDirection: 'row',
      backgroundColor: '#1B1D22',
      borderRadius: 10,
      padding: 3,
    }}
  >
    {[
  'g',
  'ml',
  ...(selectedFood?.servingSize ? ['porción'] : []),
].map((unit) => (
      <TouchableOpacity
        key={unit}
        onPress={() => {
  const currentAmount =
    Number(String(nutritionDraft.grams).replace(',', '.')) || 0;

  const servingAmount =
    Number(
      String(selectedFood?.servingSize || '')
        .replace(',', '.')
        .match(/[\d.]+/)?.[0]
    ) || 0;

  const currentBaseAmount =
    nutritionUnit === 'porción' && servingAmount > 0
      ? currentAmount * servingAmount
      : currentAmount;

  const newAmount =
    unit === 'porción' && servingAmount > 0
      ? currentBaseAmount / servingAmount
      : currentBaseAmount;

  const ratio = currentBaseAmount / 100;

  setNutritionUnit(unit);

  if (selectedFood) {
    setNutritionDraft((prev) => ({
      ...prev,
      grams: String(
        Math.round(newAmount * 100) / 100
      ),
      calories: String(
        Math.round(selectedFood.calories100 * ratio)
      ),
      protein: String(
        Math.round(selectedFood.protein100 * ratio * 10) / 10
      ),
      carbs: String(
        Math.round(selectedFood.carbs100 * ratio * 10) / 10
      ),
      fats: String(
        Math.round(selectedFood.fats100 * ratio * 10) / 10
      ),
    }));
  }
}}
        style={{
          minWidth: 48,
          height: 40,
          borderRadius: 8,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor:
            nutritionUnit === unit
              ? COLORS.orange
              : 'transparent',
        }}
      >
        <Text
          style={{
            color:
              nutritionUnit === unit
                ? '#08090C'
                : ('#8D9098'),
            fontSize: 12,
            fontWeight: '900',
          }}
        >
          {unit}
        </Text>
      </TouchableOpacity>
    ))}
  </View>
</View>
    <View
      style={{
        flexDirection: 'row',
        gap: 8,
      }}
    >
      {[
        ['protein', 'Proteína'],
        ['carbs', 'Carbos'],
        ['fats', 'Grasas'],
      ].map(([field, placeholder]) => (
        <TextInput
          key={field}
          value={nutritionDraft[field]}
          onChangeText={(value) =>
            setNutritionDraft((prev) => ({
              ...prev,
              [field]: value,
            }))
          }
          placeholder={placeholder}
          placeholderTextColor={'#666A73'}
          keyboardType="decimal-pad"
          style={{
            flex: 1,
            height: 46,
            backgroundColor: '#1B1D22',
            borderRadius: 10,
            paddingHorizontal: 10,
            color: '#FFFFFF',
            marginBottom: 12,
          }}
        />
      ))}
    </View>

    <TouchableOpacity
      disabled={
        !nutritionDraft.name.trim() ||
        !nutritionDraft.calories
      }
onPress={() => {
const entryData = {
  id: editingNutritionEntryId ?? Date.now(),
  ...nutritionDraft,

  grams: Number(nutritionDraft.grams) || 0,
  unit: nutritionUnit,

  calories: Number(nutritionDraft.calories) || 0,
  protein: Number(nutritionDraft.protein) || 0,
  carbs: Number(nutritionDraft.carbs) || 0,
  fats: Number(nutritionDraft.fats) || 0,

  foodBase: selectedFood
    ? {
        id: selectedFood.id,
        name: selectedFood.name,
        brand: selectedFood.brand || '',
        servingSize: selectedFood.servingSize || '',
quantity: selectedFood.quantity || '',
        calories100: selectedFood.calories100,
        protein100: selectedFood.protein100,
        carbs100: selectedFood.carbs100,
        fats100: selectedFood.fats100,
      }
    : null,
};
  setNutritionEntries((prev) =>
    editingNutritionEntryId !== null
      ? prev.map((entry) =>
          entry.id === editingNutritionEntryId
            ? entryData
            : entry
        )
      : [...prev, entryData]
  );

  setEditingNutritionEntryId(null);

  setNutritionDraft({
    meal: 'Comida',
    name: '',
    grams: '',
    calories: '',
    protein: '',
    carbs: '',
    fats: '',
  });
setSelectedFood(null);
setFoodSearchQuery('');
setFoodSearchResults([]);
setNutritionUnit('g');
  setShowNutritionManual(false);
}}      style={{
        height: 48,
        borderRadius: 11,
        backgroundColor: COLORS.orange,
        alignItems: 'center',
        justifyContent: 'center',
        opacity:
          !nutritionDraft.name.trim() ||
          !nutritionDraft.calories
            ? 0.4
            : 1,
      }}
    >
      <Text
        style={{
          color: '#08090C',
          fontSize: 13,
          fontWeight: '900',
        }}
      >
      {editingNutritionEntryId !== null ? 'GUARDAR CAMBIOS' : 'GUARDAR ALIMENTO'}
      </Text>
    </TouchableOpacity>
    {editingNutritionEntryId !== null && (
  <TouchableOpacity
    onPress={() => {
      setEditingNutritionEntryId(null);

      setNutritionDraft({
        meal: 'Comida',
        name: '',
        grams: '',
        calories: '',
        protein: '',
        carbs: '',
        fats: '',
      });
setSelectedFood(null);
setFoodSearchQuery('');
setFoodSearchResults([]);
setNutritionUnit('g');
      setShowNutritionManual(false);
    }}
    style={{
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 6,
    }}
  >
    <Text
      style={{
        color: '#8D9098',
        fontSize: 12,
        fontWeight: '800',
      }}
    >
      CANCELAR
    </Text>
  </TouchableOpacity>
)}
  </View>
)}
          {/* COMIDAS */}
          <Text
            style={{
              color: '#FFFFFF',
              fontSize: 17,
              fontWeight: '900',
              marginBottom: 10,
            }}
          >
            Comidas de hoy
          </Text>

{mealSummary.map(({ name, calories, icon, items }) => (
  <View
    key={name}
    style={{
      backgroundColor: 'rgba(72,62,42,0.42)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.18)',
      borderRadius: 14,
      marginBottom: 8,
      overflow: 'hidden',
    }}
  >
    <TouchableOpacity
      activeOpacity={0.75}
      onPress={() =>
        setExpandedNutritionMeal(
          expandedNutritionMeal === name ? null : name
        )
      }
      style={{
        padding: 14,
        flexDirection: 'row',
        alignItems: 'center',
      }}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 12,
          backgroundColor: '#1B1D22',
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: 12,
        }}
      >
        <MaterialCommunityIcons
          name={icon}
          size={21}
          color={COLORS.orange}
        />
      </View>

      <View style={{ flex: 1 }}>
        <Text
          style={{
            color: '#FFFFFF',
            fontSize: 14,
            fontWeight: '800',
          }}
        >
          {name}
        </Text>

        <Text
          style={{
            color: '#8D9098',
            fontSize: 11,
            marginTop: 3,
          }}
        >
          {calories > 0
            ? `${calories} kcal · ${items.length} ${
                items.length === 1 ? 'alimento' : 'alimentos'
              }`
            : 'Sin alimentos'}
        </Text>
      </View>

      <MaterialCommunityIcons
        name={
          expandedNutritionMeal === name
            ? 'chevron-up'
            : 'chevron-down'
        }
        size={22}
        color="#5C5D61"
      />
    </TouchableOpacity>

    {expandedNutritionMeal === name && items.length > 0 && (
      <View
        style={{
          borderTopWidth: 1,
          borderTopColor: '#24272E',
          paddingHorizontal: 14,
          paddingBottom: 10,
        }}
      >
{items.map((item) => (
  <View
    key={item.id}
    style={{
      paddingVertical: 10,
      flexDirection: 'row',
      alignItems: 'center',
    }}
  >
    <View style={{ flex: 1 }}>
      <Text
        style={{
          color: '#FFFFFF',
          fontSize: 12,
          fontWeight: '800',
        }}
      >
        {item.name}
      </Text>

      <Text
        style={{
          color: '#8D9098',
          fontSize: 10,
          marginTop: 3,
        }}
      >
        {item.grams > 0
  ? `${item.grams} ${item.unit || 'g'} · `
  : ''}
        P {item.protein} · C {item.carbs} · G {item.fats}
      </Text>

      <Text
        style={{
          color: COLORS.orange,
          fontSize: 11,
          fontWeight: '800',
          marginTop: 3,
        }}
      >
        {item.calories} kcal
      </Text>
    </View>

    <TouchableOpacity
      onPress={() => {
setEditingNutritionEntryId(item.id);

setNutritionDraft({
  meal: item.meal,
  name: item.name,
  grams: String(item.grams || ''),
  calories: String(item.calories || ''),
  protein: String(item.protein || ''),
  carbs: String(item.carbs || ''),
  fats: String(item.fats || ''),
});

setNutritionUnit(item.unit || 'g');
setSelectedFood(item.foodBase || null);
setFoodSearchQuery(item.name || '');
setFoodSearchResults([]);

setShowNutritionManual(true);      }}
      style={{
        width: 36,
        height: 36,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <MaterialCommunityIcons
        name="pencil-outline"
        size={18}
        color="#A7AAB2"
      />
    </TouchableOpacity>

    <TouchableOpacity
      onPress={() =>
        setNutritionEntries((prev) =>
          prev.filter((entry) => entry.id !== item.id)
        )
      }
      style={{
        width: 36,
        height: 36,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <MaterialCommunityIcons
        name="delete-outline"
        size={18}
        color="#A7AAB2"
      />
    </TouchableOpacity>
  </View>
))}      </View>
    )}
  </View>
))}
          {/* OBJETIVO */}
          <Text
            style={{
              color: '#FFFFFF',
              fontSize: 17,
              fontWeight: '900',
              marginTop: 12,
              marginBottom: 10,
            }}
          >
            Tu objetivo
          </Text>

          <View
            style={{
              backgroundColor: 'rgba(72,62,42,0.42)',
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.18)',
              borderRadius: 18,
              padding: 16,
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                marginBottom: 14,
              }}
            >
              <View>
                <Text
                  style={{
                    color: '#8D9098',
                    fontSize: 11,
                  }}
                >
                  Peso actual
                </Text>

                <Text
                  style={{
                    color: '#FFFFFF',
                    fontSize: 19,
                    fontWeight: '900',
                    marginTop: 3,
                  }}
                >
                  {currentWeight ? `${currentWeight} kg` : '-- kg'}
                </Text>
              </View>

              <View
                style={{
                  alignItems: 'flex-end',
                }}
              >
                <Text
                  style={{
                    color: '#8D9098',
                    fontSize: 11,
                  }}
                >
                  Objetivo
                </Text>

                <Text
                  style={{
                    color: COLORS.orange,
                    fontSize: 19,
                    fontWeight: '900',
                    marginTop: 3,
                  }}
                >
                  {targetWeight ? `${targetWeight} kg` : '-- kg'}
                </Text>
              </View>
            </View>

            <View
              style={{
                height: 6,
                backgroundColor: '#292C32',
                borderRadius: 99,
                overflow: 'hidden',
              }}
            >
              <View
                style={{
                  width: '35%',
                  height: '100%',
                  backgroundColor: COLORS.orange,
                  borderRadius: 99,
                }}
              />
            </View>

            <Text
              style={{
                color: '#8D9098',
                fontSize: 11,
                marginTop: 10,
              }}
            >
              Ritmo objetivo: -0,5 kg por semana
            </Text>
          </View>
          <TouchableOpacity
  activeOpacity={0.75}
  onPress={() => setShowNutritionGoals((prev) => !prev)}
  style={{
    height: 44,
    borderRadius: 11,
    backgroundColor: '#1B1D22',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
  }}
>
  <Text
    style={{
      color: COLORS.orange,
      fontSize: 12,
      fontWeight: '900',
    }}
  >
    EDITAR OBJETIVOS
  </Text>
</TouchableOpacity>
{showNutritionGoals && (
  <View
    style={{
      marginTop: 10,
      padding: 12,
      borderRadius: 14,
      backgroundColor: '#1B1D22',
    }}
  >
    <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
      <TextInput
        value={String(nutritionGoals.calories)}
        onChangeText={(value) =>
          setNutritionGoals((prev) => ({
            ...prev,
            calories: Number(value) || 0,
          }))
        }
        placeholder="Calorías"
        placeholderTextColor={'#666A73'}
        keyboardType="number-pad"
        style={{
          flex: 1,
          height: 44,
          borderRadius: 10,
          backgroundColor: 'rgba(72,62,42,0.42)',
          color: '#FFFFFF',
          paddingHorizontal: 10,
        }}
      />

      <TextInput
        value={String(nutritionGoals.protein)}
        onChangeText={(value) =>
          setNutritionGoals((prev) => ({
            ...prev,
            protein: Number(value) || 0,
          }))
        }
        placeholder="Proteína"
        placeholderTextColor={'#666A73'}
        keyboardType="number-pad"
        style={{
          flex: 1,
          height: 44,
          borderRadius: 10,
          backgroundColor: 'rgba(72,62,42,0.42)',
          color: '#FFFFFF',
          paddingHorizontal: 10,
        }}
      />
    </View>

    <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
      <TextInput
        value={String(nutritionGoals.carbs)}
        onChangeText={(value) =>
          setNutritionGoals((prev) => ({
            ...prev,
            carbs: Number(value) || 0,
          }))
        }
        placeholder="Carbohidratos"
        placeholderTextColor={'#666A73'}
        keyboardType="number-pad"
        style={{
          flex: 1,
          height: 44,
          borderRadius: 10,
          backgroundColor: 'rgba(72,62,42,0.42)',
          color: '#FFFFFF',
          paddingHorizontal: 10,
        }}
      />

      <TextInput
        value={String(nutritionGoals.fats)}
        onChangeText={(value) =>
          setNutritionGoals((prev) => ({
            ...prev,
            fats: Number(value) || 0,
          }))
        }
        placeholder="Grasas"
        placeholderTextColor={'#666A73'}
        keyboardType="number-pad"
        style={{
          flex: 1,
          height: 44,
          borderRadius: 10,
          backgroundColor: 'rgba(72,62,42,0.42)',
          color: '#FFFFFF',
          paddingHorizontal: 10,
        }}
      />
    </View>

    <TouchableOpacity
      onPress={() => setShowNutritionGoals(false)}
      style={{
        height: 44,
        borderRadius: 10,
        backgroundColor: COLORS.orange,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text
        style={{
          color: '#08090C',
          fontSize: 12,
          fontWeight: '900',
        }}
      >
        GUARDAR OBJETIVOS
      </Text>
    </TouchableOpacity>
  </View>
)}
        </ScrollView>
      </View>

      {BottomNavigation()}
    </>
  );
};
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
          <View
  style={{
    alignItems: 'center',
    marginBottom: 12,
  }}
>
  <BannerAd
    unitId={TestIds.BANNER}
    size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
    requestOptions={{
      requestNonPersonalizedAdsOnly: true,
    }}
  />
</View>

<TouchableOpacity
style={[styles.buttonShadow, { marginBottom: 18 }]}
  activeOpacity={1}
  onPress={beginCreate}
>
  <View style={styles.mainButton}>
    <View style={styles.buttonShine} />

    <Text style={styles.mainButtonIcon}>+</Text>

    <View>
      <Text style={styles.mainButtonText}>
        CREAR RUTINA DESDE CERO
      </Text>

      <Text style={styles.mainButtonSubtext}>
        Añade ejercicios a tu planificación
      </Text>
    </View>
  </View>
</TouchableOpacity>

<TouchableOpacity
  activeOpacity={0.8}
  onPress={() => {
    Alert.alert(
      'Importar rutina',
      'Elige cómo quieres importar tu rutina',
      [
        {
          text: 'Hacer foto',
          onPress: async () => {
            const permission =
              await ImagePicker.requestCameraPermissionsAsync();

            if (!permission.granted) {
              Alert.alert(
                'Permiso necesario',
                'Necesitas permitir el acceso a la cámara.'
              );
              return;
            }

            const result = await ImagePicker.launchCameraAsync({
              mediaTypes: ['images'],
              allowsEditing: false,
              quality: 0.9,
              base64: true,
            });

            if (!result.canceled) {
              await analyzeImportedRoutine(result.assets[0]);
            }
          },
        },
        {
          text: 'Elegir imagen',
          onPress: async () => {
            const permission =
              await ImagePicker.requestMediaLibraryPermissionsAsync();

            if (!permission.granted) {
              Alert.alert(
                'Permiso necesario',
                'Necesitas permitir el acceso a tus fotos.'
              );
              return;
            }

            const result =
              await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['images'],
                allowsEditing: false,
                quality: 0.9,
                base64: true,
              });

            if (!result.canceled) {
              await analyzeImportedRoutine(result.assets[0]);
            }
          },
        },
        {
          text: 'Cancelar',
          style: 'cancel',
        },
      ]
    );
  }}
  style={{
    minHeight: 68,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,176,0,0.35)',
    backgroundColor: 'rgba(255,176,0,0.055)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 12,
  }}
>
  <View
    style={{
      width: 42,
      height: 42,
      borderRadius: 13,
      backgroundColor: '#211B0C',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    }}
  >
    <MaterialCommunityIcons
      name="image-plus"
      size={22}
      color={COLORS.orange}
    />
  </View>

  <View style={{ flex: 1 }}>
    <Text
      style={{
        color: '#FFFFFF',
        fontSize: 14,
        fontWeight: '900',
      }}
    >
      IMPORTAR RUTINA
    </Text>

    <Text
      style={{
        color: '#FFFFFF',
        fontSize: 11,
        fontWeight: '600',
        marginTop: 3,
      }}
    >
      Crea una rutina desde una foto o captura
    </Text>
  </View>

  <MaterialCommunityIcons
    name="chevron-right"
    size={24}
    color={COLORS.orange}
  />
</TouchableOpacity>

<TouchableOpacity
  activeOpacity={0.8}
  onPress={openTemplates}
  style={{
    minHeight: 68,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,176,0,0.35)',
    backgroundColor: 'rgba(255,176,0,0.055)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 18,
  }}
>
  <View
    style={{
      width: 42,
      height: 42,
      borderRadius: 13,
      backgroundColor: '#211B0C',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    }}
  >
    <MaterialCommunityIcons
      name="format-list-bulleted"
      size={22}
      color={COLORS.orange}
    />
  </View>

  <View style={{ flex: 1 }}>
    <Text
      style={{
        color: '#FFFFFF',
        fontSize: 14,
        fontWeight: '900',
      }}
    >
      PLANTILLAS
    </Text>

    <Text
      style={{
        color: '#FFFFFF',
        fontSize: 11,
        fontWeight: '600',
        marginTop: 3,
      }}
    >
      Elige una rutina según los días que entrenas
    </Text>
  </View>

  <MaterialCommunityIcons
    name="chevron-right"
    size={24}
    color={COLORS.orange}
  />
</TouchableOpacity>

          {routines.length === 0 ? (
            <View style={styles.emptyCard}>
              <View style={styles.emptyIcon}>
                <MaterialCommunityIcons
                  name="dumbbell"
                  size={28}
                  color={accentColor}
                />
              </View>

              <Text style={styles.emptyTitle}>
                Crea tu primera rutina
              </Text>

              <Text style={styles.emptyText}>
                Agrupa tus ejercicios y define series,
                repeticiones, kilos y grupos musculares.
              </Text>
            </View>
          ) : (
            <>
              {/* RESUMEN */}
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'flex-end',
                  justifyContent: 'space-between',
                  marginBottom: 11,
                  marginTop: 2,
                }}
              >
                <View>
                  <Text
                    style={{
                      color: '#FFFFFF',
                      fontSize: 18,
                      fontWeight: '900',
                      letterSpacing: -0.3,
                    }}
                  >
                    Tus rutinas
                  </Text>

                  <Text
                    style={{
                      color: 'rgba(255,255,255,0.48)',
                      fontSize: 12,
                      fontWeight: '600',
                      marginTop: 3,
                    }}
                  >
                    {routines.length}{' '}
                    {routines.length === 1
                      ? 'rutina'
                      : 'rutinas'}
                    {'  ·  '}
                    {routines.reduce(
                      (total, routine) =>
                        total +
                        (routine.exercises || []).length,
                      0
                    )}{' '}
                    ejercicios
                  </Text>
                </View>
              </View>

              {routines.map((routine) => {
                const expanded =
                  expandedRoutineCardId === routine.id;

                const muscles = [
                  ...new Set(
                    (routine.exercises || [])
                      .flatMap((exercise) =>
                        getExerciseMuscles(exercise)
                      )
                      .filter(
                        (muscle) =>
                          muscle &&
                          muscle !== 'Otro'
                      )
                  ),
                ];

                const muscleSummary =
                  muscles.length > 0
                    ? muscles.slice(0, 3).join(' · ')
                    : 'Rutina personalizada';

                const totalSeries = (routine.exercises || [])
                  .reduce((total, exercise) => {
                    if (isCardioExercise(exercise)) {
                      return total;
                    }

                    const series =
                      Array.isArray(exercise.setsTemplate) &&
                      exercise.setsTemplate.length > 0
                        ? exercise.setsTemplate.length
                        : parseInt(exercise.series, 10) || 0;

                    return total + series;
                  }, 0);

                return (
                  <View
                    key={routine.id}
                    style={{
                      marginBottom: 11,
                      borderRadius: 19,
                      borderWidth: 1,
                      borderColor: expanded
                        ? `${accentColor}38`
                        : 'rgba(255,255,255,0.10)',
                      backgroundColor: isLightTheme
                        ? 'rgba(55,40,44,0.40)'
                        : 'rgba(22,22,27,0.72)',
                      overflow: 'hidden',
                    }}
                  >
                    {/* CABECERA COMPACTA */}
                    <TouchableOpacity
                      activeOpacity={0.78}
                      onPress={() => {
                        impact();

                        setExpandedRoutineCardId(
                          expanded
                            ? null
                            : routine.id
                        );
                      }}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        paddingHorizontal: 14,
                        paddingVertical: 14,
                      }}
                    >
                      <View
                        style={{
                          width: 42,
                          height: 42,
                          borderRadius: 14,
                          alignItems: 'center',
                          justifyContent: 'center',
                          marginRight: 12,
                          backgroundColor:
                            `${accentColor}18`,
                          borderWidth: 1,
                          borderColor:
                            `${accentColor}30`,
                        }}
                      >
                        <MaterialCommunityIcons
                          name="dumbbell"
                          size={20}
                          color={accentColor}
                        />
                      </View>

                      <View style={{ flex: 1 }}>
                        <Text
                          numberOfLines={1}
                          style={{
                            color: '#FFFFFF',
                            fontSize: 15,
                            fontWeight: '900',
                            letterSpacing: -0.25,
                          }}
                        >
                          {routine.name}
                        </Text>

                        <Text
                          numberOfLines={1}
                          style={{
                            color: accentColor,
                            fontSize: 11,
                            fontWeight: '800',
                            marginTop: 3,
                          }}
                        >
                          {muscleSummary}
                        </Text>

                        <Text
                          style={{
                            color:
                              'rgba(255,255,255,0.34)',
                            fontSize: 9,
                            fontWeight: '600',
                            marginTop: 2,
                          }}
                        >
                          {(routine.exercises || [])
                            .length}{' '}
                          {(routine.exercises || [])
                            .length === 1
                            ? 'ejercicio'
                            : 'ejercicios'}
                        </Text>
                      </View>

                      <View
                        style={{
                          width: 34,
                          height: 34,
                          borderRadius: 11,
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: expanded
                            ? `${accentColor}16`
                            : 'rgba(255,255,255,0.04)',
                          borderWidth: 1,
                          borderColor: expanded
                            ? `${accentColor}30`
                            : 'rgba(255,255,255,0.07)',
                        }}
                      >
                        <MaterialCommunityIcons
                          name={
                            expanded
                              ? 'chevron-up'
                              : 'chevron-down'
                          }
                          size={21}
                          color={
                            expanded
                              ? accentColor
                              : 'rgba(255,255,255,0.52)'
                          }
                        />
                      </View>
                    </TouchableOpacity>

                    {/* CONTENIDO DESPLEGADO */}
                    {expanded && (
                      <View
                        style={{
                          paddingHorizontal: 14,
                          paddingBottom: 14,
                        }}
                      >
                        <View
                          style={{
                            height: 1,
                            backgroundColor:
                              'rgba(255,255,255,0.08)',
                            marginBottom: 5,
                          }}
                        />

                        {(routine.exercises || []).map(
                          (exercise, index) => (
                            <View
                              key={
                                exercise.id || index
                              }
                              style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                minHeight: 52,
                                borderBottomWidth:
                                  index ===
                                  routine.exercises.length -
                                    1
                                    ? 0
                                    : 1,
                                borderBottomColor:
                                  'rgba(255,255,255,0.055)',
                              }}
                            >
                              {/* LÍNEA / NÚMERO */}
                              <View
                                style={{
                                  width: 28,
                                  alignItems: 'center',
                                  alignSelf: 'stretch',
                                  justifyContent: 'center',
                                  position: 'relative',
                                }}
                              >
                                {index > 0 && (
                                  <View
                                    style={{
                                      position: 'absolute',
                                      top: 0,
                                      width: 1,
                                      height: '50%',
                                      backgroundColor:
                                        `${accentColor}28`,
                                    }}
                                  />
                                )}

                                {index <
                                  routine.exercises
                                    .length -
                                    1 && (
                                  <View
                                    style={{
                                      position: 'absolute',
                                      bottom: 0,
                                      width: 1,
                                      height: '50%',
                                      backgroundColor:
                                        `${accentColor}28`,
                                    }}
                                  />
                                )}

                                <View
                                  style={{
                                    width: 18,
                                    height: 18,
                                    borderRadius: 9,
                                    alignItems: 'center',
                                    justifyContent:
                                      'center',
                                    backgroundColor:
                                      `${accentColor}18`,
                                    borderWidth: 1,
                                    borderColor:
                                      `${accentColor}45`,
                                    zIndex: 2,
                                  }}
                                >
                                  <Text
                                    style={{
                                      color:
                                        accentColor,
                                      fontSize: 8,
                                      fontWeight:
                                        '900',
                                    }}
                                  >
                                    {index + 1}
                                  </Text>
                                </View>
                              </View>

                              {/* EJERCICIO */}
                              <View
                                style={{
                                  flex: 1,
                                  paddingLeft: 7,
                                  paddingRight: 8,
                                }}
                              >
                                <Text
                                  numberOfLines={1}
                                  style={{
                                    color: '#FFFFFF',
                                    fontSize: 11.5,
                                    fontWeight: '800',
                                  }}
                                >
                                  {exercise.name}
                                </Text>

                                <Text
                                  numberOfLines={1}
                                  style={{
                                    color:
                                      'rgba(255,255,255,0.36)',
                                    fontSize: 8.5,
                                    marginTop: 2,
                                  }}
                                >
                                  {muscleText(
                                    exercise
                                  )}
                                </Text>
                              </View>

                              {/* PLAN */}
                              <View
                                style={{
                                  maxWidth: '38%',
                                  paddingHorizontal: 9,
                                  paddingVertical: 6,
                                  borderRadius: 9,
                                  backgroundColor:
                                    'rgba(255,255,255,0.045)',
                                  borderWidth: 1,
                                  borderColor:
                                    'rgba(255,255,255,0.07)',
                                }}
                              >
                                <Text
                                  numberOfLines={1}
                                  style={{
                                    color:
                                      'rgba(255,255,255,0.72)',
                                    fontSize: 9,
                                    fontWeight: '800',
                                  }}
                                >
                                  {exercisePlan(
                                    exercise
                                  )}
                                </Text>
                              </View>
                            </View>
                          )
                        )}

                        {/* RESUMEN DE RUTINA */}
                        <View
                          style={{
                            marginTop: 13,
                            paddingTop: 14,
                            borderTopWidth: 1,
                            borderTopColor:
                              'rgba(255,255,255,0.07)',
                          }}
                        >
                          <View
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                            }}
                          >
                            {/* EJERCICIOS */}
                            <View
                              style={{
                                flex: 1,
                                alignItems: 'center',
                              }}
                            >
                              <Text
                                style={{
                                  color: '#FFFFFF',
                                  fontSize: 18,
                                  fontWeight: '900',
                                  letterSpacing: -0.5,
                                }}
                              >
                                {(routine.exercises || []).length}
                              </Text>

                              <Text
                                style={{
                                  color:
                                    'rgba(255,255,255,0.34)',
                                  fontSize: 7.5,
                                  fontWeight: '800',
                                  letterSpacing: 0.7,
                                  marginTop: 3,
                                }}
                              >
                                EJERCICIOS
                              </Text>
                            </View>

                            <View
                              style={{
                                width: 1,
                                height: 30,
                                backgroundColor:
                                  'rgba(255,255,255,0.07)',
                              }}
                            />

                            {/* SERIES */}
                            <View
                              style={{
                                flex: 1,
                                alignItems: 'center',
                              }}
                            >
                              <Text
                                style={{
                                  color: '#FFFFFF',
                                  fontSize: 18,
                                  fontWeight: '900',
                                  letterSpacing: -0.5,
                                }}
                              >
                                {totalSeries}
                              </Text>

                              <Text
                                style={{
                                  color:
                                    'rgba(255,255,255,0.34)',
                                  fontSize: 7.5,
                                  fontWeight: '800',
                                  letterSpacing: 0.7,
                                  marginTop: 3,
                                }}
                              >
                                SERIES
                              </Text>
                            </View>

                            <View
                              style={{
                                width: 1,
                                height: 30,
                                backgroundColor:
                                  'rgba(255,255,255,0.07)',
                              }}
                            />

                            {/* MÚSCULOS */}
                            <View
                              style={{
                                flex: 1,
                                alignItems: 'center',
                              }}
                            >
                              <Text
                                style={{
                                  color: accentColor,
                                  fontSize: 18,
                                  fontWeight: '900',
                                  letterSpacing: -0.5,
                                }}
                              >
                                {muscles.length}
                              </Text>

                              <Text
                                style={{
                                  color:
                                    'rgba(255,255,255,0.34)',
                                  fontSize: 7.5,
                                  fontWeight: '800',
                                  letterSpacing: 0.7,
                                  marginTop: 3,
                                }}
                              >
                                MÚSCULOS
                              </Text>
                            </View>
                          </View>

                          {/* ACCIONES SECUNDARIAS */}
                          <View
                            style={{
                              flexDirection: 'row',
                              justifyContent: 'flex-end',
                              alignItems: 'center',
                              marginTop: 15,
                              gap: 8,
                            }}
                          >
                            <TouchableOpacity
                              activeOpacity={0.7}
                              onPress={() =>
                                beginEditRoutine(routine)
                              }
                              style={{
                                height: 36,
                                paddingHorizontal: 13,
                                borderRadius: 11,
                                flexDirection: 'row',
                                alignItems: 'center',
                                justifyContent: 'center',
                                backgroundColor:
                                  'rgba(255,255,255,0.035)',
                                borderWidth: 1,
                                borderColor:
                                  'rgba(255,255,255,0.085)',
                              }}
                            >
                              <MaterialCommunityIcons
                                name="pencil-outline"
                                size={14}
                                color="rgba(255,255,255,0.65)"
                              />

                              <Text
                                style={{
                                  color:
                                    'rgba(255,255,255,0.68)',
                                  fontSize: 8.5,
                                  fontWeight: '900',
                                  letterSpacing: 0.25,
                                  marginLeft: 6,
                                }}
                              >
                                EDITAR
                              </Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                              activeOpacity={0.7}
                              onPress={() => {
                                Alert.alert(
                                  routine.name,
                                  'Opciones de rutina',
                                  [
                                    {
                                      text: 'Editar rutina',
                                      onPress: () =>
                                        beginEditRoutine(
                                          routine
                                        ),
                                    },
                                    {
                                      text: 'Eliminar rutina',
                                      style: 'destructive',
                                      onPress: () =>
                                        deleteRoutine(
                                          routine.id,
                                          routine.name
                                        ),
                                    },
                                    {
                                      text: 'Cancelar',
                                      style: 'cancel',
                                    },
                                  ]
                                );
                              }}
                              style={{
                                width: 36,
                                height: 36,
                                borderRadius: 11,
                                alignItems: 'center',
                                justifyContent: 'center',
                                backgroundColor:
                                  'rgba(255,255,255,0.035)',
                                borderWidth: 1,
                                borderColor:
                                  'rgba(255,255,255,0.085)',
                              }}
                            >
                              <MaterialCommunityIcons
                                name="dots-horizontal"
                                size={18}
                                color="rgba(255,255,255,0.55)"
                              />
                            </TouchableOpacity>
                          </View>
                        </View>
                      </View>
                    )}
                  </View>
                );
              })}
              </>
            )}
          </ScrollView>
      </View>

      {BottomNavigation()}
    </>
  );


  const Templates = () => {
    const availableTemplates =
      ROUTINE_TEMPLATES.filter(
        (template) =>
          template.daysPerWeek === templateDays
      );

    return (
      <View style={styles.page}>
        <AppGradient />

        <PageHeader
          title="Plantillas"
          subtitle="Elige según tus días de entrenamiento"
        />

        <ScrollView
          contentContainerStyle={styles.pageContent}
          showsVerticalScrollIndicator={false}
        >
          <Text
            style={{
              color: '#FFFFFF',
              fontSize: 17,
              fontWeight: '900',
              marginBottom: 5,
            }}
          >
            ¿Cuántos días quieres entrenar?
          </Text>

          <Text
            style={{
              color: '#777D88',
              fontSize: 11,
              marginBottom: 14,
            }}
          >
            Te mostraremos solo las plantillas que encajen con tu frecuencia.
          </Text>

          <View
            style={{
              flexDirection: 'row',
              gap: 6,
              marginBottom: 24,
            }}
          >
            {[2, 3, 4, 5, 6].map((days) => {
              const active =
                templateDays === days;

              return (
                <TouchableOpacity
                  key={days}
                  activeOpacity={0.8}
                  onPress={() => {
                    setTemplateDays(days);
                    setExpandedTemplateId(null);
                  }}
                  style={{
                    flex: 1,
                    minHeight: 56,
                    borderRadius: 13,
                    borderWidth: 1,
                    borderColor: active
                      ? COLORS.orange
                      : '#292C34',
                    backgroundColor: active
                      ? 'rgba(255,176,0,0.14)'
                      : '#111318',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text
                    style={{
                      color: active
                        ? COLORS.orange
                        : '#FFFFFF',
                      fontSize: 18,
                      fontWeight: '900',
                    }}
                  >
                    {days}
                  </Text>

                  <Text
                    style={{
                      color: active
                        ? '#D7A93A'
                        : '#727781',
                      fontSize: 8,
                      fontWeight: '800',
                      marginTop: 1,
                    }}
                  >
                    DÍAS
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 11,
            }}
          >
            <Text
              style={{
                color: '#FFFFFF',
                fontSize: 15,
                fontWeight: '900',
              }}
            >
              {templateDays} DÍAS / SEMANA
            </Text>

            <Text
              style={{
                color: COLORS.orange,
                fontSize: 10,
                fontWeight: '900',
              }}
            >
              {availableTemplates.length}{' '}
              {availableTemplates.length === 1
                ? 'PLANTILLA'
                : 'PLANTILLAS'}
            </Text>
          </View>

          {availableTemplates.length === 0 ? (
            <View
              style={{
                backgroundColor: 'rgba(72,62,42,0.42)',
                borderWidth: 1,
                borderColor: '#292C34',
                borderRadius: 20,
                padding: 22,
                alignItems: 'center',
              }}
            >
              <MaterialCommunityIcons
                name="clipboard-check-outline"
                size={34}
                color={COLORS.orange}
              />

              <Text
                style={{
                  color: '#FFFFFF',
                  fontSize: 16,
                  fontWeight: '900',
                  marginTop: 12,
                }}
              >
                Plantillas en revisión
              </Text>

              <Text
                style={{
                  color: '#777D88',
                  fontSize: 11,
                  lineHeight: 17,
                  textAlign: 'center',
                  marginTop: 6,
                }}
              >
                Revisaremos las rutinas de {templateDays} días antes de añadirlas a RivalSet.
              </Text>
            </View>
          ) : (
            availableTemplates.map(
              (template) => {
                const expanded =
                  expandedTemplateId ===
                  template.id;

                return (
                  <View
                    key={template.id}
                    style={{
                      backgroundColor: 'rgba(72,62,42,0.42)',
                      borderWidth: 1,
                      borderColor: expanded
                        ? 'rgba(255,176,0,0.45)'
                        : '#292C34',
                      borderRadius: 20,
                      marginBottom: 13,
                      overflow: 'hidden',
                    }}
                  >
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() =>
                        setExpandedTemplateId(
                          expanded
                            ? null
                            : template.id
                        )
                      }
                      style={{
                        padding: 16,
                      }}
                    >
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                        }}
                      >
                        <View
                          style={{
                            width: 44,
                            height: 44,
                            borderRadius: 14,
                            backgroundColor: '#211B0C',
                            alignItems: 'center',
                            justifyContent: 'center',
                            marginRight: 12,
                          }}
                        >
                          <MaterialCommunityIcons
                            name="dumbbell"
                            size={23}
                            color={COLORS.orange}
                          />
                        </View>

                        <View style={{ flex: 1 }}>
                          <Text
                            style={{
                              color: '#FFFFFF',
                              fontSize: 17,
                              fontWeight: '900',
                            }}
                          >
                            {template.title}
                          </Text>

                          <Text
                            style={{
                              color: '#858A95',
                              fontSize: 10,
                              marginTop: 3,
                            }}
                          >
                            {template.level}
                          </Text>
                        </View>

                        <MaterialCommunityIcons
                          name={
                            expanded
                              ? 'chevron-up'
                              : 'chevron-down'
                          }
                          size={24}
                          color={COLORS.orange}
                        />
                      </View>

                      <View
                        style={{
                          flexDirection: 'row',
                          flexWrap: 'wrap',
                          gap: 6,
                          marginTop: 13,
                        }}
                      >
                        {[template.objective, template.schedule].map(
                          (item) => (
                            <View
                              key={item}
                              style={{
                                borderRadius: 8,
                                backgroundColor: '#1A1D23',
                                paddingHorizontal: 9,
                                paddingVertical: 5,
                              }}
                            >
                              <Text
                                style={{
                                  color: '#B9BDC5',
                                  fontSize: 8,
                                  fontWeight: '800',
                                }}
                              >
                                {item}
                              </Text>
                            </View>
                          )
                        )}
                      </View>

                      <Text
                        style={{
                          color: '#777D88',
                          fontSize: 10,
                          lineHeight: 15,
                          marginTop: 11,
                        }}
                      >
                        {template.description}
                      </Text>
                    </TouchableOpacity>

                    {expanded && (
                      <View
                        style={{
                          borderTopWidth: 1,
                          borderTopColor: '#24272E',
                          padding: 14,
                          paddingTop: 4,
                        }}
                      >
                        {template.days.map(
                          (day, dayIndex) => (
                            <View
                              key={day.name}
                              style={{
                                marginTop: 14,
                              }}
                            >
                              <Text
                                style={{
                                  color: COLORS.orange,
                                  fontSize: 12,
                                  fontWeight: '900',
                                  marginBottom: 7,
                                }}
                              >
                                DÍA {dayIndex + 1} · {day.name.toUpperCase()}
                              </Text>

                              {day.exercises.map(
                                (exercise) => (
                                  <View
                                    key={exercise.name}
                                    style={{
                                      paddingVertical: 8,
                                      borderBottomWidth: 1,
                                      borderBottomColor: '#202329',
                                    }}
                                  >
                                    <View
                                      style={{
                                        flexDirection: 'row',
                                        justifyContent: 'space-between',
                                        gap: 8,
                                      }}
                                    >
                                      <Text
                                        style={{
                                          color: '#FFFFFF',
                                          fontSize: 11,
                                          fontWeight: '800',
                                          flex: 1,
                                        }}
                                      >
                                        {exercise.name}
                                      </Text>

                                      <Text
                                        style={{
                                          color: COLORS.orange,
                                          fontSize: 10,
                                          fontWeight: '900',
                                        }}
                                      >
                                        {exercise.series} × {exercise.repRange}
                                      </Text>
                                    </View>

                                    <Text
                                      style={{
                                        color: '#676C75',
                                        fontSize: 8,
                                        marginTop: 3,
                                      }}
                                    >
                                      {exercise.primaryMuscles.join(' · ')}
                                      {exercise.secondaryMuscles.length > 0
                                        ? `  ·  Sec: ${exercise.secondaryMuscles.join(' · ')}`
                                        : ''}
                                    </Text>
                                  </View>
                                )
                              )}
                            </View>
                          )
                        )}

                        <TouchableOpacity
                          activeOpacity={0.8}
                          onPress={() =>
                            installRoutineTemplate(
                              template
                            )
                          }
                          style={{
                            height: 50,
                            borderRadius: 14,
                            backgroundColor: COLORS.orange,
                            alignItems: 'center',
                            justifyContent: 'center',
                            marginTop: 18,
                          }}
                        >
                          <Text
                            style={{
                              color: COLORS.darkText,
                              fontSize: 12,
                              fontWeight: '900',
                            }}
                          >
                            USAR ESTA PLANTILLA
                          </Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                );
              }
            )
          )}
        </ScrollView>
      </View>
    );
  };

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
          placeholderTextColor={'#626873'}
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

            const isLibraryExercise =
              !!exercise.exerciseId;

            const cardio =
              isCardioExercise(exercise);

            const exerciseMeta = [
              exercise.variant,
              ...selectedMuscles,
            ].filter(Boolean);

            return (
              <View
                key={exercise.id}
                style={styles.exerciseRow}
              >
                {/* CABECERA */}
                <View style={styles.exerciseCardHeader}>
                  <View style={styles.exerciseNumber}>
                    <Text style={styles.exerciseNumberText}>
                      {String(index + 1).padStart(2, '0')}
                    </Text>
                  </View>

                  <View style={styles.exerciseCardIdentity}>
                    {isLibraryExercise ? (
                      <>
                        <Text
                          style={styles.exerciseCardName}
                          numberOfLines={1}
                        >
                          {exercise.name}
                        </Text>

                        {exerciseMeta.length > 0 && (
                          <Text
                            style={styles.exerciseCardMeta}
                            numberOfLines={1}
                          >
                            {exerciseMeta.join('  ·  ')}
                          </Text>
                        )}
                      </>
                    ) : (
                      <TextInput
                        style={styles.exerciseNameInput}
                        placeholder="Nombre del ejercicio"
                        placeholderTextColor={'#626873'}
                        returnKeyType="done"
                        blurOnSubmit={true}
                        value={exercise.name}
                        onChangeText={(value) =>
                          updateExercise(
                            exercise.id,
                            'name',
                            value
                          )
                        }
                      />
                    )}
                  </View>

                  <TouchableOpacity
                    activeOpacity={0.7}
                    style={styles.removeButton}
                    onPress={() =>
                      removeExercise(exercise.id)
                    }
                  >
                    <MaterialCommunityIcons
                      name="trash-can-outline"
                      size={19}
                      color="#D77770"
                    />
                  </TouchableOpacity>
                </View>

                {/* MÉTRICAS */}
                {cardio ? (
                  <View style={styles.cardioPanel}>
                    {(() => {
                      const metricType =
                        getCardioMetricType(exercise);

                      const calculatedMetric =
                        getCardioCalculatedMetric(exercise);

                      const usesDistance =
                        metricType === 'pace' ||
                        metricType === 'speed';

                      return (
                        <>
                          <View style={styles.cardioMainMetrics}>
                            {/* DURACIÓN */}
                            <View style={styles.cardioMetricCard}>
                              <View style={styles.cardioMetricHeader}>
                                <MaterialCommunityIcons
                                  name="clock-outline"
                                  size={15}
                                  color={COLORS.orange}
                                />

                                <Text style={styles.cardioMetricLabel}>
                                  DURACIÓN
                                </Text>
                              </View>

                              <View style={styles.cardioValueRow}>
                                <TextInput
                                  style={styles.cardioMetricInput}
                                  placeholder="0"
                                  placeholderTextColor="#555B65"
                                  keyboardType="number-pad"
                                  value={exercise.duration}
                                  onChangeText={(value) =>
                                    updateExercise(
                                      exercise.id,
                                      'duration',
                                      value
                                    )
                                  }
                                />

                                <Text style={styles.cardioMetricUnit}>
                                  min
                                </Text>
                              </View>
                            </View>

                            {/* DISTANCIA:
                                solo donde tiene sentido */}
                            {usesDistance && (
                              <View style={styles.cardioMetricCard}>
                                <View style={styles.cardioMetricHeader}>
                                  <MaterialCommunityIcons
                                    name="map-marker-distance"
                                    size={15}
                                    color={COLORS.orange}
                                  />

                                  <Text style={styles.cardioMetricLabel}>
                                    DISTANCIA
                                  </Text>
                                </View>

                                <View style={styles.cardioValueRow}>
                                  <TextInput
                                    style={styles.cardioMetricInput}
                                    placeholder="0"
                                    placeholderTextColor="#555B65"
                                    keyboardType="decimal-pad"
                                    value={exercise.distance}
                                    onChangeText={(value) =>
                                      updateExercise(
                                        exercise.id,
                                        'distance',
                                        value
                                      )
                                    }
                                  />

                                  <Text style={styles.cardioMetricUnit}>
                                    km
                                  </Text>
                                </View>
                              </View>
                            )}
                          </View>

                          {/* MÉTRICA CALCULADA */}
                          {usesDistance && (
                            <View style={styles.cardioPaceCard}>
                              <View>
                                <Text style={styles.cardioPaceLabel}>
                                  {metricType === 'speed'
                                    ? 'VELOCIDAD MEDIA'
                                    : 'RITMO MEDIO'}
                                </Text>

                                <Text style={styles.cardioPaceHint}>
                                  Calculado automáticamente
                                </Text>
                              </View>

                              <View style={styles.cardioPaceValueWrap}>
                                <MaterialCommunityIcons
                                  name={
                                    metricType === 'speed'
                                      ? 'speedometer'
                                      : 'run-fast'
                                  }
                                  size={18}
                                  color={
                                    calculatedMetric
                                      ? COLORS.orange
                                      : '#5F646D'
                                  }
                                />

                                <Text
                                  style={[
                                    styles.cardioPaceValue,
                                    !calculatedMetric && {
                                      color: '#686D76',
                                    },
                                  ]}
                                >
                                  {calculatedMetric
                                    ? calculatedMetric.value
                                    : metricType === 'speed'
                                    ? '--.-'
                                    : '--:--'}
                                </Text>

                                <Text style={styles.cardioPaceUnit}>
                                  {metricType === 'speed'
                                    ? 'km/h'
                                    : 'min/km'}
                                </Text>
                              </View>
                            </View>
                          )}

                          {/* FRECUENCIA CARDÍACA OPCIONAL */}
                          <View style={styles.cardioHeartCard}>
                            <View style={styles.cardioHeartInfo}>
                              <View style={styles.cardioHeartIcon}>
                                <MaterialCommunityIcons
                                  name="heart-pulse"
                                  size={18}
                                  color={COLORS.orange}
                                />
                              </View>

                              <View>
                                <Text style={styles.cardioHeartLabel}>
                                  FRECUENCIA CARDÍACA
                                </Text>

                                <Text style={styles.cardioHeartHint}>
                                  Opcional · media del entrenamiento
                                </Text>
                              </View>
                            </View>

                            <View style={styles.cardioHeartInputWrap}>
                              <TextInput
                                style={styles.cardioHeartInput}
                                placeholder="---"
                                placeholderTextColor="#555B65"
                                keyboardType="number-pad"
                                value={exercise.heartRate}
                                onChangeText={(value) =>
                                  updateExercise(
                                    exercise.id,
                                    'heartRate',
                                    value
                                  )
                                }
                              />

                              <Text style={styles.cardioHeartUnit}>
                                ppm
                              </Text>
                            </View>
                          </View>
                        </>
                      );
                    })()}
                  </View>
                ) : (
                  <>
                    <View style={styles.exerciseMetricLabels}>
                      <Text style={styles.exerciseMetricLabel}>
                        SERIES
                      </Text>

                      <Text style={styles.exerciseMetricLabel}>
                        REPS
                      </Text>

                      <Text style={styles.exerciseMetricLabel}>
                        KG
                      </Text>
                    </View>

                    <View style={styles.exerciseMetricsRow}>
                    <TextInput
                      style={styles.metricInput}
                      placeholder="0"
                      placeholderTextColor={'#626873'}
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
                      placeholder="0"
                      placeholderTextColor={'#626873'}
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
                        styles.lastMetricInput,
                      ]}
                      placeholder="0"
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
                  </>
                )}

                {/* SOLO EJERCICIOS MANUALES:
                    permitimos seguir asignando músculos */}
                {!isLibraryExercise && (
                  <View style={styles.manualMuscleSection}>
                    <Text style={styles.muscleLabel}>
                      GRUPO MUSCULAR
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
                )}
              </View>
            );
          }
        )}

        <TouchableOpacity
          style={styles.addExerciseButton}
          onPress={() => {
            setExercisePickerOpen((value) => !value);
            setExercisePickerZone(null);
            setExercisePickerMuscle(null);
            setExercisePickerName(null);
            setExercisePickerCardioType(null);
          }}
        >
          <Text style={styles.addExerciseIcon}>
            ＋
          </Text>

          <Text style={styles.addExerciseText}>
            Añadir ejercicio
          </Text>
        </TouchableOpacity>

        {exercisePickerOpen && (
          <View style={styles.exercisePickerCard}>
            <View style={styles.exercisePickerHeader}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={styles.exercisePickerTitle}>
                  {exercisePickerName
                    ? exercisePickerName
                    : exercisePickerZone?.id === 'cardio' &&
                      exercisePickerCardioType
                    ? exercisePickerCardioType === 'gym'
                      ? 'Gimnasio'
                      : 'Aire libre'
                    : exercisePickerMuscle
                    ? exercisePickerMuscle
                    : exercisePickerZone
                    ? exercisePickerZone.name
                    : '¿Qué vas a entrenar?'}
                </Text>

                <Text style={styles.exercisePickerSubtitle}>
                  {exercisePickerName
                    ? 'Elige la variante'
                    : exercisePickerMuscle
                    ? 'Elige un ejercicio'
                    : exercisePickerZone?.id === 'cardio'
                    ? exercisePickerCardioType
                      ? 'Elige un ejercicio'
                      : '¿Dónde vas a hacer cardio?'
                    : exercisePickerZone
                    ? 'Elige el grupo muscular'
                    : 'Primero selecciona una zona'}
                </Text>
              </View>

              <TouchableOpacity
                onPress={() => {
                  if (exercisePickerName) {
                    setExercisePickerName(null);
                  } else if (exercisePickerMuscle) {
       setExercisePickerMuscle(null);

       if (exercisePickerZone?.id === 'cardio') {
         setExercisePickerCardioType(null);
       } else if (exercisePickerZone?.id === 'chest') {
         setExercisePickerZone(null);
       }
     } else if (exercisePickerZone) {
                    setExercisePickerCardioType(null);
                    setExercisePickerZone(null);
                  } else {
                    setExercisePickerOpen(false);
                  }
                }}
              >
                <MaterialCommunityIcons
                  name={
                    exercisePickerZone
                      ? 'arrow-left'
                      : 'close'
                  }
                  size={23}
                  color={COLORS.text}
                />
              </TouchableOpacity>
            </View>

            {/* NIVEL 1 · ZONA */}
            {!exercisePickerZone && (
              <View style={styles.exercisePickerGrid}>
                {EXERCISE_ZONES.map((zone) => (
                  <TouchableOpacity
                    key={zone.id}
                    activeOpacity={0.75}
                    style={styles.exercisePickerOption}
                    onPress={() => {
                      setExercisePickerZone(zone);
     if (zone.id === 'cardio') {
       setExercisePickerMuscle(null);
       setExercisePickerCardioType(null);
     } else if (zone.id === 'chest') {
       setExercisePickerMuscle('Pecho');
     }
                    }}
                  >
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        flex: 1,
                      }}
                    >
                      <View
                        style={{
                          width: 28,
                          height: 28,
                          alignItems: 'center',
                          justifyContent: 'center',
                          marginRight: 10,
                        }}
                      >
                        {zone.anatomicalIcon ? (
                          <RivalSetMuscleIcon
                            type={zone.anatomicalIcon}
                            size={27}
                            color={COLORS.orange}
                          />
                        ) : (
                          <MaterialCommunityIcons
                            name={zone.icon}
                            size={21}
                            color={COLORS.orange}
                          />
                        )}
                      </View>

                      <Text style={styles.exercisePickerOptionText}>
                        {zone.name}
                      </Text>
                    </View>

                    <MaterialCommunityIcons
                      name="chevron-right"
                      size={18}
                      color={COLORS.orange}
                    />
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* NIVEL 2 · TIPO DE CARDIO */}
            {exercisePickerZone?.id === 'cardio' &&
              !exercisePickerCardioType &&
              !exercisePickerMuscle && (
                <View style={styles.exercisePickerGrid}>
                  {[
                    {
                      id: 'gym',
                      name: 'Gimnasio',
                      icon: 'dumbbell',
                    },
                    {
                      id: 'outdoor',
                      name: 'Aire libre',
                      icon: 'run',
                    },
                  ].map((type) => (
                    <TouchableOpacity
                      key={type.id}
                      activeOpacity={0.75}
                      style={styles.exercisePickerOption}
                      onPress={async () => {
                        await impact();
                        setExercisePickerCardioType(type.id);
                        setExercisePickerMuscle('Cardio');
                      }}
                    >
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          flex: 1,
                        }}
                      >
                        <View
                          style={{
                            width: 28,
                            height: 28,
                            alignItems: 'center',
                            justifyContent: 'center',
                            marginRight: 10,
                          }}
                        >
                          <MaterialCommunityIcons
                            name={type.icon}
                            size={21}
                            color={COLORS.orange}
                          />
                        </View>

                        <Text
                          style={styles.exercisePickerOptionText}
                        >
                          {type.name}
                        </Text>
                      </View>

                      <MaterialCommunityIcons
                        name="chevron-right"
                        size={18}
                        color={COLORS.orange}
                      />
                    </TouchableOpacity>
                  ))}
                </View>
              )}

            {/* NIVEL 2 · MÚSCULO */}
            {exercisePickerZone &&
              exercisePickerZone.id !== 'cardio' &&
              !exercisePickerMuscle && (
                <View style={styles.exercisePickerGrid}>
                  {exercisePickerZone.muscles.map((muscle) => (
                    <TouchableOpacity
                      key={muscle}
                      activeOpacity={0.75}
                      style={styles.exercisePickerOption}
                      onPress={() =>
                        setExercisePickerMuscle(muscle)
                      }
                    >
                      <Text style={styles.exercisePickerOptionText}>
                        {muscle}
                      </Text>

                      <MaterialCommunityIcons
                        name="chevron-right"
                        size={18}
                        color={COLORS.orange}
                      />
                    </TouchableOpacity>
                  ))}
                </View>
              )}

            {/* NIVEL 3 · EJERCICIO */}
            {exercisePickerMuscle && !exercisePickerName && (
              <View style={styles.exercisePickerList}>

                {exercisePickerMuscle !== 'Cardio' && (
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingHorizontal: 4,
                      marginBottom: 10,
                    }}
                  >
                    <MaterialCommunityIcons
                      name="gesture-tap-hold"
                      size={16}
                      color={COLORS.orange}
                      style={{ marginRight: 7 }}
                    />

                    <Text
                      style={{
                        color: '#8C9099',
                        fontSize: 10,
                        fontWeight: '600',
                        flex: 1,
                      }}
                    >
                      Mantén pulsado un ejercicio para ver cómo hacerlo
                    </Text>
                  </View>
                )}

                {[...new Set(
                  EXERCISE_LIBRARY
                    .filter((item) => {
                      if (
                        !(item.primaryMuscles || []).includes(
                          exercisePickerMuscle
                        )
                      ) {
                        return false;
                      }

                      if (
                        exercisePickerMuscle !== 'Cardio'
                      ) {
                        return true;
                      }

                      const gymCardio = [
                        'Cinta',
                        'Bicicleta estática',
                        'Elíptica',
                        'Remo',
                        'Escaladora',
                      ];

                      const outdoorCardio = [
                        'Correr',
                        'Caminar',
                        'Bicicleta',
                        'Senderismo',
                      ];

                      return exercisePickerCardioType ===
                        'outdoor'
                        ? outdoorCardio.includes(item.name)
                        : gymCardio.includes(item.name);
                    })
                    .map((item) => item.name)
                )].map((name) => {
                  const cardio =
                    exercisePickerMuscle === 'Cardio';

                  return (
                    <TouchableOpacity
                      key={name}
                      activeOpacity={0.75}
                      style={[
                        styles.exercisePickerOption,
                        EXERCISE_GUIDES[name] &&
                          styles.exerciseGuidePressable,
                      ]}
                      delayLongPress={1500}
                      onPressIn={() => {
                        if (!cardio && EXERCISE_GUIDES[name]) {
                          startExerciseGuideProgress(name);
                        }
                      }}
                      onPressOut={() => {
                        if (!cardio && EXERCISE_GUIDES[name]) {
                          cancelExerciseGuideProgress();
                        }
                      }}
                      onLongPress={() => {
                        if (!cardio && EXERCISE_GUIDES[name]) {
                          openExerciseGuide(name);
                        }
                      }}
                      onPress={() => {
                        if (
                          !cardio &&
                          exerciseGuideLongPressDone.current
                        ) {
                          exerciseGuideLongPressDone.current = false;
                          return;
                        }

                        const variants =
                          EXERCISE_LIBRARY.filter(
                            (item) =>
                              item.name === name &&
                              (item.primaryMuscles || []).includes(
                                exercisePickerMuscle
                              )
                          );

                        if (cardio) {
                          const cardioVariant =
                            variants.find((item) => {
                              if (
                                exercisePickerCardioType ===
                                'outdoor'
                              ) {
                                return (
                                  item.variant === 'Aire libre' ||
                                  item.equipment === 'outdoor'
                                );
                              }

                              return (
                                item.variant === 'Gimnasio' ||
                                item.equipment !== 'outdoor'
                              );
                            }) || variants[0];

                          if (cardioVariant) {
                            addLibraryExercise(cardioVariant);
                          }
                        } else if (variants.length === 1) {
                          addLibraryExercise(variants[0]);
                        } else {
                          setExercisePickerName(name);
                        }
                      }}
                    >
                      {EXERCISE_GUIDES[name] &&
                        exerciseGuideHoldingName === name && (
                          <Animated.View
                            pointerEvents="none"
                            style={[
                              styles.exerciseGuideProgressFill,
                              {
                                width:
                                  exerciseGuideProgress.interpolate({
                                    inputRange: [0, 1],
                                    outputRange: ['0%', '100%'],
                                  }),
                              },
                            ]}
                          />
                        )}

                      <Text
                        style={[
                          styles.exercisePickerOptionText,
                          EXERCISE_GUIDES[name] &&
                            styles.exerciseGuideForeground,
                        ]}
                      >
                        {name}
                      </Text>

                      <MaterialCommunityIcons
                        name={
                          cardio
                            ? 'plus-circle-outline'
                            : 'chevron-right'
                        }
                        size={20}
                        color={COLORS.orange}
                      />
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {/* NIVEL 4 · VARIANTE */}
            {exercisePickerMuscle && exercisePickerName && (
              <View style={styles.exercisePickerList}>
                {EXERCISE_LIBRARY
                  .filter(
                    (item) =>
                      item.name === exercisePickerName &&
                      (item.primaryMuscles || []).includes(
                        exercisePickerMuscle
                      )
                  )
                  .map((item) => (
                    <TouchableOpacity
                      key={item.id}
                      activeOpacity={0.75}
                      style={styles.exercisePickerOption}
                      onPress={() =>
                        addLibraryExercise(item)
                      }
                    >
                      <View>
                        <Text style={styles.exercisePickerOptionText}>
                          {item.variant}
                        </Text>

                        <Text style={styles.exercisePickerVariantHint}>
                          {item.name}
                        </Text>
                      </View>

                      <MaterialCommunityIcons
                        name="plus-circle-outline"
                        size={20}
                        color={COLORS.orange}
                      />
                    </TouchableOpacity>
                  ))}
              </View>
            )}
          </View>
        )}

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
        <View style={styles.achievementCompactHeader}>
          <View>
            <Text style={styles.achievementCompactEyebrow}>
              NIVEL {rivalSetLevel.level} · {levelTierName}
            </Text>

            <Text style={styles.achievementCompactTitle}>
              Tus desafíos
            </Text>
          </View>

          <View style={styles.achievementCompactXP}>
            <Text style={styles.achievementCompactXPNumber}>
              {achievementXP}
            </Text>

            <Text style={styles.achievementCompactXPLabel}>
              XP TOTAL
            </Text>
          </View>
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
    const orderedQuickWorkouts = [...workouts].sort(
      (a, b) =>
        new Date(b.finishedAt || 0).getTime() -
        new Date(a.finishedAt || 0).getTime()
    );

    const latestWorkout = orderedQuickWorkouts[0];

    const preferredRoutine =
      routines.find(
        (routine) =>
          String(routine.id) ===
          String(latestWorkout?.routineId)
      ) ||
      routines[0] ||
      null;

    const otherRoutines = routines.filter(
      (routine) =>
        String(routine.id) !==
        String(preferredRoutine?.id)
    );

    /* =====================================================
       QUICK START · DATOS
    ===================================================== */

    const getQuickRoutineMuscles = (routine) => {
      return [
        ...new Set(
          (routine?.exercises || [])
            .flatMap((exercise) =>
              getExerciseMuscles(exercise)
            )
            .filter(
              (muscle) =>
                muscle &&
                muscle !== 'Otro' &&
                muscle !== 'Cardio'
            )
        ),
      ];
    };

    const getQuickRoutineSeries = (routine) =>
      (routine?.exercises || []).reduce(
        (total, exercise) => {
          const series =
            Array.isArray(exercise.setsTemplate) &&
            exercise.setsTemplate.length > 0
              ? exercise.setsTemplate.length
              : parseInt(exercise.series, 10) || 0;

          return total + series;
        },
        0
      );

    const getQuickLastWorkout = (routine) =>
      orderedQuickWorkouts.find(
        (workout) =>
          String(workout.routineId) ===
          String(routine?.id)
      );

    const getQuickLastUsedText = (routine) => {
      const workout = getQuickLastWorkout(routine);

      if (!workout?.finishedAt) {
        return 'Aún no estrenada';
      }

      const date = new Date(workout.finishedAt);

      return `Última vez · ${date.toLocaleDateString(
        'es-ES',
        {
          day: '2-digit',
          month: 'short',
        }
      )}`;
    };

    const getQuickLastUsedShort = (routine) => {
      const workout = getQuickLastWorkout(routine);

      if (!workout?.finishedAt) {
        return '—';
      }

      return new Date(
        workout.finishedAt
      ).toLocaleDateString('es-ES', {
        day: '2-digit',
        month: 'short',
      });
    };

    /* =====================================================
       RECOMENDACIÓN INTELIGENTE
       Prioriza músculos que llevan más tiempo sin entrenarse
    ===================================================== */

    const getLastMuscleWorkoutTime = (muscle) => {
      let latest = 0;

      orderedQuickWorkouts.forEach((workout) => {
        const workoutMuscles = new Set(
          (workout.exercises || [])
            .flatMap((exercise) =>
              getExerciseMuscles(exercise)
            )
            .filter(Boolean)
        );

        if (!workoutMuscles.has(muscle)) {
          return;
        }

        const time = new Date(
          workout.finishedAt || 0
        ).getTime();

        if (
          Number.isFinite(time) &&
          time > latest
        ) {
          latest = time;
        }
      });

      return latest;
    };

    const getRoutineRecoveryScore = (routine) => {
      const muscles =
        getQuickRoutineMuscles(routine);

      if (!muscles.length) {
        return -1;
      }

      const now = Date.now();

      const scores = muscles.map((muscle) => {
        const last =
          getLastMuscleWorkoutTime(muscle);

        // Si nunca se ha trabajado,
        // recibe prioridad alta.
        if (!last) {
          return 30;
        }

        const days =
          (now - last) /
          (1000 * 60 * 60 * 24);

        return Math.min(
          30,
          Math.max(0, days)
        );
      });

      return (
        scores.reduce(
          (total, value) => total + value,
          0
        ) / scores.length
      );
    };

    const rankedRecommendations = routines
      .map((routine) => ({
        routine,
        score:
          getRoutineRecoveryScore(routine),
      }))
      .filter((item) => item.score >= 0)
      .sort(
        (a, b) =>
          b.score - a.score
      );

    const recommendedRoutine =
      rankedRecommendations[0]?.routine ||
      null;

    const isRecommended = (routine) =>
      recommendedRoutine &&
      String(recommendedRoutine.id) ===
        String(routine?.id);

    const getRecommendationReason = (
      routine
    ) => {
      const muscles =
        getQuickRoutineMuscles(routine);

      if (!muscles.length) {
        return '';
      }

      const ranked = muscles
        .map((muscle) => {
          const last =
            getLastMuscleWorkoutTime(muscle);

          return {
            muscle,
            last,
            days: last
              ? Math.max(
                  0,
                  Math.floor(
                    (Date.now() - last) /
                      (1000 * 60 * 60 * 24)
                  )
                )
              : 999,
          };
        })
        .sort(
          (a, b) =>
            b.days - a.days
        );

      const top = ranked[0];

      if (!top) {
        return '';
      }

      if (top.days === 999) {
        return `${top.muscle} sin registro reciente`;
      }

      if (top.days === 0) {
        return `${top.muscle} trabajado hoy`;
      }

      return `${top.muscle} lleva ${
        top.days
      } ${
        top.days === 1 ? 'día' : 'días'
      } sin entrenar`;
    };

    const featuredMuscles =
      getQuickRoutineMuscles(
        preferredRoutine
      );

    const featuredMuscleText =
      featuredMuscles.length > 0
        ? featuredMuscles
            .slice(0, 4)
            .join(' · ')
        : 'Rutina personalizada';

    return (
      <View style={styles.page}>
        <AppGradient />

        <PageHeader
          title="¿Qué entrenamos hoy?"
          subtitle={
            workoutOrigin === 'league'
              ? 'Elige una rutina y compite'
              : 'Elige tu sesión y empieza'
          }
        />

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: 18,
            paddingTop: 12,
            paddingBottom: 42,
          }}
        >

          {/* ===============================================
              AVISO LIGA
          =============================================== */}

          {workoutOrigin === 'league' && (
            <View
              style={{
                minHeight: 58,
                borderRadius: 17,
                borderWidth: 1,
                borderColor:
                  `${accentColor}45`,
                backgroundColor:
                  isLightTheme
                    ? 'rgba(20,17,12,0.24)'
                    : 'rgba(20,20,24,0.60)',
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: 14,
                marginBottom: 18,
              }}
            >
              <MaterialCommunityIcons
                name="crown-outline"
                size={20}
                color={accentColor}
              />

              <View
                style={{
                  flex: 1,
                  marginLeft: 11,
                }}
              >
                <Text
                  style={{
                    color: accentColor,
                    fontSize: 10,
                    fontWeight: '900',
                    letterSpacing: 0.8,
                  }}
                >
                  LIGA
                </Text>

                <Text
                  style={{
                    color: '#FFFFFF',
                    fontSize: 10,
                    lineHeight: 14,
                    fontWeight: '600',
                    marginTop: 2,
                  }}
                >
                  {leagueWeeklyLimitReached
                    ? 'Tus 4 sesiones puntuables ya están completas. Este entrenamiento se guardará igualmente.'
                    : `Esta será tu sesión ${
                        leagueScoringCount + 1
                      } de 4 puntuables.`}
                </Text>
              </View>
            </View>
          )}

          {preferredRoutine ? (
            <>

              {/* ===========================================
                  CABECERA ÚLTIMA RUTINA
              =========================================== */}

              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent:
                    'space-between',
                  marginBottom: 10,
                  paddingHorizontal: 2,
                }}
              >
                <Text
                  style={{
                    color:
                      'rgba(255,255,255,0.90)',
                    fontSize: 13,
                    fontWeight: '900',
                    letterSpacing: 1.15,
                  }}
                >
                  ÚLTIMA RUTINA
                </Text>

                {isRecommended(
                  preferredRoutine
                ) && (
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingHorizontal: 10,
                      paddingVertical: 5,
                      borderRadius: 20,
                      backgroundColor:
                        `${accentColor}20`,
                      borderWidth: 1,
                      borderColor:
                        `${accentColor}65`,
                    }}
                  >
                    <MaterialCommunityIcons
                      name="star-four-points"
                      size={11}
                      color={accentColor}
                    />

                    <Text
                      style={{
                        color: accentColor,
                        fontSize: 9,
                        fontWeight: '900',
                        marginLeft: 5,
                        letterSpacing: 0.5,
                      }}
                    >
                      RECOMENDADA HOY
                    </Text>
                  </View>
                )}
              </View>

              {/* ===========================================
                  TARJETA PRINCIPAL
              =========================================== */}

              <TouchableOpacity
                activeOpacity={0.84}
                onPress={() =>
                  openWorkout(
                    preferredRoutine,
                    workoutOrigin
                  )
                }
                style={{
                  borderRadius: 25,
                  borderWidth: 1,
                  borderColor:
                    isRecommended(
                      preferredRoutine
                    )
                      ? `${accentColor}75`
                      : 'rgba(255,255,255,0.16)',
                  backgroundColor:
                    isLightTheme
                      ? 'rgba(22,18,13,0.42)'
                      : 'rgba(18,18,23,0.78)',
                  padding: 18,
                  marginBottom: 27,
                  overflow: 'hidden',
                }}
              >

                {/* NOMBRE */}

                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                  }}
                >
                  <View
                    style={{
                      width: 52,
                      height: 52,
                      borderRadius: 17,
                      alignItems: 'center',
                      justifyContent:
                        'center',
                      backgroundColor:
                        `${accentColor}18`,
                      borderWidth: 1,
                      borderColor:
                        `${accentColor}40`,
                      marginRight: 13,
                    }}
                  >
                    <MaterialCommunityIcons
                      name="dumbbell"
                      size={26}
                      color={accentColor}
                    />
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text
                      numberOfLines={1}
                      style={{
                        color: '#FFFFFF',
                        fontSize: 23,
                        fontWeight: '900',
                        letterSpacing: -0.6,
                      }}
                    >
                      {preferredRoutine.name}
                    </Text>

                    <Text
                      numberOfLines={1}
                      style={{
                        color: accentColor,
                        fontSize: 11,
                        fontWeight: '800',
                        marginTop: 4,
                      }}
                    >
                      {featuredMuscleText}
                    </Text>
                  </View>

                  <MaterialCommunityIcons
                    name="chevron-right"
                    size={28}
                    color="#FFFFFF"
                  />
                </View>

                {/* MOTIVO RECOMENDACIÓN */}

                {isRecommended(
                  preferredRoutine
                ) && (
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      marginTop: 13,
                    }}
                  >
                    <MaterialCommunityIcons
                      name="lightbulb-outline"
                      size={14}
                      color={accentColor}
                    />

                    <Text
                      style={{
                        color:
                          'rgba(255,255,255,0.72)',
                        fontSize: 10,
                        fontWeight: '600',
                        marginLeft: 6,
                      }}
                    >
                      {getRecommendationReason(
                        preferredRoutine
                      )}
                    </Text>
                  </View>
                )}

                {/* =========================================
                    MÉTRICAS VISUALES
                ========================================= */}

                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'stretch',
                    marginTop: 18,
                    paddingVertical: 14,
                    borderTopWidth: 1,
                    borderBottomWidth: 1,
                    borderColor:
                      'rgba(255,255,255,0.10)',
                  }}
                >

                  {/* EJERCICIOS */}

                  <View
                    style={{
                      flex: 1,
                      alignItems: 'center',
                    }}
                  >
                    <MaterialCommunityIcons
                      name="format-list-numbered"
                      size={17}
                      color={accentColor}
                    />

                    <Text
                      style={{
                        color: '#FFFFFF',
                        fontSize: 19,
                        fontWeight: '900',
                        marginTop: 4,
                      }}
                    >
                      {
                        (
                          preferredRoutine.exercises ||
                          []
                        ).length
                      }
                    </Text>

                    <Text
                      style={{
                        color:
                          'rgba(255,255,255,0.58)',
                        fontSize: 8.5,
                        fontWeight: '800',
                        marginTop: 1,
                      }}
                    >
                      EJERCICIOS
                    </Text>
                  </View>

                  <View
                    style={{
                      width: 1,
                      backgroundColor:
                        'rgba(255,255,255,0.10)',
                    }}
                  />

                  {/* SERIES */}

                  <View
                    style={{
                      flex: 1,
                      alignItems: 'center',
                    }}
                  >
                    <MaterialCommunityIcons
                      name="repeat"
                      size={17}
                      color={accentColor}
                    />

                    <Text
                      style={{
                        color: '#FFFFFF',
                        fontSize: 19,
                        fontWeight: '900',
                        marginTop: 4,
                      }}
                    >
                      {getQuickRoutineSeries(
                        preferredRoutine
                      )}
                    </Text>

                    <Text
                      style={{
                        color:
                          'rgba(255,255,255,0.58)',
                        fontSize: 8.5,
                        fontWeight: '800',
                        marginTop: 1,
                      }}
                    >
                      SERIES
                    </Text>
                  </View>

                  <View
                    style={{
                      width: 1,
                      backgroundColor:
                        'rgba(255,255,255,0.10)',
                    }}
                  />

                  {/* ÚLTIMA VEZ */}

                  <View
                    style={{
                      flex: 1,
                      alignItems: 'center',
                    }}
                  >
                    <MaterialCommunityIcons
                      name="history"
                      size={17}
                      color={accentColor}
                    />

                    <Text
                      numberOfLines={1}
                      style={{
                        color: '#FFFFFF',
                        fontSize: 14,
                        fontWeight: '900',
                        marginTop: 6,
                      }}
                    >
                      {getQuickLastUsedShort(
                        preferredRoutine
                      )}
                    </Text>

                    <Text
                      style={{
                        color:
                          'rgba(255,255,255,0.58)',
                        fontSize: 8.5,
                        fontWeight: '800',
                        marginTop: 2,
                      }}
                    >
                      ÚLTIMA VEZ
                    </Text>
                  </View>
                </View>

                {/* BOTÓN */}

                <View
                  style={{
                    height: 52,
                    borderRadius: 16,
                    backgroundColor:
                      accentColor,
                    marginTop: 16,
                    paddingHorizontal: 17,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent:
                      'space-between',
                  }}
                >
                  <View>
                    <Text
                      style={{
                        color: '#17120A',
                        fontSize: 12,
                        fontWeight: '900',
                      }}
                    >
                      INICIAR ENTRENAMIENTO
                    </Text>

                    <Text
                      style={{
                        color:
                          'rgba(23,18,10,0.68)',
                        fontSize: 9,
                        fontWeight: '700',
                        marginTop: 1,
                      }}
                    >
                      Continuar con esta rutina
                    </Text>
                  </View>

                  <MaterialCommunityIcons
                    name="arrow-right"
                    size={22}
                    color="#17120A"
                  />
                </View>
              </TouchableOpacity>

              {/* ===========================================
                  OTRAS RUTINAS
              =========================================== */}

              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent:
                    'space-between',
                  marginBottom: 12,
                }}
              >
                <View>
                  <Text
                    style={{
                      color: '#FFFFFF',
                      fontSize: 18,
                      fontWeight: '900',
                    }}
                  >
                    Otras rutinas
                  </Text>

                  <Text
                    style={{
                      color:
                        'rgba(255,255,255,0.62)',
                      fontSize: 10,
                      fontWeight: '600',
                      marginTop: 2,
                    }}
                  >
                    Desliza para elegir otra
                  </Text>
                </View>

                <TouchableOpacity
                  activeOpacity={0.75}
                  onPress={() => {
                    setSelectedTab(
                      'Rutinas'
                    );
                    setScreen('routines');
                  }}
                  style={{
                    paddingHorizontal: 11,
                    paddingVertical: 7,
                    borderRadius: 11,
                    backgroundColor:
                      'rgba(255,255,255,0.07)',
                    borderWidth: 1,
                    borderColor:
                      'rgba(255,255,255,0.12)',
                  }}
                >
                  <Text
                    style={{
                      color: '#FFFFFF',
                      fontSize: 9,
                      fontWeight: '900',
                      letterSpacing: 0.5,
                    }}
                  >
                    GESTIONAR
                  </Text>
                </TouchableOpacity>
              </View>

              {/* ===========================================
                  CARRUSEL CON PEEK
              =========================================== */}

              {otherRoutines.length > 0 ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={
                    false
                  }
                  decelerationRate="fast"
                  snapToInterval={321}
                  snapToAlignment="start"
                  contentContainerStyle={{
                    paddingRight: 40,
                    paddingBottom: 5,
                  }}
                >
                  {otherRoutines.map(
                    (routine) => {
                      const muscles =
                        getQuickRoutineMuscles(
                          routine
                        );

                      const muscleText =
                        muscles.length > 0
                          ? muscles
                              .slice(0, 3)
                              .join(' · ')
                          : 'Rutina personalizada';

                      const recommended =
                        isRecommended(
                          routine
                        );

                      return (
                        <TouchableOpacity
                          key={routine.id}
                          activeOpacity={0.84}
                          onPress={() =>
                            openWorkout(
                              routine,
                              workoutOrigin
                            )
                          }
                          style={{
                            width: 310,
                            minHeight: 178,
                            marginRight: 11,
                            borderRadius: 21,
                            borderWidth: 1,
                            borderColor:
                              recommended
                                ? `${accentColor}75`
                                : 'rgba(255,255,255,0.14)',
                            backgroundColor:
                              isLightTheme
                                ? 'rgba(22,18,13,0.34)'
                                : 'rgba(18,18,23,0.70)',
                            padding: 15,
                          }}
                        >

                          {/* BADGE */}

                          {recommended && (
                            <View
                              style={{
                                alignSelf:
                                  'flex-start',
                                flexDirection:
                                  'row',
                                alignItems:
                                  'center',
                                paddingHorizontal: 9,
                                paddingVertical: 4,
                                borderRadius: 20,
                                backgroundColor:
                                  `${accentColor}20`,
                                borderWidth: 1,
                                borderColor:
                                  `${accentColor}60`,
                                marginBottom: 11,
                              }}
                            >
                              <MaterialCommunityIcons
                                name="star-four-points"
                                size={10}
                                color={
                                  accentColor
                                }
                              />

                              <Text
                                style={{
                                  color:
                                    accentColor,
                                  fontSize: 8.5,
                                  fontWeight:
                                    '900',
                                  marginLeft: 4,
                                }}
                              >
                                RECOMENDADA HOY
                              </Text>
                            </View>
                          )}

                          <View
                            style={{
                              flexDirection:
                                'row',
                              alignItems:
                                'center',
                            }}
                          >
                            <View
                              style={{
                                width: 40,
                                height: 40,
                                borderRadius: 13,
                                backgroundColor:
                                  `${accentColor}16`,
                                borderWidth: 1,
                                borderColor:
                                  `${accentColor}35`,
                                alignItems:
                                  'center',
                                justifyContent:
                                  'center',
                                marginRight: 10,
                              }}
                            >
                              <MaterialCommunityIcons
                                name="dumbbell"
                                size={20}
                                color={
                                  accentColor
                                }
                              />
                            </View>

                            <View
                              style={{
                                flex: 1,
                              }}
                            >
                              <Text
                                numberOfLines={1}
                                style={{
                                  color:
                                    '#FFFFFF',
                                  fontSize: 16,
                                  fontWeight:
                                    '900',
                                }}
                              >
                                {routine.name}
                              </Text>

                              <Text
                                numberOfLines={1}
                                style={{
                                  color:
                                    accentColor,
                                  fontSize: 10,
                                  fontWeight:
                                    '800',
                                  marginTop: 3,
                                }}
                              >
                                {muscleText}
                              </Text>
                            </View>
                          </View>

                          {recommended && (
                            <Text
                              numberOfLines={1}
                              style={{
                                color:
                                  'rgba(255,255,255,0.62)',
                                fontSize: 9,
                                fontWeight:
                                  '600',
                                marginTop: 10,
                              }}
                            >
                              {getRecommendationReason(
                                routine
                              )}
                            </Text>
                          )}

                          <View
                            style={{
                              flexDirection:
                                'row',
                              alignItems:
                                'center',
                              marginTop:
                                recommended
                                  ? 10
                                  : 16,
                            }}
                          >
                            <Text
                              style={{
                                color:
                                  'rgba(255,255,255,0.76)',
                                fontSize: 10,
                                fontWeight:
                                  '700',
                              }}
                            >
                              {
                                (
                                  routine.exercises ||
                                  []
                                ).length
                              }{' '}
                              ejercicios
                              {'   ·   '}
                              {getQuickRoutineSeries(
                                routine
                              )}{' '}
                              series
                            </Text>
                          </View>

                          <View
                            style={{
                              flexDirection:
                                'row',
                              alignItems:
                                'center',
                              justifyContent:
                                'space-between',
                              marginTop: 'auto',
                              paddingTop: 14,
                            }}
                          >
                            <Text
                              numberOfLines={1}
                              style={{
                                color:
                                  'rgba(255,255,255,0.54)',
                                fontSize: 9,
                                fontWeight:
                                  '600',
                              }}
                            >
                              {getQuickLastUsedText(
                                routine
                              )}
                            </Text>

                            <View
                              style={{
                                width: 31,
                                height: 31,
                                borderRadius: 10,
                                alignItems:
                                  'center',
                                justifyContent:
                                  'center',
                                backgroundColor:
                                  `${accentColor}16`,
                              }}
                            >
                              <MaterialCommunityIcons
                                name="arrow-right"
                                size={17}
                                color={
                                  accentColor
                                }
                              />
                            </View>
                          </View>
                        </TouchableOpacity>
                      );
                    }
                  )}
                </ScrollView>
              ) : (
                <View
                  style={{
                    minHeight: 72,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: 17,
                    borderWidth: 1,
                    borderColor:
                      'rgba(255,255,255,0.12)',
                    backgroundColor:
                      'rgba(255,255,255,0.04)',
                  }}
                >
                  <Text
                    style={{
                      color:
                        'rgba(255,255,255,0.72)',
                      fontSize: 11,
                      fontWeight: '700',
                    }}
                  >
                    No tienes más rutinas todavía
                  </Text>
                </View>
              )}
            </>
          ) : (
            <View
              style={{
                borderRadius: 22,
                borderWidth: 1,
                borderColor:
                  'rgba(255,255,255,0.14)',
                backgroundColor:
                  'rgba(18,18,23,0.72)',
                padding: 26,
                alignItems: 'center',
              }}
            >
              <MaterialCommunityIcons
                name="dumbbell"
                size={40}
                color={accentColor}
              />

              <Text
                style={{
                  color: '#FFFFFF',
                  fontSize: 19,
                  fontWeight: '900',
                  marginTop: 14,
                }}
              >
                Crea tu primera rutina
              </Text>

              <Text
                style={{
                  color:
                    'rgba(255,255,255,0.68)',
                  fontSize: 11,
                  textAlign: 'center',
                  marginTop: 6,
                }}
              >
                Cuando tengas una rutina aparecerá aquí.
              </Text>

              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => {
                  setSelectedTab(
                    'Rutinas'
                  );
                  setScreen('routines');
                }}
                style={{
                  height: 46,
                  paddingHorizontal: 20,
                  borderRadius: 14,
                  backgroundColor:
                    accentColor,
                  alignItems: 'center',
                  justifyContent:
                    'center',
                  marginTop: 17,
                }}
              >
                <Text
                  style={{
                    color: '#17120A',
                    fontSize: 11,
                    fontWeight: '900',
                  }}
                >
                  CREAR RUTINA
                </Text>
              </TouchableOpacity>
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
    const count = workouts.filter((workout) => {
      const date = new Date(workout.finishedAt);

      return (
        date.getFullYear() === historyYear &&
        date.getMonth() === monthIndex
      );
    }).length;

    return {
      label,
      monthIndex,
      count,
    };
  }
);

const maxMonthlyTrainingDays = Math.max(
  1,
  ...monthlyTrainingDays.map((item) => item.count)
);
const muscleActivity = MUSCLE_GROUPS.reduce(
  (result, muscle) => {
    result[muscle] = {
      sessions: new Set(),
      series: 0,
      lastWorkout: null,
    };

    return result;
  },
  {}
);

const periodStart = new Date();

periodStart.setHours(0, 0, 0, 0);
periodStart.setDate(
  periodStart.getDate() - (musclePeriod - 1)
);

const musclePeriodWorkouts = workouts.filter(
  (workout) => {
    const date = new Date(workout.finishedAt);

    return date >= periodStart;
  }
);

musclePeriodWorkouts.forEach((workout) => {
  const workoutDay = localDayKey(
    workout.finishedAt
  );

  (workout.exercises || []).forEach(
    (exercise) => {
      const primaryMuscles = getPrimaryMuscles(
        exercise
      ).filter(
        (muscle) =>
          muscle !== 'Cardio' &&
          muscle !== 'Otro'
      );

      const primarySet = new Set(primaryMuscles);

      const secondaryMuscles =
        getSecondaryMuscles(exercise).filter(
          (muscle) =>
            muscle !== 'Cardio' &&
            muscle !== 'Otro' &&
            !primarySet.has(muscle)
        );

      if (
        primaryMuscles.length === 0 &&
        secondaryMuscles.length === 0
      ) {
        return;
      }

      const completedSets = Array.isArray(
        exercise.sets
      )
        ? exercise.sets.filter(
            (set) => set.completed !== false
          ).length
        : Math.max(
            1,
            parseInt(exercise.series, 10) || 1
          );

      const workoutDate = new Date(
        workout.finishedAt
      );

      const registerMuscle = (
        muscle,
        multiplier
      ) => {
        if (!muscleActivity[muscle]) return;

        muscleActivity[muscle].sessions.add(
          workoutDay
        );

        muscleActivity[muscle].series +=
          completedSets * multiplier;

        if (
          !muscleActivity[muscle].lastWorkout ||
          workoutDate >
            muscleActivity[muscle].lastWorkout
        ) {
          muscleActivity[muscle].lastWorkout =
            workoutDate;
        }
      };

      primaryMuscles.forEach((muscle) =>
        registerMuscle(muscle, 1)
      );

      secondaryMuscles.forEach((muscle) =>
        registerMuscle(muscle, 0.5)
      );
    }
  );
});

const intensityTarget =
  musclePeriod === 7
    ? 12
    : musclePeriod === 30
    ? 40
    : 90;

const muscleStats = MUSCLE_GROUPS
  .filter(
    (muscle) =>
      muscle !== 'Cardio' &&
      muscle !== 'Otro'
  )
  .map((muscle) => ({
    muscle,
    sessions:
      muscleActivity[muscle].sessions.size,
    series:
      Math.round(
        muscleActivity[muscle].series * 2
      ) / 2,
    lastWorkout:
      muscleActivity[muscle].lastWorkout,
    intensity: Math.min(
      1,
      muscleActivity[muscle].series /
        intensityTarget
    ),
  }));

const muscleIntensity = muscleStats.reduce(
  (result, item) => {
    result[item.muscle] = item.intensity;
    return result;
  },
  {}
);

const selectedMuscleStats =
  muscleStats.find(
    (item) => item.muscle === selectedMuscle
  ) || null;
    return (
      <>
        <View style={styles.page}>
          

          <PageHeader
            title="Historial"
            subtitle="Tu actividad personal"
            showBack={selectedTab !== 'Historial'}
          />

        {/* RIVALSET_HISTORY_AD_BANNER */}
        <View
          style={{
            width: '100%',
            alignItems: 'center',
            justifyContent: 'center',
            marginTop: 4,
            marginBottom: 12,
          }}
        >
          <BannerAd
    unitId={TestIds.BANNER}
    size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
    requestOptions={{
      requestNonPersonalizedAdsOnly: true,
    }}
  />
        </View>


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
        color: '#FFFFFF',
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
              color: '#FFFFFF',
              fontSize: 10,
              fontWeight: '800',
              marginBottom: 5,
              opacity: 1,
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
              color: '#FFFFFF',
              fontSize: 11,
              fontWeight: isCurrentMonth ? '900' : '700',
              marginTop: 7,
              opacity: 1,
            }}
          >
            {item.label}
          </Text>
        </View>
      );
    })}
  </View>
</View>

<TouchableOpacity
  activeOpacity={0.8}
  onPress={() => setScreen('personalRecords')}
  style={{
    height: 50,
    backgroundColor: 'rgba(16,17,21,0.54)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
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
  MÚSCULOS TRABAJADOS
</Text>

<Text style={[styles.historySectionSubtitle, lightTextStyle]}>
  Toca una zona para ver cuánto la has trabajado
</Text>

<View
  style={{
    backgroundColor: 'rgba(16, 17, 21, 0.54)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.13)',
    borderRadius: 20,
    padding: 16,
    marginBottom: 22,
  }}
>
  {/* FILTRO 7 / 30 / 90 DÍAS */}
  <View
    style={{
      flexDirection: 'row',
      backgroundColor: '#0B0D11',
      borderRadius: 12,
      padding: 4,
      marginBottom: 20,
    }}
  >
    {[7, 30, 90].map((period) => {
      const active = musclePeriod === period;

      return (
        <TouchableOpacity
          key={period}
          activeOpacity={0.8}
          onPress={() => {
            setMusclePeriod(period);
            setSelectedMuscle(null);
          }}
          style={{
            flex: 1,
            height: 38,
            borderRadius: 9,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: active
              ? COLORS.orange
              : 'transparent',
          }}
        >
          <Text
            style={{
              color: '#FFFFFF',
              fontSize: 12,
              fontWeight: '900',
            }}
          >
            {period} DÍAS
          </Text>
        </TouchableOpacity>
      );
    })}
  </View>

  {/* CUERPO */}
  <MuscleBodyMap
    muscleIntensity={muscleIntensity}
    selectedMuscle={selectedMuscle}
    onSelectMuscle={setSelectedMuscle}
  />

  {/* DETALLE DEL MÚSCULO */}
  {selectedMuscleStats ? (
    <View
      style={{
        marginTop: 18,
        backgroundColor: '#0B0D11',
        borderRadius: 14,
        borderWidth: 1,
        borderColor: 'rgba(255,176,0,0.20)',
        padding: 15,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 10,
        }}
      >
        <Text
          style={{
            color: '#FFFFFF',
            fontSize: 14,
            fontWeight: '900',
          }}
        >
          {selectedMuscleStats.muscle.toUpperCase()}
        </Text>

        <Text
          style={{
            color: '#FFFFFF',
            fontSize: 12,
            fontWeight: '900',
          }}
        >
          ÚLTIMOS {musclePeriod} DÍAS
        </Text>
      </View>

      <View
        style={{
          flexDirection: 'row',
          gap: 6,
        }}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: '#111318',
            borderRadius: 12,
            padding: 6,
          }}
        >
          <Text
            style={{
              color: '#FFFFFF',
              fontSize: 16,
              fontWeight: '900',
            }}
          >
            {selectedMuscleStats.sessions}
          </Text>

          <Text
            style={{
              color: '#FFFFFF',
              fontSize: 11,
              marginTop: 3,
            }}
          >
            {selectedMuscleStats.sessions === 1
              ? 'sesión'
              : 'sesiones'}
          </Text>
        </View>

        <View
          style={{
            flex: 1,
            backgroundColor: '#111318',
            borderRadius: 12,
            padding: 8,
          }}
        >
          <Text
            style={{
              color: '#FFFFFF',
              fontSize: 18,
              fontWeight: '900',
            }}
          >
            {selectedMuscleStats.series.toLocaleString(
              'es-ES',
              {
                maximumFractionDigits: 1,
              }
            )}
          </Text>

          <Text
            style={{
              color: '#FFFFFF',
              fontSize: 11,
              marginTop: 3,
            }}
          >
            {selectedMuscleStats.series === 1
              ? 'serie'
              : 'series'}
          </Text>
        </View>
      </View>

      {selectedMuscleStats.lastWorkout && (
        <Text
          style={{
            color: '#FFFFFF',
            fontSize: 11,
            marginTop: 12,
          }}
        >
          Último entrenamiento:{' '}
          {selectedMuscleStats.lastWorkout.toLocaleDateString(
            'es-ES'
          )}
        </Text>
      )}
    </View>
  ) : (
    <Text
      style={{
        color: '#FFFFFF',
        fontSize: 12,
        textAlign: 'center',
        marginTop: 14,
      }}
    >
      Selecciona un grupo muscular
    </Text>
  )}

  {/* LEYENDA */}
  <View
    style={{
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 12,
      marginTop: 18,
    }}
  >
    {[
      ['#292C32', 'Sin trabajo'],
      ['#554015', 'Bajo'],
      ['#A86C00', 'Medio'],
      ['#FFB000', 'Alto'],
    ].map(([color, label]) => (
      <View
        key={label}
        style={{
          alignItems: 'center',
          gap: 5,
        }}
      >
        <View
          style={{
            width: 10,
            height: 10,
            borderRadius: 5,
            backgroundColor: color,
          }}
        />

        <Text
          style={{
            color: '#FFFFFF',
            fontSize: 9,
            fontWeight: '700',
          }}
        >
          {label}
        </Text>
      </View>
    ))}
  </View>
</View>
            <Text
              style={[
                styles.historySectionTitle,
                styles.historyWorkoutSectionTitle,
              ]}
            >
              Entrenamientos
            </Text>

            {orderedWorkouts.map((workout, index) => {
              const workoutDate = new Date(
                workout.finishedAt
              );

              const exercises =
                workout.exercises || [];

              const completedSets =
                exercises.reduce(
                  (total, exercise) => {
                    if (
                      Array.isArray(exercise.sets)
                    ) {
                      return (
                        total +
                        exercise.sets.filter(
                          (set) =>
                            set.completed !== false
                        ).length
                      );
                    }

                    return (
                      total +
                      Math.max(
                        0,
                        parseInt(
                          exercise.series,
                          10
                        ) || 0
                      )
                    );
                  },
                  0
                );

              const prCount =
                exercises.reduce(
                  (total, exercise) =>
                    total +
                    (
                      Array.isArray(
                        exercise.sets
                      )
                        ? exercise.sets
                        : []
                    ).filter(
                      (set) => !!set.prType
                    ).length,
                  0
                );

              const cardioWorkout =
                exercises.length > 0 &&
                exercises.every(
                  (exercise) =>
                    isCardioExercise(exercise)
                );

              const isToday =
                localDayKey(
                  workout.finishedAt
                ) === localDayKey(new Date());

              const yesterday = new Date();
              yesterday.setDate(
                yesterday.getDate() - 1
              );

              const isYesterday =
                localDayKey(
                  workout.finishedAt
                ) === localDayKey(yesterday);

              const dayLabel = isToday
                ? 'HOY'
                : isYesterday
                ? 'AYER'
                : workoutDate
                    .toLocaleDateString(
                      'es-ES',
                      {
                        day: '2-digit',
                        month: 'short',
                      }
                    )
                    .replace('.', '')
                    .toUpperCase();

              return (
                <View
                  key={workout.id}
                  style={{
                    flexDirection: 'row',
                    position: 'relative',
                  }}
                >
                  {/* TIMELINE */}
                  <View
                    style={{
                      width: 42,
                      alignItems: 'center',
                    }}
                  >
                    {index !== 0 && (
                      <View
                        style={{
                          position: 'absolute',
                          top: 0,
                          width: 1,
                          height: 21,
                          backgroundColor:
                            'rgba(255,255,255,0.12)',
                        }}
                      />
                    )}

                    <View
                      style={{
                        width: 11,
                        height: 11,
                        borderRadius: 6,
                        marginTop: 21,
                        backgroundColor:
                          accentColor,
                        borderWidth: 3,
                        borderColor:
                          isLightTheme
                            ? 'rgba(255,255,255,0.72)'
                            : '#111116',
                        zIndex: 2,
                      }}
                    />

                    {index !==
                      orderedWorkouts.length -
                        1 && (
                      <View
                        style={{
                          position: 'absolute',
                          top: 32,
                          bottom: 0,
                          width: 1,
                          backgroundColor:
                            'rgba(255,255,255,0.12)',
                        }}
                      />
                    )}
                  </View>

                  {/* CONTENIDO */}
                  <View
                    style={{
                      flex: 1,
                      paddingBottom: 14,
                    }}
                  >
                    <Text
                      style={{
                        color: isLightTheme
                          ? 'rgba(255,255,255,0.78)'
                          : 'rgba(255,255,255,0.48)',
                        fontSize: 9,
                        fontWeight: '900',
                        letterSpacing: 1.15,
                        marginBottom: 7,
                      }}
                    >
                      {dayLabel}
                    </Text>

                    <View
                      style={{
                        backgroundColor:
                          isLightTheme
                            ? 'rgba(60,38,45,0.42)'
                            : 'rgba(24,24,29,0.72)',
                        borderWidth: 1,
                        borderColor:
                          isLightTheme
                            ? 'rgba(255,255,255,0.24)'
                            : 'rgba(255,255,255,0.10)',
                        borderRadius: 18,
                        paddingVertical: 14,
                        paddingHorizontal: 15,
                      }}
                    >
                      {/* CABECERA */}
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                        }}
                      >
                        <View
                          style={{
                            width: 39,
                            height: 39,
                            borderRadius: 13,
                            alignItems: 'center',
                            justifyContent:
                              'center',
                            marginRight: 12,
                            backgroundColor:
                              `${accentColor}20`,
                            borderWidth: 1,
                            borderColor:
                              `${accentColor}38`,
                          }}
                        >
                          <MaterialCommunityIcons
                            name={
                              cardioWorkout
                                ? 'run'
                                : 'dumbbell'
                            }
                            size={19}
                            color={accentColor}
                          />
                        </View>

                        <View
                          style={{
                            flex: 1,
                          }}
                        >
                          <Text
                            numberOfLines={1}
                            style={{
                              color: '#FFFFFF',
                              fontSize: 15,
                              fontWeight: '900',
                              letterSpacing: -0.25,
                            }}
                          >
                            {workout.routineName ||
                              'Entrenamiento'}
                          </Text>

                          <Text
                            style={{
                              color:
                                'rgba(255,255,255,0.54)',
                              fontSize: 10,
                              fontWeight: '600',
                              marginTop: 3,
                            }}
                          >
                            {workoutDate.toLocaleTimeString(
                              'es-ES',
                              {
                                hour: '2-digit',
                                minute: '2-digit',
                              }
                            )}
                          </Text>
                        </View>

                        <TouchableOpacity
                          activeOpacity={0.65}
                          onPress={() =>
                            setExpandedHistoryWorkoutId(
                              expandedHistoryWorkoutId ===
                                workout.id
                                ? null
                                : workout.id
                            )
                          }
                          style={{
                            width: 34,
                            height: 34,
                            borderRadius: 11,
                            alignItems: 'center',
                            justifyContent:
                              'center',
                            backgroundColor:
                              expandedHistoryWorkoutId ===
                              workout.id
                                ? `${accentColor}18`
                                : 'rgba(255,255,255,0.045)',
                            borderWidth: 1,
                            borderColor:
                              expandedHistoryWorkoutId ===
                              workout.id
                                ? `${accentColor}32`
                                : 'rgba(255,255,255,0.07)',
                          }}
                        >
                          <MaterialCommunityIcons
                            name={
                              expandedHistoryWorkoutId ===
                              workout.id
                                ? 'chevron-up'
                                : 'chevron-down'
                            }
                            size={21}
                            color={
                              expandedHistoryWorkoutId ===
                              workout.id
                                ? accentColor
                                : 'rgba(255,255,255,0.55)'
                            }
                          />
                        </TouchableOpacity>
                      </View>

                      {/* MÉTRICAS */}
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          marginTop: 13,
                          paddingTop: 11,
                          borderTopWidth: 1,
                          borderTopColor:
                            'rgba(255,255,255,0.08)',
                        }}
                      >
                        <Text
                          style={{
                            color:
                              'rgba(255,255,255,0.66)',
                            fontSize: 10,
                            fontWeight: '700',
                          }}
                        >
                          {exercises.length}{' '}
                          {exercises.length === 1
                            ? 'ejercicio'
                            : 'ejercicios'}
                        </Text>

                        {!cardioWorkout && (
                          <>
                            <View
                              style={{
                                width: 3,
                                height: 3,
                                borderRadius: 2,
                                marginHorizontal: 8,
                                backgroundColor:
                                  'rgba(255,255,255,0.28)',
                              }}
                            />

                            <Text
                              style={{
                                color:
                                  'rgba(255,255,255,0.66)',
                                fontSize: 10,
                                fontWeight: '700',
                              }}
                            >
                              {completedSets}{' '}
                              {completedSets === 1
                                ? 'serie'
                                : 'series'}
                            </Text>
                          </>
                        )}

                        <View
                          style={{
                            flex: 1,
                          }}
                        />

                        {prCount > 0 && (
                          <View
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              paddingHorizontal: 8,
                              paddingVertical: 4,
                              borderRadius: 20,
                              backgroundColor:
                                `${accentColor}1F`,
                              borderWidth: 1,
                              borderColor:
                                `${accentColor}38`,
                            }}
                          >
                            <MaterialCommunityIcons
                              name="trophy-outline"
                              size={11}
                              color={accentColor}
                            />

                            <Text
                              style={{
                                color: accentColor,
                                fontSize: 9,
                                fontWeight: '900',
                                marginLeft: 4,
                              }}
                            >
                              +{prCount} PR
                            </Text>
                          </View>
                        )}
                      </View>

                      {/* DESGLOSE EXPANDIBLE */}
                      {expandedHistoryWorkoutId ===
                        workout.id && (
                        <View
                          style={{
                            marginTop: 14,
                            paddingTop: 14,
                            borderTopWidth: 1,
                            borderTopColor:
                              'rgba(255,255,255,0.09)',
                          }}
                        >
                          {(workout.exercises || []).map(
                            (exercise, exerciseIndex) => {
                              const exerciseSets =
                                Array.isArray(
                                  exercise.sets
                                )
                                  ? exercise.sets.filter(
                                      (set) =>
                                        set.completed !==
                                        false
                                    )
                                  : [];

                              const exercisePRs =
                                exerciseSets.filter(
                                  (set) =>
                                    !!set.prType
                                ).length;

                              return (
                                <View
                                  key={
                                    exercise.id ||
                                    exerciseIndex
                                  }
                                  style={{
                                    marginBottom:
                                      exerciseIndex ===
                                      (
                                        workout.exercises ||
                                        []
                                      ).length -
                                        1
                                        ? 2
                                        : 13,
                                    padding: 11,
                                    borderRadius: 13,
                                    backgroundColor:
                                      isLightTheme
                                        ? 'rgba(255,255,255,0.08)'
                                        : 'rgba(255,255,255,0.035)',
                                    borderWidth: 1,
                                    borderColor:
                                      'rgba(255,255,255,0.07)',
                                  }}
                                >
                                  {/* EJERCICIO */}
                                  <View
                                    style={{
                                      flexDirection:
                                        'row',
                                      alignItems:
                                        'center',
                                      marginBottom: 8,
                                    }}
                                  >
                                    <View
                                      style={{
                                        flex: 1,
                                      }}
                                    >
                                      <Text
                                        style={{
                                          color:
                                            '#FFFFFF',
                                          fontSize: 12,
                                          fontWeight:
                                            '800',
                                        }}
                                      >
                                        {exercise.name}
                                      </Text>

                                      <Text
                                        style={{
                                          color:
                                            'rgba(255,255,255,0.42)',
                                          fontSize: 8.5,
                                          marginTop: 2,
                                        }}
                                      >
                                        {muscleText(
                                          exercise
                                        )}
                                      </Text>
                                    </View>

                                    {exercisePRs >
                                      0 && (
                                      <View
                                        style={{
                                          paddingHorizontal: 7,
                                          paddingVertical: 3,
                                          borderRadius: 8,
                                          backgroundColor:
                                            `${accentColor}18`,
                                        }}
                                      >
                                        <Text
                                          style={{
                                            color:
                                              accentColor,
                                            fontSize: 8,
                                            fontWeight:
                                              '900',
                                          }}
                                        >
                                          PR ×
                                          {
                                            exercisePRs
                                          }
                                        </Text>
                                      </View>
                                    )}
                                  </View>

                                  {/* CARDIO */}
                                  {isCardioExercise(
                                    exercise
                                  ) ? (
                                    <Text
                                      style={{
                                        color:
                                          'rgba(255,255,255,0.68)',
                                        fontSize: 10,
                                        fontWeight:
                                          '600',
                                      }}
                                    >
                                      {exercisePlan({
                                        ...exercise,
                                        duration:
                                          exerciseSets[0]
                                            ?.duration ??
                                          exercise.duration,
                                        distance:
                                          exerciseSets[0]
                                            ?.distance ??
                                          exercise.distance,
                                        heartRate:
                                          exerciseSets[0]
                                            ?.heartRate ??
                                          exercise.heartRate,
                                      })}
                                    </Text>
                                  ) : exerciseSets.length >
                                    0 ? (
                                    <>
                                      {/* CABECERA SERIES */}
                                      <View
                                        style={{
                                          flexDirection:
                                            'row',
                                          alignItems:
                                            'center',
                                          paddingBottom: 5,
                                        }}
                                      >
                                        <Text
                                          style={{
                                            width: 30,
                                            color:
                                              'rgba(255,255,255,0.28)',
                                            fontSize: 8,
                                            fontWeight:
                                              '800',
                                          }}
                                        >
                                          SERIE
                                        </Text>

                                        <Text
                                          style={{
                                            flex: 1,
                                            color:
                                              'rgba(255,255,255,0.28)',
                                            fontSize: 8,
                                            fontWeight:
                                              '800',
                                          }}
                                        >
                                          PESO
                                        </Text>

                                        <Text
                                          style={{
                                            flex: 1,
                                            color:
                                              'rgba(255,255,255,0.28)',
                                            fontSize: 8,
                                            fontWeight:
                                              '800',
                                          }}
                                        >
                                          REPS
                                        </Text>

                                        <View
                                          style={{
                                            width: 26,
                                          }}
                                        />
                                      </View>

                                      {exerciseSets.map(
                                        (
                                          set,
                                          setIndex
                                        ) => (
                                          <View
                                            key={
                                              set.id ||
                                              setIndex
                                            }
                                            style={{
                                              flexDirection:
                                                'row',
                                              alignItems:
                                                'center',
                                              minHeight: 28,
                                              borderTopWidth:
                                                setIndex ===
                                                0
                                                  ? 0
                                                  : 1,
                                              borderTopColor:
                                                'rgba(255,255,255,0.055)',
                                            }}
                                          >
                                            <Text
                                              style={{
                                                width: 30,
                                                color:
                                                  'rgba(255,255,255,0.38)',
                                                fontSize: 9,
                                                fontWeight:
                                                  '700',
                                              }}
                                            >
                                              {setIndex +
                                                1}
                                            </Text>

                                            <Text
                                              style={{
                                                flex: 1,
                                                color:
                                                  'rgba(255,255,255,0.78)',
                                                fontSize: 10,
                                                fontWeight:
                                                  '700',
                                              }}
                                            >
                                              {set.weight ||
                                                '—'}{' '}
                                              kg
                                            </Text>

                                            <Text
                                              style={{
                                                flex: 1,
                                                color:
                                                  'rgba(255,255,255,0.78)',
                                                fontSize: 10,
                                                fontWeight:
                                                  '700',
                                              }}
                                            >
                                              {set.reps ||
                                                '—'}{' '}
                                              reps
                                            </Text>

                                            <View
                                              style={{
                                                width: 26,
                                                alignItems:
                                                  'flex-end',
                                              }}
                                            >
                                              {!!set.prType && (
                                                <MaterialCommunityIcons
                                                  name="trophy"
                                                  size={
                                                    11
                                                  }
                                                  color={
                                                    accentColor
                                                  }
                                                />
                                              )}
                                            </View>
                                          </View>
                                        )
                                      )}
                                    </>
                                  ) : (
                                    <Text
                                      style={{
                                        color:
                                          'rgba(255,255,255,0.62)',
                                        fontSize: 10,
                                      }}
                                    >
                                      {exercisePlan(
                                        exercise
                                      )}
                                    </Text>
                                  )}
                                </View>
                              );
                            }
                          )}

                          {/* ELIMINAR */}
                          <TouchableOpacity
                            activeOpacity={0.65}
                            onPress={() =>
                              deleteWorkout(workout)
                            }
                            style={{
                              alignSelf:
                                'flex-start',
                              flexDirection: 'row',
                              alignItems: 'center',
                              marginTop: 5,
                              paddingVertical: 7,
                              paddingHorizontal: 9,
                            }}
                          >
                            <MaterialCommunityIcons
                              name="trash-can-outline"
                              size={14}
                              color="rgba(255,110,110,0.72)"
                            />

                            <Text
                              style={{
                                color:
                                  'rgba(255,110,110,0.72)',
                                fontSize: 9,
                                fontWeight: '700',
                                marginLeft: 5,
                              }}
                            >
                              Eliminar entrenamiento
                            </Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  </View>
                </View>
              );
            })}

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
  ).sort((a, b) => {
    const dateA = new Date(a.finishedAt).getTime() || 0;
    const dateB = new Date(b.finishedAt).getTime() || 0;

    // Más reciente arriba
    return dateB - dateA;
  });

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
                backgroundColor: 'rgba(16, 17, 21, 0.54)',
                borderWidth: 1,
                borderColor: 'rgba(255, 255, 255, 0.13)',
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

            const previousStrengthSets =
              !isCardioExercise(exercise)
                ? getPreviousStrengthExerciseSets(
                    exercise
                  )
                : [];

            return (
              <View
                key={exercise.id}
                style={[
                  styles.liveExerciseCard,

                  !isCardioExercise(exercise) &&
                    styles.strengthLiveExerciseCard,

                  exerciseComplete &&
                    styles.liveExerciseCardComplete,

                  !isCardioExercise(exercise) &&
                    exerciseComplete &&
                    styles.strengthLiveExerciseCardComplete,
                ]}
              >
                {exercise.isExtraWorkoutExercise && (
                  <TouchableOpacity
                    activeOpacity={0.75}
                    onPress={() => {
                      setWorkoutExercises((items) =>
                        items.filter((item) => item.id !== exercise.id)
                      );
                    }}
                    style={{
                      position: 'absolute',
                      top: 8,
                      right: 8,
                      zIndex: 50,
                      width: 30,
                      height: 30,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <MaterialCommunityIcons
                      name="close"
                      size={21}
                      color={COLORS.text}
                    />
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  activeOpacity={0.78}
                  onPress={() =>
                    toggleExerciseExpanded(
                      exercise.id
                    )
                  }
                  style={[
                    styles.liveExerciseHeader,

                    !isCardioExercise(exercise) &&
                      styles.strengthLiveExerciseHeader,

                    exercise.isExtraWorkoutExercise && {
                      paddingRight: 38,
                    },
                  ]}
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
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: 7,
                    }}
                  >
                    <Text style={styles.liveExerciseName}>
                      {exercise.name}
                    </Text>

                    {!isCardioExercise(exercise) && (() => {
                      const currentLibraryExercise =
                        EXERCISE_LIBRARY.find(
                          (candidate) =>
                            candidate.id === exercise.exerciseId
                        );

                      const exerciseName =
                        currentLibraryExercise?.name ||
                        exercise.name;

                      const variants = EXERCISE_LIBRARY.filter(
                        (candidate) =>
                          candidate.name === exerciseName
                      );

                      if (
                        variants.length <= 1 &&
                        !exercise.isExtraWorkoutExercise
                      ) return null;

                      return (
                        <TouchableOpacity
                          activeOpacity={0.75}
                          onPress={() => {
                            Alert.alert(
                              'Cambiar variante',
                              `Actual: ${
                                exercise.variant ||
                                exercise.equipment ||
                                'Sin variante'
                              }`,
                              [
                                ...variants
                                  .filter(
                                    (candidate) =>
                                      candidate.id !==
                                      exercise.exerciseId
                                  )
                                  .map((candidate) => ({
                                    text:
                                      candidate.variant ||
                                      candidate.equipment ||
                                      'Variante',
                                    onPress: () => {
                                      setWorkoutExercises(
                                        (items) =>
                                          items.map((item) =>
                                            item.id === exercise.id
                                              ? {
                                                  ...item,
                                                  exerciseId:
                                                    candidate.id,
                                                  name:
                                                    candidate.name,
                                                  variant:
                                                    candidate.variant,
                                                  equipment:
                                                    candidate.equipment,
                                                  primaryMuscles: [
                                                    ...(candidate.primaryMuscles ||
                                                      []),
                                                  ],
                                                  secondaryMuscles: [
                                                    ...(candidate.secondaryMuscles ||
                                                      []),
                                                  ],
                                                  muscles: [
                                                    ...(candidate.primaryMuscles ||
                                                      []),
                                                    ...(candidate.secondaryMuscles ||
                                                      []),
                                                  ],
                                                }
                                              : item
                                          )
                                      );
                                    },
                                  })),
                                {
                                  text: 'Cancelar',
                                  style: 'cancel',
                                },
                              ]
                            );
                          }}
                          style={{
                            paddingHorizontal: 8,
                            paddingVertical: 4,
                            borderRadius: 8,
                            borderWidth: 1,
                            borderColor:
                              'rgba(255,176,0,0.35)',
                            backgroundColor:
                              'rgba(255,176,0,0.08)',
                          }}
                        >
                          <Text
                            style={{
                              color: COLORS.orange,
                              fontSize: 10,
                              fontWeight: '800',
                            }}
                          >
                            {exercise.variant ||
                              exercise.equipment ||
                              'Variante'}{' '}
                            · Cambiar
                          </Text>
                        </TouchableOpacity>
                      );
                    })()}
                  </View>

                    <Text style={styles.liveExerciseMeta}>
                      {muscleText(exercise)}
                      {!isCardioExercise(exercise) &&
                      exercise.repRange
                        ? ` · ${exercise.series}×${exercise.repRange} reps`
                        : ''}
                    </Text>
                  </View>

                  <View
                    style={[
                      styles.exerciseProgressBadge,

                      !isCardioExercise(exercise) &&
                        styles.strengthExerciseProgressBadge,

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
                      {isCardioExercise(exercise)
                        ? `${done}/${exercise.sets.length}`
                        : `${done}/${exercise.sets.length} SERIES`}
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



                {Boolean(exercise.expanded) && (
                  <View
                    style={[
                      styles.liveSetsContainer,

                      !isCardioExercise(exercise) &&
                        styles.strengthLiveSetsContainer,

                      isCardioExercise(exercise) &&
                        styles.cardioWorkoutMetricsGlass,
                    ]}
                  >
                    <View
                      style={[
                        styles.liveSetsLabels,
                        isCardioExercise(exercise) &&
                          styles.cardioWorkoutMetricsLabels,
                      ]}
                    >
                      <Text
                        style={[
                          styles.liveSetLabel,
                          styles.setNumberColumn,
                        ]}
                      >
                      {isCardioExercise(exercise) ? 'MIN' : 'SERIE'}
                      </Text>

                      <Text
                        style={[
                          styles.liveSetLabel,
                          styles.setFieldColumn,
                        ]}
                      >
                        {isCardioExercise(exercise) ? 'KM' : 'KG'}
                      </Text>

                      <Text
                        style={[
                          styles.liveSetLabel,
                          styles.setFieldColumn,
                        ]}
                      >
                        {isCardioExercise(exercise) ? 'PPM' : 'REPS'}
                      </Text>

                      <View style={styles.setCheckColumn} />
                    </View>

                    {exercise.sets.map(
                      (set, index) => {
                        const flashing =
                          prFlashId === set.id;

                        const previousSet =
                          previousStrengthSets[index] ||
                          null;

                        return (
                          <View
                            key={set.id}
                            style={styles.liveSetWrapper}
                          >
                            <View
                              style={[
                                styles.liveSetRow,

                                !isCardioExercise(exercise) &&
                                  styles.strengthLiveSetRow,

                                set.completed &&
                                  styles.liveSetRowDone,

                                !isCardioExercise(exercise) &&
                                  set.completed &&
                                  styles.strengthLiveSetRowDone,
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

{isCardioExercise(exercise) ? (
  <View style={styles.setFieldColumn}>
    <TextInput
      value={String(set.duration ?? '')}
      onChangeText={(value) =>
        updateWorkoutSet(
          exercise.id,
          set.id,
          'duration',
          value
        )
      }
      keyboardType="number-pad"
      placeholder="0"
      placeholderTextColor="#50545D"
      style={[
        styles.liveSetInput,
        styles.cardioWorkoutMetricInput,
      ]}
    />
  </View>
) : (
  <View style={styles.setNumberColumn}>
    <View style={styles.liveSetNumberStack}>
      <Text
        style={[
          styles.liveSetNumber,
          !!set.prType &&
            styles.liveSetNumberPR,
        ]}
      >
        {index + 1}
      </Text>

      {!!set.prType && (
        <View style={styles.liveSetMiniPrBadge}>
          <Text style={styles.liveSetMiniPrText}>
            PR
          </Text>
        </View>
      )}
    </View>
  </View>
)}
{isCardioExercise(exercise) ? (
  <View style={styles.setFieldColumn}>
    <TextInput
      value={String(set.distance ?? '')}
      onChangeText={(value) =>
        updateWorkoutSet(
          exercise.id,
          set.id,
          'distance',
          value
        )
      }
      keyboardType="decimal-pad"
      placeholder="0"
      placeholderTextColor="#50545D"
      style={[
        styles.liveSetInput,
        styles.cardioWorkoutMetricInput,
      ]}
    />
  </View>
) : (
  <View style={styles.setFieldColumn}>
    <TextInput
      value={String(set.weight ?? '')}
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
        styles.strengthLiveSetInput,
        !!set.prType &&
          styles.liveSetInputPR,
      ]}
    />
  </View>
)}
{isCardioExercise(exercise) ? (
  <View style={styles.setFieldColumn}>
    <TextInput
      value={String(set.heartRate ?? '')}
      onChangeText={(value) =>
        updateWorkoutSet(
          exercise.id,
          set.id,
          'heartRate',
          value
        )
      }
      keyboardType="number-pad"
      placeholder="0"
      placeholderTextColor="#50545D"
      style={[
        styles.liveSetInput,
        styles.cardioWorkoutMetricInput,
      ]}
    />
  </View>
) : (
  <View style={styles.setFieldColumn}>
    <TextInput
      value={String(set.reps ?? '')}
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
        styles.strengthLiveSetInput,
        !!set.prType &&
          styles.liveSetInputPR,
      ]}
    />
  </View>
)}
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

                            {!isCardioExercise(exercise) &&
                              (!!set.prType ? (
                                <View style={styles.previousSetRow}>
                                  <MaterialCommunityIcons
                                    name="medal-outline"
                                    size={12}
                                    color={COLORS.orange}
                                  />

                                  <Text style={styles.previousSetPrText}>
                                    {set.prText}
                                  </Text>
                                </View>
                              ) : previousSet ? (
                                <View style={styles.previousSetRow}>
                                  <MaterialCommunityIcons
                                    name="history"
                                    size={12}
                                    color="#777D88"
                                  />

                                  <Text style={styles.previousSetText}>
                                    Anterior:{' '}
                                    {previousSet.weight > 0
                                      ? `${previousSet.weight} kg × ${previousSet.reps}`
                                      : `${previousSet.reps} reps`}
                                  </Text>
                                </View>
                              ) : null)}

                            {!!set.prType &&
                              isCardioExercise(exercise) && (
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
                                      : set.prType === 'cardio_time'
                                      ? 'NUEVO RÉCORD DE TIEMPO'
                                      : set.prType === 'cardio_distance'
                                      ? 'NUEVO RÉCORD DE DISTANCIA'
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

                    {isCardioExercise(exercise) &&
                      exercise.sets?.[0] && (
                        <RivalSetCardioLiveTimer
                          exercise={exercise}
                          set={exercise.sets[0]}
                          onUpdate={(field, value) =>
                            updateWorkoutSet(
                              exercise.id,
                              exercise.sets[0].id,
                              field,
                              value
                            )
                          }
                        />
                      )}


{!isCardioExercise(exercise) && (
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
)}                 
 </View>
                )}
              </View>
            );
          })}
<TouchableOpacity
  style={styles.addLiveSetButton}
  activeOpacity={0.75}
  onPress={() => {
    setExercisePickerOpen((value) => !value);
    setExercisePickerMuscle(null);
    setExercisePickerName(null);
  }}
>
  <MaterialCommunityIcons
    name="plus"
    size={17}
    color={COLORS.orange}
  />
  <Text style={styles.addLiveSetText}>Añadir ejercicio</Text>
</TouchableOpacity>

{exercisePickerOpen && (
  <View style={styles.exercisePickerCard}>
    <View style={styles.exercisePickerHeader}>
      <View>
        <Text style={styles.exercisePickerTitle}>
          {exercisePickerName
            ? exercisePickerName
            : exercisePickerMuscle
            ? exercisePickerMuscle
            : 'Elige grupo muscular'}
        </Text>

        <Text style={styles.exercisePickerSubtitle}>
          {exercisePickerName
            ? 'Elige la variante'
            : exercisePickerMuscle
            ? 'Elige un ejercicio'
            : 'Selecciona el grupo muscular'}
        </Text>
      </View>

      <TouchableOpacity
        onPress={() => {
          if (exercisePickerName) {
            setExercisePickerName(null);
          } else if (exercisePickerMuscle) {
            setExercisePickerMuscle(null);
          } else {
            setExercisePickerOpen(false);
          }
        }}
      >
        <MaterialCommunityIcons
          name={
            exercisePickerMuscle
              ? 'arrow-left'
              : 'close'
          }
          size={23}
          color={COLORS.text}
        />
      </TouchableOpacity>
    </View>

    {!exercisePickerMuscle && (
      <View style={styles.exercisePickerGrid}>
        {[...new Set(
          EXERCISE_LIBRARY.flatMap(
            (item) => item.primaryMuscles || []
          )
        )].map((muscle) => (
          <TouchableOpacity
            key={muscle}
            activeOpacity={0.75}
            style={styles.exercisePickerOption}
            onPress={() =>
              setExercisePickerMuscle(muscle)
            }
          >
            <Text style={styles.exercisePickerOptionText}>
              {muscle}
            </Text>

            <MaterialCommunityIcons
              name="chevron-right"
              size={18}
              color={COLORS.orange}
            />
          </TouchableOpacity>
        ))}
      </View>
    )}

    {exercisePickerMuscle &&
      !exercisePickerName && (
        <View style={styles.exercisePickerList}>
          {[...new Set(
            EXERCISE_LIBRARY
              .filter((item) =>
                (item.primaryMuscles || []).includes(
                  exercisePickerMuscle
                )
              )
              .map((item) => item.name)
          )].map((name) => (
            <TouchableOpacity
              key={name}
              activeOpacity={0.75}
              style={[
                styles.exercisePickerOption,
                EXERCISE_GUIDES[name] &&
                  styles.exerciseGuidePressable,
              ]}
              onPressIn={() =>
                startExerciseGuideProgress(name)
              }
              onPressOut={cancelExerciseGuideProgress}
              onPress={() => {
                if (exerciseGuideLongPressDone.current) {
                  exerciseGuideLongPressDone.current = false;
                  return;
                }

                setExercisePickerName(name);
              }}
            >
              {EXERCISE_GUIDES[name] &&
                exerciseGuideHoldingName === name && (
                  <Animated.View
                    pointerEvents="none"
                    style={[
                      styles.exerciseGuideProgressFill,
                      {
                        width: exerciseGuideProgress.interpolate({
                          inputRange: [0, 1],
                          outputRange: ['0%', '100%'],
                        }),
                      },
                    ]}
                  />
                )}

              <Text
                style={[
                  styles.exercisePickerOptionText,
                  EXERCISE_GUIDES[name] &&
                    styles.exerciseGuideForeground,
                ]}
              >
                {name}
              </Text>

              <MaterialCommunityIcons
                name="chevron-right"
                size={18}
                color={COLORS.orange}
                style={styles.exerciseGuideForeground}
              />
            </TouchableOpacity>
          ))}
        </View>
      )}

    {exercisePickerMuscle &&
      exercisePickerName && (
        <View style={styles.exercisePickerList}>
          {EXERCISE_LIBRARY
            .filter(
              (item) =>
                item.name === exercisePickerName &&
                (item.primaryMuscles || []).includes(
                  exercisePickerMuscle
                )
            )
            .map((item) => (
              <TouchableOpacity
                key={item.id}
                activeOpacity={0.75}
                style={styles.exercisePickerOption}
                onPress={() =>
                  addLibraryExercise(item)
                }
              >
                <View style={styles.flex}>
                  <Text
                    style={styles.exercisePickerOptionText}
                  >
                    {item.variant ||
                      item.equipment ||
                      'Estándar'}
                  </Text>
                </View>

                <MaterialCommunityIcons
                  name="plus"
                  size={18}
                  color={COLORS.orange}
                />
              </TouchableOpacity>
            ))}
        </View>
      )}
  </View>
)}
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

                  <Text style={[styles.prSummarySubtitle, lightTextStyle]}>
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

const WorkoutSummary = () => {
  if (!workoutSummary) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text
          style={{
            color: '#FFFFFF',
            fontSize: 16,
            fontWeight: '800',
          }}
        >
          No hay resumen disponible
        </Text>
      </View>
    );
  }

  const {
    routineName,
    exerciseCount,
    completedSets,
    exercises,
    prList,
    prCount,
    cardio,
    isCardio,
    points,
    origin,
  } = workoutSummary;

  const strengthSummaryExercises =
    (exercises || []).filter(
      (exercise) =>
        !isCardioExercise(exercise) &&
        (exercise.sets || []).some(
          (set) => set.completed
        )
    );

  const strengthCompletedSets =
    strengthSummaryExercises.reduce(
      (total, exercise) =>
        total +
        (exercise.sets || []).filter(
          (set) => set.completed
        ).length,
      0
    );

  const strengthPrCount =
    strengthSummaryExercises.reduce(
      (total, exercise) =>
        total +
        (exercise.sets || []).filter(
          (set) =>
            set.completed &&
            !!set.prType
        ).length,
      0
    );

  const hasStrength =
    strengthSummaryExercises.length > 0;

  const goToSummaryDestination = async () => {
    await impact();

    setWorkoutSummary(null);

    if (origin === 'league') {
      setSelectedTab('Liga');
      setScreen('league');
    } else {
      setSelectedTab('Inicio');
      setScreen('home');
    }
  };

  return (
    <ScrollView
      contentContainerStyle={{
        paddingHorizontal: 20,
        paddingTop: 28,
        paddingBottom: 50,
      }}
      showsVerticalScrollIndicator={false}
    >
      {/* CABECERA */}
      <View
        style={{
          alignItems: 'center',
          marginBottom: 28,
        }}
      >
        <View
          style={{
            width: 62,
            height: 62,
            borderRadius: 31,
            backgroundColor:
              'rgba(255,179,0,0.14)',
            borderWidth: 1,
            borderColor:
              'rgba(255,179,0,0.35)',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 16,
          }}
        >
          <MaterialCommunityIcons
            name="check-bold"
            size={31}
            color={COLORS.orange}
          />
        </View>

        <Text
          style={{
            color: COLORS.orange,
            fontSize: 11,
            fontWeight: '900',
            letterSpacing: 1.8,
            marginBottom: 7,
          }}
        >
          ENTRENAMIENTO COMPLETADO
        </Text>

        <Text
          style={{
            color: '#FFFFFF',
            fontSize: 28,
            fontWeight: '900',
            letterSpacing: -0.7,
            textAlign: 'center',
          }}
        >
          {routineName}
        </Text>

        <Text
          style={{
            color: '#777D88',
            fontSize: 13,
            marginTop: 6,
          }}
        >
          Buen trabajo. Sesión guardada.
        </Text>
      </View>

      {/* CARDIO */}
      {isCardio && cardio && (
        <View
          style={{
            backgroundColor:
              'rgba(12,13,17,0.58)',
            borderWidth: 1,
            borderColor:
              'rgba(255,255,255,0.09)',
            borderRadius: 22,
            padding: 20,
            marginBottom: 14,
          }}
        >
          <Text
            style={{
              color: '#777D88',
              fontSize: 10,
              fontWeight: '900',
              letterSpacing: 1.3,
              marginBottom: 5,
            }}
          >
            DISTANCIA
          </Text>

          <View
            style={{
              flexDirection: 'row',
              alignItems: 'flex-end',
              marginBottom: 22,
            }}
          >
            <Text
              style={{
                color: '#FFFFFF',
                fontSize: 43,
                fontWeight: '900',
                letterSpacing: -1.5,
              }}
            >
              {cardio.distance ?? '—'}
            </Text>

            {cardio.distance !== null && (
              <Text
                style={{
                  color: '#8C9099',
                  fontSize: 15,
                  fontWeight: '800',
                  marginLeft: 6,
                  marginBottom: 7,
                }}
              >
                km
              </Text>
            )}
          </View>

          <View
            style={{
              flexDirection: 'row',
              borderTopWidth: 1,
              borderTopColor:
                'rgba(255,255,255,0.07)',
              paddingTop: 16,
            }}
          >
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  color: '#FFFFFF',
                  fontSize: 18,
                  fontWeight: '900',
                }}
              >
                {cardio.duration}
              </Text>

              <Text
                style={{
                  color: '#777D88',
                  fontSize: 10,
                  fontWeight: '800',
                  marginTop: 4,
                }}
              >
                TIEMPO
              </Text>
            </View>

            <View style={{ flex: 1 }}>
              <Text
                style={{
                  color: '#FFFFFF',
                  fontSize: 18,
                  fontWeight: '900',
                }}
              >
                {cardio.pace}
              </Text>

              <Text
                style={{
                  color: '#777D88',
                  fontSize: 10,
                  fontWeight: '800',
                  marginTop: 4,
                }}
              >
                RITMO
              </Text>
            </View>

            <View style={{ flex: 1 }}>
              <Text
                style={{
                  color: '#FFFFFF',
                  fontSize: 18,
                  fontWeight: '900',
                }}
              >
                {cardio.heartRate ?? '—'}
              </Text>

              <Text
                style={{
                  color: '#777D88',
                  fontSize: 10,
                  fontWeight: '800',
                  marginTop: 4,
                }}
              >
                PPM
              </Text>
            </View>
          </View>
        </View>
      )}

      {/* FUERZA */}
      {hasStrength && (
        <View
          style={{
            flexDirection: 'row',
            backgroundColor:
              'rgba(12,13,17,0.58)',
            borderWidth: 1,
            borderColor:
              'rgba(255,255,255,0.09)',
            borderRadius: 22,
            paddingVertical: 20,
            paddingHorizontal: 18,
            marginBottom: 14,
          }}
        >
          <View
            style={{
              flex: 1,
              alignItems: 'center',
            }}
          >
            <Text
              style={{
                color: '#FFFFFF',
                fontSize: 28,
                fontWeight: '900',
              }}
            >
              {strengthSummaryExercises.length}
            </Text>

            <Text
              style={{
                color: '#777D88',
                fontSize: 10,
                fontWeight: '800',
                marginTop: 4,
              }}
            >
              EJERCICIOS
            </Text>
          </View>

          <View
            style={{
              width: 1,
              backgroundColor:
                'rgba(255,255,255,0.08)',
            }}
          />

          <View
            style={{
              flex: 1,
              alignItems: 'center',
            }}
          >
            <Text
              style={{
                color: '#FFFFFF',
                fontSize: 28,
                fontWeight: '900',
              }}
            >
              {strengthCompletedSets}
            </Text>

            <Text
              style={{
                color: '#777D88',
                fontSize: 10,
                fontWeight: '800',
                marginTop: 4,
              }}
            >
              SERIES
            </Text>
          </View>

          <View
            style={{
              width: 1,
              backgroundColor:
                'rgba(255,255,255,0.08)',
            }}
          />

          <View
            style={{
              flex: 1,
              alignItems: 'center',
            }}
          >
            <Text
              style={{
                color: COLORS.orange,
                fontSize: 28,
                fontWeight: '900',
              }}
            >
              {strengthPrCount}
            </Text>

            <Text
              style={{
                color: '#777D88',
                fontSize: 10,
                fontWeight: '800',
                marginTop: 4,
              }}
            >
              RÉCORDS
            </Text>
          </View>
        </View>
      )}

      {/* DETALLE DE FUERZA */}
      {hasStrength && (
        <View style={styles.workoutSummaryDetailSection}>
          <Text style={styles.workoutSummarySectionLabel}>
            DETALLE DEL ENTRENAMIENTO
          </Text>

          {strengthSummaryExercises.map(
            (exercise) => {
              const completedExerciseSets =
                (exercise.sets || []).filter(
                  (set) => set.completed
                );

              const exercisePrCount =
                completedExerciseSets.filter(
                  (set) => !!set.prType
                ).length;

              return (
                <View
                  key={exercise.id || exercise.name}
                  style={[
                    styles.workoutSummaryExerciseCard,

                    exercisePrCount > 0 &&
                      styles.workoutSummaryExerciseCardPR,
                  ]}
                >
                  <View
                    style={
                      styles.workoutSummaryExerciseHeader
                    }
                  >
                    <View style={styles.flex}>
                      <Text
                        style={
                          styles.workoutSummaryExerciseName
                        }
                      >
                        {exercise.name}
                      </Text>

                      <Text
                        style={
                          styles.workoutSummaryExerciseMeta
                        }
                      >
                        {exercise.variant ||
                          exercise.equipment ||
                          muscleText(exercise)}
                      </Text>
                    </View>

                    {exercisePrCount > 0 && (
                      <View
                        style={
                          styles.workoutSummaryExercisePrBadge
                        }
                      >
                        <Text
                          style={
                            styles.workoutSummaryExercisePrText
                          }
                        >
                          PR ×{exercisePrCount}
                        </Text>
                      </View>
                    )}
                  </View>

                  {completedExerciseSets.map(
                    (set, index) => {
                      const weight =
                        parseNumber(set.weight);

                      const reps =
                        parseNumber(set.reps);

                      const resultText =
                        weight !== null &&
                        weight > 0
                          ? `${weight} kg × ${
                              reps ?? '—'
                            }`
                          : `${reps ?? '—'} reps`;

                      return (
                        <View
                          key={set.id || index}
                          style={
                            styles.workoutSummarySetRow
                          }
                        >
                          <Text
                            style={
                              styles.workoutSummarySetLabel
                            }
                          >
                            SERIE {index + 1}
                          </Text>

                          <Text
                            style={
                              styles.workoutSummarySetValue
                            }
                          >
                            {resultText}
                          </Text>

                          {!!set.prType && (
                            <View
                              style={
                                styles.workoutSummarySetPrBadge
                              }
                            >
                              <Text
                                style={
                                  styles.workoutSummarySetPrText
                                }
                              >
                                PR
                              </Text>
                            </View>
                          )}
                        </View>
                      );
                    }
                  )}
                </View>
              );
            }
          )}
        </View>
      )}

      {/* RÉCORDS */}
      {prCount > 0 && (
        <View
          style={{
            backgroundColor:
              'rgba(255,179,0,0.07)',
            borderWidth: 1,
            borderColor:
              'rgba(255,179,0,0.22)',
            borderRadius: 22,
            padding: 18,
            marginBottom: 14,
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              marginBottom: 14,
            }}
          >
            <MaterialCommunityIcons
              name="medal-outline"
              size={21}
              color={COLORS.orange}
            />

            <Text
              style={{
                color: '#FFFFFF',
                fontSize: 15,
                fontWeight: '900',
                marginLeft: 9,
              }}
            >
              {prCount === 1
                ? 'NUEVO RÉCORD'
                : `${prCount} NUEVOS RÉCORDS`}
            </Text>
          </View>

          {prList.map((pr) => (
            <View
              key={`${pr.exercise}-${pr.id}`}
              style={{
                paddingVertical: 10,
                borderTopWidth: 1,
                borderTopColor:
                  'rgba(255,255,255,0.06)',
              }}
            >
              <Text
                style={{
                  color: '#FFFFFF',
                  fontSize: 14,
                  fontWeight: '800',
                }}
              >
                {pr.exercise}
              </Text>

              <Text
                style={{
                  color: '#9A9EA7',
                  fontSize: 12,
                  marginTop: 4,
                }}
              >
                {pr.text}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* PUNTOS */}
      <View
        style={{
          backgroundColor:
            'rgba(12,13,17,0.68)',
          borderWidth: 1,
          borderColor:
            points.total > 0
              ? 'rgba(255,179,0,0.30)'
              : 'rgba(255,255,255,0.08)',
          borderRadius: 22,
          padding: 20,
          marginBottom: 22,
        }}
      >
        <Text
          style={{
            color: '#777D88',
            fontSize: 10,
            fontWeight: '900',
            letterSpacing: 1.4,
            marginBottom: 17,
          }}
        >
          PUNTOS DE LIGA
        </Text>

        {points.total > 0 ? (
          <>
            <View
              style={{
                flexDirection: 'row',
                justifyContent:
                  'space-between',
                marginBottom: 10,
              }}
            >
              <Text
                style={{
                  color: '#A3A7AF',
                  fontSize: 14,
                }}
              >
                Entrenamiento
              </Text>

              <Text
                style={{
                  color: '#FFFFFF',
                  fontSize: 14,
                  fontWeight: '900',
                }}
              >
                +{points.base}
              </Text>
            </View>

            {points.records > 0 && (
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent:
                    'space-between',
                  marginBottom: 16,
                }}
              >
                <Text
                  style={{
                    color: '#A3A7AF',
                    fontSize: 14,
                  }}
                >
                  Récords
                </Text>

                <Text
                  style={{
                    color: COLORS.orange,
                    fontSize: 14,
                    fontWeight: '900',
                  }}
                >
                  +{points.records}
                </Text>
              </View>
            )}

            <View
              style={{
                height: 1,
                backgroundColor:
                  'rgba(255,255,255,0.08)',
                marginBottom: 16,
              }}
            />

            <View
              style={{
                flexDirection: 'row',
                justifyContent:
                  'space-between',
                alignItems: 'center',
              }}
            >
              <Text
                style={{
                  color: '#FFFFFF',
                  fontSize: 15,
                  fontWeight: '900',
                }}
              >
                TOTAL
              </Text>

              <Text
                style={{
                  color: COLORS.orange,
                  fontSize: 30,
                  fontWeight: '900',
                  letterSpacing: -0.7,
                }}
              >
                +{points.total} PTS
              </Text>
            </View>
          </>
        ) : (
          <View>
            <Text
              style={{
                color: '#FFFFFF',
                fontSize: 17,
                fontWeight: '900',
                marginBottom: 5,
              }}
            >
              Sesión guardada
            </Text>

            <Text
              style={{
                color: '#777D88',
                fontSize: 12,
                lineHeight: 18,
              }}
            >
              Este entrenamiento no ha sumado
              puntos de Liga.
            </Text>
          </View>
        )}
      </View>

      {/* BOTÓN */}
      <TouchableOpacity
        activeOpacity={0.82}
        onPress={goToSummaryDestination}
        style={{
          minHeight: 56,
          borderRadius: 18,
          backgroundColor: COLORS.orange,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 20,
        }}
      >
        <Text
          style={{
            color: '#17120A',
            fontSize: 14,
            fontWeight: '900',
            letterSpacing: 0.6,
          }}
        >
          CONTINUAR
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
};

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

  // RIVALSET_SPLASH_ROOT_FINAL
  // IMPORTANTE: todos los hooks de App ya se han ejecutado.
  if (showRivalSetSplash) {
    return (
      <RivalSetSplash
        onFinish={() => setShowRivalSetSplash(false)}
      />
    );
  }

return (
<LinearGradient
colors={
  getAccentBackground(
    accentColor,
    isLightTheme
  )
}
locations={[0, 0.18, 0.38, 0.60, 0.82, 1]}
start={{ x: 0.5, y: 0 }}
end={{ x: 0.5, y: 1 }}
style={styles.screen}>
  

  

  

  
  {/* RIVALSET_SOFT_RADIAL_LIGHT */}
  {(() => {
    const { r, g, b } = hexToRgb(
      accentColor || COLORS.orange
    );

    return (
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',

          // Centro visual aprox. en el tercio superior.
          top: isLightTheme ? '-5%' : '-17%',
          left: isLightTheme ? '-70%' : '-57.5%',
          width: isLightTheme ? '240%' : '255%',
          aspectRatio: 1,
        }}
      >
        <Svg
          pointerEvents="none"
          width="100%"
          height="100%"
          viewBox="0 0 100 100"
        >
          <Defs>
            <RadialGradient
              id="rivalsetSoftLight"
              cx="50%"
              cy="50%"
              rx="50%"
              ry="50%"
              fx="50%"
              fy="50%"
            >
              <Stop
            offset="0%"
            stopColor={
              isLightTheme
                ? mixAccent(
                  accentColor.toUpperCase() === '#FF7EB3'
                    ? '#D92B72'
                    : accentColor, '#FFFFFF', 0.08)
                : accentColor
            }
            stopOpacity={
              isLightTheme
                ? 0.95
                : 0.50
            }
          />

              <Stop
            offset="14%"
            stopColor={
              isLightTheme
                ? (
                    accentColor.toUpperCase() === '#FF7EB3'
                      ? '#D92B72'
                      : accentColor
                  )
                : accentColor
            }
            stopOpacity={
              isLightTheme
                ? 0.90
                : 0.41
            }
          />

              <Stop
            offset="30%"
            stopColor={
              isLightTheme
                ? (
                    accentColor.toUpperCase() === '#FF7EB3'
                      ? '#D92B72'
                      : accentColor
                  )
                : accentColor
            }
            stopOpacity={
              isLightTheme
                ? 0.82
                : 0.27
            }
          />

              <Stop
            offset="48%"
            stopColor={
              isLightTheme
                ? mixAccent(
                  accentColor.toUpperCase() === '#FF7EB3'
                    ? '#D92B72'
                    : accentColor, '#000000', 0.18)
                : accentColor
            }
            stopOpacity={
              isLightTheme
                ? 0.68
                : 0.15
            }
          />

              <Stop
            offset="66%"
            stopColor={
              isLightTheme
                ? mixAccent(
                  accentColor.toUpperCase() === '#FF7EB3'
                    ? '#D92B72'
                    : accentColor, '#000000', 0.32)
                : accentColor
            }
            stopOpacity={
              isLightTheme
                ? 0.46
                : 0.060
            }
          />

              <Stop
            offset="84%"
            stopColor={
              isLightTheme
                ? mixAccent(
                  accentColor.toUpperCase() === '#FF7EB3'
                    ? '#D92B72'
                    : accentColor, '#000000', 0.42)
                : accentColor
            }
            stopOpacity={
              isLightTheme
                ? 0.20
                : 0.018
            }
          />

              <Stop
            offset="100%"
            stopColor={
              isLightTheme
                ? mixAccent(
                  accentColor.toUpperCase() === '#FF7EB3'
                    ? '#D92B72'
                    : accentColor, '#000000', 0.42)
                : accentColor
            }
            stopOpacity={
              isLightTheme
                ? 0
                : 0
            }
          />
            </RadialGradient>
          </Defs>

          <Rect
            x="0"
            y="0"
            width="100"
            height="100"
            fill="url(#rivalsetSoftLight)"
          />
        </Svg>
      </View>
    );
  })()}

  <SafeAreaView
    style={[
      styles.flex,
      {
        position: 'relative',
        zIndex: 10,
      },
    ]}
  >

  
      <StatusBar
        barStyle="light-content"
        backgroundColor="#08090C"
      />

      {exerciseGuideName &&
        EXERCISE_GUIDES[exerciseGuideName] && (() => {
          const guide = EXERCISE_GUIDES[exerciseGuideName];

          return (
            <View style={styles.exerciseGuideOverlay}>
              <SafeAreaView style={styles.exerciseGuideSafe}>
                <View style={styles.exerciseGuideHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.exerciseGuideEyebrow}>
                      GUÍA DE EJERCICIO
                    </Text>

                    <Text style={styles.exerciseGuideTitle}>
                      {exerciseGuideName}
                    </Text>

                    <Text style={styles.exerciseGuideSubtitle}>
                      {(guide.muscles || [])
                        .slice(0, 2)
                        .join(' · ')
                        .toUpperCase()}
                    </Text>
                  </View>

                  <TouchableOpacity
                    style={styles.exerciseGuideClose}
                    onPress={() => {
                      setExerciseGuideName(null);
                      exerciseGuideLongPressDone.current = false;
                      exerciseGuideProgress.setValue(0);
                    }}
                  >
                    <MaterialCommunityIcons
                      name="close"
                      size={24}
                      color={COLORS.text}
                    />
                  </TouchableOpacity>
                </View>

                <ScrollView
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={styles.exerciseGuideScroll}
                >
                  <ExerciseAnimation exerciseName={exerciseGuideName} />

                  <Text style={styles.exerciseGuideSectionTitle}>
                    MÚSCULOS
                  </Text>

                  <View style={styles.exerciseGuideChips}>
                    {(guide.muscles || []).map((muscle) => (
                      <View
                        key={muscle}
                        style={styles.exerciseGuideChip}
                      >
                        <Text style={styles.exerciseGuideChipText}>
                          {muscle}
                        </Text>
                      </View>
                    ))}
                  </View>

                  <Text style={styles.exerciseGuideSectionTitle}>
                    TÉCNICA
                  </Text>

                  {(guide.technique || []).map((text, index) => (
                    <View
                      key={`${exerciseGuideName}-technique-${index}`}
                      style={styles.exerciseGuideStep}
                    >
                      <View style={styles.exerciseGuideStepNumber}>
                        <Text
                          style={styles.exerciseGuideStepNumberText}
                        >
                          {index + 1}
                        </Text>
                      </View>

                      <Text style={styles.exerciseGuideStepText}>
                        {text}
                      </Text>
                    </View>
                  ))}

                  <Text style={styles.exerciseGuideSectionTitle}>
                    PUNTOS CLAVE
                  </Text>

                  {(guide.keyPoints || []).map((text, index) => (
                    <View
                      key={`${exerciseGuideName}-key-${index}`}
                      style={styles.exerciseGuideBullet}
                    >
                      <MaterialCommunityIcons
                        name="check-circle-outline"
                        size={18}
                        color={COLORS.orange}
                      />

                      <Text style={styles.exerciseGuideBulletText}>
                        {text}
                      </Text>
                    </View>
                  ))}

                  <Text style={styles.exerciseGuideSectionTitle}>
                    EVITA
                  </Text>

                  {(guide.avoid || []).map((text, index) => (
                    <View
                      key={`${exerciseGuideName}-avoid-${index}`}
                      style={styles.exerciseGuideBullet}
                    >
                      <MaterialCommunityIcons
                        name="close-circle-outline"
                        size={18}
                        color="#FF6B6B"
                      />

                      <Text style={styles.exerciseGuideBulletText}>
                        {text}
                      </Text>
                    </View>
                  ))}

                  <View style={styles.exerciseGuideSafety}>
                    <MaterialCommunityIcons
                      name="shield-check-outline"
                      size={22}
                      color={COLORS.orange}
                    />

                    <Text style={styles.exerciseGuideSafetyText}>
                      Utiliza una carga que puedas controlar y detén
                      el ejercicio si aparece dolor.
                    </Text>
                  </View>
                </ScrollView>
              </SafeAreaView>
            </View>
          );
        })()}

<GlobalInputAccessory />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
      {screen === 'home'
        ? Home()
    : screen === 'globalLeague'
? <GlobalLeague />
    : screen === 'league'
? League()
: screen === 'leagueHistory'
? <LeagueHistory />
: screen === 'profile'
        ? (session ? Profile() : ProfileLogin())
        : screen === 'routines'
        ? Routines()
        : screen === 'templates'
        ? Templates()
        : screen === 'nutrition'
? <NutritionComingSoon />
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
: screen === 'workoutSummary'
? <WorkoutSummary />
: Workout()}
      </KeyboardAvoidingView>

      {/* RIVALSET SPLASH — ÚLTIMA CAPA VISUAL */}

    </SafeAreaView>
</LinearGradient>
);
}

/* =========================================================
   ESTILOS
========================================================= */


const EXERCISE_ANIMATION_FRAMES = {
"Aducción": [require("./assets/exercise-guides/catalog/package/assets/hip-adduction-machine/frame-1.png"),
require("./assets/exercise-guides/catalog/package/assets/hip-adduction-machine/frame-2.png"),
require("./assets/exercise-guides/catalog/package/assets/hip-adduction-machine/frame-3.png")],

"Abducción": [
    require('./assets/exercise-guides/rivalset/hip-abduction-machine/frame-1.png'),
    require('./assets/exercise-guides/rivalset/hip-abduction-machine/frame-2.png'),
    require('./assets/exercise-guides/rivalset/hip-abduction-machine/frame-3.png'),
  ],

  'Jalón unilateral': [
    require('./assets/exercise-guides/rivalset/close-grip-lat-pulldown/frame-1.png'),
    require('./assets/exercise-guides/rivalset/close-grip-lat-pulldown/frame-2.png'),
    require('./assets/exercise-guides/rivalset/close-grip-lat-pulldown/frame-3.png'),
  ],
  'Pullover': [
    require('./assets/exercise-guides/rivalset/straight-arm-pulldown/frame-1.png'),
    require('./assets/exercise-guides/rivalset/straight-arm-pulldown/frame-2.png'),
    require('./assets/exercise-guides/rivalset/straight-arm-pulldown/frame-3.png'),
  ],
  'Press militar': [
    require('./assets/exercise-guides/rivalset/overhead-press/frame-1.png'),
    require('./assets/exercise-guides/rivalset/overhead-press/frame-2.png'),
    require('./assets/exercise-guides/rivalset/overhead-press/frame-3.png'),
  ],
  'Press de hombro': [
    require('./assets/exercise-guides/rivalset/machine-shoulder-press/frame-1.png'),
    require('./assets/exercise-guides/rivalset/machine-shoulder-press/frame-2.png'),
    require('./assets/exercise-guides/rivalset/machine-shoulder-press/frame-3.png'),
  ],
  'Extensión sobre cabeza': [
    require('./assets/exercise-guides/rivalset/overhead-tricep-extension/frame-1.png'),
    require('./assets/exercise-guides/rivalset/overhead-tricep-extension/frame-2.png'),
    require('./assets/exercise-guides/rivalset/overhead-tricep-extension/frame-3.png'),
  ],
  'Press inclinado': [
    require('./assets/exercise-guides/rivalset/incline-bench-press/frame-1.png'),
    require('./assets/exercise-guides/rivalset/incline-bench-press/frame-2.png'),
    require('./assets/exercise-guides/rivalset/incline-bench-press/frame-3.png'),
  ],
  'Press de pecho': [
    require('./assets/exercise-guides/rivalset/machine-chest-press/frame-1.png'),
    require('./assets/exercise-guides/rivalset/machine-chest-press/frame-2.png'),
    require('./assets/exercise-guides/rivalset/machine-chest-press/frame-3.png'),
  ],
  'Aperturas': [
    require('./assets/exercise-guides/rivalset/dumbbell-fly/frame-1.png'),
    require('./assets/exercise-guides/rivalset/dumbbell-fly/frame-2.png'),
    require('./assets/exercise-guides/rivalset/dumbbell-fly/frame-3.png'),
  ],
  'Contractora': [
    require('./assets/exercise-guides/rivalset/pec-deck/frame-1.png'),
    require('./assets/exercise-guides/rivalset/pec-deck/frame-2.png'),
    require('./assets/exercise-guides/rivalset/pec-deck/frame-3.png'),
  ],
  'Fondos': [
    require('./assets/exercise-guides/rivalset/chest-dip/frame-1.png'),
    require('./assets/exercise-guides/rivalset/chest-dip/frame-2.png'),
    require('./assets/exercise-guides/rivalset/chest-dip/frame-3.png'),
  ],
  'Dominadas': [
    require('./assets/exercise-guides/rivalset/pull-up/frame-1.png'),
    require('./assets/exercise-guides/rivalset/pull-up/frame-2.png'),
    require('./assets/exercise-guides/rivalset/pull-up/frame-3.png'),
  ],
  'Jalón al pecho': [
    require('./assets/exercise-guides/rivalset/lat-pulldown/frame-1.png'),
    require('./assets/exercise-guides/rivalset/lat-pulldown/frame-2.png'),
    require('./assets/exercise-guides/rivalset/lat-pulldown/frame-3.png'),
  ],
  'Remo': [
    require('./assets/exercise-guides/rivalset/barbell-row/frame-1.png'),
    require('./assets/exercise-guides/rivalset/barbell-row/frame-2.png'),
    require('./assets/exercise-guides/rivalset/barbell-row/frame-3.png'),
  ],
  'Remo sentado': [
    require('./assets/exercise-guides/rivalset/seated-row/frame-1.png'),
    require('./assets/exercise-guides/rivalset/seated-row/frame-2.png'),
    require('./assets/exercise-guides/rivalset/seated-row/frame-3.png'),
  ],
  'Remo T': [
    require('./assets/exercise-guides/rivalset/t-bar-row/frame-1.png'),
    require('./assets/exercise-guides/rivalset/t-bar-row/frame-2.png'),
    require('./assets/exercise-guides/rivalset/t-bar-row/frame-3.png'),
  ],
  'Elevaciones laterales': [
    require('./assets/exercise-guides/rivalset/lateral-raise/frame-1.png'),
    require('./assets/exercise-guides/rivalset/lateral-raise/frame-2.png'),
    require('./assets/exercise-guides/rivalset/lateral-raise/frame-3.png'),
  ],
  'Pájaros': [
    require('./assets/exercise-guides/rivalset/rear-delt-fly/frame-1.png'),
    require('./assets/exercise-guides/rivalset/rear-delt-fly/frame-2.png'),
    require('./assets/exercise-guides/rivalset/rear-delt-fly/frame-3.png'),
  ],
  'Face pull': [
    require('./assets/exercise-guides/rivalset/face-pull/frame-1.png'),
    require('./assets/exercise-guides/rivalset/face-pull/frame-2.png'),
    require('./assets/exercise-guides/rivalset/face-pull/frame-3.png'),
  ],
  'Curl de bíceps': [
    require('./assets/exercise-guides/rivalset/bicep-curl/frame-1.png'),
    require('./assets/exercise-guides/rivalset/bicep-curl/frame-2.png'),
    require('./assets/exercise-guides/rivalset/bicep-curl/frame-3.png'),
  ],
  'Curl martillo': [
    require('./assets/exercise-guides/rivalset/hammer-curl/frame-1.png'),
    require('./assets/exercise-guides/rivalset/hammer-curl/frame-2.png'),
    require('./assets/exercise-guides/rivalset/hammer-curl/frame-3.png'),
  ],
  'Curl predicador': [
    require('./assets/exercise-guides/rivalset/preacher-curl/frame-1.png'),
    require('./assets/exercise-guides/rivalset/preacher-curl/frame-2.png'),
    require('./assets/exercise-guides/rivalset/preacher-curl/frame-3.png'),
  ],
  'Extensión de tríceps': [
    require('./assets/exercise-guides/rivalset/tricep-pushdown/frame-1.png'),
    require('./assets/exercise-guides/rivalset/tricep-pushdown/frame-2.png'),
    require('./assets/exercise-guides/rivalset/tricep-pushdown/frame-3.png'),
  ],
  'Press francés': [
    require('./assets/exercise-guides/rivalset/skull-crusher/frame-1.png'),
    require('./assets/exercise-guides/rivalset/skull-crusher/frame-2.png'),
    require('./assets/exercise-guides/rivalset/skull-crusher/frame-3.png'),
  ],
  'Press cerrado': [
    require('./assets/exercise-guides/rivalset/close-grip-bench-press/frame-1.png'),
    require('./assets/exercise-guides/rivalset/close-grip-bench-press/frame-2.png'),
    require('./assets/exercise-guides/rivalset/close-grip-bench-press/frame-3.png'),
  ],
  'Fondos de tríceps': [
    require('./assets/exercise-guides/rivalset/bench-dip/frame-1.png'),
    require('./assets/exercise-guides/rivalset/bench-dip/frame-2.png'),
    require('./assets/exercise-guides/rivalset/bench-dip/frame-3.png'),
  ],
  'Sentadilla': [
    require('./assets/exercise-guides/rivalset/squat/frame-1.png'),
    require('./assets/exercise-guides/rivalset/squat/frame-2.png'),
    require('./assets/exercise-guides/rivalset/squat/frame-3.png'),
  ],
  'Hack squat': [
    require('./assets/exercise-guides/rivalset/hack-squat/frame-1.png'),
    require('./assets/exercise-guides/rivalset/hack-squat/frame-2.png'),
    require('./assets/exercise-guides/rivalset/hack-squat/frame-3.png'),
  ],
  'Prensa': [
    require('./assets/exercise-guides/rivalset/leg-press/frame-1.png'),
    require('./assets/exercise-guides/rivalset/leg-press/frame-2.png'),
    require('./assets/exercise-guides/rivalset/leg-press/frame-3.png'),
  ],
  'Extensión de cuádriceps': [
    require('./assets/exercise-guides/rivalset/leg-extension/frame-1.png'),
    require('./assets/exercise-guides/rivalset/leg-extension/frame-2.png'),
    require('./assets/exercise-guides/rivalset/leg-extension/frame-3.png'),
  ],
  'Sentadilla búlgara': [
    require('./assets/exercise-guides/rivalset/bulgarian-split-squat/frame-1.png'),
    require('./assets/exercise-guides/rivalset/bulgarian-split-squat/frame-2.png'),
    require('./assets/exercise-guides/rivalset/bulgarian-split-squat/frame-3.png'),
  ],
  'Peso muerto rumano': [
    require('./assets/exercise-guides/rivalset/romanian-deadlift/frame-1.png'),
    require('./assets/exercise-guides/rivalset/romanian-deadlift/frame-2.png'),
    require('./assets/exercise-guides/rivalset/romanian-deadlift/frame-3.png'),
  ],
  'Curl femoral tumbado': [
    require('./assets/exercise-guides/rivalset/lying-leg-curl/frame-1.png'),
    require('./assets/exercise-guides/rivalset/lying-leg-curl/frame-2.png'),
    require('./assets/exercise-guides/rivalset/lying-leg-curl/frame-3.png'),
  ],
  'Curl femoral sentado': [
    require('./assets/exercise-guides/rivalset/seated-leg-curl/frame-1.png'),
    require('./assets/exercise-guides/rivalset/seated-leg-curl/frame-2.png'),
    require('./assets/exercise-guides/rivalset/seated-leg-curl/frame-3.png'),
  ],
  'Hip thrust': [
    require('./assets/exercise-guides/rivalset/hip-thrust/frame-1.png'),
    require('./assets/exercise-guides/rivalset/hip-thrust/frame-2.png'),
    require('./assets/exercise-guides/rivalset/hip-thrust/frame-3.png'),
  ],
  'Patada de glúteo': [
    require('./assets/exercise-guides/rivalset/cable-kickback/frame-1.png'),
    require('./assets/exercise-guides/rivalset/cable-kickback/frame-2.png'),
    require('./assets/exercise-guides/rivalset/cable-kickback/frame-3.png'),
  ],
  'Abductores': [
    require('./assets/exercise-guides/rivalset/hip-abduction-machine/frame-1.png'),
    require('./assets/exercise-guides/rivalset/hip-abduction-machine/frame-2.png'),
    require('./assets/exercise-guides/rivalset/hip-abduction-machine/frame-3.png'),
  ],
  'Elevación de gemelos': [
    require('./assets/exercise-guides/rivalset/standing-calf-raise/frame-1.png'),
    require('./assets/exercise-guides/rivalset/standing-calf-raise/frame-2.png'),
    require('./assets/exercise-guides/rivalset/standing-calf-raise/frame-3.png'),
  ],
  'Gemelo sentado': [
    require('./assets/exercise-guides/rivalset/seated-calf-raise/frame-1.png'),
    require('./assets/exercise-guides/rivalset/seated-calf-raise/frame-2.png'),
    require('./assets/exercise-guides/rivalset/seated-calf-raise/frame-3.png'),
  ],
  'Encogimientos': [
    require('./assets/exercise-guides/rivalset/shrug/frame-1.png'),
    require('./assets/exercise-guides/rivalset/shrug/frame-2.png'),
    require('./assets/exercise-guides/rivalset/shrug/frame-3.png'),
  ],
  'Crunch': [
    require('./assets/exercise-guides/rivalset/crunch/frame-1.png'),
    require('./assets/exercise-guides/rivalset/crunch/frame-2.png'),
    require('./assets/exercise-guides/rivalset/crunch/frame-3.png'),
  ],
  'Elevación de piernas': [
    require('./assets/exercise-guides/rivalset/hanging-leg-raise/frame-1.png'),
    require('./assets/exercise-guides/rivalset/hanging-leg-raise/frame-2.png'),
    require('./assets/exercise-guides/rivalset/hanging-leg-raise/frame-3.png'),
  ],
  'Peso muerto convencional': [
    require('./assets/exercise-guides/rivalset/deadlift/frame-1.png'),
    require('./assets/exercise-guides/rivalset/deadlift/frame-2.png'),
    require('./assets/exercise-guides/rivalset/deadlift/frame-3.png'),
  ],
  'Hiperextensiones': [
    require('./assets/exercise-guides/rivalset/back-extension/frame-1.png'),
    require('./assets/exercise-guides/rivalset/back-extension/frame-2.png'),
    require('./assets/exercise-guides/rivalset/back-extension/frame-3.png'),
  ],
};

const ExerciseAnimation = ({ exerciseName }) => {
  const frames = EXERCISE_ANIMATION_FRAMES[exerciseName];

  // Press banca mantiene exactamente la animación
  // original que ya sabemos que funciona.
  if (exerciseName === 'Press banca') {
    return <BenchPressAnimation />;
  }

  if (!frames || frames.length !== 3) {
    return null;
  }

  return (
    <ExerciseFramesAnimation
      key={exerciseName}
      frames={frames}
    />
  );
};

const ExerciseFramesAnimation = ({ frames }) => {
  // Exactamente el mismo sistema que BenchPressAnimation:
  // 1 → 2 → 3 → 2 → 1...
  const sequence = [0, 1, 2, 1];
  const [sequencePosition, setSequencePosition] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setSequencePosition((position) =>
        (position + 1) % sequence.length
      );
    }, 300);

    return () => clearInterval(timer);
  }, []);

  const activeFrame = sequence[sequencePosition];

  return (
    <View
      style={{
        width: '100%',
        height: 235,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      <View
        style={{
          width: '100%',
          height: 205,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {frames.map((source, index) => (
          <Image
            key={index}
            source={source}
            resizeMode="contain"
            fadeDuration={0}
            style={{
              position: 'absolute',
              width: '100%',
              height: '100%',
              opacity: activeFrame === index ? 1 : 0,
            }}
          />
        ))}
      </View>
    </View>
  );
};

const BenchPressAnimation = () => {
  const frames = [
    require('./assets/exercise-guides/bench-press/uniform-1.png'),
    require('./assets/exercise-guides/bench-press/uniform-2.png'),
    require('./assets/exercise-guides/bench-press/uniform-3.png'),
  ];

  // 1 → 2 → 3 → 2 → 1 → 2 → 3 → 2...
  const sequence = [0, 1, 2, 1];
  const [sequencePosition, setSequencePosition] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setSequencePosition((position) =>
        (position + 1) % sequence.length
      );
    }, 300);

    return () => clearInterval(timer);
  }, []);

  const activeFrame = sequence[sequencePosition];

  return (
    <View
      style={{
        width: '100%',
        height: 235,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      <View
        style={{
          width: '100%',
          height: 205,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {frames.map((source, index) => (
          <Image
            key={index}
            source={source}
            resizeMode="contain"
            fadeDuration={0}
            style={{
              position: 'absolute',
              width: '100%',
              height: '100%',
              opacity: activeFrame === index ? 1 : 0,
            }}
          />
        ))}
      </View>

      <Text
        style={{
          position: 'absolute',
          bottom: 1,
          fontSize: 10,
          fontWeight: '600',
          color: '#FFFFFF',
          textAlign: 'center',
        }}
      >
        Baja al pecho · Empuja hasta extender
      </Text>
    
      

</View>
  );
};

const createRivalSetStyles = () => StyleSheet.create({
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
    backgroundColor: 'rgba(72,62,42,0.42)',
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
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
    backgroundColor: 'rgba(72,62,42,0.42)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
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
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: 'rgba(24,24,24,0.48)',
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
    display: 'none',
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
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(72,62,42,0.42)',
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
    color: '#FFFFFF',
    fontSize: 12,
    marginTop: 3,
  },

  arrow: {
    color: COLORS.orange,
    fontSize: 27,
  },

  navigation: {
    overflow: 'hidden',
    marginBottom: 10,
    marginHorizontal: 14,
    borderRadius: 32,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    height: 80,
    flexDirection: 'row',
    backgroundColor: 'rgba(72,62,42,0.32)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.18)',
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
    color: '#A8ABB2',
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

  globalBackText: {
    color: '#FFFFFF',
    fontWeight: '800',
  },

  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',

    backgroundColor: 'rgba(10,10,12,0.42)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
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

  leagueHeroPro: {
    minHeight: 66,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    paddingHorizontal: 3,
  },

  leagueHeroEyebrow: {
    color: COLORS.orange,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.8,
  },

  leagueHeroTitle: {
    color: '#FFFFFF',
    fontSize: 23,
    fontWeight: '900',
    letterSpacing: -0.7,
    marginTop: 4,
  },

  leagueHeroIcon: {
    width: 43,
    height: 43,
    borderRadius: 14,
    backgroundColor: 'rgba(255,176,0,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,176,0,0.20)',
    alignItems: 'center',
    justifyContent: 'center',
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
    minHeight: 78,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(10,12,16,0.68)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 13,
    marginBottom: 8,
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
    fontSize: 23,
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
  color: COLORS.orange,
  letterSpacing: 0.8,
  opacity: 0.9,
},

  leagueMetaText: {
    color: '#FFFFFF',
    fontSize: 10.5,
    fontWeight: '700',
    marginTop: 4,
    opacity: 0.92,
  },

  leagueMainObjectiveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 7,
  },

  leagueMainObjective: {
    color: '#D0D3D8',
    fontSize: 10,
    fontWeight: '800',
    marginLeft: 4,
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
    backgroundColor: 'rgba(72,62,42,0.42)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
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
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    backgroundColor: 'rgba(10,12,16,0.62)',
    padding: 14,
    marginBottom: 10,
  },

  leagueTrainingHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },

  leagueTrainingExplanation: {
    color: '#FFFFFF',
    fontSize: 10.5,
    lineHeight: 15,
    fontWeight: '700',
    marginTop: 5,
    paddingRight: 14,
    maxWidth: 270,
    opacity: 0.92,
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
    height: 6,
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
    minHeight: 52,
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
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    backgroundColor: 'rgba(10,12,16,0.62)',
    padding: 14,
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
    columnGap: 9,
  },

  leagueSectionTitle: {
    color: COLORS.orange,
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 1.25,
  },

  leagueSectionSubtitle: {
    color: '#FFFFFF',
    fontSize: 10.5,
    fontWeight: '700',
    marginTop: 3,
    opacity: 0.9,
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
    minHeight: 58,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    backgroundColor: 'rgba(255,255,255,0.025)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    marginBottom: 6,
    overflow: 'hidden',
  },

  leaguePlayerRowFirst: {
    backgroundColor: 'rgba(255,176,0,0.085)',
    borderColor: 'rgba(255,176,0,0.30)',
  },

  leaguePlayerRowSecond: {
    backgroundColor: 'rgba(255,255,255,0.035)',
    borderColor: 'rgba(255,255,255,0.09)',
  },

  leaguePlayerRowThird: {
    backgroundColor: 'rgba(255,255,255,0.025)',
    borderColor: 'rgba(255,255,255,0.075)',
  },

  leaguePlayerRowMe: {
    backgroundColor: 'rgba(255,176,0,0.075)',
    borderColor: 'rgba(255,176,0,0.42)',
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
    paddingRight: 6,
  },

  leaguePlayerNameLine: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
  },

  leaguePlayerAwardColumn: {
    width: 104,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 5,
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
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginTop: 4,
    gap: 4,
  },

  leaguePlayerMeBadge: {
    color: COLORS.orange,
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 0.4,
    backgroundColor: 'rgba(255,176,0,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,176,0,0.25)',
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 2,
    marginLeft: 6,
  },

leaguePlayerAward: {
    width: 98,
    color: COLORS.orange,
    fontSize: 8.5,
    fontWeight: '900',
    letterSpacing: 0.3,
    textAlign: 'center',
    backgroundColor: 'rgba(255,176,0,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,176,0,0.30)',
    borderRadius: 8,
    paddingVertical: 5,
    paddingHorizontal: 4,
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
    minHeight: 44,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(10,12,16,0.48)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 13,
    marginBottom: 10,
  },

  leagueActionTextBox: {
    flex: 1,
    marginLeft: 10,
  },

  leagueInviteText: {
    color: '#E7E8EB',
    fontSize: 11,
    fontWeight: '800',
  },

  leagueInviteSubtext: {
    color: '#FFFFFF',
    fontSize: 10.5,
    fontWeight: '700',
    marginTop: 2,
    opacity: 0.9,
  },

  leagueActivityCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(10,12,16,0.62)',
    padding: 14,
  },

  leagueActivityRow: {
    minHeight: 62,
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

  leagueActivityIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: 'rgba(255,176,0,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,176,0,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },

  leagueActivitySide: {
    alignItems: 'flex-end',
    marginLeft: 8,
  },

  leagueActivityPoints: {
    color: COLORS.orange,
    fontSize: 10.5,
    fontWeight: '900',
    marginBottom: 3,
  },

  leagueActivityInfo: {
    flex: 1,
  },

  leagueActivityText: {
    color: '#FFFFFF',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
    paddingRight: 4,
    opacity: 0.9,
  },

  leagueActivityName: {
    color: COLORS.orange,
    fontSize: 13,
    fontWeight: '900',
  },

  leagueActivityTime: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
    marginLeft: 8,
    opacity: 0.72,
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
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '900',
    marginTop: 16,
    marginBottom: 6,
  },

  nameEditBox: {
    minWidth: 170,
    maxWidth: 250,
    height: 43,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.42)',
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

  /* =====================================================
     PERFIL · CRISTAL
  ===================================================== */

  profileGlassSectionLabel: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.15,
    marginTop: 4,
    marginBottom: 9,
    marginLeft: 2,
  },

  profileActivityGlass: {
    backgroundColor: 'rgba(14,15,19,0.34)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    borderRadius: 22,
    padding: 16,
    marginBottom: 22,

    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 16,
    elevation: 4,
  },

  profileActivityTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
  },

  profileActivityHeadline: {
    color: '#F5F5F7',
    fontSize: 17,
    fontWeight: '900',
  },

  profileActivitySubheadline: {
    color: 'rgba(255,255,255,0.43)',
    fontSize: 9,
    fontWeight: '600',
    marginTop: 3,
  },

  profileActivityActivePill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: 'rgba(255,179,0,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,179,0,0.22)',
  },

  profileActivityActiveText: {
    color: COLORS.orange,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.6,
    marginLeft: 3,
  },

  profileActivityContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  profileActivityCircle: {
    width: 104,
    height: 104,
    borderRadius: 52,
    alignItems: 'center',
    justifyContent: 'center',

    backgroundColor: 'rgba(255,179,0,0.055)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,194,51,0.48)',
  },

  profileActivityCircleInner: {
    width: 86,
    height: 86,
    borderRadius: 43,
    alignItems: 'center',
    justifyContent: 'center',

    backgroundColor: 'rgba(8,9,12,0.20)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },

  profileActivityBigNumber: {
    color: COLORS.yellow,
    fontSize: 31,
    lineHeight: 33,
    fontWeight: '900',
  },

  profileActivityBigLabel: {
    color: 'rgba(255,194,51,0.62)',
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.9,
    marginTop: 2,
  },

  profileActivityRight: {
    flex: 1,
    marginLeft: 20,
  },

  profileActivityMiniStat: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
  },

  profileActivityMiniIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 11,

    backgroundColor: 'rgba(255,255,255,0.045)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
  },

  profileActivityMiniNumber: {
    color: '#F5F5F7',
    fontSize: 19,
    fontWeight: '900',
    lineHeight: 20,
  },

  profileActivityMiniLabel: {
    color: 'rgba(255,255,255,0.44)',
    fontSize: 9,
    fontWeight: '600',
    marginTop: 2,
  },

  profileActivityDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.07)',
    marginVertical: 4,
  },

  profileActivityBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 17,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.07)',
  },

  profileActivityBottomText: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 11,
    fontWeight: '700',
    marginLeft: 7,
  },

  profileSettingsGlass: {
    overflow: 'hidden',
    borderRadius: 19,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(14,15,19,0.34)',
    marginBottom: 20,

    shadowColor: '#000',
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 3,
  },

  profileSettingGlassIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 11,

    backgroundColor: 'rgba(255,179,0,0.065)',
    borderWidth: 1,
    borderColor: 'rgba(255,179,0,0.14)',
  },

  profileSettingValue: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  profileSettingValueText: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 11,
    fontWeight: '700',
    marginRight: 3,
  },

  profileAmberDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: COLORS.orange,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.30)',
    marginRight: 7,
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
    fontSize: 11,
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

  exercisePickerCard: {
    marginTop: 12,
    marginBottom: 18,
    padding: 16,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(72,62,42,0.42)',
  },

  exercisePickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },

  exercisePickerTitle: {
    color: COLORS.text,
    fontSize: 17,
    fontWeight: '800',
  },

  exercisePickerSubtitle: {
    color: COLORS.muted,
    fontSize: 11,
    marginTop: 4,
  },

  exercisePickerGrid: {
    gap: 8,
  },

  exercisePickerList: {
    gap: 8,
  },

  exercisePickerOption: {
    minHeight: 50,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.045)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  exercisePickerOptionText: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '700',
  },

  exercisePickerVariantHint: {
    color: COLORS.muted,
    fontSize: 10,
    marginTop: 3,
  },

  exerciseGuidePressable: {
    overflow: 'hidden',
    position: 'relative',
  },

  exerciseGuideProgressFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(255,176,0,0.70)',
    borderRadius: 14,
  },

  exerciseGuideForeground: {
    zIndex: 2,
  },

  exerciseGuideOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#08090C',
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 999999,
    elevation: 999999,
  },

  exerciseGuideSafe: {
    flex: 1,
  },

  exerciseGuideHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },

  exerciseGuideEyebrow: {
    color: COLORS.orange,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.4,
    marginBottom: 5,
  },

  exerciseGuideTitle: {
    color: COLORS.text,
    fontSize: 28,
    fontWeight: '900',
  },

  exerciseGuideSubtitle: {
    color: COLORS.muted,
    fontSize: 11,
    fontWeight: '800',
    marginTop: 4,
    letterSpacing: 0.8,
  },

  exerciseGuideClose: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },

  exerciseGuideScroll: {
    padding: 20,
    paddingBottom: 50,
  },

  exerciseGuideDemo: {
    minHeight: 190,
    borderRadius: 22,
    backgroundColor: 'rgba(72,62,42,0.42)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    marginBottom: 26,
  },

  exerciseGuideDemoTitle: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '900',
    marginTop: 14,
  },

  exerciseGuideDemoText: {
    color: COLORS.muted,
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
    marginTop: 7,
  },

  exerciseGuideSectionTitle: {
    color: COLORS.orange,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.2,
    marginTop: 8,
    marginBottom: 13,
  },

  exerciseGuideChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 22,
  },

  exerciseGuideChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255,176,0,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,176,0,0.28)',
  },

  exerciseGuideChipText: {
    color: COLORS.orange,
    fontSize: 11,
    fontWeight: '800',
  },

  exerciseGuideStep: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 14,
  },

  exerciseGuideStepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.orange,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },

  exerciseGuideStepNumberText: {
    color: '#111111',
    fontSize: 12,
    fontWeight: '900',
  },

  exerciseGuideStepText: {
    flex: 1,
    color: COLORS.text,
    fontSize: 13,
    lineHeight: 20,
  },

  exerciseGuideBullet: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 12,
  },

  exerciseGuideBulletText: {
    flex: 1,
    color: COLORS.text,
    fontSize: 13,
    lineHeight: 19,
  },

  exerciseGuideSafety: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 16,
    borderRadius: 18,
    backgroundColor: 'rgba(255,176,0,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,176,0,0.24)',
    marginTop: 18,
  },

  exerciseGuideSafetyText: {
    flex: 1,
    color: COLORS.text,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
  },

  routineCard: {
    backgroundColor: 'rgba(72,62,42,0.42)',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
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
    backgroundColor: 'rgba(18, 18, 22, 0.54)',
    borderWidth: 1,
    borderColor: 'rgba(255, 194, 51, 0.24)',
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
    backgroundColor: 'rgba(16, 17, 21, 0.58)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.13)',
    padding: 14,
    marginBottom: 12,
  },

  exerciseCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  exerciseNumber: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(255,179,0,0.13)',
    borderWidth: 1,
    borderColor: 'rgba(255,179,0,0.28)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 11,
  },

  exerciseNumberText: {
    color: COLORS.yellow,
    fontSize: 12,
    fontWeight: '900',
  },

  exerciseCardIdentity: {
    flex: 1,
    minWidth: 0,
  },

  exerciseCardName: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0.1,
  },

  exerciseCardMeta: {
    color: '#8C9099',
    fontSize: 10,
    fontWeight: '600',
    marginTop: 4,
  },

  exerciseFields: {
    flex: 1,
  },

  exerciseNameInput: {
    height: 42,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.035)',
    borderRadius: 11,
    color: COLORS.text,
    paddingHorizontal: 11,
    fontWeight: '700',
  },

  exerciseMetricLabels: {
    flexDirection: 'row',
    marginTop: 15,
    marginBottom: 5,
  },

  exerciseMetricLabel: {
    flex: 1,
    color: '#747A85',
    fontSize: 8,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: 0.7,
    marginRight: 6,
  },

  exerciseMetricsRow: {
    flexDirection: 'row',
  },

  metricInput: {
    flex: 1,
    height: 44,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
    color: COLORS.text,
    textAlign: 'center',
    marginRight: 6,
    fontSize: 14,
    fontWeight: '800',
  },

  lastMetricInput: {
    marginRight: 0,
  },

  weightInput: {
    borderColor: 'rgba(255,179,0,0.28)',
    backgroundColor: 'rgba(255,179,0,0.06)',
    color: COLORS.yellow,
  },

  /* CARDIO · RIVALSET */
  cardioPanel: {
    marginTop: 16,
  },

  cardioMainMetrics: {
    flexDirection: 'row',
    gap: 9,
  },

  cardioMetricCard: {
    flex: 1,
    minHeight: 94,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,179,0,0.18)',
    backgroundColor: 'rgba(255,255,255,0.035)',
    paddingHorizontal: 13,
    paddingVertical: 12,
  },

  cardioMetricHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },

  cardioMetricLabel: {
    color: '#8C9099',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.7,
  },

  cardioValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },

  cardioMetricInput: {
    flex: 1,
    padding: 0,
    color: COLORS.text,
    fontSize: 25,
    fontWeight: '900',
    minHeight: 36,
  },

  cardioMetricUnit: {
    color: '#777D87',
    fontSize: 11,
    fontWeight: '800',
    marginLeft: 5,
  },

  cardioPaceCard: {
    minHeight: 68,
    marginTop: 9,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    backgroundColor: 'rgba(8,9,12,0.28)',
    paddingHorizontal: 14,
    paddingVertical: 11,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  cardioPaceLabel: {
    color: '#A7ABB3',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.7,
  },

  cardioPaceHint: {
    color: '#5F646D',
    fontSize: 8,
    fontWeight: '600',
    marginTop: 3,
  },

  cardioPaceValueWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },

  cardioPaceValue: {
    color: COLORS.orange,
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: -0.4,
  },

  cardioPaceUnit: {
    color: '#777D87',
    fontSize: 9,
    fontWeight: '700',
  },

  cardioHeartCard: {
    minHeight: 68,
    marginTop: 9,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,179,0,0.14)',
    backgroundColor: 'rgba(255,179,0,0.035)',
    paddingHorizontal: 13,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  cardioHeartInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },

  cardioHeartIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: 'rgba(255,179,0,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 9,
  },

  cardioHeartLabel: {
    color: '#A7ABB3',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.5,
  },

  cardioHeartHint: {
    color: '#5F646D',
    fontSize: 8,
    fontWeight: '600',
    marginTop: 3,
  },

  cardioHeartInputWrap: {
    flexDirection: 'row',
    alignItems: 'baseline',
    minWidth: 78,
    justifyContent: 'flex-end',
  },

  cardioHeartInput: {
    minWidth: 45,
    padding: 0,
    color: COLORS.text,
    fontSize: 20,
    fontWeight: '900',
    textAlign: 'right',
  },

  cardioHeartUnit: {
    color: '#777D87',
    fontSize: 9,
    fontWeight: '800',
    marginLeft: 4,
  },



  cardioWorkoutMetricsGlass: {
    marginTop: 8,
    marginHorizontal: 0,
    paddingTop: 10,
    paddingHorizontal: 10,
    paddingBottom: 10,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(10,11,15,0.48)',
    overflow: 'hidden',
  },

  cardioWorkoutMetricsLabels: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    marginBottom: 6,
  },

  cardioWorkoutMetricLabel: {
    flex: 1,
    color: 'rgba(255,255,255,0.38)',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.1,
    textAlign: 'center',
  },

  cardioWorkoutMetricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },

  cardioWorkoutMetricBox: {
    flex: 1,
    minHeight: 43,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.045)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },

  cardioWorkoutMetricInput: {
    width: '100%',
    paddingVertical: 7,
    paddingHorizontal: 3,
    color: '#F5F5F6',
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
  },

  cardioLiveTimer: {
    marginTop: 16,
    paddingTop: 17,
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: 'rgba(255,157,0,0.18)',
    backgroundColor: 'rgba(8,9,12,0.52)',
    overflow: 'hidden',
  },

  cardioLiveTimerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  cardioLiveTimerLabel: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.4,
  },

  cardioLiveStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },

  cardioLiveDot: {
    width: 6,
    height: 6,
    borderRadius: 99,
    backgroundColor: COLORS.orange,
  },

  cardioLiveStatusText: {
    color: COLORS.orange,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.9,
  },

  cardioLiveTime: {
    marginTop: 6,
    color: '#F5F5F6',
    fontSize: 42,
    lineHeight: 48,
    fontWeight: '800',
    letterSpacing: 1.5,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },

  cardioLiveObjective: {
    marginTop: 1,
    color: 'rgba(255,255,255,0.42)',
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },

  cardioLiveButtons: {
    marginTop: 15,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 9,
  },

  cardioLivePrimary: {
    minHeight: 42,
    paddingHorizontal: 19,
    borderRadius: 13,
    backgroundColor: COLORS.orange,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },

  cardioLivePrimaryText: {
    color: '#1A1200',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.7,
  },

  cardioLivePause: {
    minHeight: 42,
    paddingHorizontal: 19,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: 'rgba(255,157,0,0.30)',
    backgroundColor: 'rgba(255,157,0,0.08)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },

  cardioLivePauseText: {
    color: COLORS.orange,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.7,
  },

  cardioLiveFinish: {
    minHeight: 42,
    paddingHorizontal: 15,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.055)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },

  cardioLiveFinishText: {
    color: '#F4F4F5',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
  },

  cardioLiveTrackArea: {
    marginTop: 27,
  },

  cardioLiveTrack: {
    height: 42,
    marginHorizontal: 9,
    justifyContent: 'center',
  },

  cardioLiveTrackBase: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 3,
    borderRadius: 99,
    backgroundColor: 'rgba(255,255,255,0.11)',
  },

  cardioLiveTrackProgress: {
    position: 'absolute',
    left: 0,
    height: 3,
    borderRadius: 99,
    backgroundColor: COLORS.orange,
  },

  cardioLivePerson: {
    position: 'absolute',
    bottom: 16,
    marginLeft: -14,
  },

  cardioLivePersonGlow: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,157,0,0.08)',
  },

  cardioLiveGoal: {
    position: 'absolute',
    right: -7,
    bottom: 16,
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },

  cardioLiveTrackFooter: {
    marginTop: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  cardioLiveTrackText: {
    color: 'rgba(255,255,255,0.38)',
    fontSize: 10,
    fontWeight: '600',
  },

  manualMuscleSection: {
    marginTop: 13,
    paddingTop: 11,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.07)',
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
    marginBottom: 7,
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
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.035)',
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
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 7,
    backgroundColor: 'rgba(215,119,112,0.06)',
  },

  removeText: {
    color: '#E47A71',
    fontSize: 23,
  },

  addExerciseButton: {
    height: 50,
    backgroundColor: 'rgba(20, 17, 10, 0.32)',
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(255, 194, 51, 0.40)',
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

  /* HOME · NIVEL / PROGRESIÓN */

  homeScrollContent: {
    paddingBottom: 28,
  },

  gameLevelCard: {
    backgroundColor: 'rgba(30,25,16,0.58)',
    borderWidth: 1,
    borderColor: 'rgba(255,179,0,0.42)',
    borderRadius: 22,
    padding: 14,
    marginBottom: 17,
    overflow: 'hidden',

    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.16,
    shadowRadius: 18,
    elevation: 5,
  },

  gameLevelMain: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 108,
  },

  gameMedalZone: {
    width: 116,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    paddingLeft: 4,
  },

  gameMedalRing: {
    width: 102,
    height: 102,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    borderWidth: 0,
    overflow: 'visible',
  },

  gameMedalScale: {
    transform: [{ scale: 1.281 }],
    alignItems: 'center',
    justifyContent: 'center',
  },

  gameRankPill: {
    marginTop: -8,
    marginLeft: -6,
    paddingHorizontal: 12,
    height: 21,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111216',
    borderWidth: 1,
    borderColor: 'rgba(255,179,0,0.55)',
  },

  gameRankPillText: {
    color: COLORS.orange,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1.1,
  },

  gameLevelData: {
    flex: 1,
  },

  gameLevelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },

  gameLevelOverline: {
    color: COLORS.orange,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.3,
    marginBottom: 1,
  },

  gameLevelNumberRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: -2,
  },

  gameLevelNumber: {
    color: COLORS.orange,
    fontSize: 38,
    lineHeight: 43,
    fontWeight: '900',
    letterSpacing: -1.5,
  },

  gameLevelMax: {
    color: '#969AA2',
    fontSize: 11,
    fontWeight: '900',
    marginLeft: 3,
  },

  gameTrophyButton: {
    width: 31,
    height: 31,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,179,0,0.055)',
    borderWidth: 1,
    borderColor: 'rgba(255,179,0,0.14)',
  },

  gameXPTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 5,
    marginBottom: 5,
  },

  gameXPText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
  },

  gameXPPercent: {
    color: COLORS.orange,
    fontSize: 8,
    fontWeight: '900',
  },

  gameXPTrack: {
    height: 9,
    borderRadius: 5,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.16)',
  },

  gameXPFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: COLORS.orange,
  },

  gameXPRemaining: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.7,
    marginTop: 6,
  },

  gameMission: {
    minHeight: 52,
    marginTop: 12,
    paddingTop: 11,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,179,0,0.22)',
    flexDirection: 'row',
    alignItems: 'center',
  },

  gameMissionIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,179,0,0.055)',
    borderWidth: 1,
    borderColor: 'rgba(255,179,0,0.10)',
    marginRight: 9,
  },

  gameMissionContent: {
    flex: 1,
  },

  gameMissionLabel: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.1,
  },

  gameMissionTitle: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 14,
    fontWeight: '800',
    marginTop: 2,
  },

  gameMissionProgress: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
  },

  gameMissionValue: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
    marginRight: 2,
  },

  homeLevelCard: {
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: 'rgba(16, 17, 21, 0.50)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    borderRadius: 26,
    padding: 18,
    marginBottom: 21,
  },

  homeLevelAmbientGlow: {
    position: 'absolute',
    width: 190,
    height: 190,
    borderRadius: 95,
    backgroundColor: 'rgba(255,179,0,0.075)',
    top: -105,
    right: -55,
  },

  homeLevelAmbientGlowTwo: {
    position: 'absolute',
    width: 130,
    height: 130,
    borderRadius: 65,
    backgroundColor: 'rgba(255,194,51,0.035)',
    bottom: -80,
    left: -55,
  },

  homeLevelTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 15,
  },

  homeLevelEyebrow: {
    color: '#717680',
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1.5,
  },

  homeLevelRankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },

  homeLevelRank: {
    color: COLORS.orange,
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 1,
  },

  homeLevelLiveDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.orange,
    marginHorizontal: 7,
  },

  homeLevelRankHint: {
    color: '#5E636C',
    fontSize: 7,
    fontWeight: '800',
  },

  homeLevelDetailsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,179,0,0.20)',
    backgroundColor: 'rgba(255,179,0,0.055)',
    borderRadius: 14,
    paddingLeft: 10,
    paddingRight: 6,
    paddingVertical: 6,
  },

  homeLevelDetailsText: {
    color: '#B08C35',
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 0.8,
  },

  homeLevelHero: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 17,
  },

  homeLevelMedalWrap: {
    width: 92,
    height: 92,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 15,
  },

  homeLevelMedalHaloOuter: {
    position: 'absolute',
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 1,
    borderColor: 'rgba(255,179,0,0.10)',
  },

  homeLevelMedalHaloInner: {
    position: 'absolute',
    width: 67,
    height: 67,
    borderRadius: 34,
    backgroundColor: 'rgba(255,179,0,0.07)',
  },

  homeLevelHeroInfo: {
    flex: 1,
  },

  homeLevelNumberLabel: {
    color: '#696E77',
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 1.4,
  },

  homeLevelNumberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 1,
  },

  homeLevelNumber: {
    color: '#FFFFFF',
    fontSize: 45,
    lineHeight: 50,
    fontWeight: '900',
    letterSpacing: -1.8,
  },

  homeNextLevelBox: {
    marginLeft: 12,
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(255,255,255,0.10)',
    paddingLeft: 11,
  },

  homeNextLevelLabel: {
    color: '#5E636C',
    fontSize: 6,
    fontWeight: '900',
    letterSpacing: 0.8,
  },

  homeNextLevelNumber: {
    color: '#A7ABB3',
    fontSize: 17,
    fontWeight: '900',
  },

  homeLevelHeroHint: {
    color: '#777C85',
    fontSize: 9,
    marginTop: 2,
  },

  homeXPTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 7,
  },

  homeXPTitle: {
    color: '#6C717A',
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 1.2,
  },

  homeXPText: {
    color: '#C9CCD2',
    fontSize: 8,
    fontWeight: '900',
  },

  homeXPTrack: {
    height: 9,
    borderRadius: 5,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.065)',
  },

  homeXPFill: {
    height: '100%',
    borderRadius: 5,
    overflow: 'hidden',
    backgroundColor: COLORS.orange,
  },

  homeXPFillShine: {
    height: 2,
    marginTop: 1,
    marginHorizontal: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.30)',
  },

  homeXPSegments: {
    flexDirection: 'row',
    marginTop: 5,
    marginBottom: 18,
  },

  homeXPSegment: {
    flex: 1,
    height: 2,
    borderRadius: 1,
    marginRight: 3,
    backgroundColor: 'rgba(255,255,255,0.045)',
  },

  homeXPSegmentActive: {
    backgroundColor: 'rgba(255,179,0,0.48)',
  },

  homeRankSection: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.07)',
    paddingTop: 15,
    marginBottom: 17,
  },

  homeRankHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 11,
  },

  homeRankTitle: {
    color: '#6C717A',
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 1.1,
  },

  homeRankDestination: {
    color: COLORS.orange,
    fontSize: 7,
    fontWeight: '900',
  },

  homeRankTrack: {
    position: 'relative',
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.07)',
  },

  homeRankFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: 'rgba(255,179,0,0.72)',
  },

  homeRankMarker: {
    position: 'absolute',
    top: -5,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: COLORS.orange,
    backgroundColor: '#17140D',
    alignItems: 'center',
    justifyContent: 'center',
  },

  homeRankMarkerCore: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: COLORS.orange,
  },

  homeRankLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },

  homeRankLabel: {
    color: '#4F545D',
    fontSize: 6,
    fontWeight: '900',
  },

  homeRankLabelActive: {
    color: COLORS.orange,
  },

  homeProgressMetrics: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    paddingVertical: 13,
  },

  homeMetric: {
    flex: 1,
    paddingHorizontal: 8,
  },

  homeMetricTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  homeMetricValue: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
  },

  homeMetricLabel: {
    color: '#646973',
    fontSize: 6,
    fontWeight: '900',
    letterSpacing: 0.7,
    marginTop: 5,
  },

  homeMetricTrack: {
    height: 3,
    borderRadius: 2,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginTop: 7,
  },

  homeMetricFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: COLORS.orange,
  },

  homeMetricDivider: {
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.07)',
  },

  homeNextChallenge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    paddingTop: 1,
  },

  homeNextChallengeIcon: {
    width: 32,
    height: 32,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,179,0,0.075)',
    borderWidth: 1,
    borderColor: 'rgba(255,179,0,0.14)',
    marginRight: 10,
  },

  homeNextChallengeLabel: {
    color: '#60656E',
    fontSize: 6,
    fontWeight: '900',
    letterSpacing: 1,
  },

  homeNextChallengeTitle: {
    color: '#D9DBDF',
    fontSize: 10,
    fontWeight: '800',
    marginTop: 2,
  },

  homeNextChallengeProgress: {
    color: COLORS.orange,
    fontSize: 10,
    fontWeight: '900',
  },

  achievementCompactHeader: {
    minHeight: 75,
    backgroundColor: 'rgba(16,17,21,0.50)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 13,
    marginBottom: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  achievementCompactEyebrow: {
    color: COLORS.orange,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1,
  },

  achievementCompactTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '900',
    marginTop: 3,
  },

  achievementCompactXP: {
    alignItems: 'flex-end',
  },

  achievementCompactXPNumber: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
  },

  achievementCompactXPLabel: {
    color: '#646973',
    fontSize: 6,
    fontWeight: '900',
    letterSpacing: 0.8,
    marginTop: 2,
  },

  /* LOGROS */

  levelPlayerCard: {
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: 'rgba(12, 13, 17, 0.88)',
    borderWidth: 1,
    borderColor: 'rgba(255, 179, 0, 0.30)',
    borderRadius: 28,
    padding: 20,
    marginBottom: 20,
  },

  levelCardGlow: {
    position: 'absolute',
    width: 210,
    height: 210,
    borderRadius: 105,
    backgroundColor: 'rgba(255, 179, 0, 0.08)',
    top: -115,
    right: -60,
  },

  levelCardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 20,
  },

  levelCardEyebrow: {
    color: '#777C86',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.7,
  },

  levelCardRank: {
    color: COLORS.orange,
    fontSize: 17,
    fontWeight: '900',
    letterSpacing: 1.1,
    marginTop: 4,
  },

  levelRankPill: {
    borderWidth: 1,
    borderColor: 'rgba(255, 179, 0, 0.24)',
    backgroundColor: 'rgba(255, 179, 0, 0.07)',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },

  levelRankPillText: {
    color: '#A88B45',
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 0.8,
  },

  levelHero: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 112,
    marginBottom: 18,
  },

  levelMedalArea: {
    width: 116,
    height: 112,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 17,
  },

  levelMedalGlow: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255, 179, 0, 0.10)',
  },

  levelNumberArea: {
    flex: 1,
  },

  levelNumberLabel: {
    color: '#777C86',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 2,
  },

  levelNumber: {
    color: '#FFFFFF',
    fontSize: 52,
    lineHeight: 56,
    fontWeight: '900',
    letterSpacing: -2,
  },

  levelStatus: {
    color: '#8B9099',
    fontSize: 10,
    fontWeight: '700',
  },

  levelXPHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },

  levelXPLabel: {
    color: '#777C86',
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1.3,
  },

  levelXPValue: {
    color: '#D9DCE2',
    fontSize: 9,
    fontWeight: '900',
  },

  levelXPTrack: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.07)',
  },

  levelXPFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: COLORS.orange,
  },

  levelSegments: {
    flexDirection: 'row',
    marginTop: 5,
    marginBottom: 20,
  },

  levelSegment: {
    flex: 1,
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginRight: 3,
  },

  levelSegmentActive: {
    backgroundColor: 'rgba(255,179,0,0.55)',
  },

  levelStats: {
    minHeight: 67,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },

  levelStat: {
    flex: 1,
    alignItems: 'center',
  },

  levelStatNumber: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '900',
  },

  levelStatLabel: {
    color: '#696E78',
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 0.8,
    marginTop: 3,
  },

  levelStatDivider: {
    width: 1,
    height: 25,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },

  rankRoad: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 19,
  },

  rankRoadItem: {
    flex: 1,
    alignItems: 'center',
  },

  rankRoadDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#424650',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },

  rankRoadDotActive: {
    borderColor: COLORS.orange,
  },

  rankRoadDotCore: {
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: COLORS.orange,
  },

  rankRoadText: {
    color: '#515660',
    fontSize: 6,
    fontWeight: '900',
    letterSpacing: 0.4,
  },

  rankRoadTextActive: {
    color: COLORS.orange,
  },

  achievementSummary: {
    backgroundColor: 'rgba(16, 17, 21, 0.54)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.13)',
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
    backgroundColor: 'rgba(16, 17, 21, 0.54)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.13)',
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
    backgroundColor: 'rgba(72,62,42,0.42)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
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
    backgroundColor: 'rgba(72,62,42,0.42)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
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
    backgroundColor: 'rgba(72,62,42,0.42)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
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
    backgroundColor: 'rgba(72,62,42,0.42)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
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
    backgroundColor: 'rgba(72,62,42,0.42)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
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
    color: '#FFFFFF',
    fontSize: 21,
    fontWeight: '900',
    letterSpacing: -0.3,
  },

  historySectionSubtitle: {
    color: '#FFFFFF',
    fontSize: 11,
    marginTop: 4,
    marginBottom: 11,
  },

  historyWorkoutSectionTitle: {
    marginTop: 25,
    marginBottom: 11,
  },

  muscleStatsCard: {
    backgroundColor: 'rgba(72,62,42,0.42)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
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
    backgroundColor: 'rgba(72,62,42,0.42)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
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
    backgroundColor: 'rgba(72,62,42,0.42)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
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
    backgroundColor: 'rgba(72,62,42,0.42)',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
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
    backgroundColor: 'rgba(72,62,42,0.42)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    marginBottom: 11,
    overflow: 'hidden',
  },

  liveExerciseCardComplete: {
    borderColor: 'rgba(255,176,0,0.45)',
  },

  strengthLiveExerciseCard: {
    backgroundColor: 'rgba(12,13,17,0.56)',
    borderColor: 'rgba(255,255,255,0.10)',
    borderRadius: 20,
  },

  strengthLiveExerciseCardComplete: {
    backgroundColor: 'rgba(20,18,11,0.62)',
    borderColor: 'rgba(255,176,0,0.42)',
  },

  strengthLiveExerciseHeader: {
    minHeight: 62,
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

  strengthExerciseProgressBadge: {
    minWidth: 68,
    paddingHorizontal: 7,
    backgroundColor: 'rgba(255,255,255,0.055)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
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

  strengthLiveSetsContainer: {
    borderTopColor: 'rgba(255,255,255,0.06)',
    paddingTop: 9,
    paddingBottom: 9,
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

  strengthLiveSetRow: {
    minHeight: 48,
    backgroundColor: 'rgba(255,255,255,0.035)',
    borderColor: 'rgba(255,255,255,0.075)',
  },

  strengthLiveSetRowDone: {
    backgroundColor: 'rgba(255,176,0,0.055)',
    borderColor: 'rgba(255,176,0,0.18)',
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

  liveSetNumberStack: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },

  liveSetMiniPrBadge: {
    minWidth: 22,
    height: 12,
    borderRadius: 5,
    backgroundColor: COLORS.orange,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },

  liveSetMiniPrText: {
    color: COLORS.darkText,
    fontSize: 6.5,
    fontWeight: '900',
    letterSpacing: 0.2,
  },

  previousSetRow: {
    minHeight: 18,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingTop: 3,
  },

  previousSetText: {
    color: '#777D88',
    fontSize: 8.5,
    fontWeight: '700',
    marginLeft: 5,
  },

  previousSetPrText: {
    color: COLORS.orange,
    fontSize: 8.5,
    fontWeight: '800',
    marginLeft: 5,
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

  strengthLiveSetInput: {
    height: 35,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.055)',
    borderColor: 'rgba(255,255,255,0.09)',
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

  workoutSummaryDetailSection: {
    marginBottom: 14,
  },

  workoutSummarySectionLabel: {
    color: '#777D88',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.3,
    marginBottom: 9,
    marginLeft: 2,
  },

  workoutSummaryExerciseCard: {
    backgroundColor: 'rgba(12,13,17,0.58)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 18,
    paddingHorizontal: 15,
    paddingTop: 14,
    paddingBottom: 8,
    marginBottom: 9,
  },

  workoutSummaryExerciseCardPR: {
    borderColor: 'rgba(255,179,0,0.20)',
  },

  workoutSummaryExerciseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },

  workoutSummaryExerciseName: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
  },


  workoutSummaryExerciseMeta: {
    color: '#777D88',
    fontSize: 10,
    marginTop: 3,
  },

  workoutSummaryExercisePrBadge: {
    minWidth: 48,
    height: 25,
    borderRadius: 8,
    backgroundColor: 'rgba(255,179,0,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,179,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 7,
  },

  workoutSummaryExercisePrText: {
    color: COLORS.orange,
    fontSize: 9,
    fontWeight: '900',
  },

  workoutSummarySetRow: {
    minHeight: 39,
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.055)',
  },

  workoutSummarySetLabel: {
    width: 58,
    color: '#6F747E',
    fontSize: 9,
    fontWeight: '800',
  },

  workoutSummarySetValue: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },

  workoutSummarySetPrBadge: {
    height: 22,
    borderRadius: 7,
    backgroundColor: COLORS.orange,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 7,
  },

  workoutSummarySetPrText: {
    color: '#17120A',
    fontSize: 8,
    fontWeight: '900',
  },

  prSummaryCard: {
    backgroundColor: 'rgba(72,62,42,0.42)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
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

let styles = createRivalSetStyles();



// RIVALSET_SIDE_MENU_V1
function RivalSetSideMenu({
  onLeaguesPress,
photoUri,
  profileName,

  onPress,
  isLightTheme = false,
  accentColor = '#FF8A00',
}) {
  const [visible, setVisible] = useState(false);
  const progress = useRef(new Animated.Value(0)).current;
  const closing = useRef(false);

  const ink = isLightTheme ? '#17202B' : '#F5F6FA';
  const muted = isLightTheme ? '#626B79' : '#ABB2C0';
  const line = isLightTheme
    ? 'rgba(20,28,40,0.10)'
    : 'rgba(255,255,255,0.10)';

  const open = () => {
    closing.current = false;
    progress.setValue(0);
    setVisible(true);
  };

  const animateOpen = () => {
    Animated.timing(progress, {
      toValue: 1,
      duration: 260,
      useNativeDriver: true,
    }).start();
  };

  const close = (after) => {
    if (closing.current) return;
    closing.current = true;
    Animated.timing(progress, {
      toValue: 0,
      duration: 210,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished) return;
      setVisible(false);
      if (typeof after === 'function') after();
    });
  };

  return (
    <>
      <TouchableOpacity
        onPress={open}
        activeOpacity={0.75}
        accessibilityRole="button"
        accessibilityLabel="Abrir menú"
        accessibilityState={{ expanded: visible }}
        style={{
          width: 46, height: 46, borderRadius: 16,
          alignItems: 'center', justifyContent: 'center',
          borderWidth: 1, borderColor: line,
          backgroundColor: isLightTheme
            ? 'rgba(255,255,255,0.65)'
            : 'rgba(255,255,255,0.07)',
        }}
      >
        <MaterialCommunityIcons name="menu" size={28} color={ink} />
      </TouchableOpacity>

      <Modal
        visible={visible}
        transparent
        animationType="none"
        onShow={animateOpen}
        onRequestClose={() => close()}
      >
        <View style={{ flex: 1 }}>
          <Animated.View
            style={[
              StyleSheet.absoluteFillObject,
              {
                backgroundColor: 'rgba(3,4,7,0.60)',
                opacity: progress,
              },
            ]}
          >
            <TouchableOpacity
              style={{ flex: 1 }}
              activeOpacity={1}
              onPress={() => close()}
              accessibilityRole="button"
              accessibilityLabel="Cerrar menú"
            />
          </Animated.View>

          <Animated.View
            accessibilityViewIsModal
            style={{
              position: 'absolute',
              top: 0, bottom: 0, right: 0,
              width: '80%', maxWidth: 380,
              borderTopLeftRadius: 28,
              borderBottomLeftRadius: 28,
              borderWidth: 1,
              borderColor: isLightTheme
                ? 'rgba(255,255,255,0.8)'
                : 'rgba(255,255,255,0.18)',
              backgroundColor: isLightTheme
                ? 'rgba(245,247,251,0.98)'
                : 'rgba(10,12,17,0.96)',
              overflow: 'hidden',
              transform: [{
                translateX: progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [420, 0],
                }),
              }],
            }}
          >
            <BlurView
              intensity={60}
              tint={isLightTheme ? 'light' : 'dark'}
              pointerEvents="none"
              style={StyleSheet.absoluteFillObject}
            />
            <View
              pointerEvents="none"
              style={[
                StyleSheet.absoluteFillObject,
                {
                  backgroundColor: isLightTheme
                    ? 'rgba(247,249,252,0.96)'
                    : 'rgba(8,10,15,0.96)',
                },
              ]}
            />
            <LinearGradient
              pointerEvents="none"
              colors={[
                'rgba(255,255,255,0.10)',
                'rgba(255,255,255,0.025)',
                'rgba(255,255,255,0)',
              ]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFillObject}
            />

            <SafeAreaView style={{ flex: 1 }}>
              <View style={{
                padding: 22,
                paddingTop: 24,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderBottomWidth: 1,
                borderBottomColor: line,
              }}>
                <View
                  style={{
                    flex: 1,
                    flexDirection: 'row',
                    alignItems: 'center',
                  }}
                >
                  <RivalSetPhoto
                    uri={photoUri}
                    size={52}
                    color={accentColor}
                  />

                  <View
                    style={{
                      flex: 1,
                      marginLeft: 14,
                    }}
                  >
                    <Text
                      numberOfLines={1}
                      style={{
                        color: ink,
                        fontSize: 19,
                        fontWeight: '800',
                      }}
                    >
                      Hola{profileName?.trim()
                        ? `, ${profileName.trim()}`
                        : ''}
                    </Text>

                    <Text
                      style={{
                        color: muted,
                        fontSize: 11,
                        marginTop: 4,
                      }}
                    >
                      Bienvenido a RivalSet
                    </Text>
                  </View>
                </View>

                <TouchableOpacity
                  onPress={() => close()}
                  accessibilityRole="button"
                  accessibilityLabel="Cerrar menú"
                  style={{
                    width: 44, height: 44,
                    borderRadius: 22,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: isLightTheme
                      ? 'rgba(20,28,40,0.05)'
                      : 'rgba(255,255,255,0.08)',
                  }}
                >
                  <MaterialCommunityIcons
                    name="close" size={23} color={ink}
                  />
                </TouchableOpacity>
              </View>

              <ScrollView
                contentContainerStyle={{ padding: 20 }}
                showsVerticalScrollIndicator={false}
              >
                <TouchableOpacity
                  onPress={() => close(onPress)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingVertical: 18,
                    borderBottomWidth: 1,
                    borderBottomColor: line,
                  }}
                >
                  <MaterialCommunityIcons
                    name="account-outline"
                    size={28}
                    color={accentColor}
                  />
                  <View style={{ flex: 1, marginLeft: 14 }}>
                    <Text style={{
                      color: ink, fontSize: 17, fontWeight: '700',
                    }}>
                      Mi perfil
                    </Text>
                    <Text style={{
                      color: muted, fontSize: 12, marginTop: 4,
                    }}>
                      Cuenta, apariencia y ajustes
                    </Text>
                  </View>
                  <MaterialCommunityIcons
                    name="chevron-right" size={22} color={muted}
                  />
                </TouchableOpacity>

                
                <TouchableOpacity
                  onPress={() => close(onLeaguesPress)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="Mis ligas"
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingVertical: 18,
                    borderBottomWidth: 1,
                    borderBottomColor: line,
                  }}
                >
                  <MaterialCommunityIcons
                    name="account-group-outline"
                    size={28}
                    color={accentColor}
                  />

                  <View style={{ flex: 1, marginLeft: 14 }}>
                    <Text
                      style={{
                        color: ink,
                        fontSize: 17,
                        fontWeight: '700',
                      }}
                    >
                      Mis ligas
                    </Text>

                    <Text
                      style={{
                        color: muted,
                        fontSize: 12,
                        marginTop: 4,
                      }}
                    >
                      Compite con tus amigos
                    </Text>
                  </View>

                  <MaterialCommunityIcons
                    name="chevron-right"
                    size={22}
                    color={muted}
                  />
                </TouchableOpacity>

<View
                  accessible
                  accessibilityLabel="Profesionales. Próximamente"
                  style={{
                    paddingVertical: 20,
                    borderBottomWidth: 1,
                    borderBottomColor: line,
                  }}
                >
                  <View style={{
                    flexDirection: 'row', alignItems: 'center',
                  }}>
                    <MaterialCommunityIcons
                      name="account-group-outline"
                      size={26}
                      color={muted}
                    />
                    <View style={{ flex: 1, marginLeft: 14 }}>
                      <Text style={{
                        color: ink, fontSize: 17, fontWeight: '700',
                      }}>
                        Profesionales
                      </Text>
                      <Text style={{
                        color: muted,
                        fontSize: 12,
                        marginTop: 4,
                        lineHeight: 18,
                      }}>
                        Entrenadores y nutricionistas
                      </Text>
                      <Text style={{
                        color: accentColor,
                        fontSize: 10,
                        fontWeight: '800',
                        letterSpacing: 1,
                        marginTop: 10,
                      }}>
                        PRÓXIMAMENTE
                      </Text>
                    </View>
                  </View>
                </View>
              </ScrollView>
            </SafeAreaView>
          </Animated.View>
        </View>
      </Modal>
    </>
  );
}


// RIVALSET_ACCOUNT_PHOTO_V1
function RivalSetPhoto({
  uri, size = 46, color, busy = false, onPress,
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [uri]);

  const content = (
    <View style={{
      width: size,
      height: size,
      borderRadius: size / 2,
      overflow: 'hidden',
      borderWidth: 2,
      borderColor: color,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(127,127,127,0.12)',
    }}>
      {busy ? (
        <ActivityIndicator color={color} />
      ) : uri && !failed ? (
        <Image
          source={{uri}}
          onError={() => setFailed(true)}
          resizeMode="cover"
          style={{width:'100%',height:'100%'}}
        />
      ) : (
        <MaterialCommunityIcons
          name="account" size={size * 0.6} color={color}
        />
      )}
    </View>
  );

  return onPress ? (
    <TouchableOpacity
      disabled={busy}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Cambiar foto de perfil"
      activeOpacity={0.75}
    >
      {content}
    </TouchableOpacity>
  ) : content;
}

function useRivalSetPhoto(userId) {
  const [photo, setPhoto] = useState(null);
  const [busy, setBusy] = useState(false);
  const owner = useRef(userId);
  const lock = useRef(false);
  const revision = useRef(0);
  owner.current = userId;

  const bucket = () => supabase.storage.from('profile-photos');
  const path = id => id + '/avatar.jpg';

  useEffect(() => {
    let active = true;
    setPhoto(null);

    const load = async () => {
      const version = revision.current;
      if (!userId) return;

      try {
        const {data, error} = await bucket().createSignedUrl(
          path(userId), 604800
        );
        if (error) {
          console.log('Foto de perfil no disponible:', error.message);
          return;
        }
        if (
          active &&
          owner.current === userId &&
          revision.current === version
        ) {
          setPhoto({
            userId,
            uri: data.signedUrl + '&v=' + Date.now(),
          });
        }
      } catch (error) {
        console.log('No se pudo cargar la foto:', error.message);
      }
    };

    load();
    const timer = setInterval(load, 3600000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [userId]);

  const clear = async () => {
    if (lock.current) {
      throw Error('Espera a que termine de guardarse la foto.');
    }
    if (!userId) return;

    lock.current = true;
    setBusy(true);
    revision.current++;

    try {
      const {error} = await bucket().remove([path(userId)]);
      if (error) throw error;
      if (owner.current === userId) setPhoto(null);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };

  const choose = async () => {
    if (!userId || lock.current) return;
    lock.current = true;
    setBusy(true);
    revision.current++;

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.65,
        base64: true,
      });

      if (result.canceled || owner.current !== userId) return;

      const base64 = result.assets?.[0]?.base64;
      if (!base64) {
        throw Error('No se pudo leer esta imagen. Prueba otra foto.');
      }

      const chars =
        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
      const raw = base64.replace(/=+$/, '');
      const bytes = new Uint8Array(Math.floor(raw.length * 6 / 8));

      if (bytes.length > 3145728) {
        throw Error(
          'La foto supera 3 MB. Recórtala más o elige una imagen más pequeña.'
        );
      }

      let bits = 0;
      let value = 0;
      let index = 0;

      for (const character of raw) {
        const number = chars.indexOf(character);
        if (number < 0) {
          throw Error('La imagen no tiene un formato válido.');
        }
        value = (value << 6) | number;
        bits += 6;
        if (bits >= 8) {
          bits -= 8;
          bytes[index++] = (value >> bits) & 255;
        }
      }

      if (bytes[0] !== 255 || bytes[1] !== 216) {
        throw Error('Selecciona una foto JPEG.');
      }

      const {data: auth} = await supabase.auth.getSession();
      if (auth.session?.user?.id !== userId) {
        throw Error('La sesión ha cambiado. Vuelve a intentarlo.');
      }

      const {error} = await bucket().upload(
        path(userId),
        bytes.buffer,
        {
          contentType: 'image/jpeg',
          cacheControl: '0',
          upsert: true,
        }
      );
      if (error) throw error;

      if (owner.current === userId) {
        setPhoto({
          userId,
          uri: 'data:image/jpeg;base64,' + base64,
        });
      }
    } catch (error) {
      Alert.alert(
        'No se pudo guardar la foto',
        error.message || 'Inténtalo de nuevo.'
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };

  const uri = photo && photo.userId === userId ? photo.uri : null;

  const edit = () => Alert.alert(
    'Foto de perfil',
    'Elige una foto para tu cuenta.',
    [
      {
        text: uri ? 'Cambiar foto' : 'Elegir foto',
        onPress: choose,
      },
      ...(uri ? [{
        text: 'Quitar foto',
        style: 'destructive',
        onPress: () => clear().catch(error =>
          Alert.alert('No se pudo quitar', error.message)
        ),
      }] : []),
      {text: 'Cancelar', style: 'cancel'},
    ]
  );

  return [uri, busy, edit, clear];
}
