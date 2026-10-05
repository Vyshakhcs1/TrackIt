import {
  CheckCircle2,
  ChevronDown,
  Clock3,
  CloudOff,
  Edit3,
  FileText,
  Minus,
  Plus,
  Scale,
  Trash2,
  X,
} from 'lucide-react-native';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppHeader } from '../../../../shared/components/AppHeader/AppHeader';
import { PrimaryButton } from '../../../../shared/components/PrimaryButton/PrimaryButton';
import { useLogMetricViewModel } from '../hooks/useLogMetricViewModel';

function MetricInput({
  label,
  icon,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  trailing,
}: {
  label: string;
  icon: React.ReactNode;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'numeric' | 'decimal-pad';
  trailing?: React.ReactNode;
}) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{label.toUpperCase()}</Text>
      <View style={styles.fieldShell}>
        {icon}
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={palette.outline}
          keyboardType={keyboardType}
          style={styles.fieldInput}
          selectionColor={palette.green}
        />
        {trailing}
      </View>
    </View>
  );
}

const palette = {
  background: '#F8F9FF',
  surface: '#FFFFFF',
  surfaceLow: '#EFF4FF',
  surfaceContainer: '#E5EEFF',
  surfaceHigh: '#DCE9FF',
  text: '#0B1C30',
  muted: '#45464D',
  outline: '#76777D',
  primary: '#000000',
  green: '#006C4A',
  blue: '#188ACE',
  red: '#BA1A1A',
};

