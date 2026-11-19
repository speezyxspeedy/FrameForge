import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  FieldValue,
  FieldValuesMap,
  NavigationView,
  OperationLogEntry,
  ProtocolField,
  ProtocolSchema,
  ProtocolTemplate,
  RoundTripResult,
} from './types/protocol';
import { PROTOCOL_TEMPLATES } from './data/protocolTemplates';
import { bytesToHexString, encodePacket } from './engine/binaryWriter';
import { decodePacket } from './engine/binaryReader';
import { coerceBytesValue } from './engine/fieldEncoder';
import { runRoundTripValidation } from './engine/packetValidator';
import { setByteInBytes, toggleBitInBytes } from './engine/bitVisualizer';
import { formatTimestampNow } from './utilities/formatters';
import { Sidebar } from './components/Layout/Sidebar';
import { TopToolbar } from './components/Layout/TopToolbar';
import { WorkspaceView } from './components/Workspace/WorkspaceView';
import { PacketBuilderView } from './components/PacketBuilder/PacketBuilderView';
import { HexInspectorView } from './components/HexInspector/HexInspectorView';
import { DecoderView } from './components/Decoder/DecoderView';
import { ChecksumLabView } from './components/ChecksumLab/ChecksumLabView';
import { TemplatesView } from './components/Templates/TemplatesView';
import { DocumentationView } from './components/Documentation/DocumentationView';
import { ImportExportModal } from './components/Modals/ImportExportModal';
import { HelpModal } from './components/Modals/HelpModal';

const CUSTOM_TEMPLATES_STORAGE_KEY = 'frameforge_custom_templates_v1';

