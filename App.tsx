import './global.css';

import { useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider } from './src/auth/AuthContext';
import KubdeeMobileApp from './src/components/KubdeeMobileApp';
import { LibraryProvider } from './src/library/LibraryContext';
import AuthLoadingScreen from './src/screens/AuthLoadingScreen';
import { darkTheme, lightTheme } from './src/theme/tokens';
import { useKubdeeFonts } from './src/theme/useKubdeeFonts';

export default function App(): React.JSX.Element {
  const colorScheme = useColorScheme();
  const fontsReady = useKubdeeFonts();
  const initialTheme = colorScheme === 'light' ? lightTheme : darkTheme;

  if (!fontsReady) {
    return <AuthLoadingScreen theme={initialTheme} useSystemText />;
  }

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <LibraryProvider>
          <KubdeeMobileApp />
        </LibraryProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
