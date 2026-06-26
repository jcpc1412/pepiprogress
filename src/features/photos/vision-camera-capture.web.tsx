import { PhotoCapture } from '@/features/photos/photo-capture';
import type { PhotoEntry, PhotoSession } from '@/lib/store';

/**
 * Web stub for the face capture. `react-native-vision-camera` is native-only and
 * importing it crashes the web bundle, so on web we fall back to the standard
 * expo-camera capture (Metro auto-resolves this `.web` variant). The `baseline`
 * distance-comparison prop is native-only and ignored here.
 */
export function VisionCameraCapture({
  session,
  ghostUri,
  visible,
  onClose,
}: {
  session: PhotoSession;
  ghostUri?: string;
  baseline?: PhotoEntry;
  visible: boolean;
  onClose: () => void;
}) {
  return <PhotoCapture session={session} ghostUri={ghostUri} visible={visible} onClose={onClose} />;
}
