/**
 * Google Drive backup / restore (spec 06, Polish).
 *
 * Requires a Google Cloud project with OAuth 2.0 credentials:
 *   EXPO_PUBLIC_GOOGLE_CLIENT_ID   — Web Client ID (works for PKCE on mobile too)
 *
 * Setup steps (owner action before device build):
 *   1. Go to console.cloud.google.com → APIs & Services → Credentials.
 *   2. Enable the Google Drive API.
 *   3. Create an "OAuth 2.0 Client ID" → Application type: Web.
 *   4. Add Authorized redirect URIs:
 *        - https://auth.expo.io/@<expo-username>/pepi  (for Expo Go)
 *        - pepi://  (for the bare app; matches "scheme" in app.json)
 *   5. Copy the Client ID into .env as EXPO_PUBLIC_GOOGLE_CLIENT_ID.
 *
 * The auth flow uses PKCE (no client secret needed on mobile).
 */

import type { PersistedState } from '@/lib/store';

const BACKUP_FILE_PREFIX = 'pepi-backup-';
const DRIVE_FILES_URL = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';

export type DriveBackupInfo = {
  id: string;
  name: string;
  createdTime: string;
};

/** Upload the full app state as a JSON file to the user's Drive `appDataFolder`. */
export async function uploadToDrive(
  state: PersistedState,
  accessToken: string,
): Promise<DriveBackupInfo> {
  const filename = `${BACKUP_FILE_PREFIX}${Date.now()}.json`;
  const json = JSON.stringify(state);

  // Multipart upload: metadata + body in one request.
  const metadata = JSON.stringify({ name: filename, parents: ['appDataFolder'] });
  const boundary = 'pepiprogress_boundary';
  const body = [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    metadata,
    `--${boundary}`,
    'Content-Type: application/json',
    '',
    json,
    `--${boundary}--`,
  ].join('\r\n');

  const res = await fetch(DRIVE_UPLOAD_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Drive upload failed: ${res.status} ${err}`);
  }

  const file = (await res.json()) as { id: string; name: string; createdTime: string };
  return { id: file.id, name: file.name, createdTime: file.createdTime };
}

/** List PepiProgress backup files from Drive `appDataFolder`, newest first. */
export async function listBackups(accessToken: string): Promise<DriveBackupInfo[]> {
  const params = new URLSearchParams({
    spaces: 'appDataFolder',
    fields: 'files(id,name,createdTime)',
    orderBy: 'createdTime desc',
    q: `name contains '${BACKUP_FILE_PREFIX}'`,
    pageSize: '10',
  });

  const res = await fetch(`${DRIVE_FILES_URL}?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) throw new Error(`Drive list failed: ${res.status}`);
  const data = (await res.json()) as { files: DriveBackupInfo[] };
  return data.files ?? [];
}

/** Download and parse a backup file from Drive. Returns null on parse failure. */
export async function downloadBackup(
  fileId: string,
  accessToken: string,
): Promise<PersistedState | null> {
  const res = await fetch(`${DRIVE_FILES_URL}/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) throw new Error(`Drive download failed: ${res.status}`);
  try {
    return (await res.json()) as PersistedState;
  } catch {
    return null;
  }
}

/** Delete old backup files, keeping the most recent `keep` (default 3). */
export async function pruneOldBackups(
  accessToken: string,
  keep = 3,
): Promise<void> {
  const files = await listBackups(accessToken);
  const toDelete = files.slice(keep);
  await Promise.allSettled(
    toDelete.map((f) =>
      fetch(`${DRIVE_FILES_URL}/${f.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      }),
    ),
  );
}
