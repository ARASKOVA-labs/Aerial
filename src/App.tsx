// ── Aerial desktop app shell ─────────────────────────────────────────────────
// Composes the canvas with the app's features; each feature lives in src/app/.

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import mermaid from 'mermaid';
import './App.css';
import { AerialWordmark } from './AerialLogo';
import { buildCommands } from './app/commands';
import { AgentAccessDialog } from './app/dialogs/AgentAccessDialog';
import { FeedbackDialog } from './app/dialogs/FeedbackDialog';
import { ResetDialog } from './app/dialogs/ResetDialog';
import { SaveFileDialog } from './app/dialogs/SaveFileDialog';
import { StorageLockedDialog } from './app/dialogs/StorageLockedDialog';
import { UnlockFileDialog } from './app/dialogs/UnlockFileDialog';
import { exportPng, exportSvg } from './app/exports';
import { MainMenuContent } from './app/MainMenuContent';
import { MAGIC_LANGS, PanelChoice, TRANSLATE_LANGS, type MagicLanguage } from './app/PanelExtras';
import { useAerialFiles } from './app/useAerialFiles';
import { useAgentBridge } from './app/useAgentBridge';
import { useAppShortcuts } from './app/useAppShortcuts';
import { useBoards, type GridType } from './app/useBoards';
import { useCanvasHandle } from './app/useCanvasHandle';
import { useDiagramEditing } from './app/useDiagramEditing';
import { useImageImport } from './app/useImageImport';
import { usePersistentState } from './app/usePersistentState';
import { useTheme } from './app/useTheme';
import { useToast } from './app/useToast';
import { useTranslateSelection } from './app/useTranslateSelection';
import { AerialCanvas } from './components/AerialCanvas';
import { CommandPaletteModal } from './components/CommandPaletteModal';
import { DiagramStudioModal } from './components/desktop/DiagramStudioModal';
import { KeyboardShortcutsModal } from './components/desktop/KeyboardShortcutsModal';
import { TextTranslatorModal } from './components/desktop/TextTranslatorModal';
import { ensureConsent, setConsentPrompter } from './lib/consent';
import { ConsentDialog } from './app/dialogs/ConsentDialog';
import { getAraskovaMermaidConfig } from './lib/diagram-theme';
import type { AerialCanvasRef, DesktopToolId, ToolId } from './lib/types';
import type { ExtraTool } from './ui/Toolbar';
import { ClipboardIcon, DiagramIcon, FileIcon, HelpIcon, ImageIcon, LaserIcon, MagicPenIcon, TranslateIcon } from './ui/icons';
import { EMPTY_SELECTION, type SelectionInfo } from './ui/model';
import { MenuItem, MOD } from './ui/primitives';

mermaid.initialize({ ...getAraskovaMermaidConfig(true, 'brutalist'), startOnLoad: false, securityLevel: 'strict' });

/**
 * Canvas colours are stored in their light-theme form and inverted for dark
 * mode, so the old dark "paper" presets map back to white. Without this, a
 * board saved with a dark background would turn near-white in dark mode.
 */
const LEGACY_DARK_PAPERS = new Set(['#0a0a0a', '#18181b', '#0f172a', '#0c2a4a', '#121212']);
export function canonicalPaper(color: string | null | undefined): string {
  if (!color) return '#ffffff';
  return LEGACY_DARK_PAPERS.has(color.toLowerCase()) ? '#ffffff' : color;
}

const parseGrid = (raw: string | null): GridType => (raw === 'dots' || raw === 'lines' ? raw : 'blank');

type Dialog = 'reset' | 'feedback' | 'diagram' | 'translator' | 'help' | 'palette' | 'locked' | 'agents' | null;

