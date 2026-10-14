use std::collections::HashSet;
use std::ops::Range;
use std::sync::LazyLock;

use regex::Regex;
use serde::Serialize;
use ts_rs::TS;

use super::js::{self, Function};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub enum Rule {
    NulledNotCancelled,
    UnguardedRearm,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub enum Severity {
    Low,
    Medium,
    High,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct Finding {
    pub rule: Rule,
    pub severity: Severity,
    pub function: String,
    pub line: usize,
    pub snippet: String,
}

static SCHEDULE_ASSIGN: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"([A-Za-z_$][\w$.]*)\s*=\s*\$\.Schedule\s*\(").unwrap());
static NULL_ASSIGN: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"([A-Za-z_$][\w$.]*)\s*=\s*null\b").unwrap());

pub fn scan(source: &str) -> Vec<Finding> {
    let stripped = js::strip(source);
    let functions = js::functions(&stripped);
    let mut findings = nulled_not_cancelled(source, &stripped, &functions);
    findings.extend(unguarded_rearm(source, &stripped, &functions));
    findings
}

/// A handle stored from `$.Schedule` and then reset to `null` without cancelling loses the only
/// way to stop that timer. If the function is also entered by another path, each entry starts
/// another timer chain while the old one keeps re-arming.
fn nulled_not_cancelled(source: &str, stripped: &str, functions: &[Function]) -> Vec<Finding> {
    let mut handles = HashSet::new();
    let mut timer_calls: Vec<(String, Range<usize>)> = Vec::new();
    for caps in SCHEDULE_ASSIGN.captures_iter(stripped) {
        let name = caps[1].to_string();
        let open = caps.get(0).unwrap().end() - 1;
        if let Some(close) = js::matching(stripped.as_bytes(), open, b'(', b')') {
            timer_calls.push((name.clone(), open..close));
        }
        handles.insert(name);
    }

    let mut findings = Vec::new();
    for caps in NULL_ASSIGN.captures_iter(stripped) {
        let handle = &caps[1];
        let at = caps.get(0).unwrap().start();
        if !handles.contains(handle) || is_declaration(&stripped[..at]) {
            continue;
        }
        if timer_calls.iter().any(|(name, range)| name == handle && range.contains(&at)) {
            continue;
        }
        let Some(function) = functions.iter().filter(|f| f.body.contains(&at)).min_by_key(|f| f.body.len()) else {
            continue;
        };
        if cancels_before(&stripped[function.body.start..at], handle) {
            continue;
        }

        let severity = match entries(stripped, function) {
            Entries::Other => Severity::High,
            Entries::TimerOnly => continue,
            Entries::None => Severity::Medium,
        };
        findings.push(Finding {
            rule: Rule::NulledNotCancelled,
            severity,
            function: function.name.clone(),
            line: js::line_of(source, at),
            snippet: js::line_text(source, at),
        });
    }
    findings
}

