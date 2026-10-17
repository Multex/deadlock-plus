use super::filter::{Entry, EntryKind};

/// `WebKitContextMenuAction` values from WebKitGTK's public header; the C enum is part of its stable ABI.
const COPY_LINK_TO_CLIPBOARD: i32 = 4;
const COPY_IMAGE_TO_CLIPBOARD: i32 = 7;
const COPY_IMAGE_URL_TO_CLIPBOARD: i32 = 8;
const GO_BACK: i32 = 10;
const GO_FORWARD: i32 = 11;
const RELOAD: i32 = 13;
const COPY: i32 = 14;
const CUT: i32 = 15;
const PASTE: i32 = 16;
const SELECT_ALL: i32 = 18;
const SPELLING_GUESS: i32 = 21;
const NO_GUESSES_FOUND: i32 = 22;
const IGNORE_SPELLING: i32 = 23;
const LEARN_SPELLING: i32 = 24;
const IGNORE_GRAMMAR: i32 = 25;
const INSPECT_ELEMENT: i32 = 31;
const PASTE_AS_PLAIN_TEXT: i32 = 45;

/// Names a WebKitGTK stock action after its WebView2 counterpart, so one keep-list trims both menus.
pub fn entry(action: i32, separator: bool, submenu: bool) -> Entry {
    let kind = if separator {
        EntryKind::Separator
    } else if submenu {
        EntryKind::Submenu
    } else {
        EntryKind::Item
    };
    let name = match action {
        GO_BACK => "back",
        GO_FORWARD => "forward",
        RELOAD => "reload",
        CUT => "cut",
        COPY => "copy",
        PASTE => "paste",
        PASTE_AS_PLAIN_TEXT => "pasteAndMatchStyle",
        SELECT_ALL => "selectAll",
        COPY_LINK_TO_CLIPBOARD => "copyLinkLocation",
        COPY_IMAGE_TO_CLIPBOARD => "copyImage",
        COPY_IMAGE_URL_TO_CLIPBOARD => "copyImageLocation",
        SPELLING_GUESS | NO_GUESSES_FOUND | IGNORE_SPELLING | LEARN_SPELLING | IGNORE_GRAMMAR => "spellcheck",
        INSPECT_ELEMENT => "inspectElement",
        _ => "",
    };
    Entry { name: name.to_owned(), kind }
}

#[cfg(test)]
mod tests {
    use super::super::filter::plan;
    use super::*;

    const OPEN_LINK: i32 = 1;
    const DOWNLOAD_IMAGE_TO_DISK: i32 = 6;
    const OPEN_FRAME_IN_NEW_WINDOW: i32 = 9;
    const STOP: i32 = 12;
    const DELETE: i32 = 17;
    const INPUT_METHODS: i32 = 19;
    const UNICODE: i32 = 20;
    const FONT_MENU: i32 = 26;
    const INSERT_EMOJI: i32 = 44;
    const CUSTOM: i32 = 10000;

    fn kept(action: i32, debug: bool) -> bool {
        !plan(&[entry(action, false, false)], debug).empty
    }

    #[test]
    fn actions_with_a_webview2_counterpart_stay() {
        for action in [
            GO_BACK,
            GO_FORWARD,
            RELOAD,
            CUT,
            COPY,
            PASTE,
            PASTE_AS_PLAIN_TEXT,
            SELECT_ALL,
            COPY_LINK_TO_CLIPBOARD,
            COPY_IMAGE_TO_CLIPBOARD,
            COPY_IMAGE_URL_TO_CLIPBOARD,
            SPELLING_GUESS,
            NO_GUESSES_FOUND,
            IGNORE_SPELLING,
            LEARN_SPELLING,
            IGNORE_GRAMMAR,
        ] {
            assert!(kept(action, false), "{action}");
        }
    }

    #[test]
    fn other_and_unknown_actions_go() {
        for action in [
            0,
            OPEN_LINK,
            DOWNLOAD_IMAGE_TO_DISK,
            OPEN_FRAME_IN_NEW_WINDOW,
            STOP,
            DELETE,
            FONT_MENU,
            INSERT_EMOJI,
            CUSTOM,
            999,
        ] {
            assert!(!kept(action, false), "{action}");
        }
    }

