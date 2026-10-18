# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Deadlock+ reopens on the page you last had open, including match details.
- Settings > Appearance has a UI scale slider, from 80 to 150%.
- Hardware acceleration can be turned off on Windows and Linux, with a button to restart Deadlock+ and apply it.
- Deadlock+ can open its window when Deadlock starts, even from the tray.
- Clicking a Deadlock+ desktop notification opens the page it is about.
- In unranked matches, the Live page shows each player's rank from their ranked matches.

#### Game overlay

- Notifications show over the game instead of as Windows notifications while you play.
- The overlay needs Borderless Window or Window mode; Settings says when Deadlock is in Full Screen.
- The game overlay has its own Settings page, with a switch to turn it off.
- You can pick where overlay notifications appear on screen.
- You can choose how long overlay notifications stay up.
- A Show test button shows a sample notification over the game.
- The test notification waits 3 seconds, so you can click into the game first.
- Overlay notifications move with you when you switch into or out of the game.
- "Match found" shows in the middle of your screen when your queue pops, even over another window or a fullscreen video.
- "Match found" only shows while you are tabbed out, since Deadlock shows its own when it is in front.
- Settings > Notifications has a switch to turn "Match found" off.

#### Notification settings

- Settings > Notifications lists every notification type, each with its own switch.
- Each type except "Match found" lets you choose how it shows: over the game, as a desktop notification, or only in the notification center.
- Server block updates and out-of-date warnings can be turned off separately.
- The break reminder switch is also in Settings > Notifications.

#### Match grades

- Deadlock+ grades your recent matches in the background, against a weekly sample of real matches.
- Each graded player gets a score from 0 to 100, a letter from S+ to F, and a place in the match.
- Grades compare each player with others on the same hero, adjusted for the lobby's rank and the match length.
- Each match in Match History shows your grade and place under the result.
- The match detail shows every graded player's grade; hover one for a breakdown of each stat.
- Matches where someone left early are marked, since every grade in them is skewed.
- Settings > Storage lists the match grades, with a clear action.

#### Live performance grades

- The Live page grades how you play, from E to S, while the match runs.
- Grades compare you with players of your hero at your lobby's rank, at the same point in the match.
- Kills, deaths, assists, souls, damage, objective damage and healing each get a grade, plus an overall grade.
- Hover a grade to see the average and how many players you beat.

#### Linux

- The Live page says when Linux blocks Deadlock+ from reading the game, with a button to allow it.
- The taskbar icon shows your unread notification count on docks that support it.
- The right-click menu shows the same short list as on Windows.
- Notifications know when Deadlock is in front on X11 and XWayland.
- Frame time stats leave out the time you spend tabbed out of the game.
- The server block update job is listed in Jobs and can be turned off.
- Support reports include the session type, desktop, Steam install type and package type.

#### Match recovery

- Match History shows how many of your matches have full details, and how many recent ones have replays.
- Matches the Deadlock API is missing show a "No details" badge in Match History.
- A Recover button in Match History fills in your missing matches.
- The recovery panel shows progress, time left and each Steam account's use for the day.
- You can pause, resume or cancel recovery.
- Paused recovery stays paused after a restart.
- Recovery continues on its own when Deadlock closes or the daily limit resets.
- Recovery takes up to 40 matches per Steam account a day.
- The status bar shows recovery progress and links to Match History.
- A match the Deadlock API is missing shows what is known and how to recover it, instead of an error.
- You can recover a single match from its page.
- Settings > Privacy opens recovery in Match History.

### Changed

- Matches Deadlock+ sends to the Deadlock API are labelled as coming from Deadlock+.
- The match time and mode now sit at the top of the Live page.
- Server block updates no longer show a Windows notification while you're in the game.
- When the game files can't be read, the replay map keeps the markers from the last game version it read.
- With no earlier map data, the replay map gets most of its markers from the Deadlock API, without lane lines.
- "Match found" shows only over the game, never as a desktop notification or in the notification center.
- On Linux, Settings hides the game overlay options, since the overlay is Windows only.
- On Linux, background server block updates no longer ask for your password; Deadlock+ says the blocks are out of date instead.
- Linux builds now run on Ubuntu 22.04 and Debian 12.
- Uninstalling Deadlock+ on Windows now lifts its server blocks.

