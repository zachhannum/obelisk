import { App, Modal, Platform, setTooltip } from "obsidian";

export interface CommentDraft {
	body: string;
	/** undefined = no suggestion attached. */
	suggestion?: string;
}

/**
 * The compose dialog used by "Add comment" / "Suggest an edit".
 *
 * Two plain textareas rather than `Setting` rows: the body wants room to type
 * in, and the suggestion is pre-filled with the selected text so it is edited
 * in place, GitHub-style, instead of retyped. Cmd/Ctrl+Enter submits; Esc
 * cancels (Modal's own binding).
 */
export class CommentModal extends Modal {
	private draft: CommentDraft;
	private submitEl: HTMLButtonElement | null = null;

	constructor(
		app: App,
		private quote: string,
		withSuggestion: boolean,
		private onSubmit: (draft: CommentDraft) => void,
	) {
		super(app);
		this.draft = {
			body: "",
			suggestion: withSuggestion ? quote : undefined,
		};
	}

	onOpen(): void {
		const suggesting = this.draft.suggestion !== undefined;
		this.titleEl.setText(suggesting ? "Suggest an edit" : "Add comment");
		this.modalEl.addClass("obelisk-modal");

		this.contentEl
			.createDiv({ cls: "obelisk-quote" })
			.setText(collapse(this.quote));

		const body = this.field("Comment", "obelisk-compose-body");
		body.placeholder = suggesting
			? "Why this change? (optional)"
			: "Leave a comment…";
		body.addEventListener("input", () => {
			this.draft.body = body.value;
			this.syncSubmit();
		});

		if (suggesting) {
			const replacement = this.field(
				"Replacement",
				"obelisk-compose-suggestion",
			);
			replacement.value = this.quote;
			setTooltip(
				replacement,
				"Replaces the selected text when the suggestion is applied.",
			);
			replacement.addEventListener("input", () => {
				this.draft.suggestion = replacement.value;
				this.syncSubmit();
			});
		}

		const actions = this.contentEl.createDiv({
			cls: "obelisk-compose-actions",
		});
		actions.createSpan({
			cls: "obelisk-compose-hint",
			text: `${Platform.isMacOS ? "Cmd" : "Ctrl"}+Enter to submit`,
		});
		actions
			.createEl("button", { text: "Cancel" })
			.addEventListener("click", () => this.close());
		this.submitEl = actions.createEl("button", {
			cls: "mod-cta",
			text: suggesting ? "Suggest" : "Comment",
		});
		this.submitEl.addEventListener("click", () => this.submit());

		this.scope.register(["Mod"], "Enter", () => {
			this.submit();
			return false;
		});

		this.syncSubmit();
		// Focus after the modal has finished opening, or Obsidian's own focus
		// handling wins the race.
		window.setTimeout(() => body.focus(), 0);
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private field(label: string, cls: string): HTMLTextAreaElement {
		const wrapper = this.contentEl.createDiv({ cls: "obelisk-compose" });
		wrapper.createEl("label", { cls: "obelisk-compose-label", text: label });
		return wrapper.createEl("textarea", { cls });
	}

	/**
	 * A comment with neither a body nor an actual change proposed is not worth
	 * writing to the file.
	 */
	private canSubmit(): boolean {
		if (this.draft.body.trim().length > 0) return true;
		return (
			this.draft.suggestion !== undefined &&
			this.draft.suggestion !== this.quote
		);
	}

	private syncSubmit(): void {
		if (this.submitEl) this.submitEl.disabled = !this.canSubmit();
	}

	private submit(): void {
		if (!this.canSubmit()) return;
		this.onSubmit({
			body: this.draft.body.trim(),
			suggestion: this.draft.suggestion,
		});
		this.close();
	}
}

/** One-line preview of the quoted passage. */
function collapse(text: string): string {
	const flat = text.replace(/\s+/g, " ").trim();
	return flat.length > 240 ? flat.slice(0, 239) + "…" : flat;
}
