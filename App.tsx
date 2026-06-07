import './global.css';

import { SafeAreaProvider } from 'react-native-safe-area-context';

import KubdeeMobileApp from './src/components/KubdeeMobileApp';

export default function App(): React.JSX.Element {
  return (
    <SafeAreaProvider>
      <KubdeeMobileApp />
    </SafeAreaProvider>
  );
}
