/**
 * Full-screen overlay navigation for surfaces that must cover the tab bar
 * (Settings, Logging, Add-compound). The app uses a flat native-tabs layout
 * with no root stack, so a React Native <Modal> is the reliable, cross-platform
 * way to present a screen over the native tab bar. Deep links (e.g. the H-05
 * macro reminder) open overlays through this same context.
 */

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { Modal } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AddCompoundScreen } from '@/features/protocol/add-compound-screen';
import { CompoundDetailScreen } from '@/features/protocol/compound-detail-screen';
import { SettingsScreen } from '@/features/settings/settings-screen';
import { LoggingScreen } from '@/features/logging/logging-screen';

export type LoggingMode = 'quick' | 'detailed';

type OverlayState =
  | { kind: 'settings' }
  | { kind: 'logging'; mode: LoggingMode; seedPrompt?: 'macros'; quickOnly?: boolean }
  | { kind: 'addCompound' }
  | { kind: 'compoundDetail'; itemId: string }
  | null;

type OverlayContextValue = {
  openSettings: () => void;
  openLogging: (mode: LoggingMode, seedPrompt?: 'macros', quickOnly?: boolean) => void;
  openAddCompound: () => void;
  openCompoundDetail: (itemId: string) => void;
  close: () => void;
  state: OverlayState;
};

const OverlayContext = createContext<OverlayContextValue | undefined>(undefined);

export function useOverlay(): OverlayContextValue {
  const ctx = useContext(OverlayContext);
  if (!ctx) throw new Error('useOverlay must be used within OverlayProvider');
  return ctx;
}

export function OverlayProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<OverlayState>(null);

  const value = useMemo<OverlayContextValue>(
    () => ({
      openSettings: () => setState({ kind: 'settings' }),
      openLogging: (mode, seedPrompt, quickOnly) =>
        setState({ kind: 'logging', mode, seedPrompt, quickOnly }),
      openAddCompound: () => setState({ kind: 'addCompound' }),
      openCompoundDetail: (itemId) => setState({ kind: 'compoundDetail', itemId }),
      close: () => setState(null),
      state,
    }),
    [state],
  );

  return (
    <OverlayContext.Provider value={value}>
      {children}
      <Modal
        visible={state !== null}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setState(null)}>
        {/* A Modal renders in its own native view tree outside the root
            SafeAreaProvider, so SafeAreaView/insets read 0 inside it and the
            header slides under the status bar (the "can't go back" bug). Give
            the modal its own provider so insets resolve. */}
        <SafeAreaProvider>
          <OverlayContent state={state} onClose={() => setState(null)} />
        </SafeAreaProvider>
      </Modal>
    </OverlayContext.Provider>
  );
}

function OverlayContent({ state, onClose }: { state: OverlayState; onClose: () => void }) {
  if (!state) return null;
  if (state.kind === 'settings') return <SettingsScreen onClose={onClose} />;
  if (state.kind === 'logging')
    return (
      <LoggingScreen
        onClose={onClose}
        initialMode={state.mode}
        seedPrompt={state.seedPrompt}
        quickOnly={state.quickOnly}
      />
    );
  if (state.kind === 'compoundDetail')
    return <CompoundDetailScreen itemId={state.itemId} onClose={onClose} />;
  return <AddCompoundScreen onClose={onClose} />;
}
