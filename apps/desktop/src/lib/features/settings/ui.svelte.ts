class SettingsUi {
    query = $state("");
    logsExpanded = $state(false);
    restoreLogsToggleFocus = false;
    /** The page the user came from, so "Back" leaves settings instead of stepping through categories. */
    returnTo: string | null = null;

    /** Row id the next settings page render should scroll to and highlight. */
    highlightId: string | null = $state(null);

    takeHighlight(): string | null {
        const id = this.highlightId;
        this.highlightId = null;
        return id;
    }

    toggleLogsExpanded() {
        this.restoreLogsToggleFocus = true;
        this.logsExpanded = !this.logsExpanded;
    }
}

export const settingsUi = new SettingsUi();
