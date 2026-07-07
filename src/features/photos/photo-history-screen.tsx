import { Image } from 'expo-image';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DatePicker } from '@/components/date-picker';
import { OptionChip, PrimaryButton, TextButton } from '@/components/form';
import { OverlayHeader } from '@/components/overlay-header';
import { EngravedLabel, Placeholder } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Fonts, MaxContentWidth, Radii, Spacing } from '@/constants/theme';
import { compoundBySlug } from '@/data/compound-catalog';
import { daysBetween } from '@/lib/dates';
import { useTheme } from '@/hooks/use-theme';
import { useResolvedUris } from '@/lib/photos';
import { localDateKey, useStore, type DoseEvent, type PhotoEntry, type PhotoSession, type ProtocolItem } from '@/lib/store';

// ─── Auto-tag derivation ─────────────────────────────────────────────────────

/** Derive compound names + cycle week from dose history around a photo's date. */
function derivePhotoTags(
  photo: PhotoEntry,
  doseEvents: DoseEvent[],
  protocolItems: ProtocolItem[],
): string[] {
  const photoKey = localDateKey(new Date(photo.takenAt));
  const windowDays = 14;

  const activeSlugs = new Set<string>();
  for (const d of doseEvents) {
    if (!d.compoundSlug) continue;
    const doseKey = localDateKey(new Date(d.takenAt));
    const diff = Math.abs(daysBetween(doseKey, photoKey));
    if (diff <= windowDays) activeSlugs.add(d.compoundSlug);
  }

  if (activeSlugs.size === 0) return [];

  const tags: string[] = [];
  for (const slug of activeSlugs) {
    tags.push(compoundBySlug(slug)?.canonicalName ?? slug);
  }

  const relevantStarts = protocolItems
    .filter((p) => p.compoundSlug && activeSlugs.has(p.compoundSlug) && p.startedAt)
    .map((p) => p.startedAt!)
    .sort();

  if (relevantStarts[0]) {
    const photoDate = new Date(photo.takenAt);
    const weeks = Math.floor(
      (photoDate.getTime() - new Date(relevantStarts[0]).getTime()) / (7 * 86400000),
    );
    if (weeks >= 0) tags.push(`__WEEK__${weeks + 1}`);
  }

  return tags;
}

// ─── Month grouping ──────────────────────────────────────────────────────────

function formatMonthLabel(key: string, locale: string): string {
  const [y, m] = key.split('-');
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString(locale, { month: 'long', year: 'numeric' }).toUpperCase();
}

// ─── Tag editor modal ────────────────────────────────────────────────────────

function TagEditorModal({
  photo,
  derivedTags,
  visible,
  onClose,
}: {
  photo: PhotoEntry;
  derivedTags: string[];
  visible: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const { updatePhoto } = useStore();
  const [tags, setTags] = useState<string[]>(photo.customTags ?? derivedTags);
  const [newTag, setNewTag] = useState('');

  const removeTag = (idx: number) => setTags((prev) => prev.filter((_, i) => i !== idx));
  const addTag = () => {
    const trimmed = newTag.trim();
    if (!trimmed || tags.includes(trimmed)) { setNewTag(''); return; }
    setTags((prev) => [...prev, trimmed]);
    setNewTag('');
  };
  const save = () => {
    updatePhoto(photo.id, { customTags: tags });
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={modalStyles.backdrop} onPress={onClose}>
        <View
          style={[modalStyles.sheet, { backgroundColor: theme.surfaceRaised, borderColor: theme.border }]}
          onStartShouldSetResponder={() => true}>
          <EngravedLabel>{t('photos.editTags')}</EngravedLabel>
          <View style={modalStyles.chips}>
            {tags.map((tag, i) => {
              const label = tag.startsWith('__WEEK__')
                ? t('photos.tagWeek', { week: tag.slice(8) })
                : tag;
              return (
                <Pressable
                  key={i}
                  accessibilityRole="button"
                  onPress={() => removeTag(i)}
                  style={[modalStyles.chip, { backgroundColor: theme.surfaceSunken, borderColor: theme.border }]}>
                  <ThemedText type="monoSm">{label} ×</ThemedText>
                </Pressable>
              );
            })}
          </View>
          <View style={[modalStyles.inputRow, { borderColor: theme.border }]}>
            <TextInput
              style={[modalStyles.input, { color: theme.text, fontFamily: Fonts.mono }]}
              placeholder={t('photos.tagPlaceholder')}
              placeholderTextColor={theme.textMuted}
              value={newTag}
              onChangeText={setNewTag}
              onSubmitEditing={addTag}
              returnKeyType="done"
            />
            <Pressable onPress={addTag} hitSlop={8}>
              <ThemedText type="monoSm" themeColor="accent">{t('photos.addTag')}</ThemedText>
            </Pressable>
          </View>
          <PrimaryButton label={t('common.save')} onPress={save} />
        </View>
      </Pressable>
    </Modal>
  );
}

const modalStyles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center' },
  sheet: {
    width: 300,
    borderRadius: Radii.panel,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  chip: {
    borderRadius: Radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radii.chamfer,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    gap: Spacing.two,
  },
  input: { flex: 1, fontSize: 14 },
});

