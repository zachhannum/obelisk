import { App, Modal, Setting } from "obsidian";

export interface CommentDraft {
	body: string;
	/** undefined = no suggestion attached. */
	suggestion?: string;
}

/**
 * The compose dialog used by "Add comment" / "Suggest an edit".
 *
 * TODO: this is a placeholder built out of Setting rows. It should become a
 * proper panel: a textarea with markdown autocomplete for the body, and — when
 * suggesting — a second textarea pre-filled with the selected text so the user
 * edits it in place, GitHub-style. Cmd/Ctrl+Enter submits, Esc cancels.
 */
export class CommentModal extends Modal {
	private draft: CommentDraft;

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
		this.titleEl.setText(
			this.draft.suggestion === undefined
				? "Add comment"
				: "Suggest an edit",
		);

		this.contentEl
			.createDiv({ cls: "obelisk-quote" })
			.setText(this.quote);

		new Setting(this.contentEl).setName("Comment").addTextArea((ta) =>
			ta.onChange((v) => {
				this.draft.body = v;
			}),
		);

		if (this.draft.suggestion !== undefined) {
			new Setting(this.contentEl)
				.setName("Replacement")
				.setDesc("Replaces the selected text when applied.")
				.addTextArea((ta) =>
					ta.setValue(this.quote).onChange((v) => {
						this.draft.suggestion = v;
					}),
				);
		}

		new Setting(this.contentEl).addButton((b) =>
			b
				.setButtonText("Comment")
				.setCta()
				.onClick(() => {
					this.onSubmit(this.draft);
					this.close();
				}),
		);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
