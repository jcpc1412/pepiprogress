import AppTabs from '@/components/app-tabs';
import { Onboarding } from '@/features/onboarding/onboarding';
import { MacroReminderHandler } from '@/lib/macro-reminder-handler';
import { useStore } from '@/lib/store';

/**
 * Tab group layout. Handles the onboarding gate (O-01): renders Onboarding in
 * place of the whole navigator until the user completes it, then mounts the
 * tab bar and the macro-reminder side-effect component.
 */
export default function TabsLayout() {
  const { ready, profile } = useStore();

  if (!ready) return null;
  if (!profile.onboardingComplete) return <Onboarding />;

  return (
    <>
      <MacroReminderHandler />
      <AppTabs />
    </>
  );
}