#### Administrator access

- Deadlock+ no longer asks for administrator rights when it starts.
- Windows asks for permission only when you use a feature that needs it: blocking servers, live connection stats or frame recording.
- Allow gives access until you stop using those features for a few minutes.
- Always allow asks once, then never again on this Windows account.
- Admin access goes to a small separate Deadlock+ helper.
- Settings > Startup and background switches between Ask each time and Always allow.
- The welcome steps let you pick Always allow or Ask me later.
- The admin access buttons wait until your match ends.
- The Live page says when Deadlock itself runs as administrator, which stops Deadlock+ from reading it.
- Start with Windows uses the Windows startup list instead of a scheduled task, and the update moves it for you.
- If the admin helper is from another Deadlock+ version, Deadlock+ asks you to reinstall instead of failing quietly.

### Fixed

- Saved and copied scoreboard images no longer show scrollbars when Windows or Deadlock+ scaling is above 100%.
- Team names in saved and copied scoreboard images stay on one line instead of covering the team totals.
- Map positions and some hero and item images load again after Deadlock's October 16 patch.
- Hero, item, ability, rank and minimap images no longer break when Deadlock updates while Deadlock+ is open.
- A new hero's Discord art shows up within an hour of the Deadlock API publishing it, instead of up to a week later.
- Pressing Play while match salts are being recovered no longer says Deadlock is being played on another computer.
- Discord shows "Finding match" with the queue timer again when you queue as a party.
- Sharing your matches no longer fails when Steam's cache holds more than 1,000 of them.
- Every replay link in a Steam cache entry is shared, not just the first.
- Match recovery hands unfinished matches back to the Deadlock API after each run, so other helpers can pick them up.
- Discord shows the mode you queued for when you queue as a party.
- The Live page's current server ignores other traffic from the game, like voice chat.
- The Live page's current server clears when you leave a server, instead of showing the last one.
- The Live page switches to your new server at once when you go from a match to the Hideout or the next match.
- "Match found" over the game also shows when you queue as a party.
- Match salt recovery no longer misses friends' online status when many answer at once.
- On Linux, ping times no longer fail on systems set to a language other than English.
- On NixOS, blocking servers finds the password prompt instead of failing.
- On Linux, Deadlock+ picks the Steam install you last signed in to when there are several.
- Discord presence works with Vesktop installed from Flatpak.
- On Linux desktops without a tray, starting with your computer shows the window instead of hiding it.
- A server's switch in the Server Picker goes back to its real state when blocking or unblocking fails.

## [0.12.0] - 2026-10-15

### Added

- Replay key recovery can fetch your whole match history at once from Match sharing settings, past the daily limit.
- A banner offers a waiting update once it is a day old, and comes back each time you open the window until you install it.
- The update notice has an Install button.
- The break reminder now sends a desktop notification when your session reaches three losses in a row.

#### Presence page

- Discord presence has its own Presence page in the sidebar.
- The status bar always links to Presence, and shows "Discord off" while presence is off.
- Setup offers a "Show on Discord" switch.
- The activity editor says when only the Detailed level uses its states.

### Changed

- The Updates page is now called News.
- Performance, Mutes and Replays sit in a Tools group in the sidebar that you can fold.
- Storage moved into Settings.
- Match sharing has its own Settings category.
- Settings > About now holds Thanks, Licenses and a What's new link.
- Settings search now finds items by their category name and description.
- Background tasks moved under Advanced in Startup settings.
- The "Pause while Deadlock is open" setting is gone: each background task now sets what it does in game.
- Resetting the usage data ID moved under Advanced in Privacy settings.
- Ctrl+1 to Ctrl+7 now open Home through Presence.
- Anonymous usage data now counts Presence visits.
- The "Download Deadlock+" button on your Discord activity now opens the Deadlock+ website.

