import { registerRootComponent } from 'expo';

// Defines the background location task — must happen at startup, before
// Android delivers queued fixes to it (see src/location.ts).
import './src/location';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
