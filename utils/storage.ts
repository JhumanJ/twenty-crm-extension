import { storage } from '#imports';
import type { ExtensionSettings } from '../types';

// Define storage items with proper typing
export const twentyUrlStorage = storage.defineItem<string>('sync:twentyUrl', {
  fallback: '',
});

// API key is a secret — keep it in local storage only, never synced across devices
export const apiKeyStorage = storage.defineItem<string>('local:apiKey', {
  fallback: '',
});

export const lastCapturedStorage = storage.defineItem<Array<{
  linkedinUrl: string;
  name: string;
  type: 'person' | 'company';
  capturedAt: number;
  twentyId: string;
}>>('local:lastCaptured', {
  fallback: [],
});

// Helper functions
export async function getSettings(): Promise<ExtensionSettings> {
  const [twentyUrl, apiKey] = await Promise.all([
    twentyUrlStorage.getValue(),
    apiKeyStorage.getValue(),
  ]);
  return { twentyUrl, apiKey };
}

export async function saveSettings(settings: Partial<ExtensionSettings>): Promise<void> {
  if (settings.twentyUrl !== undefined) {
    await twentyUrlStorage.setValue(settings.twentyUrl);
  }
  if (settings.apiKey !== undefined) {
    await apiKeyStorage.setValue(settings.apiKey);
  }
}

export async function addToRecentCaptures(capture: {
  linkedinUrl: string;
  name: string;
  type: 'person' | 'company';
  twentyId: string;
}): Promise<void> {
  const current = await lastCapturedStorage.getValue();
  const newCapture = {
    ...capture,
    capturedAt: Date.now(),
  };
  
  // Keep only last 10 captures, remove duplicates
  const filtered = current.filter((c) => c.linkedinUrl !== capture.linkedinUrl);
  const updated = [newCapture, ...filtered].slice(0, 10);
  
  await lastCapturedStorage.setValue(updated);
}

export async function getRecentCaptures() {
  return lastCapturedStorage.getValue();
}