- The Discord link opens the invite in the Discord app when it is installed.
- Anonymous usage data now counts clicks on the Discord link.
- Screen readers now announce which player, replay, region or preset a button acts on.
- The player menus on a match page are named after their card for screen readers.
- Replay key recovery now checks your Steam friends' newest matches first.
- Replay key recovery stops asking for a match after three tries when the community database still cannot use it.
- Error messages are one plain sentence and no longer show technical details.
- The app says "replay keys" instead of "salts", "servers" instead of "relays" and "mods" instead of "addons".
- Deadlock+ checks for updates when you open its window, not only once an hour.
- Anonymous usage data now counts Match History and What's New visits.
- Anonymous usage data now counts when an update is offered and when you start it.

#### Rank in Stats

- Rank is now part of the Stats page and no longer has its own sidebar entry.
- Your rank, next win and loss, and demotion shields sit at the top of Stats.
- An Outlook card compares the winrate that holds your rank with your recent winrate.
- The rank chart marks each promotion and demotion with a triangle.
- The rank's recent matches and rank changes lists are gone; Match History and the chart show them.
- The Stats filters now apply only to the "Your games" section.

#### Sessions in Match History

- Sessions is now part of Match History and no longer has its own sidebar entry.
- Match History groups your matches by play session instead of by day.
- Each session shows its verdict, games, record, length and rank change above its matches.
- "What your results say" sits below the match list.
- The break reminder switch sits above the session list.

### Fixed

- Home, Stats, Rank, Sessions and Match History no longer request your history in a loop when the Deadlock API is down.
- Confirmation dialogs in Mutes, Server Picker and the Discord activity editor now close after you confirm.
- A Discord activity change made just before leaving the page is no longer lost.
- Home no longer shows "Loading..." forever when no Steam account is found.
- Home shows your blocked region count before you open Server Picker.
- A match that fails to load offline now shows a clear connection message.
- Mutes shows "No Steam account found" as a plain state, with Import and Export turned off.
- The import question in Mutes no longer changes its wording as it closes.
- The unmute question can no longer be confirmed once Deadlock starts.
- Replay key recovery keeps working when the Deadlock API's list of missing matches fails to load.
- Replay key recovery retries a failed upload instead of losing the match.
- The tray menu now switches to your chosen language.
- Desktop notifications now appear in your chosen language.
- Counts such as "2,093 matches" now use your language's number format.
- Notices no longer run out while the Deadlock+ window is hidden.
- Pages that refresh on a timer now pause while Deadlock+ is minimized or in the tray.
- Opening Deadlock+ from the tray or taskbar now checks for updates when the last check is over 10 minutes old.
- Live match reading no longer drops out and reconnects after a bad memory read on some PCs.

## [0.11.0] - 2026-10-12

### Added

- Linux downloads (AppImage and deb) are now published with each release.
- The Linux app can update itself.
- Settings > Diagnostics can build a support report you can read, copy or save. Nothing is sent for you.
- The app version shows in the bottom-left corner of the status bar.

#### Match History

- A new Match History page lists every match the Deadlock API knows for your account.
- Filter matches by mode, hero, outcome and date, or show only custom matches.
- Open a match for the full scoreboard: both teams, items, ranks and bans.
- The scoreboard marks the game's MVP and key players.
- A match you just played opens with its full scoreboard before the Deadlock API has it, marked as provisional.
- That scoreboard is kept until the API has the match. Clear it under Storage > Post-game match data.
- Match pages include souls and damage over time, a purchase timeline, damage dealt, objectives and accolades.
- The Purchases card steps through every item a player bought or sold and every ability they unlocked or upgraded.
- Each purchase step shows the items the player held and their ability levels at that moment.
- Hover the souls and damage charts to read the values at that moment in a tooltip.
- Pick the player a match card shows from the card's own header.
- Match page tables and the scoreboard have written column and stat names, and objectives are named.
- Opened matches are cached for three days. Clear them under Storage > Match detail cache.

#### Match replay

