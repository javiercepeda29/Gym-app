import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const supabaseUrl = 'https://kpejsuncutkbgktqlcwe.supabase.co';
const supabasePublishableKey = 'sb_publishable_yyvoFgfe-eRJItrS9We5pQ_3RzH4jMJ';

export const supabase = createClient(
  supabaseUrl,
  supabasePublishableKey,
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  }
);