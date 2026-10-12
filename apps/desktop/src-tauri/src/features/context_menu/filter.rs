#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EntryKind {
    Item,
    Submenu,
    Separator,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Entry {
    pub name: String,
    pub kind: EntryKind,
}

#[derive(Debug, PartialEq, Eq)]
pub struct Plan {
    /// Ascending indices into the entries the plan was made from.
    pub remove: Vec<usize>,
    pub empty: bool,
}

/// WebView2 item names. The documentation and shipped runtimes disagree on the casing of `spellcheck`, so matching
/// ignores case.
const WANTED: [&str; 14] = [
    "back",
    "forward",
    "reload",
    "undo",
    "redo",
    "cut",
    "copy",
    "paste",
    "pasteAndMatchStyle",
    "selectAll",
    "copyLinkLocation",
    "copyImage",
    "copyImageLocation",
    "spellcheck",
];
const INSPECT: &str = "inspectElement";

fn wanted(name: &str, debug: bool) -> bool {
    WANTED.iter().any(|kept| name.eq_ignore_ascii_case(kept)) || (debug && name.eq_ignore_ascii_case(INSPECT))
}

pub fn plan(entries: &[Entry], debug: bool) -> Plan {
    let mut remove = Vec::new();
    let mut kept_any = false;
    let mut pending_separator = None;
    for (index, entry) in entries.iter().enumerate() {
        if entry.kind == EntryKind::Separator {
            if kept_any && pending_separator.is_none() {
                pending_separator = Some(index);
            } else {
                remove.push(index);
            }
        } else if wanted(&entry.name, debug) {
            kept_any = true;
            pending_separator = None;
        } else {
            remove.push(index);
        }
    }
    remove.extend(pending_separator);
    remove.sort_unstable();
    Plan { remove, empty: !kept_any }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SEP: &str = "-";

    fn entries(names: &[&str]) -> Vec<Entry> {
        names
            .iter()
            .map(|name| {
                let kind = if *name == SEP { EntryKind::Separator } else { EntryKind::Item };
                Entry { name: (*name).to_owned(), kind }
            })
            .collect()
    }

    fn kept(names: &[&str], debug: bool) -> Vec<String> {
        let list = entries(names);
        let plan = plan(&list, debug);
        list.iter().enumerate().filter(|(i, _)| !plan.remove.contains(i)).map(|(_, e)| e.name.clone()).collect()
    }

    #[test]
    fn every_wanted_entry_stays() {
        for name in [
            "back",
            "forward",
            "reload",
            "undo",
            "redo",
            "cut",
            "copy",
            "paste",
            "pasteAndMatchStyle",
            "selectAll",
            "copyLinkLocation",
            "copyImage",
            "copyImageLocation",
            "spellcheck",
        ] {
            let result = plan(&entries(&[name]), false);
            assert_eq!(result, Plan { remove: vec![], empty: false }, "{name}");
        }
    }

    #[test]
    fn unwanted_and_unknown_entries_go() {
        for name in [
            "saveAs",
            "print",
            "share",
            "openLinkInNewWindow",
            "saveImageAs",
            "saveLinkAs",
            "copyLinkText",
            "extension",
            "custom",
            "somethingAddedNextYear",
            "",
        ] {
            assert_eq!(kept(&["copy", name], false), ["copy"], "{name}");
        }
    }

    #[test]
    fn names_match_in_any_casing() {
        assert_eq!(
            kept(&["spellCheck", "SelectAll", "COPYIMAGE", "saveas"], false),
            ["spellCheck", "SelectAll", "COPYIMAGE"]
        );
    }

    #[test]
    fn inspect_stays_only_in_debug() {
        assert_eq!(kept(&["copy", SEP, "inspectElement"], true), ["copy", SEP, "inspectElement"]);
        assert_eq!(kept(&["copy", SEP, "inspectElement"], false), ["copy"]);
    }

    #[test]
    fn leading_separators_go() {
        assert_eq!(kept(&[SEP, "copy"], false), ["copy"]);
        assert_eq!(kept(&["saveAs", SEP, "copy"], false), ["copy"]);
    }

    #[test]
    fn trailing_separators_go() {
        assert_eq!(kept(&["copy", SEP], false), ["copy"]);
        assert_eq!(kept(&["copy", SEP, "print", SEP, "share"], false), ["copy"]);
    }

    #[test]
    fn doubled_separators_collapse_to_one() {
        assert_eq!(kept(&["back", SEP, SEP, "copy"], false), ["back", SEP, "copy"]);
        assert_eq!(kept(&["back", SEP, "saveAs", SEP, "print", SEP, "copy"], false), ["back", SEP, "copy"]);
    }

    #[test]
    fn separators_between_kept_entries_stay() {
        assert_eq!(
            plan(&entries(&["back", "forward", SEP, "copy", SEP, "selectAll"]), false),
            Plan { remove: vec![], empty: false }
        );
    }

    #[test]
    fn a_submenu_that_is_not_wanted_goes_whole() {
        let list = vec![
            Entry { name: "copy".to_owned(), kind: EntryKind::Item },
            Entry { name: "moreTools".to_owned(), kind: EntryKind::Submenu },
        ];
        assert_eq!(plan(&list, true), Plan { remove: vec![1], empty: false });
    }

    #[test]
    fn nothing_left_is_reported_as_empty() {
        assert_eq!(
            plan(&entries(&["saveAs", SEP, "print", SEP, "inspectElement"]), false),
            Plan { remove: vec![0, 1, 2, 3, 4], empty: true }
        );
        assert_eq!(plan(&entries(&[SEP, SEP]), false), Plan { remove: vec![0, 1], empty: true });
    }

    #[test]
    fn a_menu_with_no_entries_is_empty() {
        assert_eq!(plan(&[], false), Plan { remove: vec![], empty: true });
    }

    #[test]
    fn removal_indices_ascend() {
        let result = plan(&entries(&[SEP, "print", "copy", SEP, "saveAs", SEP]), false);
        assert_eq!(result.remove, [0, 1, 3, 4, 5]);
    }
}