// ─── Filter modal ────────────────────────────────────────────────────────────

function FilterModal({
  visible,
  session,
  filterFrom,
  filterTo,
  compoundSlugs,
  selectedCompounds,
  onSessionChange,
  onFromChange,
  onToChange,
  onCompoundsChange,
  onClear,
  onClose,
}: {
  visible: boolean;
  session: PhotoSession | 'all';
  filterFrom: string | undefined;
  filterTo: string | undefined;
  compoundSlugs: string[];
  selectedCompounds: string[];
  onSessionChange: (s: PhotoSession | 'all') => void;
  onFromChange: (v: string | undefined) => void;
  onToChange: (v: string | undefined) => void;
  onCompoundsChange: (slugs: string[]) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const theme = useTheme();

  const toggleCompound = (slug: string) => {
    onCompoundsChange(
      selectedCompounds.includes(slug)
        ? selectedCompounds.filter((s) => s !== slug)
        : [...selectedCompounds, slug],
    );
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={filterStyles.backdrop}>
        <SafeAreaView edges={['bottom']} style={[filterStyles.sheet, { backgroundColor: theme.surfaceRaised, borderColor: theme.border }]}>
          <View style={filterStyles.header}>
            <EngravedLabel>{t('photos.filterTitle')}</EngravedLabel>
            <TextButton label={t('photos.filterClear')} onPress={onClear} />
          </View>

          <EngravedLabel>{t('photos.filterSession')}</EngravedLabel>
          <View style={filterStyles.chips}>
            {(['all', 'face', 'body'] as const).map((s) => (
              <OptionChip
                key={s}
                label={s === 'all' ? t('photos.filterAll') : t(s === 'face' ? 'photos.sessionFace' : 'photos.sessionBody')}
                selected={session === s}
                onPress={() => onSessionChange(s)}
              />
            ))}
          </View>

          {compoundSlugs.length > 0 && (
            <>
              <EngravedLabel>{t('photos.filterCompound')}</EngravedLabel>
              <View style={filterStyles.chips}>
                {compoundSlugs.map((slug) => (
                  <OptionChip
                    key={slug}
                    label={compoundBySlug(slug)?.canonicalName ?? slug}
                    selected={selectedCompounds.includes(slug)}
                    onPress={() => toggleCompound(slug)}
                  />
                ))}
              </View>
            </>
          )}

          <EngravedLabel>{t('photos.filterFrom')}</EngravedLabel>
          <DatePicker value={filterFrom} onChange={onFromChange} />

          <EngravedLabel>{t('photos.filterTo')}</EngravedLabel>
          <DatePicker value={filterTo} onChange={onToChange} />

          <PrimaryButton label={t('common.done')} onPress={onClose} />
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const filterStyles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: {
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.three,
    gap: Spacing.two,
    paddingBottom: Spacing.four,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
});

// ─── Photo History screen ────────────────────────────────────────────────────

export function PhotoHistoryScreen({ onClose }: { onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const { photos, doseEvents, protocolItems } = useStore();

  const [filterSession, setFilterSession] = useState<PhotoSession | 'all'>('all');
  const [filterCompounds, setFilterCompounds] = useState<string[]>([]);
  const [filterFrom, setFilterFrom] = useState<string | undefined>();
  const [filterTo, setFilterTo] = useState<string | undefined>();
  const [filterOpen, setFilterOpen] = useState(false);
  const [editingPhoto, setEditingPhoto] = useState<{ photo: PhotoEntry; derived: string[] } | null>(null);

  const allCompoundSlugs = useMemo(
    () => [...new Set(protocolItems.map((p) => p.compoundSlug).filter((s): s is string => !!s))],
    [protocolItems],
  );

  const photosWithTags = useMemo(
    () =>
      photos.map((p) => ({
        photo: p,
        derived: derivePhotoTags(p, doseEvents, protocolItems),
      })),
    [photos, doseEvents, protocolItems],
  );

  const resolvedUris = useResolvedUris(photos);

  const filtered = useMemo(() => {
    return photosWithTags.filter(({ photo }) => {
      if (filterSession !== 'all' && photo.session !== filterSession) return false;
      if (filterCompounds.length > 0) {
        const tags = photo.customTags ?? derivePhotoTags(photo, doseEvents, protocolItems);
        const hasCompound = filterCompounds.some((slug) => {
          const name = compoundBySlug(slug)?.canonicalName ?? slug;
          return tags.includes(name);
        });
        if (!hasCompound) return false;
      }
      if (filterFrom && localDateKey(new Date(photo.takenAt)) < filterFrom) return false;
      if (filterTo && localDateKey(new Date(photo.takenAt)) > filterTo) return false;
      return true;
    });
  }, [photosWithTags, filterSession, filterCompounds, filterFrom, filterTo, doseEvents, protocolItems]);

  const byMonth = useMemo(() => {
    const groups: { key: string; label: string; items: typeof filtered }[] = [];
    const map = new Map<string, typeof filtered>();
    for (const item of [...filtered].sort((a, b) => b.photo.takenAt.localeCompare(a.photo.takenAt))) {
      const key = item.photo.takenAt.slice(0, 7);
      if (!map.has(key)) {
        map.set(key, []);
        groups.push({ key, label: formatMonthLabel(key, i18n.language), items: map.get(key)! });
      }
      map.get(key)!.push(item);
    }
    return groups;
  }, [filtered, i18n.language]);

  const hasFilters = filterSession !== 'all' || filterCompounds.length > 0 || !!filterFrom || !!filterTo;
  const clearFilters = () => {
    setFilterSession('all');
    setFilterCompounds([]);
    setFilterFrom(undefined);
    setFilterTo(undefined);
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <OverlayHeader title={t('photos.historyTitle')} onClose={onClose} />
        <View style={styles.toolbar}>
          <Pressable
            accessibilityRole="button"
            onPress={() => setFilterOpen(true)}
            style={[styles.filterBtn, { backgroundColor: hasFilters ? theme.accent : theme.surfaceSunken, borderColor: theme.border }]}>
            <ThemedText type="monoSm" themeColor={hasFilters ? 'onAccent' : 'textSecondary'}>
              {t('photos.filterBtn').toUpperCase()}
            </ThemedText>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {byMonth.length === 0 ? (
            <Placeholder label={filtered.length === 0 && photos.length > 0 ? t('photos.filterEmpty') : t('photos.empty')} height={100} />
          ) : (
            byMonth.map(({ key, label, items }) => (
              <View key={key} style={styles.monthGroup}>
                <EngravedLabel>{label}</EngravedLabel>
                <View style={styles.photoGrid}>
                  {items.map(({ photo, derived }) => {
                    const displayTags = (photo.customTags ?? derived).map((tag) =>
                      tag.startsWith('__WEEK__')
                        ? t('photos.tagWeek', { week: tag.slice(8) })
                        : tag,
                    );
                    return (
                      <View key={photo.id} style={styles.photoCell}>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={t('photos.editTags')}
                          onPress={() => setEditingPhoto({ photo, derived })}
                          style={[styles.thumb, { borderColor: theme.border }]}>
                          <Image source={{ uri: resolvedUris[photo.id] ?? photo.uri }} style={styles.thumbImg} contentFit="cover" />
                          <View style={[styles.sessionBadge, { backgroundColor: 'rgba(0,0,0,0.45)' }]}>
                            <ThemedText type="monoSm" style={styles.sessionText}>
                              {photo.session === 'face' ? t('photos.sessionFace') : t('photos.sessionBody')}
                            </ThemedText>
                          </View>
                        </Pressable>
                        <ThemedText type="monoSm" themeColor="textMuted" style={styles.dateLabel}>
                          {new Date(photo.takenAt).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short' })}
                        </ThemedText>
                        {displayTags.length > 0 && (
                          <View style={styles.tags}>
                            {displayTags.map((tag, i) => (
                              <View key={i} style={[styles.tag, { backgroundColor: theme.surfaceSunken, borderColor: theme.border }]}>
                                <ThemedText type="monoSm" themeColor="textSecondary">{tag}</ThemedText>
                              </View>
                            ))}
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>
              </View>
            ))
          )}
        </ScrollView>
      </SafeAreaView>

      <FilterModal
        visible={filterOpen}
        session={filterSession}
        filterFrom={filterFrom}
        filterTo={filterTo}
        compoundSlugs={allCompoundSlugs}
        selectedCompounds={filterCompounds}
        onSessionChange={setFilterSession}
        onFromChange={setFilterFrom}
        onToChange={setFilterTo}
        onCompoundsChange={setFilterCompounds}
        onClear={clearFilters}
        onClose={() => setFilterOpen(false)}
      />

      {editingPhoto && (
        <TagEditorModal
          photo={editingPhoto.photo}
          derivedTags={editingPhoto.derived}
          visible
          onClose={() => setEditingPhoto(null)}
        />
      )}
    </ThemedView>
  );
}

const THUMB_SIZE = 108;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  safe: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  toolbar: { flexDirection: 'row', justifyContent: 'flex-end', paddingVertical: Spacing.two },
  filterBtn: {
    borderRadius: Radii.chamfer,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
  },
  scroll: { gap: Spacing.four, paddingBottom: Spacing.six },
  monthGroup: { gap: Spacing.two },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  photoCell: { gap: Spacing.half, width: THUMB_SIZE },
  thumb: {
    width: THUMB_SIZE,
    height: Math.floor(THUMB_SIZE * (4 / 3)),
    borderRadius: Radii.chamfer,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  thumbImg: { flex: 1 },
  sessionBadge: { position: 'absolute', top: Spacing.one, left: Spacing.one, borderRadius: 2, paddingHorizontal: 3, paddingVertical: 1 },
  sessionText: { color: 'rgba(240,239,236,0.85)', fontSize: 9 },
  dateLabel: {},
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.half },
  tag: {
    borderRadius: Radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.one,
    paddingVertical: 1,
  },
});