- A match page now has a minimap replay with every player moving over the match.
- Play, pause and scrub the replay, at up to 4x speed.
- A shared timeline shows deaths, objectives, Mid Boss, item buys and sells, and net worth swings.
- Click a marker on the timeline to jump the replay to that moment.
- The replay map draws the lanes, Guardians, Walkers, Shrines, Base Guardians and Patrons, and removes each one when it falls.
- Players on the replay map use the game's own minimap icons, with allies in cream and enemies in red-orange.
- A Patron stays on the replay map through its second phase, as its centre diamond, until its Core falls.
- Neutral camps and the Mid Boss appear on the replay map at their estimated spawn times.
- A camp disappears from the replay map when it is cleared and returns when it respawns.
- Camp clears on the replay map are estimated from player movement, so some will be off.
- The Camps button hides or shows neutral camps on the replay map.
- The replay map shows shops, and a lane's shop goes away with its Guardian.
- The replay map shows the four teleporters.
- Hover an objective on the replay map to see how much Gun, Spirit and Trooper damage it took.
- A destroyed objective stays highlighted on the replay map for a few seconds.
- Death map mode shows every death and who got the kill, filtered by player and time.
- Death map opens on your own deaths, each with the hero who killed you.
- Step through deaths one at a time to see where every player stood at that moment.
- Hover a death on the death map to bring it to the front and fade the others.
- Replays need the match's movement data, so they are not available for provisional matches.

#### Match ping

- A match page now has a Ping card with your ping over the match, plus average and worst.
- Each match you play is recorded second by second, using the game's own connection when it can be read.
- If the game's connection can't be read, the card falls back to the ping to the relay.
- The card says which one it shows, and notes when recording began after the match started.
- The Live page ping card now shows the game's own ping, jitter and packet loss during a match.
- The Live page ping chart follows the same source.
- The relay ping is shown only when the game's connection can't be read.
- Matches played before this update show ping to the relay for the match's time window, if it is still stored.
- Clear recordings under Storage > Match ping recordings. The match in progress is kept.

#### Match scoreboard extras

- Your row on the scoreboard shows how each stat compares with your average on that hero.
- A summary line counts how many stats were better or worse than your average.
- Save the scoreboard as an image, or copy it to the clipboard.

### Changed

- Dropdowns across the app are now drawn by the app instead of the system, with an icon for each option.
- Hero dropdowns show each hero's icon.
- Buttons have clearer hover, pressed and switched-on states.
- On Windows, the right-click menu now only offers Back, Forward, Refresh, text editing, Copy link and Copy image.
- Russian and Turkish are now partly translated. Untranslated text shows in English.
- On Linux, the capture helper runs from a root-owned copy, only accepts connections from root and gives up its privileges once capture starts.
- On Linux, capture and the firewall report an error if `pkexec` or `nft` is not in a standard system folder.
- Steam links in patch notes now open only if they are store pages, Deadlock launch links or Steam web pages.
- The thanks page now shows each translator's language in its own name, followed by its name in your language.
- The Support Deadlock+ link now also shows in Settings > About, What's New, the thanks page, the update notice and the patch notes viewer.
- Match History, Stats and Demos show the Support Deadlock+ link while they are empty.

#### Game data from your install

- Hero portraits and icons now load from your Deadlock install, with the online copy as a fallback.
- Hero names now follow the app's language, read from your Deadlock install.
- A newly released hero shows up in the app without waiting for an app update.
- Rank badges now load from your Deadlock install, with the online copy as a fallback.
- Objective, camp and shop positions are now read from your Deadlock install.
- Those positions refresh on their own after a game update.
- Map marker icons and hero map heads now load from your Deadlock install.

#### Performance

- The app starts faster and uses less memory at launch.
- The server picker, Steam account, voice ban, storage and demo pages no longer freeze the window while they read files.
- Logging, the network monitor and the alerts check do less work in the background, and none while the game is closed.
- Patch-note searches are quicker, and the search data takes about half the disk space.
- Country flags load as separate files instead of being packed into the app's main script.

### Fixed

- On Linux, Deadlock is now detected when it runs under Proton.
- On Linux with Proton, the Live page no longer says Deadlock is not running while the game is open.
- On Linux with Proton, the Live page now loads the player table.
- Heroes released after the app last loaded its hero list now show their art in the app and in Discord, instead of a placeholder.
- Unreleased test heroes no longer appear in the hero list.

### Removed

- The ping-only recent matches list on the Live page is gone. Match History replaces it.
- The ExitLag comparison, calibration and path view on the Live page are gone. They were rarely accurate.

## [0.10.0] - 2026-10-08

### Added

- The Live page, instant match results and Discord game status are now enabled on Linux. Some systems must allow memory reads first; the README explains how.

