use dp_gamedata::{CcSet, Install, SteamInstall};

/// Rewrites the bundled hard-CC list from an installed game.
///
/// `cargo run -p dp-gamedata --example cc_abilities -- [citadel dir] [out.tsv]`
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut args = std::env::args_os().skip(1);
    let dir = match args.next() {
        Some(dir) => std::path::PathBuf::from(dir),
        None => SteamInstall.citadel_dir().ok_or("Deadlock install not found")?,
    };
    let tsv = CcSet::from_install(&dir)?.to_tsv();
    match args.next() {
        Some(out) => std::fs::write(out, tsv)?,
        None => print!("{tsv}"),
    }
    Ok(())
}
