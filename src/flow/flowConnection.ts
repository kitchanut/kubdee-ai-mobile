import AsyncStorage from '@react-native-async-storage/async-storage';

import type { FlowAccount, FlowConnectionState } from './FlowWebView';

const STORAGE_KEY = 'kubdee:flow:connectionState';
const ACCOUNT_KEY = 'kubdee:flow:account';

const VALID: FlowConnectionState[] = ['unknown', 'signin', 'loggedout', 'connected'];

export async function loadFlowConnectionState(): Promise<FlowConnectionState | null> {
  try {
    const value = (await AsyncStorage.getItem(STORAGE_KEY)) as FlowConnectionState | null;
    return value && VALID.includes(value) ? value : null;
  } catch {
    return null;
  }
}

export async function saveFlowConnectionState(state: FlowConnectionState): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, state);
  } catch {
    // ignore persistence failures
  }
}

export async function loadFlowAccount(): Promise<FlowAccount | null> {
  try {
    const raw = await AsyncStorage.getItem(ACCOUNT_KEY);
    return raw ? (JSON.parse(raw) as FlowAccount) : null;
  } catch {
    return null;
  }
}

export async function saveFlowAccount(account: FlowAccount): Promise<void> {
  try {
    await AsyncStorage.setItem(ACCOUNT_KEY, JSON.stringify(account));
  } catch {
    // ignore persistence failures
  }
}
