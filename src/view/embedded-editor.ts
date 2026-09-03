import { App, Scope, TFile } from "obsidian";
import { Extension, Prec } from "@codemirror/state";
import { EditorView, keymap, placeholder } from "@codemirror/view";

export interface EmbeddedEditorOptions {
	value: string;
	placeholder: string;
	/** The note the comment hangs off, so links resolve as they do there. */
	file: TFile | null;
	onChange: (value: string) => void;
	/** Cmd/Ctrl+Enter. */
	onSubmit: () => void;
	onEscape: () => void;
}

/** What the composer needs from a text field, however it is implemented. */
export interface EmbeddedEditor {
	readonly value: string;
	focus(): void;
	selection(): { from: number; to: number };
	replace(from: number, to: number, text: string): void;
	select(from: number, to: number): void;
	/** CodeMirror measures on layout; call after showing a hidden editor. */
	refresh(): void;
	destroy(): void;
}

/**
 * The private editor, as far as the composer reaches into it. Every member
 * here is undocumented and can move in any release.
 */
interface WidgetEditor {
	app: App;
	editor: { cm?: EditorView; focus(): void; getValue(): string };
	activeCM?: EditorView;
	cm?: EditorView;
	/** Obsidian's Component flag, set while the component is loaded. */
	_loaded?: boolean;
	set(value: string, clear: boolean): void;
	unload(): void;
	destroy(): void;
	onunload?(): void;
	onUpdate?(update: unknown, changed: boolean): void;
	buildLocalExtensions?(): Extension[];
}

/** The class `resolveBase` digs out, called the way its own constructor is. */
type WidgetEditorBase = new (
	app: App,
	container: HTMLElement,
	owner: EditorOwner,
) => WidgetEditor;

/** The subclass, which takes the composer's options in the owner's place. */
type WidgetEditorClass = new (
	app: App,
	container: HTMLElement,
	options: EmbeddedEditorOptions,
) => WidgetEditor;

/** What the widget editor expects of the view hosting it. */
interface EditorOwner {
	app: App;
	file: TFile | null;
	editor: unknown;
	hoverPopover: null;
	getMode: () => string;
	onMarkdownScroll: () => void;
}

/** The markdown embed `embedRegistry` hands back, used only as a probe. */
interface EmbedProbe {
	editable: boolean;
	showEditor(): void;
	editMode?: object;
	unload?(): void;
}

type MarkdownEmbed = (
	context: { app: App; containerEl: HTMLElement },
	file: TFile | null,
	subpath: string,
) => EmbedProbe;

/**
 * The editor Obsidian uses inside Canvas cards and property fields, borrowed
 * for the comment box.
 *
 * Everything a writer already knows comes with it: Cmd+B/I/K, list
 * continuation, Tab indentation, `[[` autocomplete and every other registered
 * suggester, live preview, vim mode if they use it. Reimplementing that on a
 * textarea would be a keymap that is always a little wrong.
 *
 * This file is the plugin's only use of private API. `embedRegistry` is not in
 * obsidian.d.ts, and the class extended below is reachable only by building a
 * throwaway editor and walking up its prototype chain. Obsidian offers no
 * supported equivalent, and either could move in any release.
 *
 * When one does, `resolveBase` returns null rather than throwing, `unavailable`
 * latches so the probe costs one attempt per session, and the composer builds a
 * plain textarea instead. Writing, editing, replying and inserting a suggestion
 * all still work there, without the shortcuts.
 *
 * Nothing here reads or writes a note, so a release that moves either one costs
 * shortcuts and cannot lose a comment or damage a file.
 */
export function createEmbeddedEditor(
	app: App,
	container: HTMLElement,
	options: EmbeddedEditorOptions,
): EmbeddedEditor | null {
	let instance: WidgetEditor;
	try {
		const Editor = editorClass(app);
		if (!Editor) return null;
		pending = options;
		instance = new Editor(app, container, options);
	} catch (err) {
		console.error("Obelisk: embedded editor unavailable", err);
		// A half-built editor would sit above the textarea we fall back to.
		container.empty();
		return null;
	} finally {
		pending = null;
	}

	// Everything below goes through CodeMirror where CodeMirror can answer, so
	// the internal surface we depend on stays as small as the dig itself.
	const cm = (): EditorView =>
		(instance.editor?.cm ?? instance.activeCM ?? instance.cm) as EditorView;

	return {
		get value(): string {
			return cm().state.doc.toString();
		},
		// The Editor wrapper's focus, not the view's: on mobile it is what
		// raises the keyboard.
		focus: () => {
			if (instance.editor) instance.editor.focus();
			else cm().focus();
		},
		selection: () => {
			const range = cm().state.selection.main;
			return { from: range.from, to: range.to };
		},
		replace: (from, to, text) => {
			cm().dispatch({ changes: { from, to, insert: text } });
		},
		select: (from, to) => {
			cm().dispatch({ selection: { anchor: from, head: to } });
		},
		refresh: () => cm().requestMeasure(),
		destroy: () => instance.destroy(),
	};
}

/**
 * The subclass, built once the first time it is asked for — it cannot be
 * declared at module scope because its superclass has to be dug out of a live
 * app first.
 */
