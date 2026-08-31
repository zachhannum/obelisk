import { App, Component, Modal } from "obsidian";
import { findSuggestions, stripSuggestions } from "../core/suggestion";
import { Composer } from "./composer";

export interface CommentDraft {
	/** Markdown, suggestion blocks included. */
	body: string;
}

/**
 * The compose dialog used by "Add comment" / "Suggest an edit".
 *
 * There is one field, because a comment is one thing: markdown. "Suggest an
 * edit" is not a different kind of comment, it is this dialog opened with a
 * suggestion block already dropped in and the quoted text selected, ready to
 * be edited in place. Anything else — prose above it, a second proposal below
 * it, a link, a list — is just more markdown in the same box.
 *
 * Cmd/Ctrl+Enter submits; Esc cancels (Modal's own binding).
 */
export class CommentModal extends Modal {
	private body = "";
	private composer!: Composer;
	private submitEl: HTMLButtonElement | null = null;
	/**
	 * Owns the preview tab's rendered markdown. A Modal is not a Component, and
	 * `scope` is already its keymap — hence a separate one, loaded and unloaded
	 * with the dialog so embeds in a preview die with it.
	 */
	private readonly renderScope = new Component();

	constructor(
		app: App,
		private quote: string,
		private withSuggestion: boolean,
		private sourcePath: string,
		private onSubmit: (draft: CommentDraft) => void,
	) {
		super(app);
	}

	onOpen(): void {
		this.renderScope.load();
		this.titleEl.setText(
			this.withSuggestion ? "Suggest an edit" : "Add comment",
		);
		this.modalEl.addClass("obelisk-modal");

		this.contentEl
			.createDiv({ cls: "obelisk-quote" })
			.setText(collapse(this.quote));

		this.composer = new Composer(this.contentEl, {
			app: this.app,
			sourcePath: this.sourcePath,
			component: this.renderScope,
			quote: this.quote,
			placeholder: this.withSuggestion
				? "Why this change? (optional)"
				: "Leave a comment…",
			onChange: (value) => {
				this.body = value;
				this.syncSubmit();
			},
			onSubmit: () => this.submit(),
			// The editor eats Esc before the modal's own scope sees it.
			onEscape: () => this.close(),
		});

		const actions = this.contentEl.createDiv({
			cls: "obelisk-compose-actions",
		});
		actions
			.createEl("button", { text: "Cancel" })
			.addEventListener("click", () => this.close());
		this.submitEl = actions.createEl("button", {
			cls: "mod-cta",
			text: this.withSuggestion ? "Suggest" : "Comment",
		});
		this.submitEl.addEventListener("click", () => this.submit());

		// Also bound modal-wide, so Cmd+Enter submits from the Preview tab too.
		this.scope.register(["Mod"], "Enter", () => {
			this.submit();
			return false;
		});

		this.syncSubmit();

		// Focus after the modal has finished opening, or Obsidian's own focus
		// handling wins the race.
		window.setTimeout(() => {
			if (this.withSuggestion) this.composer.insertSuggestion();
			else this.composer.focus();
		}, 0);
	}

	onClose(): void {
		this.renderScope.unload();
		this.contentEl.empty();
	}

	/**
	 * A comment with neither something to say nor an actual change proposed is
	 * not worth writing to the file.
	 */
	private canSubmit(): boolean {
		if (!this.body.trim()) return false;
		if (stripSuggestions(this.body).trim()) return true;
		// Nothing but suggestion blocks: at least one has to change something.
		return findSuggestions(this.body).some((b) => b.text !== this.quote);
	}

	private syncSubmit(): void {
		if (this.submitEl) this.submitEl.disabled = !this.canSubmit();
	}

	private submit(): void {
		if (!this.canSubmit()) return;
		this.onSubmit({ body: this.body.trim() });
		this.close();
	}
}

/** One-line preview of the quoted passage. */
function collapse(text: string): string {
	const flat = text.replace(/\s+/g, " ").trim();
	return flat.length > 240 ? flat.slice(0, 239) + "…" : flat;
}