function loadSavedTemplates(): ProtocolTemplate[] {
  try {
    const raw = localStorage.getItem(CUSTOM_TEMPLATES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default function App() {
  const initialTemplate = PROTOCOL_TEMPLATES[0];

  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [activeView, setActiveView] = useState<NavigationView>('workspace');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const [schema, setSchema] = useState<ProtocolSchema>(() =>
    structuredClone(initialTemplate.schema)
  );
  const [fieldValues, setFieldValues] = useState<FieldValuesMap>(() => ({
    ...initialTemplate.sampleValues,
  }));

  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(
    initialTemplate.schema.fields[0]?.id ?? null
  );
  const [selectedByteOffset, setSelectedByteOffset] = useState<number | null>(0);

  // Manual byte buffer override when user edits bytes/bits directly or imports a .bin/.hex file
  const [manualBytes, setManualBytes] = useState<Uint8Array | null>(null);

  // Decoder input hex text
  const [decoderHexInput, setDecoderHexInput] = useState<string>(() => {
    const init = encodePacket(initialTemplate.schema, initialTemplate.sampleValues);
    return init.hexString;
  });

  const [roundTripResult, setRoundTripResult] = useState<RoundTripResult | null>(() =>
    runRoundTripValidation(initialTemplate.schema, initialTemplate.sampleValues)
  );

  const [customTemplates, setCustomTemplates] = useState<ProtocolTemplate[]>(() =>
    loadSavedTemplates()
  );

  const [ioModalMode, setIoModalMode] = useState<'import' | 'export' | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);

  const [operationLog, setOperationLog] = useState<OperationLogEntry[]>(() => [
    {
      id: 'init-1',
      timestamp: formatTimestampNow(),
      level: 'success',
      category: 'schema',
      message: `Loaded template "${initialTemplate.name}" (${initialTemplate.schema.fields.length} fields, ${initialTemplate.schema.endianness}-endian).`,
    },
  ]);

  const appendLog = useCallback(
    (
      level: OperationLogEntry['level'],
      category: OperationLogEntry['category'],
      message: string
    ) => {
      setOperationLog((prev) => [
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          timestamp: formatTimestampNow(),
          level,
          category,
          message,
        },
        ...prev.slice(0, 79),
      ]);
    },
    []
  );

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  useEffect(() => {
    try {
      localStorage.setItem(CUSTOM_TEMPLATES_STORAGE_KEY, JSON.stringify(customTemplates));
    } catch {
      // Ignore storage quota errors
    }
  }, [customTemplates]);

  // Real-time binary encoding from schema + live field values
  const encodedPacket = useMemo(
    () => encodePacket(schema, fieldValues),
    [schema, fieldValues]
  );

  // Active bytes inspected in Hex Inspector / Workspace (manual override or encoded output)
  const activeBytes = manualBytes ?? encodedPacket.bytes;

  // Real-time decoding of activeBytes against schema
  const decodedPacket = useMemo(
    () =>
      decodePacket(schema, activeBytes, {
        strictMode: Boolean(schema.strictDecoding),
      }),
    [schema, activeBytes]
  );

  const handleUpdateSchema = useCallback(
    (nextSchema: ProtocolSchema) => {
      setSchema(nextSchema);
      setManualBytes(null);
      setRoundTripResult(null);
    },
    []
  );

  const handleUpdateFieldValue = useCallback(
    (fieldName: string, value: FieldValue) => {
      setManualBytes(null);
      setFieldValues((prev) => {
        const next: FieldValuesMap = { ...prev, [fieldName]: value };
        // If this field is a bytes array using field_ref, keep its referenced length field in sync when input is valid hex
        const targetField = schema.fields.find((f) => f.name === fieldName);
        if (
          targetField?.type === 'bytes' &&
          targetField.bytesLengthMode === 'field_ref' &&
          targetField.lengthFieldName
        ) {
          const parsed = coerceBytesValue(value);
          if (parsed.ok) {
            next[targetField.lengthFieldName] = parsed.bytes.length;
          }
        }
        return next;
      });
    },
    [schema.fields]
  );

  const handleUpdateFieldConfig = useCallback(
    (updated: ProtocolField) => {
      setManualBytes(null);
      setSchema((prev) => {
        const oldField = prev.fields.find((f) => f.id === updated.id);
        if (oldField && oldField.name !== updated.name) {
          setFieldValues((prevVals) => {
            const nextVals = { ...prevVals };
            if (prevVals[oldField.name] !== undefined) {
              nextVals[updated.name] = prevVals[oldField.name];
              delete nextVals[oldField.name];
            }
            return nextVals;
          });
        }
        return {
          ...prev,
          fields: prev.fields.map((f) => (f.id === updated.id ? updated : f)),
        };
      });
      setRoundTripResult(null);
    },
    []
  );

  const handleAddField = useCallback(() => {
    setManualBytes(null);
    const baseIndex = schema.fields.length + 1;
    let candidateName = `field_${baseIndex}`;
    const existingNames = new Set(schema.fields.map((f) => f.name));
    let suffix = baseIndex;
    while (existingNames.has(candidateName)) {
      suffix++;
      candidateName = `field_${suffix}`;
    }

    const newField: ProtocolField = {
      id: `f-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: candidateName,
      type: 'uint16',
      defaultValue: 0,
      description: '',
      required: true,
      color: ['#06B6D4', '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899'][
        schema.fields.length % 6
      ],
    };

    setSchema((prev) => ({
      ...prev,
      fields: [...prev.fields, newField],
    }));
    setFieldValues((prev) => ({ ...prev, [newField.name]: newField.defaultValue }));
    setSelectedFieldId(newField.id);
    setRoundTripResult(null);
    appendLog('info', 'schema', `Added field "${newField.name}" (${newField.type}).`);
  }, [schema.fields, appendLog]);

  const handleDuplicateField = useCallback(
    (fieldId: string) => {
      const target = schema.fields.find((f) => f.id === fieldId);
      if (!target) return;
      setManualBytes(null);
      const existingNames = new Set(schema.fields.map((f) => f.name));
      let copyName = `${target.name}_copy`;
      let counter = 2;
      while (existingNames.has(copyName)) {
        copyName = `${target.name}_copy_${counter++}`;
      }
      const clone: ProtocolField = {
        ...structuredClone(target),
        id: `f-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: copyName,
        bitOffset:
          target.type === 'bitfield'
            ? (target.bitOffset ?? 0) + (target.bitWidth ?? 1)
            : target.bitOffset,
      };
      const idx = schema.fields.findIndex((f) => f.id === fieldId);
      setSchema((prev) => {
        const nextFields = [...prev.fields];
        nextFields.splice(idx + 1, 0, clone);
        return { ...prev, fields: nextFields };
      });
      setFieldValues((prev) => ({
        ...prev,
        [clone.name]: prev[target.name] ?? clone.defaultValue,
      }));
      setSelectedFieldId(clone.id);
      setRoundTripResult(null);
      appendLog('info', 'schema', `Duplicated field "${target.name}" as "${clone.name}".`);
    },
    [schema.fields, appendLog]
  );

  const handleRemoveField = useCallback(
    (fieldId: string) => {
      const target = schema.fields.find((f) => f.id === fieldId);
      if (!target) return;
      setManualBytes(null);
      setSchema((prev) => ({
        ...prev,
        fields: prev.fields.filter((f) => f.id !== fieldId),
      }));
      setFieldValues((prev) => {
        const next = { ...prev };
        delete next[target.name];
        return next;
      });
      if (selectedFieldId === fieldId) {
        setSelectedFieldId(null);
      }
      setRoundTripResult(null);
      appendLog('info', 'schema', `Removed field "${target.name}".`);
    },
    [schema.fields, selectedFieldId, appendLog]
  );

  const handleReorderField = useCallback(
    (fieldId: string, direction: 'up' | 'down') => {
      setManualBytes(null);
      setSchema((prev) => {
        const idx = prev.fields.findIndex((f) => f.id === fieldId);
        if (idx === -1) return prev;
        const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
        if (swapIdx < 0 || swapIdx >= prev.fields.length) return prev;
        const next = [...prev.fields];
        const [moved] = next.splice(idx, 1);
        next.splice(swapIdx, 0, moved);
        return { ...prev, fields: next };
      });
      setRoundTripResult(null);
    },
    []
  );

  const handleRunRoundTrip = useCallback(() => {
    const rt = runRoundTripValidation(schema, fieldValues);
    setRoundTripResult(rt);
    appendLog(
      rt.success ? 'success' : 'error',
      'roundtrip',
      rt.summary
    );
  }, [schema, fieldValues, appendLog]);

  const handleEditByte = useCallback(
    (offset: number, newValue: number) => {
      if (offset < 0 || offset >= activeBytes.length) return;
      const updated = setByteInBytes(activeBytes, offset, newValue);
      setManualBytes(updated);
      setDecoderHexInput(bytesToHexString(updated));
      appendLog(
        'info',
        'edit',
        `Modified byte at offset 0x${offset.toString(16).toUpperCase()} to 0x${newValue.toString(16).toUpperCase().padStart(2, '0')}.`
      );
    },
    [activeBytes, appendLog]
  );

  const handleToggleBit = useCallback(
    (byteOffset: number, bitIndex: number) => {
      if (byteOffset < 0 || byteOffset >= activeBytes.length) return;
      const updated = toggleBitInBytes(activeBytes, byteOffset, bitIndex);
      setManualBytes(updated);
      setDecoderHexInput(bytesToHexString(updated));
      appendLog(
        'info',
        'edit',
        `Toggled bit ${bitIndex} at offset 0x${byteOffset.toString(16).toUpperCase()} -> 0x${updated[byteOffset].toString(16).toUpperCase().padStart(2, '0')}.`
      );
    },
    [activeBytes, appendLog]
  );

  const handleResetManualEdits = useCallback(() => {
    setManualBytes(null);
    setDecoderHexInput(encodedPacket.hexString);
    appendLog('info', 'edit', 'Reverted manual byte edits back to live encoded packet.');
  }, [encodedPacket.hexString, appendLog]);

  const handleLoadTemplate = useCallback(
    (tpl: ProtocolTemplate) => {
      const clonedSchema = structuredClone(tpl.schema);
      const clonedValues = { ...tpl.sampleValues };
      setSchema(clonedSchema);
      setFieldValues(clonedValues);
      setManualBytes(null);
      setSelectedFieldId(clonedSchema.fields[0]?.id ?? null);
      setSelectedByteOffset(0);
      const enc = encodePacket(clonedSchema, clonedValues);
      setDecoderHexInput(enc.hexString);
      setRoundTripResult(runRoundTripValidation(clonedSchema, clonedValues));
      setActiveView('builder');
      appendLog(
        'success',
        'schema',
        `Loaded template "${tpl.name}" (${enc.byteLength} encoded bytes).`
      );
    },
    [appendLog]
  );

  const handleSaveCustomTemplate = useCallback(
    (name: string, summary: string) => {
      const newTpl: ProtocolTemplate = {
        id: `custom-${Date.now()}`,
        name,
        category: 'Custom Saved',
        summary,
        builtIn: false,
        schema: {
          ...structuredClone(schema),
          name,
          description: summary,
          updatedAt: new Date().toISOString(),
        },
        sampleValues: { ...fieldValues },
      };
      setCustomTemplates((prev) => [newTpl, ...prev]);
      appendLog('success', 'schema', `Saved custom template "${name}".`);
    },
    [schema, fieldValues, appendLog]
  );

  const handleDeleteCustomTemplate = useCallback(
    (templateId: string) => {
      setCustomTemplates((prev) => prev.filter((t) => t.id !== templateId));
      appendLog('info', 'schema', 'Deleted custom saved template.');
    },
    [appendLog]
  );

  const handleCreateBlankSchema = useCallback(() => {
    const blank: ProtocolSchema = {
      id: `schema-${Date.now()}`,
      version: 1,
      name: 'Untitled Binary Protocol',
      description: 'Custom binary packet schema',
      endianness: 'big',
      strictDecoding: true,
      fields: [],
    };
    setSchema(blank);
    setFieldValues({});
    setManualBytes(null);
    setSelectedFieldId(null);
    setSelectedByteOffset(null);
    setDecoderHexInput('');
    setRoundTripResult(null);
    setActiveView('builder');
    appendLog('info', 'schema', 'Created a new blank protocol schema.');
  }, [appendLog]);

  const handleImportSchema = useCallback(
    (imported: ProtocolSchema, sampleVals?: FieldValuesMap) => {
      const nextValues: FieldValuesMap = {};
      for (const f of imported.fields) {
        nextValues[f.name] =
          sampleVals && sampleVals[f.name] !== undefined
            ? sampleVals[f.name]
            : f.defaultValue;
      }
      setSchema(imported);
      setFieldValues(nextValues);
      setManualBytes(null);
      setSelectedFieldId(imported.fields[0]?.id ?? null);
      setSelectedByteOffset(0);
      const enc = encodePacket(imported, nextValues);
      setDecoderHexInput(enc.hexString);
      setRoundTripResult(runRoundTripValidation(imported, nextValues));
      setActiveView('builder');
    },
    []
  );

  const handleImportBinary = useCallback(
    (bytes: Uint8Array, sourceName: string) => {
      setManualBytes(bytes);
      setSelectedByteOffset(bytes.length > 0 ? 0 : null);
      setDecoderHexInput(bytesToHexString(bytes));
      setActiveView('hex');
      appendLog('success', 'io', `Loaded ${bytes.length} bytes from "${sourceName}".`);
    },
    [appendLog]
  );

  const handleSendBytesToInspector = useCallback(
    (bytes: Uint8Array) => {
      setManualBytes(bytes);
      setSelectedByteOffset(bytes.length > 0 ? 0 : null);
      setActiveView('hex');
    },
    []
  );

  const totalErrors = encodedPacket.errors.length + decodedPacket.errors.length;

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-slate-50 dark:bg-[#0B0F17] text-slate-900 dark:text-slate-100">
      <TopToolbar
        workspaceName={schema.name}
        onRenameWorkspace={(name) => setSchema((prev) => ({ ...prev, name }))}
        onOpenImport={() => setIoModalMode('import')}
        onOpenExport={() => setIoModalMode('export')}
        theme={theme}
        onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
        onOpenHelp={() => setHelpOpen(true)}
        onOpenMobileNav={() => setMobileNavOpen(true)}
      />

      <div className="flex-1 min-h-0 flex overflow-hidden">
        <Sidebar
          activeView={activeView}
          onSelectView={setActiveView}
          fieldCount={schema.fields.length}
          packetByteLength={activeBytes.length}
          errorCount={totalErrors}
          mobileOpen={mobileNavOpen}
          onCloseMobile={() => setMobileNavOpen(false)}
        />

        <main className="flex-1 min-w-0 min-h-0 overflow-hidden">
          {activeView === 'workspace' && (
            <WorkspaceView
              schema={schema}
              fieldValues={fieldValues}
              encodedPacket={encodedPacket}
              activeBytes={activeBytes}
              hasManualEdits={manualBytes !== null}
              decodedPacket={decodedPacket}
              roundTripResult={roundTripResult}
              operationLog={operationLog}
              selectedFieldId={selectedFieldId}
              selectedByteOffset={selectedByteOffset}
              onSelectField={setSelectedFieldId}
              onSelectByte={setSelectedByteOffset}
              onUpdateSchema={handleUpdateSchema}
              onUpdateFieldValue={handleUpdateFieldValue}
              onUpdateFieldConfig={handleUpdateFieldConfig}
              onAddField={handleAddField}
              onRunRoundTrip={handleRunRoundTrip}
              onToggleBit={handleToggleBit}
              onResetManualEdits={handleResetManualEdits}
              onNavigate={setActiveView}
            />
          )}

          {activeView === 'builder' && (
            <PacketBuilderView
              schema={schema}
              fieldValues={fieldValues}
              encodedPacket={encodedPacket}
              roundTripResult={roundTripResult}
              selectedFieldId={selectedFieldId}
              selectedByteOffset={selectedByteOffset}
              onSelectField={setSelectedFieldId}
              onSelectByte={setSelectedByteOffset}
              onUpdateSchema={handleUpdateSchema}
              onUpdateFieldValue={handleUpdateFieldValue}
              onRunRoundTrip={handleRunRoundTrip}
              onAddField={handleAddField}
              onDuplicateField={handleDuplicateField}
              onRemoveField={handleRemoveField}
              onReorderField={handleReorderField}
              onUpdateFieldConfig={handleUpdateFieldConfig}
            />
          )}

          {activeView === 'hex' && (
            <HexInspectorView
              bytes={activeBytes}
              hasManualEdits={manualBytes !== null}
              fieldMappings={
                decodedPacket.fieldMappings.length > 0
                  ? decodedPacket.fieldMappings
                  : encodedPacket.fieldMappings
              }
              bitRanges={
                decodedPacket.bitRanges.length > 0
                  ? decodedPacket.bitRanges
                  : encodedPacket.bitRanges
              }
              decodedPacket={decodedPacket}
              selectedByteOffset={selectedByteOffset}
              onSelectByte={setSelectedByteOffset}
              onEditByte={handleEditByte}
              onToggleBit={handleToggleBit}
              onResetManualEdits={handleResetManualEdits}
            />
          )}

          {activeView === 'decoder' && (
            <DecoderView
              schema={schema}
              encodedPacket={encodedPacket}
              hexInput={decoderHexInput}
              onChangeHexInput={setDecoderHexInput}
              onSendBytesToInspector={handleSendBytesToInspector}
            />
          )}

          {activeView === 'checksum' && (
            <ChecksumLabView
              activeBytes={activeBytes}
              onLog={(level, msg) => appendLog(level, 'checksum', msg)}
            />
          )}

          {activeView === 'templates' && (
            <TemplatesView
              builtInTemplates={PROTOCOL_TEMPLATES}
              customTemplates={customTemplates}
              activeSchema={schema}
              activeFieldValues={fieldValues}
              onLoadTemplate={handleLoadTemplate}
              onSaveCustomTemplate={handleSaveCustomTemplate}
              onDeleteCustomTemplate={handleDeleteCustomTemplate}
              onCreateBlankSchema={handleCreateBlankSchema}
              onOpenImportModal={() => setIoModalMode('import')}
            />
          )}

          {activeView === 'docs' && (
            <DocumentationView onNavigate={setActiveView} />
          )}
        </main>
      </div>

      <ImportExportModal
        mode={ioModalMode}
        onClose={() => setIoModalMode(null)}
        schema={schema}
        fieldValues={fieldValues}
        encodedPacket={encodedPacket}
        activeBytes={activeBytes}
        decodedPacket={decodedPacket}
        onImportSchema={handleImportSchema}
        onImportBinary={handleImportBinary}
        onLog={(level, msg) => appendLog(level, 'io', msg)}
      />

      <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  );
}
