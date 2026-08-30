import { App, Component, Platform, setIcon, setTooltip } from "obsidian";
import { suggestionFence } from "../suggestion/parse";
import { renderCommentBody } from "./markdown";

export interface ComposerOptions {
	app: App;
	/** Resolves links in the preview. */
	sourcePath: string;
	/** Owns what the preview renders. */
	component: Component;
	/** The anchored text — what "Suggest a change" starts from. */
	quote: string;
	placeholder?: string;
	value?: string;
	onChange?: (value: string) => void;
	/** Cmd/Ctrl+Enter. */
	onSubmit?: () => void;
}

/** Past this the box scrolls rather than pushing the buttons off-screen. */
const MAX_ROWS = 20;

/**
 * The box you write a comment in.
 *
 * One component for the compose dialog and for replies, because they are the
 * same thing: a markdown editor with a Write/Preview pair and a button that
 * drops in a ```suggestion block prefilled with the passage under discussion.
 * Proposing an edit is an act of writing here, not a separate mode with its
 * own field — which is what makes a counter-proposal in a reply work for free.
 *
 * A plain textarea rather than an embedded CodeMirror: the preview tab is
 * where you check your markdown, and a real editor instance per reply box is
 * a lot of machinery for a paragraph. The trade-off is no live highlighting
 * while typing.
 */
export class Composer {
	readonly el: HTMLElement;
	private readonly input: HTMLTextAreaElement;
	private readonly previewEl: HTMLElement;
	private readonly writeTab: HTMLButtonElement;
	private readonly previewTab: HTMLButtonElement;

	constructor(
		container: HTMLElement,
		private opts: ComposerOptions,
	) {
		this.el = container.createDiv({ cls: "obelisk-composer" });

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

		this.input = this.el.createEl("textarea", {
			cls: "obelisk-compose-body",
		});
		this.input.placeholder = opts.placeholder ?? "Leave a comment…";
		this.input.value = opts.value ?? "";
		this.input.addEventListener("input", () => {
			this.autosize();
			this.opts.onChange?.(this.value);
		});
		this.input.addEventListener("keydown", (evt) => {
			if (evt.key === "Enter" && (evt.metaKey || evt.ctrlKey)) {
				evt.preventDefault();
				this.opts.onSubmit?.();
			}
		});

		this.previewEl = this.el.createDiv({ cls: "obelisk-preview" });
		this.previewEl.hide();

		this.el.createDiv({
			cls: "obelisk-compose-hint",
			text: `Markdown supported · ${Platform.isMacOS ? "Cmd" : "Ctrl"}+Enter to submit`,
		});

		this.show("write");
		this.autosize();
	}

	get value(): string {
		return this.input.value;
	}

	focus(): void {
		this.input.focus();
	}

	/**
	 * Drop a suggestion block at the cursor, prefilled with the quoted text and
	 * with that text selected — so the next keystroke edits the passage rather
	 * than retyping it, the way GitHub's suggestion button behaves.
	 */
	insertSuggestion(): void {
		this.show("write");

		const value = this.input.value;
		const before = value.slice(0, this.input.selectionStart);
		const after = value.slice(this.input.selectionEnd);
		const block = suggestionFence(this.opts.quote);

		// A fence has to start its own line, and wants a blank line above it
		// so it does not get swallowed by the paragraph it follows.
		const lead = before.length === 0 || before.endsWith("\n\n")
			? ""
			: before.endsWith("\n")
				? "\n"
				: "\n\n";
		const trail = after.length === 0 || after.startsWith("\n") ? "" : "\n";

		this.input.value = before + lead + block + trail + after;

		const contentStart =
			before.length + lead.length + block.indexOf("\n") + 1;
		this.input.setSelectionRange(
			contentStart,
			contentStart + this.opts.quote.length,
		);
		this.input.focus();
		this.autosize();
		this.opts.onChange?.(this.value);
	}

	/**
	 * Grow the box to its content, so an edit or a prefilled suggestion opens
	 * showing the whole thing rather than a two-line slot you have to drag.
	 * CSS caps it, past which the textarea scrolls; the height has to be reset
	 * first or scrollHeight only ever reports the taller of the two.
	 */
	private autosize(): void {
		if (!this.input.isShown()) {
			// Nothing to measure while detached or on the Preview tab — count
			// lines instead, and re-measure when Write comes back.
			this.input.rows = Math.min(
				MAX_ROWS,
				this.input.value.split("\n").length,
			);
			return;
		}
		this.input.style.height = "auto";
		this.input.style.height = `${this.input.scrollHeight}px`;
	}

	private show(which: "write" | "preview"): void {
		const previewing = which === "preview";
		this.writeTab.toggleClass("is-active", !previewing);
		this.previewTab.toggleClass("is-active", previewing);
		this.input.toggle(!previewing);
		this.previewEl.toggle(previewing);
		if (!previewing) {
			this.autosize();
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

function tab(bar: HTMLElement, label: string): HTMLButtonElement {
	return bar.createEl("button", { cls: "obelisk-tab", text: label });
}
