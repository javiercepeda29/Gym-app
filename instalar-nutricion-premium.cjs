const fs = require('fs');

const file = 'App.js';
const backup = `App.js.bak-nutrition-launch-${Date.now()}`;

if (!fs.existsSync(file)) {
  console.error('❌ No encuentro App.js');
  process.exit(1);
}

let src = fs.readFileSync(file, 'utf8');

const nutritionAnchor = '  const Nutrition = () => {';
const exactRender = "? <Nutrition />";

if (!src.includes(nutritionAnchor)) {
  console.error('❌ No encuentro el componente Nutrition. No se ha tocado nada.');
  process.exit(1);
}

if (!src.includes(exactRender)) {
  console.error('❌ No encuentro el render exacto de Nutrition. No se ha tocado nada.');
  process.exit(1);
}

if (src.includes('RIVALSET_NUTRITION_COMING_SOON')) {
  console.log('ℹ️ La pantalla Próximamente ya está instalada.');
  process.exit(0);
}

fs.copyFileSync(file, backup);

const comingSoon = `
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
            backgroundColor: 'rgba(255,179,0,0.10)',
            borderWidth: 1,
            borderColor: 'rgba(255,179,0,0.30)',
            marginBottom: 24,
          }}
        >
          <MaterialCommunityIcons
            name="silverware-fork-knife"
            size={35}
            color={COLORS.orange}
          />
        </View>

        <View
          style={{
            alignSelf: 'center',
            paddingHorizontal: 13,
            paddingVertical: 6,
            borderRadius: 20,
            backgroundColor: 'rgba(255,179,0,0.12)',
            marginBottom: 15,
          }}
        >
          <Text
            style={{
              color: COLORS.orange,
              fontSize: 11,
              fontWeight: '900',
              letterSpacing: 1.1,
            }}
          >
            PRÓXIMAMENTE · PREMIUM
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
            color: '#9A9DA5',
            fontSize: 14,
            lineHeight: 21,
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
            backgroundColor: 'rgba(255,255,255,0.055)',
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.10)',
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
                  backgroundColor: 'rgba(255,179,0,0.10)',
                }}
              >
                <MaterialCommunityIcons
                  name={icon}
                  size={19}
                  color={COLORS.orange}
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
            color="#73767D"
          />

          <Text
            style={{
              color: '#73767D',
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

`;

src = src.replace(
  nutritionAnchor,
  comingSoon + nutritionAnchor
);

src = src.replace(
  exactRender,
  '? <NutritionComingSoon />'
);

fs.writeFileSync(file, src, 'utf8');

console.log('');
console.log('==========================================');
console.log('✅ NUTRICIÓN PREPARADA PARA LANZAMIENTO');
console.log('==========================================');
console.log('✅ Pantalla Próximamente instalada');
console.log('✅ Nutrición antigua conservada');
console.log('✅ Base de datos intacta');
console.log('✅ Supabase intacto');
console.log('✅ Backup creado: ' + backup);
console.log('');
