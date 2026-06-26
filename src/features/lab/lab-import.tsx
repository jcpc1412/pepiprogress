import * as DocumentPicker from 'expo-document-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, StyleSheet, View } from 'react-native';

import { PrimaryButton } from '@/components/form';
import { Card, Divider, EngravedLabel } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { parseLab, scanVial, type LabValue, type VialScanResult } from '@/lib/ai';
import { localDateKey, useStore } from '@/lib/store';

function LabValueRow({ item }: { item: LabValue }) {
  const { t } = useTranslation();
  const label = t(`markers.${item.marker}` as never, { defaultValue: item.marker });
  return (
    <View style={styles.row}>
      <View style={styles.rowLabel}>
        <ThemedText type="mono" themeColor="textSecondary">{label}</ThemedText>
        {item.referenceRange ? (
          <ThemedText type="monoSm" themeColor="textMuted">{t('lab.range', { range: item.referenceRange })}</ThemedText>
        ) : null}
      </View>
      <ThemedText type="metricSm" themeColor={item.confidence >= 0.8 ? 'numeral' : 'textMuted'}>
        {item.value} {item.unit}
      </ThemedText>
    </View>
  );
}

/** Lab result photo import — extracts marker values via AI vision, saves to today's check-in. */
export function LabImport() {
  const { t, i18n } = useTranslation();
  const { upsertCheckin } = useStore();
  const [scanning, setScanning] = useState(false);
  const [results, setResults] = useState<LabValue[] | null>(null);
  const [labDate, setLabDate] = useState<string | undefined>();
  const [pdfName, setPdfName] = useState<string | undefined>();

  // PDF upload (H-06). Parsing PDFs is deferred (AI task); we accept + retain the
  // file now and surface a "parsing coming" acknowledgement.
  const pickPdf = useCallback(async () => {
    const res = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true });
    if (res.canceled || !res.assets?.[0]) return;
    setPdfName(res.assets[0].name);
  }, []);

  const pickAndScan = useCallback(async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      const libPerm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!libPerm.granted) {
        Alert.alert(t('lab.permissionNeeded'));
        return;
      }
    }

    const pickerOpts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.9 };
    const fromCamera = perm.granted;
    const result = fromCamera
      ? await ImagePicker.launchCameraAsync(pickerOpts)
      : await ImagePicker.launchImageLibraryAsync(pickerOpts);

    if (result.canceled || !result.assets[0]) return;

    setScanning(true);
    setResults(null);
    try {
      const ctx = ImageManipulator.ImageManipulator.manipulate(result.assets[0].uri);
      ctx.resize({ width: 1024 });
      const rendered = await ctx.renderAsync();
      const out = await rendered.saveAsync({ format: ImageManipulator.SaveFormat.JPEG });
      const parsed = await parseLab(out.uri, i18n.language);
      setResults(parsed.values);
      setLabDate(parsed.labDate);
    } catch {
      Alert.alert(t('lab.error'));
    } finally {
      setScanning(false);
    }
  }, [t, i18n.language]);

  const saveResults = useCallback(() => {
    if (!results) return;
    const high = results.filter((v) => v.confidence >= 0.6);
    if (!high.length) return;
    const labValues: Record<string, number> = {};
    for (const v of high) labValues[v.marker] = v.value;
    const date = labDate ?? localDateKey(new Date());
    upsertCheckin(date, { labValues });
    setResults(null);
    setLabDate(undefined);
  }, [results, labDate, upsertCheckin]);

  return (
    <View style={styles.wrap}>
      <EngravedLabel>{t('lab.section')}</EngravedLabel>
      <ThemedText type="monoSm" themeColor="textSecondary">{t('lab.description')}</ThemedText>

      <PrimaryButton
        label={scanning ? t('lab.scanning') : t('lab.import')}
        onPress={pickAndScan}
        disabled={scanning}
      />

      <PrimaryButton label={t('lab.uploadPdf')} variant="secondary" onPress={pickPdf} />
      {pdfName && (
        <ThemedText type="monoSm" themeColor="textMuted">
          {t('lab.pdfSaved', { name: pdfName })}
        </ThemedText>
      )}

      {results && results.length === 0 && (
        <ThemedText type="monoSm" themeColor="textMuted">{t('lab.empty')}</ThemedText>
      )}

      {results && results.length > 0 && (
        <Card style={styles.results}>
          {labDate && (
            <ThemedText type="monoSm" themeColor="textMuted">{t('lab.labDate', { date: labDate })}</ThemedText>
          )}
          {results.map((v, i) => (
            <View key={v.marker}>
              {i > 0 && <Divider />}
              <LabValueRow item={v} />
            </View>
          ))}
          <PrimaryButton label={t('lab.confirm')} onPress={saveResults} />
        </Card>
      )}
    </View>
  );
}

/** Vial label scanner — extracts compound name + concentration via AI vision. */
export function VialScanner({ onResult }: { onResult: (result: VialScanResult) => void }) {
  const { t, i18n } = useTranslation();
  const [scanning, setScanning] = useState(false);

  const scan = useCallback(async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(t('lab.permissionNeeded'));
      return;
    }

    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.9 });
    if (result.canceled || !result.assets[0]) return;

    setScanning(true);
    try {
      const ctx = ImageManipulator.ImageManipulator.manipulate(result.assets[0].uri);
      ctx.resize({ width: 1024 });
      const rendered = await ctx.renderAsync();
      const out = await rendered.saveAsync({ format: ImageManipulator.SaveFormat.JPEG });
      const vialResult = await scanVial(out.uri, i18n.language);
      if (vialResult.confidence < 0.5) {
        Alert.alert(t('lab.vialUnreadable'));
      } else {
        onResult(vialResult);
      }
    } catch {
      Alert.alert(t('lab.error'));
    } finally {
      setScanning(false);
    }
  }, [t, i18n.language, onResult]);

  return (
    <PrimaryButton
      label={scanning ? t('lab.vialScanning') : t('lab.vialScan')}
      onPress={scan}
      disabled={scanning}
    />
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.two },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.one },
  rowLabel: { flex: 1, gap: 2 },
  results: { gap: Spacing.two, padding: Spacing.three },
});
