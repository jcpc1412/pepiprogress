import { useTranslation } from 'react-i18next';

import { useAuth } from '@/lib/auth';

import { AuthScreen } from './auth-screen';

/**
 * Post-sign-out auth splash (B3-06). Signing out ends the cloud session and
 * presents the login/sign-up screen, so a normal logout lands on an auth gate
 * rather than silently staying in-app. The "continue without account" dismiss
 * preserves the local-first model (the app stays usable with no account); a
 * successful sign-in clears the gate automatically (session effect in useAuth).
 * Renders nothing until a sign-out requests it.
 */
export function AuthGate() {
  const { t } = useTranslation();
  const { authGateVisible, user, dismissAuthGate } = useAuth();
  return (
    <AuthScreen
      visible={authGateVisible && !user}
      onClose={dismissAuthGate}
      dismissLabel={t('auth.continueWithout')}
    />
  );
}
