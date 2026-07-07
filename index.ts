import { registerRootComponent } from 'expo';

import App from './App';
import { initTelemetry, wrapWithSentry } from './src/lib/sentry';

// Boot error reporting before anything else so early failures are captured.
initTelemetry();

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(wrapWithSentry(App));
