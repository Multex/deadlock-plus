# Third-party notices

Deadlock+ is an unofficial fan tool. It is not made by, affiliated with or endorsed by Valve
Corporation. "Deadlock" and "Steam" are trademarks of Valve Corporation.

## Fonts bundled from Deadlock (`packages/ui/src/fonts/`)

These fonts are the property of their owners. They are not covered by this project's licence and
no licence to them is granted here. They are included so the app matches the game's look. If an
owner asks for one to be removed, it will be removed and the app falls back to system fonts.

| Font | Files | Notice embedded in the font files |
| --- | --- | --- |
| Retail Demo | `retaildemo-*.otf` | (c) Copyright OH no Type Company, LLC. 2021. All rights reserved. Ohno Humanist is a trademark of OH no Type Company, LLC. Designer: James Edmondson. Licence: http://ohnotype.co/license |
| Valve Oracle | `valveoracle-*.ttf` | Copyright 2025 Valve Corporation. See license metadata for details. Version 1.006, YWFT. |
| Valve Pulp | `valvepulp-bold.ttf` | Copyright 2025 Valve Corp. All Rights Reserved. Valve Pulp is a trademark of Valve Corporation, originally created for Valve by YouWorkForThem / Nicolas Massi. "Like other Valve game content, you may use this font to create Fan Art, as described in the Steam Subscriber Agreement." |

## Fonts from npm packages (SIL Open Font License 1.1)

- **Atkinson Hyperlegible**, Copyright 2020 Braille Institute of America, Inc. (`@fontsource/atkinson-hyperlegible`)
- **Limelight**, Copyright (c) 2010 by Sorkin Type Co (eben@eyebytes.com) with Reserved Font Name
  Limelight (`@fontsource/limelight`)

Licence text: https://openfontlicense.org/open-font-license-official-text/ (also shipped inside each
package's `LICENSE` file under `node_modules/@fontsource/`).

## Patch notes search model

- **all-MiniLM-L6-v2** (int8 quantized ONNX export), based on
  [sentence-transformers/all-MiniLM-L6-v2](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2),
  licensed Apache 2.0. ONNX export from
  [Xenova/all-MiniLM-L6-v2](https://huggingface.co/Xenova/all-MiniLM-L6-v2). Bundled at
  `src-tauri/assets/patch-search/` for local, offline patch notes search; no network call is made
  to run it.

## Flag artwork

- **Twemoji**, Graphics Copyright 2020 Twitter, Inc and other contributors, licensed under CC-BY 4.0
  (https://creativecommons.org/licenses/by/4.0/), packaged as `@twemoji/svg` by Samuel Kopp.

## Code dependencies

Licences and copyright notices for the Rust crates and npm packages Deadlock+ is built with are listed
in the app under Settings, Licenses, Open-source dependencies.