### Changed

- The Live page, Discord and match capture now share one connection to the game.
- The Live page uses less CPU.
- Background updates pause while the window is hidden.
- Frame capture uses far less CPU while recording.
- Background workers use less CPU when idle.
- The status bar is more compact.
- The Live page shows each game state, such as closed, menus and searching, in a card with an icon and a short hint.
- The Live page says "Reading the match" while player data loads, instead of showing nothing useful.

### Removed

- macOS support. Nobody could test it, and the game reader does not support it.
- Hero Labs, which no longer exists in the game, is gone from Discord and the Live page.
- The "Hero select" Discord status is gone, including its editor entry. We could not read the hero select screen reliably, and it also showed on the post-game scoreboard.

### Fixed

- The Live page updates even when no Steam account is signed in.

#### Discord status

- Discord shows "Finding match" again when you search solo.
- Discord correctly shows the game mode you are searching for, such as Ranked or Street Brawl.
- Discord shows the Sandbox and Explore NYC instead of "Main menu" or "Hideout".
- Discord shows "Setting up a bot match" while you start a private bot match.
- A private match against only bots shows as a bot match on Discord.
- Discord keeps your last status for up to 30 seconds while a map loads instead of flashing "Playing Deadlock".

#### Game performance

- Deadlock+ no longer lowers your FPS when the game starts.
- Deadlock+ uses less CPU in the menus, so it no longer lowers your FPS there.
- Deadlock+ no longer causes FPS drops while you sit in the Hideout.

## [0.9.1] - 2026-10-06

### Added

- The status bar shows your Discord presence state. Click it to open Discord settings.
- The status bar shows your live match: searching, starting, in match with the clock, paused or finished. Click it to open Live.

### Changed

- The Live page subtitle and description now mention both teams.

### Fixed

- Closing the app no longer fails while sending the final usage report.


## [0.9.0] - 2026-10-06

### Added

- Settings has a Thanks page for contributors, translators and donators.

#### Live match

- Live shows both teams during a match: heroes, ranks, souls, K/D/A, damage and healing, with team totals.
- Hover a player to open their Steam profile or Statlocker page.
- When a player switches hero after pregame, a notice lists the change and the player's row is marked.
- The connection section lists each match's average and worst ping, with the server.
- A one-line status above the connection shows what the game is doing: reading off, game closed, menus, queuing, pregame, in match or post-match.

#### Telemetry

- Deadlock+ now sends ANONYMOUS usage data and error reports, so the team can see how many people use it and what breaks.
- It is on by default. New installs are told in the setup, and existing users get a one-time notice.
- Turn it off in Settings > Privacy. Nothing is sent after that.
- It uses a random install ID. Settings > Privacy can reset it.
- It never sends your Steam ID, paths, names, IP address or match data. The README lists exactly what is sent.

### Changed

- Instant match results are now always enabled.
- The Connection page has been turned into a Live page. It shows your connection details underneath information about the match in progress.

### Fixed

- Lowered CPU use from reading the game: party lookups now pause during matches and run less often in menus.
- Live no longer shows a server running on your own machine as your game server.
- Pages no longer shift sideways when you switch between pages with and without a scrollbar.
- Your Steam account is now detected on setups where it was missing, so it shows in the app again.

## [0.8.0] - 2026-10-05

### Added

#### Discord activity

- Deadlock+ can show on your Discord profile while Deadlock is running. It is off by default.
- Turn it on in Settings > Discord.
- Pick which Discord clients get it: Stable, PTB, Canary or others. All are selected by default.
- Settings shows which Discord clients are running right now.
- Choose Basic or Detailed. Detailed shows your hideout, mode, hero and match timer by reading the game.
- A "Download Deadlock+" button is added to your activity by default. Turn it off with Support Deadlock+ in Settings > Discord.

#### Discord activity editor

