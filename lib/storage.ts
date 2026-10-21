import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

const memoryMirror = new Map<string, string>();

export function readSyncCache<T>(key: string): T | null {
  try {
    if (Platform.OS === "web" && typeof localStorage !== "undefined") {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : null;
    }
    const raw = memoryMirror.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export async function readPersistentCache<T>(key: string): Promise<T | null> {
  const immediate = readSyncCache<T>(key);
  if (immediate !== null) return immediate;

  if (Platform.OS === "web") return null;

  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    memoryMirror.set(key, raw);
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function writePersistentCache(key: string, value: unknown): Promise<void> {
  try {
    const serialized = JSON.stringify(value);
    memoryMirror.set(key, serialized);
    if (Platform.OS === "web" && typeof localStorage !== "undefined") {
      localStorage.setItem(key, serialized);
      return;
    }
    await AsyncStorage.setItem(key, serialized);
  } catch {
    // Storage quota or private browsing should never block rendering.
  }
}

export async function clearPersistentPrefix(prefixes: string[]): Promise<void> {
  for (const key of [...memoryMirror.keys()]) {
    if (prefixes.some((prefix) => key.startsWith(prefix))) {
      memoryMirror.delete(key);
    }
  }

  try {
    if (Platform.OS === "web" && typeof localStorage !== "undefined") {
      for (let index = localStorage.length - 1; index >= 0; index -= 1) {
        const key = localStorage.key(index);
        if (key && prefixes.some((prefix) => key.startsWith(prefix))) {
          localStorage.removeItem(key);
        }
      }
      return;
    }

    const keys = await AsyncStorage.getAllKeys();
    const matching = keys.filter((key) => prefixes.some((prefix) => key.startsWith(prefix)));
    if (matching.length) {
      await AsyncStorage.multiRemove(matching);
    }
  } catch {
    // Ignore storage cleanup errors.
  }
}

export async function readStringItem(key: string): Promise<string | null> {
  try {
    if (Platform.OS === "web" && typeof localStorage !== "undefined") {
      return localStorage.getItem(key);
    }
    return await AsyncStorage.getItem(key);
  } catch {
    return null;
  }
}

export async function writeStringItem(key: string, value: string): Promise<void> {
  try {
    if (Platform.OS === "web" && typeof localStorage !== "undefined") {
      localStorage.setItem(key, value);
      return;
    }
    await AsyncStorage.setItem(key, value);
  } catch {
    // Ignore persistence failures.
  }
}