    #[test]
    fn inspect_element_stays_only_in_debug() {
        assert!(kept(INSPECT_ELEMENT, true));
        assert!(!kept(INSPECT_ELEMENT, false));
    }

    #[test]
    fn separators_and_submenus_keep_their_kind() {
        assert_eq!(entry(0, true, false).kind, EntryKind::Separator);
        assert_eq!(entry(INPUT_METHODS, false, true).kind, EntryKind::Submenu);
        assert_eq!(entry(COPY, false, false).kind, EntryKind::Item);
    }

    #[test]
    fn unwanted_submenus_go_whole() {
        let list = [entry(COPY, false, false), entry(INPUT_METHODS, false, true), entry(UNICODE, false, true)];
        assert_eq!(plan(&list, false).remove, [1, 2]);
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn values_match_the_webkit_header() {
        use webkit2gtk::ffi;
        assert_eq!(COPY_LINK_TO_CLIPBOARD, ffi::WEBKIT_CONTEXT_MENU_ACTION_COPY_LINK_TO_CLIPBOARD);
        assert_eq!(COPY_IMAGE_TO_CLIPBOARD, ffi::WEBKIT_CONTEXT_MENU_ACTION_COPY_IMAGE_TO_CLIPBOARD);
        assert_eq!(COPY_IMAGE_URL_TO_CLIPBOARD, ffi::WEBKIT_CONTEXT_MENU_ACTION_COPY_IMAGE_URL_TO_CLIPBOARD);
        assert_eq!(GO_BACK, ffi::WEBKIT_CONTEXT_MENU_ACTION_GO_BACK);
        assert_eq!(GO_FORWARD, ffi::WEBKIT_CONTEXT_MENU_ACTION_GO_FORWARD);
        assert_eq!(RELOAD, ffi::WEBKIT_CONTEXT_MENU_ACTION_RELOAD);
        assert_eq!(COPY, ffi::WEBKIT_CONTEXT_MENU_ACTION_COPY);
        assert_eq!(CUT, ffi::WEBKIT_CONTEXT_MENU_ACTION_CUT);
        assert_eq!(PASTE, ffi::WEBKIT_CONTEXT_MENU_ACTION_PASTE);
        assert_eq!(SELECT_ALL, ffi::WEBKIT_CONTEXT_MENU_ACTION_SELECT_ALL);
        assert_eq!(SPELLING_GUESS, ffi::WEBKIT_CONTEXT_MENU_ACTION_SPELLING_GUESS);
        assert_eq!(NO_GUESSES_FOUND, ffi::WEBKIT_CONTEXT_MENU_ACTION_NO_GUESSES_FOUND);
        assert_eq!(IGNORE_SPELLING, ffi::WEBKIT_CONTEXT_MENU_ACTION_IGNORE_SPELLING);
        assert_eq!(LEARN_SPELLING, ffi::WEBKIT_CONTEXT_MENU_ACTION_LEARN_SPELLING);
        assert_eq!(IGNORE_GRAMMAR, ffi::WEBKIT_CONTEXT_MENU_ACTION_IGNORE_GRAMMAR);
        assert_eq!(INSPECT_ELEMENT, ffi::WEBKIT_CONTEXT_MENU_ACTION_INSPECT_ELEMENT);
        assert_eq!(PASTE_AS_PLAIN_TEXT, ffi::WEBKIT_CONTEXT_MENU_ACTION_PASTE_AS_PLAIN_TEXT);
        assert_eq!(OPEN_LINK, ffi::WEBKIT_CONTEXT_MENU_ACTION_OPEN_LINK);
        assert_eq!(INPUT_METHODS, ffi::WEBKIT_CONTEXT_MENU_ACTION_INPUT_METHODS);
        assert_eq!(CUSTOM, ffi::WEBKIT_CONTEXT_MENU_ACTION_CUSTOM);
    }
}