- Settings > Discord has an editor for every line of your activity.
- Change the top line, bottom line, hover text, images and timer for each state.
- Give a state variants, such as ranked or Street Brawl, and a different line for a chosen hero.
- Lines can use placeholders like {hero}, {kills}, {deaths}, {assists} and {souls}.
- Pick a hero once at the top to edit that hero's lines across every state.
- Turn a state or variant on or off with the switch on its row.
- Optional groups like [[Playing as {hero}]] disappear when a value is missing, and `||` adds fallbacks.
- A Template syntax card at the bottom explains placeholders, groups and fallbacks with live examples.
- {partySize}, {partyMax} and {queueTime} show your party and queue while you look for a match.
- Finding a match has lines per queue mode, and a Hideout party has its own line.
- The preview now looks like a Discord card, with the Deadlock logo, Discord's own row and the download button.
- {matchId} is available for your own lines, and is never used by a built-in line.
- Your hero icon is the big image on your Discord card wherever a hero is known.
- Your rank badge is the small image in ranked matches. Other states have no small image.
- Hover text shows your hero and rank, and {rank} is a new variable.
- Spectating and private lobbies send no hero or rank art unless you turn it on.
- The preview shows the real art.
- {heroPresence} inserts your hero's own hideout line, like "Plotting in the Hideout".
- Discord shows your party count, like (2 of 6), when you are in a party of two or more.
- A Party size switch on each state turns the count off.
- Street Brawl has its own Round state, and {round}, {scoreAmber} and {scoreSapphire} show the round and score.
- Custom image URLs must be https and under 256 characters.
- See a live preview of the card, reset any field, and import or export your setup as JSON.
- Your own kills, deaths, assists and souls are never shown while you spectate.

### Changed

- Community translations from Crowdin are updated for all 19 languages.

### Fixed

- Text in Cyrillic, Thai, Chinese, Japanese and Korean now uses a matching font instead of a mismatched fallback.
- Polish, Czech, Hungarian and Turkish letters now use a Deadlock+ font instead of a plain system font.
- Line spacing is taller for Chinese, Japanese, Korean and Thai so characters are not cramped.

## [0.7.0] - 2026-10-04

### Added

- The sidebar has a Discord button that opens the Deadlock+ server.

#### Command palette

- Press Ctrl+K (Cmd+K on macOS) to open a command palette.
- It jumps to any page or Settings section, and runs actions like checking for updates.
- It lists every keyboard shortcut.

#### Page shortcuts

- Press Ctrl+1 to Ctrl+9 (Cmd on macOS) to jump to the first nine pages in the sidebar.

#### Language setting

- Settings has a new Language section. It follows your system language by default.
- Each language shows its flag and how much of the app is translated, and you pick one from the list.
- All app text, error messages and notifications now come from a translation catalog.
- The tray menu and desktop notifications follow the chosen language.
- Translations are community-made on Crowdin, and more languages will arrive as they are approved.

### Changed

- Theme and delete-method choices now move with the arrow keys.
- Server Picker keeps keyboard focus on the block switch while it updates.
- Notifications can be reached with the arrow keys.
- Many errors and loading messages are now announced by screen readers.

## [0.6.1] - 2026-10-03

### Added

- The sidebar has a "Support Deadlock+" button that opens the Ko-fi page, in and outside Settings.
- The support button's logo pulses now and then while Deadlock+ is in view.
- A one-time toast on your third launch points to the support page.

## [0.6.0] - 2026-10-03

### Added

- Home has a new Deadlock tile that launches the game through Steam and shows when it is running.

#### Instant match results

- Instant match results is a new opt-in setting.
- It is Windows only and off by default.
- Finished matches show in Stats and Sessions right away, before the Deadlock API has them.
- Deadlock+ reads them from the running game on this PC and never uploads them.
- These matches carry a "Syncing" badge until the Deadlock API confirms them.
- A just-finished ranked match moves your rank estimate right away, marked as estimated.
- Setup offers this option.

#### Recover missing match salts through Steam

- Recovering missing match salts through Steam is a new opt-in setting.
- It is off by default.
- It signs in to Steam with your saved login and asks Deadlock's game servers for matches the community database lacks.
- It never runs while Deadlock is open.
- It is limited to 40 matches per account per day.
- Your Steam login stays on this PC.
- Setup offers this option.

### Changed

- Steam update links now open in the Steam app when it is installed.
- They fall back to your browser otherwise.

## [0.5.0] - 2026-09-30

### Added

