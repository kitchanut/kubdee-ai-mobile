import { ActivityIndicator, Image, StyleSheet, View } from 'react-native';

import Text from '@/components/ui/KubdeeText';
import type { KubdeeTheme } from '@/theme/tokens';
import { radii, typography } from '@/theme/tokens';

const logoDark = require('../../assets/logo-dark.png');
const logoLight = require('../../assets/logo-light.png');

interface AuthLoadingScreenProps {
  theme: KubdeeTheme;
}

export default function AuthLoadingScreen({ theme }: AuthLoadingScreenProps): React.JSX.Element {
  return (
    <View style={[styles.container, { backgroundColor: theme.panel }]}>
      <View style={[styles.logoFrame, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <Image source={theme.isDark ? logoLight : logoDark} resizeMode="contain" style={styles.logo} />
      </View>
      <ActivityIndicator color={theme.orange} size="small" />
      <Text style={[styles.label, { color: theme.textSubtle }]}>กำลังตรวจสอบบัญชี</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    flex: 1,
    gap: 14,
    justifyContent: 'center',
    padding: 24,
  },
  label: {
    fontSize: typography.body,
    fontWeight: '700',
  },
  logo: {
    height: 44,
    width: 44,
  },
  logoFrame: {
    alignItems: 'center',
    borderRadius: radii.lg,
    borderWidth: 1,
    height: 72,
    justifyContent: 'center',
    width: 72,
  },
});
