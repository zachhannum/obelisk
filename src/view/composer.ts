import {
	App,
	Component,
	Platform,
	TFile,
	setIcon,
	setTooltip,
} from "obsidian";
import { suggestionFence } from "../core/suggestion";
import { EmbeddedEditor, createEmbeddedEditor } from "./embedded-editor";
import { renderCommentBody } from "./markdown";

export interface ComposerOptions {
	app: App;
	/** Resolves links in the preview. */
	sourcePath: string;
	/** Owns what the preview renders, and this composer's lifetime. */
	component: Component;
	/** The anchored text — what "Suggest a change" starts from. */
	quote: string;
	placeholder?: string;
	value?: string;
	onChange?: (value: string) => void;
	/** Cmd/Ctrl+Enter. */
	onSubmit?: () => void;
	/**
	 * Esc. The editor takes the key before it can reach a modal or the
	 * workspace, so whoever opened the box says what backing out means.
	 */
	onEscape?: () => void;
}

/** Lets a caller re-focus a composer it has already put on screen. */
const composers = new WeakMap<HTMLElement, Composer>();

/**
 * The box you write a comment in.
 *
 * One component for the compose dialog and for replies, because they are the
 * same thing: a markdown editor with a Write/Preview pair and a button that
 * drops in a ```suggestion block prefilled with the passage under discussion.
 * Proposing an edit is an act of writing here, not a separate mode with its
 * own field — which is what makes a counter-proposal in a reply work for free.
 *
 * Writing happens in Obsidian's own embedded editor, so a comment is written
 * with the shortcuts, autocompletion and live preview the note itself has
 * (see `embedded-editor.ts`). That editor is internal API; when it cannot be
 * had, the box falls back to a plain textarea and everything else here — the
 * tabs, the suggestion button, submit — works unchanged.
 *
 * The Preview tab survives live preview, because it is the only place a
 * ```suggestion block renders as the diff a reader will see.
 */
export class Composer extends Component {
	readonly el: HTMLElement;
	private readonly field: Field;
	private readonly previewEl: HTMLElement;
	private readonly writeTab: HTMLButtonElement;
	private readonly previewTab: HTMLButtonElement;

	constructor(
		container: HTMLElement,
		private opts: ComposerOptions,
	) {
		super();
		this.el = container.createDiv({ cls: "obelisk-composer" });
		composers.set(this.el, this);

		const bar = this.el.createDiv({ cls: "obelisk-composer-bar" });
		this.writeTab = tab(bar, "Write");
		this.previewTab = tab(bar, "Preview");
		this.writeTab.addEventListener("click", () => this.show("write"));
		this.previewTab.addEventListener("click", () => this.show("preview"));

		const tools = bar.createDiv({ cls: "obelisk-composer-tools" });
		const suggest = tools.createEl("button", {
			cls: "obelisk-icon-button",
		});
		setIcon(suggest, "replace");
		setTooltip(suggest, "Suggest a change to the quoted text");
		suggest.addEventListener("click", () => this.insertSuggestion());

		this.field = this.createField();

		this.previewEl = this.el.createDiv({ cls: "obelisk-preview" });
		this.previewEl.hide();

		this.el.createDiv({
			cls: "obelisk-compose-hint",
			text: `Markdown supported · ${Platform.isMacOS ? "Cmd" : "Ctrl"}+Enter to submit`,
		});

		this.show("write");
		opts.component.addChild(this);
	}

	get value(): string {
		return this.field.value;
	}

	focus(): void {
		this.field.focus();
	}

	/** Focus the composer already mounted under `root`, if there is one. */
	static focusWithin(root: HTMLElement): boolean {
		const el = root.hasClass("obelisk-composer")
			? root
			: root.querySelector<HTMLElement>(".obelisk-composer");
		const composer = el ? composers.get(el) : undefined;
		composer?.focus();
		return !!composer;
	}

	/**
	 * Tear the editor down. Callers that remove the box from the DOM
	 * themselves — a cancelled reply, a saved edit — should call this first;
	 * otherwise the owning component takes care of it on unload.
	 */
	destroy(): void {
		this.opts.component.removeChild(this);
	}

	onunload(): void {
		this.field.destroy();
	}

	/**
	 * Drop a suggestion block at the cursor, prefilled with the quoted text and
	 * with that text selected — so the next keystroke edits the passage rather
	 * than retyping it, the way GitHub's suggestion button behaves.
	 */
	insertSuggestion(): void {
		this.show("write");

		const value = this.field.value;
		const { from, to } = this.field.selection();
		const before = value.slice(0, from);
		const after = value.slice(to);
		const block = suggestionFence(this.opts.quote);

		// A fence has to start its own line, and needs a blank line above it
		// so it does not get swallowed by the paragraph it follows.
		const lead = before.length === 0 || before.endsWith("\n\n")
			? ""
			: before.endsWith("\n")
				? "\n"
				: "\n\n";
		const trail = after.length === 0 || after.startsWith("\n") ? "" : "\n";

		this.field.replace(from, to, lead + block + trail);

		const contentStart = from + lead.length + block.indexOf("\n") + 1;
		this.field.select(contentStart, contentStart + this.opts.quote.length);
		this.field.focus();
	}