- A step-by-step setup page. You see it once after updating, and Esc or Skip ends it.
- What's New is now a full page. It opens after an update and from Settings > About.
- A Deadlock API status item in the status bar. It shows online, degraded or offline.
- A crash report dialog on the next launch after an error or an unclean exit.
- The report is a plain-text file with the last 500 log lines. User names and tokens are masked.
- The dialog opens the report folder or a pre-filled GitHub issue.
- Nothing is sent anywhere. You choose whether to share the report.
- Early macOS and Linux support. It is best-effort and mostly untested.
- The Connection page works on macOS and Linux. It asks for your password when you press Allow.
- Server Picker blocking works on Linux (nftables) and macOS (pf). It asks for your password to apply or remove a block.
- Frame capture works on Linux through a Vulkan layer. Install it from the Performance page.
- A Steam launch option turns the frame layer on for Deadlock only.
- The Linux packages include the frame layer.
- Deadlock and Steam are found on Linux (native, Flatpak, snap) and under Wine, Proton, Whisky and CrossOver.
- Deadlock is found in extra Steam libraries inside Wine prefixes.
- Start with login works on Linux and macOS.
- The startup switch is named for your system: Start with Windows, Start with macOS or Start at login.
- The welcome tour lists the features missing on macOS and Linux, and where to report problems.
- Linux AppImage and deb builds, and macOS dmg builds for Apple silicon. They are unsigned and untested.

### Changed

- The data-sharing choice is now part of setup instead of a popup. If you skip it, sharing stays off.
- Every page uses the same content width and header size.
- Exported logs also mask tokens and /home names.
- Folders and files open through the system file manager on every platform.
- On macOS and Linux, replays go to the Trash instead of the Recycle Bin.
- The Connection page hides ExitLag on macOS and Linux.
- Version details show the right account and web view names on macOS and Linux.

### Fixed

- Patch note search no longer fails when a patch repeats the same line.
- Dialogs no longer dim the title bar, only the page content.
- The sidebar toggle, window controls and notification centre work while a dialog is open.

## [0.4.1] - 2026-09-29

### Added

- Server blocks update themselves when Valve changes its relay addresses. The block stays on while it updates.
- The check runs after launch, every 30 minutes and when you open the server picker.
- A notification tells you when a block was updated, or needs re-applying.
- Background work: an "Updating server blocks" task you can turn off.

### Fixed

- Background work settings (the pause switch, per-task choices and switches) now save. They reset every time Deadlock+ restarted.

## [0.4.0] - 2026-09-29

### Added

- Performance page with an addon script scan. It flags patterns that can hurt frametimes, such as timers that pile up. Results are hints, not proof.
- Frametimes: record Deadlock's frame pacing while you play. Shows average FPS, 1% and 0.1% lows, percentiles and stutter spikes. Time spent tabbed out is excluded.
- Save a frametime run with a label, then compare two runs side by side.
- Patch note indexing and addon scans pause while Deadlock runs and resume when you close it.
- Background work setting: allow background work, pause while Deadlock runs, and per job (addon scan, patch note indexing) run by itself and choose keep running, pause or slow down while Deadlock runs.
- Storage rows show a badge (regenerates, history, backup, yours or managed by mods), what clearing does, item count, age and a size bar.
- Storage lists saved frametime runs with their size and a link to Performance.
- Storage: Show paths toggle and a Clear regenerable button for the shader cache and console log.
- The status bar shows "paused while Deadlock runs" with a Run now button. A scan you start yourself runs right away.
- Copy or save a comparison as a text report.

### Changed

- Storage is grouped by owner: Deadlock, Deadlock+, mods and backups. Rows are sorted by size.
- Storage splits "Deadlock+ data" into Settings, Server presets, Replay pins and cleanup rules, Connection history, Alerts and notifications, Patch notes index, Stats cache, Server list cache, Replay info cache and Other app files.
- Storage: "Deadlock+ logs" is now "App logs".
- Home: the Tools list is centered, so a short last row sits in the middle.

## [0.3.0] - 2026-09-28

### Added