static SCHEDULE_CALL: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\$\.Schedule\s*\(").unwrap());
static REGISTRATION: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\$\.(?:RegisterEventHandler|RegisterForUnhandledEvent|RegisterKeyBind)\s*\(|\.SetPanelEvent\s*\(|\.AddEventHandler\s*\(").unwrap()
});

/// Text and span of the callback argument of every `$.Schedule(delay, callback)`.
fn schedule_callbacks(stripped: &str) -> Vec<(usize, Range<usize>)> {
    let bytes = stripped.as_bytes();
    let mut out = Vec::new();
    for m in SCHEDULE_CALL.find_iter(stripped) {
        let open = m.end() - 1;
        let Some(close) = js::matching(bytes, open, b'(', b')') else { continue };
        let mut depth = 0i32;
        let mut comma = None;
        for (i, &byte) in bytes.iter().enumerate().take(close).skip(open + 1) {
            match byte {
                b'(' | b'[' | b'{' => depth += 1,
                b')' | b']' | b'}' => depth -= 1,
                b',' if depth == 0 => {
                    comma = Some(i);
                    break;
                }
                _ => {}
            }
        }
        if let Some(comma) = comma {
            out.push((m.start(), comma + 1..close));
        }
    }
    out
}

fn mentions(text: &str, name: &str) -> Vec<usize> {
    let pattern = format!(r"(?:^|[^\w$.])({})(?:[^\w$]|$)", regex::escape(name));
    Regex::new(&pattern).unwrap().captures_iter(text).map(|c| c.get(1).unwrap().start()).collect()
}

fn calls(text: &str, name: &str) -> bool {
    let pattern = format!(r"(?:^|[^\w$.]){}\s*\(", regex::escape(name));
    Regex::new(&pattern).unwrap().is_match(text)
}

/// A function that re-arms itself and can be entered again from an event starts a second timer
/// chain on every event, and nothing stops the first. A cancel in the function or a helper it
/// calls counts as a guard.
fn unguarded_rearm(source: &str, stripped: &str, functions: &[Function]) -> Vec<Finding> {
    let schedules: Vec<(&Function, &str)> = schedule_callbacks(stripped)
        .into_iter()
        .filter_map(|(at, callback)| {
            let owner = functions.iter().filter(|f| f.body.contains(&at)).min_by_key(|f| f.body.len())?;
            Some((owner, &stripped[callback]))
        })
        .collect();

    let cancellers: Vec<&Function> =
        functions.iter().filter(|f| stripped[f.body.clone()].contains("CancelScheduled")).collect();

    let registrations: Vec<Range<usize>> = REGISTRATION
        .find_iter(stripped)
        .filter_map(|m| {
            let open = m.end() - 1;
            js::matching(stripped.as_bytes(), open, b'(', b')').map(|close| open..close)
        })
        .collect();

    let mut findings = Vec::new();
    let mut seen = HashSet::new();
    for function in functions {
        let body = &stripped[function.body.clone()];
        let rearms = schedules.iter().any(|(owner, callback)| {
            let names_function = callback.trim() == function.name || calls(callback, &function.name);
            names_function && (owner.body == function.body || calls(body, &owner.name))
        });
        if !rearms || !seen.insert(function.name.clone()) {
            continue;
        }
        let guarded = body.contains("CancelScheduled") || cancellers.iter().any(|c| calls(body, &c.name));
        let event_entry =
            mentions(stripped, &function.name).into_iter().any(|at| registrations.iter().any(|r| r.contains(&at)));
        if guarded || !event_entry {
            continue;
        }
        findings.push(Finding {
            rule: Rule::UnguardedRearm,
            severity: Severity::High,
            function: function.name.clone(),
            line: js::line_of(source, function.start),
            snippet: js::line_text(source, function.start),
        });
    }
    findings
}

fn cancels_before(text: &str, handle: &str) -> bool {
    let pattern = format!(r"\$\.CancelScheduled\s*\(\s*{}\s*\)", regex::escape(handle));
    Regex::new(&pattern).unwrap().is_match(text)
}

fn is_declaration(before: &str) -> bool {
    let word = before.trim_end();
    ["let", "const", "var"].iter().any(|kw| {
        word.strip_suffix(kw).is_some_and(|rest| rest.ends_with(|c: char| c.is_whitespace() || c == ';' || c == '{'))
    })
}

enum Entries {
    /// Referenced somewhere other than its own timer, e.g. an event handler or a direct call.
    Other,
    /// Only ever scheduled as its own `$.Schedule` callback, so the timer has already fired.
    TimerOnly,
    None,
}

fn entries(stripped: &str, function: &Function) -> Entries {
    let name = regex::escape(&function.name);
    let mention = Regex::new(&format!(r"(?:^|[^\w$.])({name})(?:[^\w$]|$)")).unwrap();
    let as_timer_callback = Regex::new(&format!(r"\$\.Schedule\s*\([^;()]*,\s*({name})\s*\)")).unwrap();

    let timer_positions: Vec<usize> =
        as_timer_callback.captures_iter(stripped).map(|c| c.get(1).unwrap().start()).collect();
    let other = mention
        .captures_iter(stripped)
        .map(|c| c.get(1).unwrap().start())
        .any(|at| at != function.start && !function.body.contains(&at) && !timer_positions.contains(&at));
    if other {
        Entries::Other
    } else if timer_positions.is_empty() {
        Entries::None
    } else {
        Entries::TimerOnly
    }
}

#[cfg(test)]
mod tests;
