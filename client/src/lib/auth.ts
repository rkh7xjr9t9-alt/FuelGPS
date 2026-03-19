// Simple in-memory auth state (no localStorage — blocked in sandbox)
import { create } from "zustand";

interface AuthUser {
  id: string;
  username: string;
  email: string;
}

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  setAuth: (token: string, user: AuthUser) => void;
  clearAuth: () => void;
}

// We use a simple module-level variable for the token so apiRequest can read it
// without importing the full store (avoids circular deps)
let _token: string | null = null;

export function getToken(): string | null {
  return _token;
}

export const useAuth = create<AuthState>((set) => ({
  token: null,
  user: null,
  setAuth: (token, user) => {
    _token = token;
    set({ token, user });
  },
  clearAuth: () => {
    _token = null;
    set({ token: null, user: null });
  },
}));