- Deadlock+ now checks for updates periodically while it's open, not just at launch, so a release doesn't go unnoticed during a long session.
- A notification bell in the title bar collects patch/news alerts and maintenance reminders in one place.
- Notifications can be marked read individually or all at once.
- The tray and taskbar icons show a green badge when an update is available.
- The tray and taskbar icons show a red badge with an unread notification count.

### Fixed

- Patch notes: images now show at the same spot they appear in the real post, instead of always at the top, and can be clicked to view full-size.
- Patch notes: a bold section heading like "General" no longer shows up as literal bolded text (`**[ General ]**`).
- The maintenance reminder no longer fires again if the app restarts while already inside the lead window.
- Stats: a leaderboard-tracked hero with no games in the current filter now shows its lifetime game count instead of just "No games in this selection."

## [0.2.0] - 2026-09-28

### Added

- Search patch notes from the Updates page, going all the way back to October 2024 — find a change even if you only remember roughly what it said, not the exact wording.
- A big, full-width search bar on the Updates page.
- Search results show whether an update came from Steam or the forums.
- Search waits for patch notes to finish indexing in the background before showing results, so you don't get an incomplete list.
- View full patch notes for an update, with images where available. Forum-only updates without a full body show the forum's short preview instead, with a link to read the rest there.
- Two new themes: Nightshift (teal cyberpunk noir with amber trim) and Deadlock API (OLED black with electric red glow).
- Status bar shows progress while new patch notes are being indexed, including which one is currently being processed.
- Storage page: clear Deadlock+'s own log files with a new `Logs` entry.

### Fixed

- Status bar items are now separated by a dot when several show at once.
- The main window no longer sits empty for a couple of seconds after launching.
- Some updates in the Updates list showed the wrong date and sorted out of order.

## [0.1.2] - 2026-09-26

### Added

- First-run welcome: finds the game, explains the administrator prompt and firewall use, and offers the optional extras (start with Windows, tray, alerts, maintenance reminder).
- Status bar shows whether Deadlock is running.

### Changed

- The Server Picker remembers its sort column and direction across page changes and restarts.
- Home no longer shows the "Deadlock is running" line; the status bar has it.

### Fixed

- Expanding or collapsing the Diagnostics log viewer no longer moves focus to the first settings category and pops up its tooltip.

## [0.1.1] - 2026-09-26

### Added

- Server Picker columns sort on click: Region, Direct ping and Blocked. Click again to reverse. Default is Region A-Z.
- Server Picker shows a warning banner while Deadlock is running: restart the game after changing blocks.
- New installs start with six Server Picker presets: Asia, EU All, EU West, USA, USA East and ZA. They are ordinary presets: edit or delete them, and they do not come back.

## [0.1.0] - 2026-09-26

First release. Windows only.

### Added

- Home page with a greeting, quick counts and live cards for your rank, recent form, latest update and last session.
- Server Picker: block or unblock Steam Datagram Relay regions with Windows Firewall rules, with live ping, presets, and import from ServerPickerX and CS2ServerPicker.
- Connection page: live server, ping and packet loss for your current match, with an optional ExitLag comparison. History is kept between launches.
- Stats: winrate, streaks, playtime and per-hero numbers for ranked, unranked or all modes, plus progress toward leaderboard eligibility.
- Rank: progress to the next subrank, demotion shields, what your next win or loss is worth, break-even winrate, climb forecast and a progress graph.
- Sessions: play sessions with plain-language findings, session verdicts and an optional break reminder.
- Mutes: view, add, unmute, export and import muted players, with a backup before every change.
- Replays: browse saved replays, pin the ones to keep, and clean up the rest.
- Storage: see what Deadlock and Deadlock+ use on disk and clear regenerable files.
- Updates page and optional Windows notifications for new patch notes and Steam announcements.
- Steam maintenance reminder with a configurable day, time and lead.
- Start with Windows through Task Scheduler (no UAC prompt at sign-in), and a tray icon with an optional keep-running-in-tray mode.
- Settings overlay with search: four themes, reduced motion, an accessible font option, diagnostics with a log viewer, and licences.
- Automatic update checks with signed updates and a "What's new" dialog. A titlebar button shows when an update is available.
- Opt-in match data sharing with the Deadlock API, asked on first launch.
- Offline banner. Stats pages show the last saved copy when the network is down.
- Window size and position are remembered.