export function LogMetricScreen() {
  const viewModel = useLogMetricViewModel();

  if (!viewModel.canRender) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <AppHeader headerSubtitle="Log Metric" />
        <View style={styles.loadingState}>
          {viewModel.status === 'failed' ? (
            <Text style={styles.loadingError}>{viewModel.error}</Text>
          ) : (
            <ActivityIndicator color={palette.green} />
          )}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <AppHeader headerSubtitle="Log Metric" />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.statusBanner}>
          <View style={styles.statusCopy}>
                <Scale size={20} color={palette.green} />
            <Text style={styles.statusTitle}>Body Composition Hub</Text>
          </View>
        </View>

        <View style={styles.formCard}>
          <View style={styles.metricTabs}>
            {viewModel.metricTabs.map(metric => {
              const selected = metric === viewModel.activeMetric;
              return (
                <Pressable
                  key={metric}
                  accessibilityRole="tab"
                  accessibilityState={{ selected }}
                  onPress={() => viewModel.setActiveMetric(metric)}
                  style={[styles.metricTab, selected && styles.metricTabSelected]}
                >
                  <Text style={[styles.metricTabText, selected && styles.metricTabTextSelected]}>
                    {metric}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {viewModel.activeMetric === 'Weight' ? (
            <>
              <View style={styles.valuePanel}>
                <View style={styles.unitSwitch}>
                  {(['kg', 'lbs'] as const).map(weightUnit => (
                    <Pressable
                      key={weightUnit}
                      onPress={() => viewModel.setUnit(weightUnit)}
                      style={[styles.unitOption, viewModel.unit === weightUnit && styles.unitOptionSelected]}
                    >
                      <Text style={[styles.unitOptionText, viewModel.unit === weightUnit && styles.unitOptionTextSelected]}>
                        {weightUnit}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                <View style={styles.stepperRow}>
                  <Pressable
                    accessibilityLabel="Decrease weight by 0.1"
                    onPress={() => viewModel.adjustWeight(-0.1)}
                    style={styles.stepperButton}
                  >
                    <Minus size={22} color={palette.text} />
                  </Pressable>
                  <View style={styles.measurementDisplay}>
                    <Text style={styles.measurementValue}>{viewModel.draftValue}</Text>
                    <Text style={styles.targetLabel}>Target: {viewModel.targetValue} {viewModel.unit}</Text>
                  </View>
                  <Pressable
                    accessibilityLabel="Increase weight by 0.1"
                    onPress={() => viewModel.adjustWeight(0.1)}
                    style={styles.stepperButton}
                  >
                    <Plus size={22} color={palette.text} />
                  </Pressable>
                </View>
              </View>

              <MetricInput
                label="Optional Note"
                icon={<FileText size={19} color={palette.muted} />}
                value={viewModel.note}
                onChangeText={viewModel.setNote}
                placeholder="e.g. Post-morning run, fasted"
              />

              <PrimaryButton
                title={viewModel.saved ? 'Saved!' : 'Save Measurement'}
                trailingSymbol={viewModel.saved ? '✓' : '+'}
                onPress={viewModel.saveMeasurement}
              />
            </>
          ) : (
            <View style={styles.comingSoon}>
              <View style={styles.comingSoonIcon}>
                <Clock3 size={22} color={palette.green} />
              </View>
              <Text style={styles.comingSoonTitle}>{viewModel.activeMetric}</Text>
              <Text style={styles.comingSoonText}>Coming soon</Text>
            </View>
          )}
        </View>

        {viewModel.activeMetric === 'Weight' ? <View style={styles.historySection}>
          <View style={styles.historyHeading}>
            <View style={styles.historyTitleGroup}>
              <Text style={styles.historyTitle}>Historical Measurements</Text>
              <Text style={styles.entryCount}>{viewModel.records.length}</Text>
            </View>
            <Pressable style={styles.filterButton}>
              <ChevronDown size={15} color={palette.muted} />
              <Text style={styles.filterText}>Filter</Text>
            </Pressable>
          </View>

          <View style={styles.recordsList}>
            {viewModel.records.map(record => (
              <View key={record.id} style={styles.recordCard}>
                <View style={[styles.recordAccent, { backgroundColor: record.synced ? palette.green : palette.blue }]} />
                <View style={styles.recordTopRow}>
                  <View style={styles.recordCopy}>
                    <View style={styles.recordValueRow}>
                      <Text style={styles.recordValue}>{record.value}</Text>
                      <Text style={styles.recordUnit}>{record.unit}</Text>
                      <View style={[styles.recordStatus, record.synced ? styles.syncedRecord : styles.localRecord]}>
                        {record.synced ? (
                          <CheckCircle2 size={11} color={palette.green} />
                        ) : (
                          <CloudOff size={11} color={palette.red} />
                        )}
                        <Text style={[styles.recordStatusText, { color: record.synced ? palette.green : palette.red }]}>
                          {record.synced ? 'SYNCED' : 'UNSYNCED / LOCAL'}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.recordTimestamp}>{record.timestamp}</Text>
                  </View>
                  <View style={styles.recordActions}>
                    <Pressable
                      accessibilityLabel="Edit record"
                      onPress={() => viewModel.openEdit(record)}
                      style={styles.recordAction}
                    >
                      <Edit3 size={16} color={palette.text} />
                    </Pressable>
                    <Pressable
                      accessibilityLabel="Delete record"
                      onPress={() => viewModel.setDeleting(record)}
                      style={[styles.recordAction, styles.deleteAction]}
                    >
                      <Trash2 size={16} color={palette.red} />
                    </Pressable>
                  </View>
                </View>
                {record.note ? (
                  <View style={styles.recordNote}>
                    <FileText size={14} color={palette.muted} />
                    <Text numberOfLines={1} style={styles.recordNoteText}>{record.note}</Text>
                  </View>
                ) : null}
              </View>
            ))}
          </View>
        </View> : null}
      </ScrollView>

      <Modal
        visible={viewModel.editing !== null}
        transparent
        animationType="slide"
        onRequestClose={viewModel.closeEdit}
      >
        <View style={styles.sheetOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={viewModel.closeEdit} />
          <View style={styles.editSheet}>
            <View style={styles.modalHeading}>
              <View style={styles.modalTitleGroup}>
                <Edit3 size={21} color={palette.primary} />
                <Text style={styles.modalTitle}>Edit Measurement</Text>
              </View>
              <Pressable onPress={viewModel.closeEdit} style={styles.closeButton}>
                <X size={19} color={palette.muted} />
              </Pressable>
            </View>
            <MetricInput
              label={`Weight (${viewModel.editing?.unit ?? 'kg'})`}
              icon={<Scale size={18} color={palette.muted} />}
              value={viewModel.editValue}
              onChangeText={viewModel.setEditValue}
              keyboardType="decimal-pad"
            />
            <MetricInput
              label="Notes"
              icon={<FileText size={18} color={palette.muted} />}
              value={viewModel.editNote}
              onChangeText={viewModel.setEditNote}
              placeholder="Add a note"
            />
            <View style={styles.modalActions}>
              <Pressable onPress={viewModel.closeEdit} style={styles.cancelButton}>
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
              <PrimaryButton title="Confirm Changes" onPress={viewModel.confirmEdit} />
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={viewModel.deleting !== null}
        transparent
        animationType="fade"
        onRequestClose={() => viewModel.setDeleting(null)}
      >
        <View style={styles.deleteOverlay}>
          <View style={styles.deleteDialog}>
            <View style={styles.deleteIcon}>
              <Trash2 size={25} color={palette.red} />
            </View>
            <Text style={styles.deleteTitle}>Delete Measurement?</Text>
            <Text style={styles.deleteMessage}>
              Delete entry for {viewModel.deleting?.timestamp.split(' • ')[0]}? This cannot be undone.
            </Text>
            <View style={styles.modalActions}>
              <Pressable onPress={() => viewModel.setDeleting(null)} style={styles.cancelButton}>
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable onPress={viewModel.confirmDelete} style={styles.confirmDeleteButton}>
                <Text style={styles.confirmDeleteText}>Delete</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F8F9FF' },
  loadingState: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingError: { color: '#BA1A1A', fontFamily: 'Manrope', fontSize: 13 },
  scroll: { flex: 1 },
  content: { gap: 14, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 28 },
  statusBanner: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: '#EFF4FF',
  },
  statusCopy: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusTitle: { color: '#0B1C30', fontFamily: 'Manrope', fontSize: 13, fontWeight: '600' },
  offlineBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, backgroundColor: 'rgba(130,245,193,0.55)' },
  offlineText: { color: '#00714E', fontFamily: 'Manrope', fontSize: 9, fontWeight: '700', letterSpacing: 0.4 },
  formCard: { gap: 14, padding: 14, borderRadius: 12, backgroundColor: '#FFFFFF', elevation: 2, shadowColor: '#0B1C30', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 5 },
  metricTabs: { flexDirection: 'row', gap: 3, padding: 4, borderRadius: 9, backgroundColor: '#E5EEFF' },
  metricTab: { flex: 1, minHeight: 34, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3, borderRadius: 6 },
  metricTabSelected: { backgroundColor: '#FFFFFF', elevation: 2 },
  metricTabText: { color: '#45464D', fontFamily: 'Manrope', fontSize: 11, fontWeight: '500', textAlign: 'center' },
  metricTabTextSelected: { color: '#0B1C30', fontWeight: '700' },
  comingSoon: { minHeight: 190, alignItems: 'center', justifyContent: 'center', gap: 9, padding: 20, borderRadius: 12, backgroundColor: '#EFF4FF' },
  comingSoonIcon: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 23, backgroundColor: '#FFFFFF' },
  comingSoonTitle: { color: '#0B1C30', fontFamily: 'Manrope', fontSize: 17, fontWeight: '700' },
  comingSoonText: { color: '#45464D', fontFamily: 'Manrope', fontSize: 13 },
  valuePanel: { alignItems: 'center', gap: 10, padding: 14, borderRadius: 12, backgroundColor: '#EFF4FF' },
  unitSwitch: { flexDirection: 'row', gap: 2, padding: 2, borderRadius: 16, backgroundColor: '#E5EEFF' },
  unitOption: { minWidth: 48, alignItems: 'center', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 14 },
  unitOptionSelected: { backgroundColor: '#FFFFFF', elevation: 1 },
  unitOptionText: { color: '#45464D', fontFamily: 'Manrope', fontSize: 12, lineHeight: 17 },
  unitOptionTextSelected: { color: '#0B1C30', fontWeight: '700' },
  stepperRow: { width: '100%', maxWidth: 280, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stepperButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: '#FFFFFF', elevation: 2 },
  measurementDisplay: { alignItems: 'center' },
  measurementValue: { color: '#0B1C30', fontFamily: 'SpaceGrotesk', fontSize: 34, fontWeight: '700', lineHeight: 42 },
  targetLabel: { marginTop: 2, color: '#45464D', fontFamily: 'Manrope', fontSize: 10, fontWeight: '700', letterSpacing: 0.4 },
  fieldGroup: { gap: 5 },
  fieldLabel: { color: '#45464D', fontFamily: 'Manrope', fontSize: 10, fontWeight: '700', lineHeight: 14, letterSpacing: 0.6 },
  fieldShell: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 11, borderRadius: 8, backgroundColor: '#EFF4FF' },
  fieldInput: { flex: 1, minWidth: 0, paddingVertical: 8, color: '#0B1C30', fontFamily: 'Manrope', fontSize: 13 },
  nowButton: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 5, backgroundColor: 'rgba(130,245,193,0.45)' },
  nowButtonText: { color: '#006C4A', fontFamily: 'Manrope', fontSize: 11, fontWeight: '700' },
  historySection: { gap: 9 },
  historyHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  historyTitleGroup: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  historyTitle: { color: '#0B1C30', fontFamily: 'Manrope', fontSize: 17, fontWeight: '700' },
  entryCount: { overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12, backgroundColor: '#DCE9FF', color: '#45464D', fontFamily: 'Manrope', fontSize: 10, fontWeight: '700' },
  filterButton: { flexDirection: 'row', alignItems: 'center', gap: 2, padding: 5 },
  filterText: { color: '#45464D', fontFamily: 'Manrope', fontSize: 11, fontWeight: '600' },
  recordsList: { gap: 8 },
  recordCard: { gap: 9, overflow: 'hidden', padding: 13, borderRadius: 12, backgroundColor: '#FFFFFF', elevation: 1, shadowColor: '#0B1C30', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3 },
  recordAccent: { position: 'absolute', top: 0, bottom: 0, left: 0, width: 4 },
  recordTopRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 5, paddingLeft: 3 },
  recordCopy: { flex: 1, minWidth: 0 },
  recordValueRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4 },
  recordValue: { color: '#0B1C30', fontFamily: 'SpaceGrotesk', fontSize: 22, fontWeight: '700' },
  recordUnit: { color: '#45464D', fontFamily: 'Manrope', fontSize: 13, fontWeight: '600' },
  recordStatus: { flexDirection: 'row', alignItems: 'center', gap: 3, marginLeft: 3, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 10 },
  syncedRecord: { backgroundColor: 'rgba(130,245,193,0.4)' },
  localRecord: { backgroundColor: '#FFEEEE' },
  recordStatusText: { fontFamily: 'Manrope', fontSize: 8, fontWeight: '700', letterSpacing: 0.3 },
  recordTimestamp: { marginTop: 3, color: '#45464D', fontFamily: 'Manrope', fontSize: 10, lineHeight: 14 },
  recordActions: { flexDirection: 'row', gap: 5 },
  recordAction: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 7, backgroundColor: '#E5EEFF' },
  deleteAction: { backgroundColor: '#FFF0F0' },
  recordNote: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 6, backgroundColor: '#EFF4FF' },
  recordNoteText: { flex: 1, color: '#45464D', fontFamily: 'Manrope', fontSize: 11 },
  sheetOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(33,49,69,0.48)' },
  editSheet: { gap: 15, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 28, borderTopLeftRadius: 22, borderTopRightRadius: 22, backgroundColor: '#FFFFFF' },
  modalHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
  modalTitleGroup: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  modalTitle: { color: '#0B1C30', fontFamily: 'Manrope', fontSize: 20, fontWeight: '700' },
  closeButton: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 17, backgroundColor: '#E5EEFF' },
  modalActions: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 2 },
  cancelButton: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: '#E5EEFF' },
  cancelText: { color: '#0B1C30', fontFamily: 'Manrope', fontSize: 15, fontWeight: '700' },
  deleteOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, backgroundColor: 'rgba(33,49,69,0.48)' },
  deleteDialog: { width: '100%', gap: 13, alignItems: 'center', padding: 22, borderRadius: 18, backgroundColor: '#FFFFFF', elevation: 12 },
  deleteIcon: { width: 50, height: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 25, backgroundColor: '#FFEEEE' },
  deleteTitle: { color: '#0B1C30', fontFamily: 'Manrope', fontSize: 20, fontWeight: '700', textAlign: 'center' },
  deleteMessage: { color: '#45464D', fontFamily: 'Manrope', fontSize: 13, lineHeight: 19, textAlign: 'center' },
  confirmDeleteButton: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: '#BA1A1A' },
  confirmDeleteText: { color: '#FFFFFF', fontFamily: 'Manrope', fontSize: 14, fontWeight: '700' },
});