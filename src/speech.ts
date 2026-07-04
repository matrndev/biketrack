// TTS layer — the only file that touches expo-speech (swap-friendly, same
// pattern as location.ts). Severity shapes delivery (PLAN §5.4): critical is
// repeated with a strong buzz, important gets one buzz, low is just quieter
// speech. Phrases queue rather than interrupt, so back-to-back comms all land.
import * as Speech from 'expo-speech';
import { Vibration } from 'react-native';
import type { Severity } from './comms';

export function speak(text: string, severity: Severity): void {
  try {
    if (severity === 'critical') {
      Vibration.vibrate([0, 300, 120, 300]);
      Speech.speak(text, { rate: 1.05 });
      Speech.speak(text, { rate: 1.05 });
    } else if (severity === 'important') {
      Vibration.vibrate(150);
      Speech.speak(text);
    } else {
      Speech.speak(text, { volume: 0.7 });
    }
  } catch {
    // TTS engine missing/busy — comms still land visually.
  }
}
