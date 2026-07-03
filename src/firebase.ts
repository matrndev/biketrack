// Central Firebase handles. Uses the react-native-firebase MODULAR API (v22+).
// Config (project, RTDB URL) is read automatically from google-services.json,
// so there is nothing to hardcode here.
import { getApp } from '@react-native-firebase/app';
import { getAuth } from '@react-native-firebase/auth';
import { getDatabase } from '@react-native-firebase/database';

const app = getApp();

export const auth = getAuth(app);
export const db = getDatabase(app);
