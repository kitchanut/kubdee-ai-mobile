import './global.css';

import { useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Toaster } from 'sonner-native';

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
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <LibraryProvider>
            <KubdeeMobileApp />
            <Toaster
              theme={colorScheme === 'light' ? 'light' : 'dark'}
              richColors
              toastOptions={{
                titleStyle: { fontFamily: 'NotoSansThai_500Medium' },
                descriptionStyle: { fontFamily: 'NotoSansThai_400Regular' },
              }}
            />
          </LibraryProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
