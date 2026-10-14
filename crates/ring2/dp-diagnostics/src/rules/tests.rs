use super::*;

const LEAKY: &str = "
var handle = null;
function schedule(delay) {
    if (handle !== null) { $.CancelScheduled(handle); handle = null; }
    handle = $.Schedule(delay, refresh);
}
function refresh() {
    handle = null;
    doWork();
    schedule(0.5);
}
$.RegisterForUnhandledEvent('ItemsChanged', function () {
    refresh();
});
";

const FIXED: &str = "
var handle = null;
function cancel() {
    if (handle !== null) { $.CancelScheduled(handle); handle = null; }
}
function schedule(delay) {
    cancel();
    handle = $.Schedule(delay, function () {
        handle = null;
        refresh();
    });
}
function refresh() {
    cancel();
    doWork();
    schedule(0.5);
}
$.RegisterForUnhandledEvent('ItemsChanged', function () {
    refresh();
});
";

fn ids(findings: &[Finding]) -> Vec<Rule> {
    findings.iter().map(|f| f.rule).collect()
}

#[test]
fn flags_handle_nulled_without_cancelling() {
    let findings = scan(LEAKY);
    assert_eq!(ids(&findings), [Rule::NulledNotCancelled]);
    let f = &findings[0];
    assert_eq!(f.function, "refresh");
    assert_eq!(f.line, 8);
    assert_eq!(f.severity, Severity::High);
}

#[test]
fn nulling_inside_the_timer_callback_or_after_a_cancel_is_fine() {
    assert!(scan(FIXED).is_empty());
}

#[test]
fn cancel_earlier_in_the_same_function_clears_the_flag() {
    let src = "
        var h = null;
        function go() {
            $.CancelScheduled(h);
            h = null;
            h = $.Schedule(1, go);
        }
    ";
    assert!(scan(src).is_empty());
}

#[test]
fn cancelling_a_different_handle_does_not_count() {
    let src = "
        var a = null;
        var b = null;
        function go() {
            $.CancelScheduled(b);
            a = null;
            a = $.Schedule(1, go);
        }
        go();
    ";
    assert_eq!(ids(&scan(src)), [Rule::NulledNotCancelled]);
}

#[test]
fn a_function_entered_only_by_its_own_timer_may_null_the_handle() {
    let src = "
        var h = null;
        function tick() {
            h = null;
            h = $.Schedule(1, tick);
        }
        function start() { h = $.Schedule(1, tick); }
    ";
    assert!(scan(src).is_empty());
}

#[test]
fn another_entry_point_by_reference_is_high() {
    let src = "
        var h = null;
        function tick() {
            h = null;
            h = $.Schedule(1, tick);
        }
        $.RegisterEventHandler('Changed', $.GetContextPanel(), tick);
    ";
    let findings: Vec<_> = scan(src).into_iter().filter(|f| f.rule == Rule::NulledNotCancelled).collect();
    assert_eq!(ids(&findings), [Rule::NulledNotCancelled]);
    assert_eq!(findings[0].severity, Severity::High);
}

#[test]
fn severity_is_medium_when_the_function_has_no_visible_entry() {
    let src = "
        var h = $.Schedule(1, f);
        function reset() { h = null; }
    ";
    let findings = scan(src);
    assert_eq!(ids(&findings), [Rule::NulledNotCancelled]);
    assert_eq!(findings[0].severity, Severity::Medium);
}

#[test]
fn declaration_initialisers_are_not_resets() {
    let src = "
        function other() { h = $.Schedule(1, other); }
        function create() {
            let h = null;
            let k = 1;
        }
    ";
    assert!(scan(src).is_empty());
}

#[test]
fn variables_never_assigned_from_schedule_are_ignored() {
    let src = "
        var cache = null;
        function reset() { cache = null; }
        var h = $.Schedule(1, reset);
    ";
    assert!(scan(src).is_empty());
}

#[test]
fn comments_and_strings_are_not_code() {
    let src = "
        var h = null;
        // h = $.Schedule(1, f);
        var s = 'h = $.Schedule(1, f)';
        function f() { h = null; }
    ";
    assert!(scan(src).is_empty());
}

#[test]
fn reports_each_leaking_function_once_per_assignment() {
    let src = "
        var h = null;
        function a() { h = null; h = $.Schedule(1, a); }
        function b() { h = null; }
        a(); b();
    ";
    let names: Vec<_> = scan(src).into_iter().map(|f| f.function).collect();
    assert_eq!(names, ["a", "b"]);
}

fn rearm(src: &str) -> Vec<String> {
    scan(src).into_iter().filter(|f| f.rule == Rule::UnguardedRearm).map(|f| f.function).collect()
}

#[test]
fn flags_self_rearming_function_with_an_event_entry() {
    let src = "
        function poll() {
            work();
            $.Schedule(0.5, poll);
        }
        $.RegisterForUnhandledEvent('Changed', poll);
    ";
    assert_eq!(rearm(src), ["poll"]);
}

#[test]
fn flags_rearm_through_an_anonymous_callback_and_a_handler_body() {
    let src = "
        function poll() {
            work();
            $.Schedule(0.5, function () { poll(); });
        }
        $.RegisterEventHandler('Changed', $.GetContextPanel(), function () { poll(); });
    ";
    assert_eq!(rearm(src), ["poll"]);
}

#[test]
fn flags_rearm_through_a_scheduling_helper() {
    let src = "
        function later(d) { $.Schedule(d, poll); }
        function poll() {
            work();
            later(0.5);
        }
        $.RegisterForUnhandledEvent('Changed', poll);
    ";
    assert_eq!(rearm(src), ["poll"]);
}

#[test]
fn startup_calls_are_not_repeatable_entries() {
    let src = "
        function poll() { work(); $.Schedule(0.5, poll); }
        function init() { poll(); }
        poll();
        init();
    ";
    assert!(rearm(src).is_empty());
}

#[test]
fn a_cancel_in_the_function_or_a_helper_it_calls_is_a_guard() {
    let direct = "
        var h = null;
        function poll() {
            $.CancelScheduled(h);
            h = $.Schedule(0.5, poll);
        }
        $.RegisterForUnhandledEvent('Changed', poll);
    ";
    let helper = "
        function stop() { $.CancelScheduled(h); }
        function poll() {
            stop();
            h = $.Schedule(0.5, poll);
        }
        $.RegisterForUnhandledEvent('Changed', poll);
    ";
    assert!(rearm(direct).is_empty());
    assert!(rearm(helper).is_empty());
}

#[test]
fn a_one_shot_scheduled_by_another_function_is_not_a_rearm() {
    let src = "
        function once() { work(); }
        function start() { $.Schedule(1, once); }
        $.RegisterForUnhandledEvent('Changed', once);
    ";
    assert!(rearm(src).is_empty());
}

#[test]
fn findings_carry_the_trimmed_source_line() {
    let findings = scan(LEAKY);
    assert!(!findings.is_empty());
    for f in &findings {
        let expected = LEAKY.lines().nth(f.line - 1).unwrap().trim();
        assert_eq!(f.snippet, expected);
    }
}

#[test]
fn findings_carry_the_rule_and_function_but_no_english_text() {
    let finding = &scan(LEAKY)[0];
    let json = serde_json::to_value(finding).unwrap();
    assert_eq!(json["rule"], "nulledNotCancelled");
    assert_eq!(json["function"], "refresh");
    assert!(json.get("message").is_none(), "finding still carries text: {json}");
}