export default function App() {
  const toast = useToast();
  const [activeTool, setActiveTool] = useState<DesktopToolId>('select');
  const [selection, setSelection] = useState<SelectionInfo>(EMPTY_SELECTION);
  const [magicLanguage, setMagicLanguage] = useState<MagicLanguage>('en');
  const [dialog, setDialog] = useState<Dialog>(null);
  const [consent, setConsent] = useState<{ message: string; resolve: (ok: boolean) => void } | null>(null);
  useEffect(() => {
    setConsentPrompter((_service, message) => new Promise<boolean>((resolve) => setConsent({ message, resolve })));
    return () => setConsentPrompter(null);
  }, []);
  const { isDarkMode, setIsDarkMode, toggleFullscreen } = useTheme();
  const [gridType, setGridType] = usePersistentState<GridType>('aerial_grid', parseGrid);
  const [palmRejection, setPalmRejection] = usePersistentState('aerial_palm_rejection', (raw) => raw !== 'false');
  const [canvasBg, setCanvasBg] = usePersistentState('aerial_canvas_bg', canonicalPaper);

  const { canvasRef, canvasReady, markReady } = useCanvasHandle();

  const applyLook = useCallback(
    (look: { bgColor?: string; gridType?: GridType }) => {
      if (look.bgColor) setCanvasBg(canonicalPaper(look.bgColor));
      if (look.gridType) setGridType(look.gridType);
    },
    [setCanvasBg, setGridType],
  );
  const boards = useBoards(canvasRef, canvasReady, applyLook, { bgColor: canvasBg, gridType });
  const files = useAerialFiles(canvasRef, boards, canvasReady, toast.show);
  const images = useImageImport(canvasRef, toast.show, dialog === 'diagram' || dialog === 'translator');
  const translateSelection = useTranslateSelection(canvasRef, toast.show);
  const onNodeDoubleClick = useDiagramEditing(canvasRef, isDarkMode);
  const agents = useAgentBridge(
    {
      canvas: () => canvasRef.current,
      boards: () => boards.boards.map(({ id, name }) => ({ id, name })),
      activeBoard: () => (boards.activeBoard ? { id: boards.activeBoard.id, name: boards.activeBoard.name } : undefined),
      openBoard: boards.switchBoard,
      createBoard: (name) => boards.createBoard({ name }),
      isDarkMode: () => isDarkMode,
    },
    canvasReady,
  );

  // ── Canvas lifecycle ───────────────────────────────────────────────────────
  const onCanvasReady = useCallback(
    async (api: AerialCanvasRef) => {
      const engine = api.getEngine();
      if (!engine) return;
      window.__aerialBoot?.('board');
      if (!(await boards.hydrate(api))) setDialog('locked');
      engine.set_grid_type(gridType);
      engine.set_dark_mode(isDarkMode);
      engine.set_background_color(canvasBg);
      engine.render();
      markReady();
      // Hold the boot screen until the hand-drawn font is ready (bounded), so
      // the first frame of the welcome screen and text never flashes.
      window.__aerialBoot?.('fonts');
      await Promise.race([
        Promise.all([document.fonts.load('400 20px Kalam'), document.fonts.load('500 14px Inter')]).catch(() => undefined),
        new Promise((resolve) => setTimeout(resolve, 700)),
      ]);
      window.__aerialBoot?.('ready');
    },
    // Runs once per mount; later look changes reach the engine through props.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const changeGrid = useCallback(
    (g: GridType) => {
      setGridType(g);
      boards.setBoardLook({ gridType: g });
      canvasRef.current?.getEngine()?.set_grid_type(g);
      canvasRef.current?.getEngine()?.render();
    },
    [boards, canvasRef, setGridType],
  );

  const changeCanvasBg = useCallback(
    (color: string) => {
      setCanvasBg(color);
      boards.setBoardLook({ bgColor: color });
      canvasRef.current?.setBackgroundColor(color);
    },
    [boards, canvasRef, setCanvasBg],
  );

  const selectTool = useCallback(
    (id: DesktopToolId) => {
      if (id === 'image') return images.openImagePicker();
      if (id === 'pdf') return images.openPdfPicker();
      canvasRef.current?.setTool(id);
      setActiveTool(id);
    },
    [canvasRef, images],
  );

  const doExportPng = useCallback(() => void exportPng(canvasRef, toast.show), [canvasRef, toast.show]);
  const doExportSvg = useCallback(() => void exportSvg(canvasRef, toast.show), [canvasRef, toast.show]);
  const close = useCallback(() => setDialog(null), []);

  useAppShortcuts({
    closeDialogs: () => {
      close();
      files.closeDialogs();
    },
    togglePalette: () => setDialog((d) => (d === 'palette' ? null : 'palette')),
    toggleHelp: () => setDialog((d) => (d === 'help' ? null : 'help')),
    exportPng: doExportPng,
    exportSvg: doExportSvg,
    saveFile: files.requestSave,
    openFile: () => void files.openFile(),
    newBoard: () => void boards.createBoard(),
    openImage: images.openImagePicker,
    openPdf: images.openPdfPicker,
    resetCanvas: () => setDialog('reset'),
    pasteScreenshot: () => void images.pasteFromClipboard(),
    switchToBoard: (i) => boards.boards[i] && void boards.switchBoard(boards.boards[i].id),
    toggleFullscreen,
    zoomToFit: () => canvasRef.current?.zoomToFit(),
  });

  // ── Chrome content ─────────────────────────────────────────────────────────
  const extraTools = useMemo<ExtraTool[]>(
    () => [
      { id: 'laser', label: 'Laser pointer', icon: <LaserIcon />, shortcut: 'K', group: 'Draw', active: activeTool === 'laser_pen', onSelect: () => selectTool('laser_pen') },
      { id: 'magic', label: 'Magic pen — handwriting to text', icon: <MagicPenIcon />, shortcut: 'W', group: 'Draw', active: activeTool === 'magic_pen', onSelect: () => selectTool('magic_pen') },
      { id: 'diagram', label: 'Diagram from text (Mermaid)', icon: <DiagramIcon />, group: 'Generate', onSelect: () => setDialog('diagram') },
      { id: 'translate', label: 'Text translator', icon: <TranslateIcon />, group: 'Generate', onSelect: () => setDialog('translator') },
      { id: 'pdf', label: 'Insert PDF', icon: <FileIcon />, shortcut: `${MOD}⇧O`, group: 'Insert', onSelect: images.openPdfPicker },
      { id: 'paste', label: 'Paste screenshot', icon: <ClipboardIcon />, shortcut: `${MOD}V`, group: 'Insert', onSelect: () => void images.pasteFromClipboard() },
    ],
    [activeTool, selectTool, images],
  );

  const paletteCommands = useMemo(
    () =>
      buildCommands({
        boards: boards.boards,
        activeBoardId: boards.activeBoardId,
        isDarkMode,
        selectTool,
        newBoard: () => void boards.createBoard(),
        switchBoard: (id) => void boards.switchBoard(id),
        openDiagram: () => setDialog('diagram'),
        openTranslator: () => setDialog('translator'),
        openImage: images.openImagePicker,
        openPdf: images.openPdfPicker,
        openFile: () => void files.openFile(),
        exportAerial: files.requestSave,
        pasteScreenshot: () => void images.pasteFromClipboard(),
        exportPng: doExportPng,
        exportSvg: doExportSvg,
        toggleFullscreen,
        toggleTheme: () => setIsDarkMode(!isDarkMode),
        resetCanvas: () => setDialog('reset'),
        showHelp: () => setDialog('help'),
        zoomToFit: () => canvasRef.current?.zoomToFit(),
      }),
    [boards, isDarkMode, selectTool, images, files, doExportPng, doExportSvg, toggleFullscreen, setIsDarkMode, canvasRef],
  );

  const panelExtra = useCallback(
    (tool: ToolId): ReactNode => {
      if (tool === 'magic_pen') return <PanelChoice label="Handwriting language" value={magicLanguage} options={MAGIC_LANGS} onChange={setMagicLanguage} />;
      if (tool === 'select' && selection.count === 1 && selection.kinds[0] === 'Text') {
        return <PanelChoice label="Translate to" options={TRANSLATE_LANGS} onChange={(l) => void translateSelection(l)} />;
      }
      return null;
    },
    [magicLanguage, selection, translateSelection],
  );

  const menu = (closeMenu: () => void) => (
    <MainMenuContent
      close={closeMenu}
      boards={boards}
      actions={{
        openImage: images.openImagePicker,
        openFile: () => void files.openFile(),
        saveFile: files.requestSave,
        exportPng: doExportPng,
        exportSvg: doExportSvg,
        openPalette: () => setDialog('palette'),
        toggleFullscreen,
        showHelp: () => setDialog('help'),
        resetCanvas: () => setDialog('reset'),
        sendFeedback: () => setDialog('feedback'),
        agents: () => setDialog('agents'),
      }}
      agentsEnabled={agents.enabled}
      isDarkMode={isDarkMode}
      onThemeChange={setIsDarkMode}
      canvasBg={canvasBg}
      onCanvasBg={changeCanvasBg}
      gridType={gridType}
      onGridType={changeGrid}
      palmRejection={palmRejection}
      onPalmRejection={setPalmRejection}
    />
  );

  const welcomeItems = (
    <>
      <MenuItem icon={<FileIcon />} label="Open .aerial file" hint={`${MOD}⇧E`} onSelect={() => void files.openFile()} />
      <MenuItem icon={<ImageIcon />} label="Insert image" hint={`${MOD}O`} onSelect={images.openImagePicker} />
      <MenuItem icon={<DiagramIcon />} label="Diagram from text" onSelect={() => setDialog('diagram')} />
      <MenuItem icon={<HelpIcon />} label="Help & shortcuts" hint="?" onSelect={() => setDialog('help')} />
    </>
  );

  return (
    <div className="ae-root fixed inset-0 overflow-hidden select-none" data-theme={isDarkMode ? 'dark' : 'light'}>
      <div className="absolute inset-0 z-0">
        <AerialCanvas
          ref={canvasRef}
          onExternalRequest={(service) => ensureConsent(service, { reask: true })}
          theme={isDarkMode ? 'dark' : 'light'}
          backgroundColor={canvasBg}
          palmRejection={palmRejection}
          magicLanguage={magicLanguage}
          showToolbar
          showWelcome
          menu={menu}
          extraTools={extraTools}
          welcomeItems={welcomeItems}
          logo={<AerialWordmark />}
          onHelp={() => setDialog((d) => (d === 'help' ? null : 'help'))}
          onInsertImage={images.openImagePicker}
          onSelectionChange={setSelection}
          panelExtra={panelExtra}
          onReady={onCanvasReady}
          onToolChange={setActiveTool}
          onNodeDoubleClick={onNodeDoubleClick}
        />
      </div>

      <input {...images.imageInputProps} />
      <input {...images.pdfInputProps} />
      <input {...files.inputProps} />

      {dialog === 'reset' && (
        <ResetDialog
          onClose={close}
          onConfirm={() => {
            canvasRef.current?.clearBoard();
            close();
          }}
        />
      )}
      {dialog === 'feedback' && <FeedbackDialog onClose={close} />}
      {consent && (
        <ConsentDialog
          message={consent.message}
          onAnswer={(ok) => {
            consent.resolve(ok);
            setConsent(null);
          }}
        />
      )}
      {dialog === 'locked' && <StorageLockedDialog onClose={close} />}
      {dialog === 'agents' && <AgentAccessDialog enabled={agents.enabled} onToggle={agents.setEnabled} onClose={close} />}
      {dialog === 'palette' && <CommandPaletteModal commands={paletteCommands} onClose={close} />}
      {dialog === 'help' && <KeyboardShortcutsModal onClose={close} />}
      {dialog === 'diagram' && (
        <DiagramStudioModal
          isDarkMode={isDarkMode}
          onClose={close}
          onInsertDiagram={(code, svg, scale, accent) => {
            canvasRef.current?.addDiagram(code, svg, scale, accent);
            close();
          }}
        />
      )}
      {dialog === 'translator' && <TextTranslatorModal onClose={close} onInsertText={(text) => canvasRef.current?.addText(text)} />}
      {files.saveDialog.open && <SaveFileDialog {...files.saveDialog} />}
      {files.unlockDialog && <UnlockFileDialog {...files.unlockDialog} />}

      {images.isDraggingFile && (
        <div className="ae-drop" aria-hidden="true">
          <div className="ae-drop__card">
            <ImageIcon />
            <span>Drop image to insert</span>
          </div>
        </div>
      )}

      {toast.message && (
        <div className="ae-toast" role="status" style={{ position: 'fixed' }}>
          {toast.message}
        </div>
      )}
    </div>
  );
}
