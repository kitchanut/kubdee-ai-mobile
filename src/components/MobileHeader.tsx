import {
  FolderOpen,
  Moon,
  Settings,
  Square,
  Sun,
} from 'lucide-react-native';
import { Image, StyleSheet, Text, View } from 'react-native';

import IconButton from '@/components/ui/IconButton';
import type { KubdeeTheme } from '@/theme/tokens';
import { typography } from '@/theme/tokens';

const logoDark = require('../../assets/logo-dark.png');
const logoLight = require('../../assets/logo-light.png');
const headerActionIconSize = 17;
const headerActionSize = 34;

interface MobileHeaderProps {
  theme: KubdeeTheme;
  runningCount: number;
  libraryActive?: boolean;
  subtitle?: string;
  onLibraryPress: () => void;
  onThemeModeToggle: () => void;
}

export default function MobileHeader({
  theme,
  runningCount,
  libraryActive = false,
  subtitle = 'Shopee หลัก',
  onLibraryPress,
  onThemeModeToggle,
}: MobileHeaderProps): React.JSX.Element {
  const ThemeIcon = theme.isDark ? Moon : Sun;

  return (
    <View style={[styles.container, { borderBottomColor: theme.border }]}>
      <View style={styles.identity}>
        <Image
          source={theme.isDark ? logoLight : logoDark}
          resizeMode="contain"
          style={styles.logo}
        />
        <View style={styles.titleBlock}>
          <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
            Kubdee AI
          </Text>
          <Text style={[styles.subtitle, { color: theme.textSubtle }]} numberOfLines={1}>
            {subtitle}
          </Text>
        </View>
      </View>

      <View style={styles.actions}>
        {runningCount > 0 ? (
          <IconButton
            icon={Square}
            size={headerActionSize}
            iconSize={14}
            color={theme.red}
            backgroundColor={theme.redSoft}
          />
        ) : null}
        <IconButton
          icon={FolderOpen}
          size={headerActionSize}
          iconSize={headerActionIconSize}
          color={libraryActive ? theme.orange : theme.textSubtle}
          backgroundColor={libraryActive ? theme.orangeSoft : theme.panelMuted}
          onPress={onLibraryPress}
        />
        <IconButton
          icon={Settings}
          size={headerActionSize}
          iconSize={headerActionIconSize}
          color={theme.textSubtle}
          backgroundColor={theme.panelMuted}
        />
        <IconButton
          icon={ThemeIcon}
          size={headerActionSize}
          iconSize={headerActionIconSize}
          color={theme.isDark ? theme.blue : theme.amber}
          backgroundColor={theme.isDark ? theme.active : theme.amberSoft}
          onPress={onThemeModeToggle}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  actions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  container: {
    alignItems: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  identity: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 10,
    minWidth: 0,
  },
  logo: {
    height: 38,
    width: 38,
  },
  subtitle: {
    fontSize: typography.caption,
    letterSpacing: 0,
  },
  title: {
    fontSize: typography.title,
    fontWeight: '800',
    letterSpacing: 0,
  },
  titleBlock: {
    flex: 1,
    minWidth: 0,
  },
});