	private createField(): Field {
		const host = this.el.createDiv({ cls: "obelisk-compose-editor" });
		const shared = {
			value: this.opts.value ?? "",
			placeholder: this.opts.placeholder ?? "Leave a comment…",
			onChange: (value: string) => this.opts.onChange?.(value),
			onSubmit: () => this.opts.onSubmit?.(),
			onEscape: () => this.opts.onEscape?.(),
		};

		const embedded = createEmbeddedEditor(this.opts.app, host, {
			...shared,
			file: noteFor(this.opts.app, this.opts.sourcePath),
		});
		return embedded
			? new EmbeddedField(host, embedded)
			: new TextareaField(host, shared);
	}

	private show(which: "write" | "preview"): void {
		const previewing = which === "preview";
		this.writeTab.toggleClass("is-active", !previewing);
		this.previewTab.toggleClass("is-active", previewing);
		this.field.el.toggle(!previewing);
		this.previewEl.toggle(previewing);
		if (!previewing) {
			this.field.refresh();
			return;
		}

		this.previewEl.empty();
		const markdown = this.value.trim();
		if (!markdown) {
			this.previewEl.createDiv({
				cls: "obelisk-empty",
				text: "Nothing to preview yet.",
			});
			return;
		}
		renderCommentBody(this.previewEl, markdown, {
			app: this.opts.app,
			sourcePath: this.opts.sourcePath,
			component: this.opts.component,
			suggestion: { quote: this.opts.quote },
		});
	}
}

/**
 * What the composer asks of whatever it is writing into: a string, a caret,
 * and the ability to put text where the caret is. Both backends answer in
 * document offsets, so the suggestion-block arithmetic above is written once.
 */
interface Field {
	/** The element the Write tab shows and the Preview tab hides. */
	readonly el: HTMLElement;
	readonly value: string;
	focus(): void;
	selection(): { from: number; to: number };
	replace(from: number, to: number, text: string): void;
	select(from: number, to: number): void;
	/** Called when the field is shown again, for anything that measures. */
	refresh(): void;
	destroy(): void;
}

interface FieldOptions {
	value: string;
	placeholder: string;
	onChange: (value: string) => void;
	onSubmit: () => void;
	onEscape: () => void;
}

/** Obsidian's editor, with the shortcuts and completion that come with it. */
class EmbeddedField implements Field {
	constructor(
		readonly el: HTMLElement,
		private readonly editor: EmbeddedEditor,
	) {}

	get value(): string {
		return this.editor.value;
	}

	focus(): void {
		this.editor.focus();
	}

	selection(): { from: number; to: number } {
		return this.editor.selection();
	}

	replace(from: number, to: number, text: string): void {
		this.editor.replace(from, to, text);
	}

	select(from: number, to: number): void {
		this.editor.select(from, to);
	}

	refresh(): void {
		this.editor.refresh();
	}

	destroy(): void {
		this.editor.destroy();
	}
}

/** The fallback: no shortcuts, but it always works. */
class TextareaField implements Field {
	readonly el: HTMLTextAreaElement;
	private readonly onChange: (value: string) => void;

	constructor(host: HTMLElement, opts: FieldOptions) {
		this.el = host.createEl("textarea", { cls: "obelisk-compose-body" });
		this.el.placeholder = opts.placeholder;
		this.el.value = opts.value;
		this.el.addEventListener("input", () => opts.onChange(this.value));
		this.el.addEventListener("keydown", (evt) => {
			if (evt.key === "Enter" && (evt.metaKey || evt.ctrlKey)) {
				evt.preventDefault();
				opts.onSubmit();
			} else if (evt.key === "Escape") {
				opts.onEscape();
			}
		});
		this.onChange = opts.onChange;
	}

	get value(): string {
		return this.el.value;
	}

	focus(): void {
		this.el.focus();
	}

	selection(): { from: number; to: number } {
		return { from: this.el.selectionStart, to: this.el.selectionEnd };
	}

	replace(from: number, to: number, text: string): void {
		const value = this.el.value;
		this.el.value = value.slice(0, from) + text + value.slice(to);
		this.onChange(this.value);
	}

	select(from: number, to: number): void {
		this.el.setSelectionRange(from, to);
	}

	refresh(): void {
		// The box grows with `field-sizing`, so there is nothing to measure.
	}

	destroy(): void {
		// The DOM goes with the composer; nothing else is held.
	}
}

/** The note a comment hangs off, when it is still there to be found. */
function noteFor(app: App, path: string): TFile | null {
	const file = app.vault.getAbstractFileByPath(path);
	return file instanceof TFile ? file : null;
}

function tab(bar: HTMLElement, label: string): HTMLButtonElement {
	return bar.createEl("button", { cls: "obelisk-tab", text: label });
}
