use crate::kind::{ClientKind, Pipe};

/// What opening one endpoint to label it found.
#[cfg_attr(not(any(unix, windows)), allow(dead_code))]
pub(crate) enum Probe {
    Labelled(Option<ClientKind>),
    /// The endpoint exists but has no free instance, so it could not be inspected. Not remembered: opening a busy
    /// pipe fails before Discord sees it, so asking again is cheap. Only Windows named pipes run out of instances.
    #[cfg_attr(not(windows), allow(dead_code))]
    Busy,
    Gone,
}

/// Remembers each endpoint's label for as long as it stays listed. Discord accepts and then drops every
/// connection that opens its pipe, so an endpoint is opened to label it once, not on every look.
#[derive(Debug, Default)]
pub struct Discovery {
    known: Vec<Pipe>,
}

fn same_endpoint(a: &Pipe, b: &Pipe) -> bool {
    a.index == b.index && a.path == b.path
}

impl Discovery {
    pub fn new() -> Self {
        Self::default()
    }

    /// The running Discord clients' endpoints, listed without opening them; only endpoints not seen before are
    /// opened to learn their client.
    #[cfg(any(unix, windows))]
    pub fn pipes(&mut self) -> Vec<Pipe> {
        self.refresh(crate::platform::endpoints(), crate::platform::probe)
    }

    #[cfg(not(any(unix, windows)))]
    pub fn pipes(&mut self) -> Vec<Pipe> {
        Vec::new()
    }

    #[cfg_attr(not(any(unix, windows)), allow(dead_code))]
    pub(crate) fn refresh(&mut self, present: Vec<Pipe>, mut probe: impl FnMut(&Pipe) -> Probe) -> Vec<Pipe> {
        self.known.retain(|k| present.iter().any(|p| same_endpoint(k, p)));
        present
            .into_iter()
            .filter_map(|endpoint| {
                if let Some(known) = self.known.iter().find(|k| same_endpoint(k, &endpoint)) {
                    return Some(known.clone());
                }
                match probe(&endpoint) {
                    Probe::Labelled(kind) => {
                        let pipe = Pipe { kind, ..endpoint };
                        self.known.push(pipe.clone());
                        Some(pipe)
                    }
                    Probe::Busy => Some(endpoint),
                    Probe::Gone => None,
                }
            })
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use ClientKind::*;

    fn listed(indexes: &[u8]) -> Vec<Pipe> {
        indexes.iter().map(|&i| Pipe::new(i, None)).collect()
    }

    fn kinds(pipes: &[Pipe]) -> Vec<(u8, Option<ClientKind>)> {
        pipes.iter().map(|p| (p.index, p.kind)).collect()
    }

    #[test]
    fn a_listed_endpoint_is_opened_once_while_it_stays() {
        let mut d = Discovery::new();
        let mut opened = Vec::new();
        for _ in 0..5 {
            let pipes = d.refresh(listed(&[0, 1]), |p| {
                opened.push(p.index);
                Probe::Labelled(Some(if p.index == 0 { Stable } else { Canary }))
            });
            assert_eq!(kinds(&pipes), [(0, Some(Stable)), (1, Some(Canary))]);
        }
        assert_eq!(opened, [0, 1]);
    }

    #[test]
    fn an_endpoint_that_comes_back_is_labelled_again() {
        let mut d = Discovery::new();
        let mut opened = 0;
        let mut probe = |_: &Pipe| {
            opened += 1;
            Probe::Labelled(Some(Ptb))
        };
        d.refresh(listed(&[0]), &mut probe);
        assert!(d.refresh(listed(&[]), &mut probe).is_empty());
        d.refresh(listed(&[0]), &mut probe);
        assert_eq!(opened, 2);
    }

    #[test]
    fn a_busy_endpoint_is_listed_unlabelled_and_asked_again() {
        let mut d = Discovery::new();
        let mut asked = 0;
        for _ in 0..2 {
            let pipes = d.refresh(listed(&[3]), |_| {
                asked += 1;
                Probe::Busy
            });
            assert_eq!(kinds(&pipes), [(3, None)]);
        }
        assert_eq!(asked, 2);
    }

    #[test]
    fn an_unidentified_owner_is_remembered_too() {
        let mut d = Discovery::new();
        let mut asked = 0;
        for _ in 0..3 {
            d.refresh(listed(&[2]), |_| {
                asked += 1;
                Probe::Labelled(None)
            });
        }
        assert_eq!(asked, 1);
    }

    #[test]
    fn a_stale_endpoint_is_left_out() {
        let mut d = Discovery::new();
        assert!(d.refresh(listed(&[4]), |_| Probe::Gone).is_empty());
    }
}
