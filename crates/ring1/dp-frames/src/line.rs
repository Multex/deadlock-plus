#[derive(Debug, Clone, PartialEq, Eq)]
pub enum FrameLine {
    Present(u64),
    Others(u32),
    Failed(String),
}

pub fn encode(line: &FrameLine) -> String {
    match line {
        FrameLine::Present(ticks) => format!("D {ticks}\n"),
        FrameLine::Others(count) => format!("O {count}\n"),
        FrameLine::Failed(message) => format!("X {}\n", message.replace(['\n', '\r'], " ")),
    }
}

pub fn decode(line: &str) -> Option<FrameLine> {
    let line = line.strip_suffix('\n').unwrap_or(line);
    let line = line.strip_suffix('\r').unwrap_or(line);
    if let Some(message) = line.strip_prefix("X ") {
        return Some(FrameLine::Failed(message.to_string()));
    }
    if let Some(ticks) = line.strip_prefix("D ") {
        return digits(ticks)?.parse().ok().map(FrameLine::Present);
    }
    let count = line.strip_prefix("O ")?;
    digits(count)?.parse().ok().map(FrameLine::Others)
}

fn digits(s: &str) -> Option<&str> {
    (!s.is_empty() && s.bytes().all(|b| b.is_ascii_digit())).then_some(s)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trips() {
        for line in [
            FrameLine::Present(0),
            FrameLine::Present(u64::MAX),
            FrameLine::Others(0),
            FrameLine::Others(u32::MAX),
            FrameLine::Failed("trace failed".into()),
            FrameLine::Failed(String::new()),
        ] {
            assert_eq!(decode(&encode(&line)), Some(line));
        }
    }

    #[test]
    fn encodes_one_line_with_prefix() {
        assert_eq!(encode(&FrameLine::Present(42)), "D 42\n");
        assert_eq!(encode(&FrameLine::Others(3)), "O 3\n");
        assert_eq!(encode(&FrameLine::Failed("a\nb\r\nc".into())), "X a b  c\n");
    }

    #[test]
    fn decodes_without_trailing_newline() {
        assert_eq!(decode("D 7"), Some(FrameLine::Present(7)));
        assert_eq!(decode("O 7\r\n"), Some(FrameLine::Others(7)));
    }

    #[test]
    fn rejects_malformed() {
        for bad in [
            "",
            "\n",
            "D",
            "D ",
            "D x",
            "D -1",
            "D +1",
            "O 1.5",
            "Z 1",
            "d 1",
            "D1",
            " D 1",
            "{}",
            "P i 1.1.1.1 1 1",
            "E boom",
            "F 1.1.1.1",
        ] {
            assert_eq!(decode(bad), None, "{bad:?}");
        }
    }

    #[test]
    fn rejects_overflow() {
        assert_eq!(decode("D 18446744073709551616"), None);
        assert_eq!(decode("O 4294967296"), None);
        assert_eq!(decode("D 18446744073709551615"), Some(FrameLine::Present(u64::MAX)));
    }

    #[test]
    fn rejects_extra_fields() {
        assert_eq!(decode("D 1 2"), None);
        assert_eq!(decode("O 1 "), None);
        assert_eq!(decode("D 1\nD 2\n"), None);
    }

    #[test]
    fn failed_keeps_message_verbatim() {
        assert_eq!(decode("X  spaced  out "), Some(FrameLine::Failed(" spaced  out ".into())));
    }
}
