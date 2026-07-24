const { withMainActivity } = require('@expo/config-plugins');

/**
 * Register the Health Connect permission delegate in MainActivity.onCreate.
 *
 * react-native-health-connect requires the host app to call
 * `HealthConnectPermissionDelegate.setPermissionDelegate(this)` from
 * `MainActivity.onCreate` (see its README). That call is what registers the
 * ActivityResultLauncher the permission dialog is launched through, and it has
 * to happen in onCreate because `registerForActivityResult` throws once the
 * activity is STARTED.
 *
 * The library's own Expo config plugin does NOT do this: it only pushes the
 * `ACTION_SHOW_PERMISSIONS_RATIONALE` intent-filter into the manifest. So on a
 * managed Expo app the delegate is silently never set, and the launcher stays
 * an uninitialized Kotlin `lateinit var`.
 *
 * The failure mode is a hard crash, not an error. `requestPermission` does:
 *
 *   coroutineScope.launch { HealthConnectPermissionDelegate.launchPermissionsDialog(..) }
 *
 * with no exception handler, so the `UninitializedPropertyAccessException`
 * surfaces as an uncaught exception on a background dispatcher and takes the
 * process down. The JS promise is never rejected, which is why the try/catch in
 * `healthConnectProvider.authenticate()` cannot save it.
 */
const IMPORT = 'import dev.matinzd.healthconnect.permissions.HealthConnectPermissionDelegate';
const CALL = '    HealthConnectPermissionDelegate.setPermissionDelegate(this)';
const ANCHOR = 'super.onCreate(null)';

const withHealthConnectDelegate = (config) =>
  withMainActivity(config, (config) => {
    const { modResults } = config;
    if (modResults.language !== 'kt') {
      throw new Error(
        `with-health-connect-delegate: expected a Kotlin MainActivity, got "${modResults.language}".`,
      );
    }
    // Idempotent: prebuild re-runs against an already-patched file.
    if (modResults.contents.includes('HealthConnectPermissionDelegate')) return config;

    if (!modResults.contents.includes(ANCHOR)) {
      throw new Error(
        `with-health-connect-delegate: could not find "${ANCHOR}" in MainActivity. ` +
          'The Expo template changed; update the anchor rather than shipping a silent no-op, ' +
          'because a missing delegate crashes the app when the user connects Health Connect.',
      );
    }

    modResults.contents = modResults.contents
      .replace('import com.facebook.react.ReactActivity', `${IMPORT}\nimport com.facebook.react.ReactActivity`)
      // After super.onCreate so the activity is initialized, still inside onCreate
      // so registration happens before the activity is STARTED.
      .replace(ANCHOR, `${ANCHOR}\n${CALL}`);

    return config;
  });

module.exports = withHealthConnectDelegate;
