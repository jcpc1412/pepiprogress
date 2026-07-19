import { Image } from 'expo-image';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { cropToImageStyle, displayCrop, type CropBox } from '@/lib/photo-crop';

/**
 * A photo rendered through its analysis crop box (W6-28), or full-frame when
 * there is no trustworthy box. The crop is presentation only: the underlying
 * file is never modified, so improving the box later re-crops from the original.
 *
 * Implemented as an overflow-hidden window with the image blown up and offset so
 * the crop region fills it, which keeps the source untouched and costs nothing
 * beyond a style calculation.
 */
export function CroppedPhoto({
  uri,
  cropBox,
  style,
  accessibilityLabel,
}: {
  uri: string;
  cropBox?: CropBox;
  /** Sizing for the visible window (width/height/border, etc.). */
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const crop = displayCrop(cropBox);

  if (!crop) {
    return (
      <View style={[styles.window, style]}>
        <Image
          source={{ uri }}
          style={styles.fill}
          contentFit="cover"
          accessibilityLabel={accessibilityLabel}
        />
      </View>
    );
  }

  const s = cropToImageStyle(crop);
  return (
    <View style={[styles.window, style]}>
      <Image
        source={{ uri }}
        style={{
          position: 'absolute',
          width: `${s.width}%`,
          height: `${s.height}%`,
          left: `${s.left}%`,
          top: `${s.top}%`,
        }}
        contentFit="cover"
        accessibilityLabel={accessibilityLabel}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  window: { overflow: 'hidden' },
  fill: { flex: 1 },
});
