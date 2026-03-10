import { create } from 'zustand';

export type ToastType = 'success' | 'error' | 'attack' | 'defense' | 'info';

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  icon?: string;
}

interface ToastStore {
  toasts: Toast[];
  addToast: (message: string, type: ToastType, icon?: string) => void;
  removeToast: (id: string) => void;
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  addToast: (message, type, icon) => {
    const id = `t-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    set((s) => ({ toasts: [...s.toasts, { id, message, type, icon }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, 3500);
  },
  removeToast: (id) => {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },
}));

/** Convenience function — use outside React components */
export const toast = {
  success: (msg: string, icon?: string) => useToastStore.getState().addToast(msg, 'success', icon),
  error: (msg: string, icon?: string) => useToastStore.getState().addToast(msg, 'error', icon),
  info: (msg: string, icon?: string) => useToastStore.getState().addToast(msg, 'info', icon),
  attack: (msg: string, icon?: string) => useToastStore.getState().addToast(msg, 'attack', icon),
  defense: (msg: string, icon?: string) => useToastStore.getState().addToast(msg, 'defense', icon),
};