let cached: WidgetEditorClass | null = null;

/** Set once the dig has come up empty, so it is not repeated per comment. */
let unavailable = false;

/**
 * `buildLocalExtensions` runs from inside the superclass constructor, before
 * our own field assignments have had a chance to happen, so the options have
 * to be reachable without going through `this`.
 */
let pending: EmbeddedEditorOptions | null = null;

function editorClass(app: App): WidgetEditorClass | null {
	if (cached) return cached;
	if (unavailable) return null;

	const Base = resolveBase(app);
	if (!Base) {
		unavailable = true;
		return null;
	}

	cached = class extends Base {
		options!: EmbeddedEditorOptions;
		owner: EditorOwner;
		scope: Scope;
		private scoped = false;
		private destroyed = false;

		constructor(
			app: App,
			container: HTMLElement,
			options: EmbeddedEditorOptions,
		) {
			// The widget editor talks to its "owner" the way a pane's editor
			// talks to its MarkdownView. A comment box has no scroll position
			// worth reporting and is always source-with-live-preview; the file
			// is the note under discussion, which is what makes a link or an
			// embed in a comment resolve the way it would in the note.
			const owner: EditorOwner = {
				app,
				file: options.file,
				editor: null,
				hoverPopover: null,
				getMode: () => "source",
				onMarkdownScroll: () => {},
			};
			super(app, container, owner);
			this.owner = owner;
			this.options = options;
			owner.editor = this.editor;

			// Obsidian's global hotkeys still see the keystroke after our
			// keymap has had it. A scope of our own, pushed while the box has
			// focus, stops the submit chord from also firing whatever the
			// vault has bound to it.
			this.scope = new Scope(app.scope);
			this.scope.register(["Mod"], "Enter", () => true);

			this.set(options.value ?? "", true);
		}

		onUpdate(update: unknown, changed: boolean): void {
			super.onUpdate?.(update, changed);
			if (changed) this.options?.onChange(this.editor.getValue());
		}

		buildLocalExtensions(): Extension[] {
			const extensions: Extension[] = super.buildLocalExtensions?.() ?? [];
			const options = this.options ?? pending;
			if (!options) return extensions;

			if (options.placeholder) {
				extensions.push(placeholder(options.placeholder));
			}

			extensions.push(
				EditorView.domEventHandlers({
					focus: () => {
						this.pushScope();
						return false;
					},
					blur: () => {
						this.popScope();
						return false;
					},
				}),
			);

			// Highest precedence: plain Enter belongs to Obsidian (it is what
			// continues a list), but the submit chord has to be taken before
			// the editor's own Enter handling gets to it.
			extensions.push(
				Prec.highest(
					keymap.of([
						{
							key: "Mod-Enter",
							run: () => {
								options.onSubmit();
								return true;
							},
						},
						{
							key: "Escape",
							run: () => {
								options.onEscape();
								return true;
							},
							preventDefault: true,
						},
					]),
				),
			);

			return extensions;
		}

		private pushScope(): void {
			// `scope` is assigned after `super()` returns, and the superclass
			// constructor is what installs these handlers — so an early focus
			// has nothing to push yet, and nothing to pop either.
			if (!this.scope || this.scoped) return;
			this.scoped = true;
			this.app.keymap.pushScope(this.scope);
		}

		private popScope(): void {
			if (!this.scope || !this.scoped) return;
			this.scoped = false;
			this.app.keymap.popScope(this.scope);
		}

		onunload(): void {
			super.onunload?.();
			this.destroy();
		}

		destroy(): void {
			if (this.destroyed) return;
			this.destroyed = true;
			if (this._loaded) this.unload();
			this.popScope();
			// Leaving a dead editor as the active one would point every
			// editor command in the app at a box that no longer exists.
			const active: unknown = this.app.workspace.activeEditor;
			if (active === this.owner) {
				this.app.workspace.activeEditor = null;
			}
			super.destroy?.();
		}
	};

	return cached;
}

/**
 * Build a throwaway embedded editor and take its class off the prototype
 * chain: `editMode` is an instance of the markdown edit view, whose parent is
 * the general-purpose editable view we want to extend.
 */
function resolveBase(app: App): WidgetEditorBase | null {
	const registry = (
		app as App & {
			embedRegistry?: {
				embedByExtension?: Record<string, MarkdownEmbed | undefined>;
			};
		}
	).embedRegistry;
	const embed = registry?.embedByExtension?.md;
	if (typeof embed !== "function") return null;

	let probe: EmbedProbe | undefined;
	try {
		probe = embed({ app, containerEl: createDiv() }, null, "");
		probe.editable = true;
		probe.showEditor();
		const editMode = probe.editMode;
		if (!editMode) return null;
		const parent = Object.getPrototypeOf(
			Object.getPrototypeOf(editMode),
		) as { constructor?: unknown } | null;
		const base = parent?.constructor;
		return typeof base === "function" ? (base as WidgetEditorBase) : null;
	} catch (err) {
		console.error("Obelisk: could not resolve the embedded editor", err);
		return null;
	} finally {
		probe?.unload?.();
	}
}
