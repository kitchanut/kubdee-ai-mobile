import './global.css';

import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider } from './src/auth/AuthContext';
import KubdeeMobileApp from './src/components/KubdeeMobileApp';
import { useKubdeeFonts } from './src/theme/useKubdeeFonts';

export default function App(): React.JSX.Element {
  const fontsReady = useKubdeeFonts();

  if (!fontsReady) {
    return <></>;
  }

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <KubdeeMobileApp />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
