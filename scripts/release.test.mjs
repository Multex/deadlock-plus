import { describe, expect, it } from "vitest";
import { assetName, changelogNotes, channelOf, channelOutputs, releaseNotes, updaterManifest } from "./release.mjs";

const md = `# Changelog

## [Unreleased]

- Later

## [0.2.0] - 2026-10-01

### Added

- Auto-update

## [0.1.0] - 2026-09-26

- First release
`;

describe("changelogNotes", () => {
    it("returns the body of one release", () => {
        expect(changelogNotes(md, "0.2.0")).toBe("### Added\n\n- Auto-update");
    });

    it("stops at the next release heading", () => {
        expect(changelogNotes(md, "0.1.0")).toBe("- First release");
    });

    it("returns null for a version that has no entry", () => {
        expect(changelogNotes(md, "0.3.0")).toBeNull();
    });

    it("returns null for an empty entry", () => {
        expect(changelogNotes("## [1.0.0] - 2026-01-01\n\n## [0.9.0] - 2025-01-01\n\n- x\n", "1.0.0")).toBeNull();
    });
});

describe("assetName", () => {
    it("has no characters GitHub rewrites", () => {
        expect(assetName("0.2.0", "windows-x86_64")).toBe("Deadlock-Plus_0.2.0_x64-setup.exe");
    });

    it("names the Linux bundles per package format", () => {
        expect(assetName("0.2.0", "linux-x86_64-appimage")).toBe("Deadlock-Plus_0.2.0_amd64.AppImage");
        expect(assetName("0.2.0", "linux-x86_64-deb")).toBe("Deadlock-Plus_0.2.0_amd64.deb");
    });

    it("rejects an unknown platform", () => {
        expect(() => assetName("0.2.0", "macos-aarch64")).toThrow();
    });
});

describe("updaterManifest", () => {
    const manifest = updaterManifest({
        version: "0.2.0",
        notes: "### Added\n\n- Auto-update",
        pubDate: "2026-10-01T12:00:00Z",
        signatures: { "windows-x86_64": "c2ln", "linux-x86_64-appimage": "YXBw", "linux-x86_64-deb": "ZGVi" },
        repo: "deadlock-plus/deadlock-plus",
    });
    const base = "https://github.com/deadlock-plus/deadlock-plus/releases/download/v0.2.0";

    it("carries version, notes and date", () => {
        expect(manifest.version).toBe("0.2.0");
        expect(manifest.notes).toBe("### Added\n\n- Auto-update");
        expect(manifest.pub_date).toBe("2026-10-01T12:00:00Z");
    });

    it("points the windows platform at the tagged release asset", () => {
        expect(manifest.platforms["windows-x86_64"]).toEqual({
            signature: "c2ln",
            url: `${base}/Deadlock-Plus_0.2.0_x64-setup.exe`,
        });
    });

    it("lists one Linux entry per package format", () => {
        expect(manifest.platforms["linux-x86_64-appimage"]).toEqual({
            signature: "YXBw",
            url: `${base}/Deadlock-Plus_0.2.0_amd64.AppImage`,
        });
        expect(manifest.platforms["linux-x86_64-deb"]).toEqual({
            signature: "ZGVi",
            url: `${base}/Deadlock-Plus_0.2.0_amd64.deb`,
        });
    });

    it("refuses to build a feed with a platform missing its signature", () => {
        expect(() =>
            updaterManifest({
                version: "0.2.0",
                notes: "x",
                pubDate: "2026-10-01T12:00:00Z",
                signatures: { "windows-x86_64": "c2ln" },
                repo: "deadlock-plus/deadlock-plus",
            }),
        ).toThrow(/linux-x86_64-appimage/);
    });
});

describe("channelOf", () => {
    it("reads the channel from the version's prerelease label", () => {
        expect(channelOf("0.15.0")).toBe("release");
        expect(channelOf("0.15.0-beta.1")).toBe("beta");
        expect(channelOf("0.15.0-nightly.20261028")).toBe("nightly");
        expect(channelOf("0.15.0-nightly.20261028.2")).toBe("nightly");
    });

    it("accepts a tag with its v prefix", () => {
        expect(channelOf("v0.15.0-beta.3")).toBe("beta");
    });

    it("rejects a prerelease label no channel ships", () => {
        expect(() => channelOf("0.15.0-rc.1")).toThrow(/rc\.1/);
        expect(() => channelOf("0.15.0-beta")).toThrow();
        expect(() => channelOf("0.15")).toThrow();
    });
});

describe("channelOutputs", () => {
    it("keeps a release on the draft flow with no feed of its own", () => {
        expect(channelOutputs("v0.15.0")).toBe("channel=release\nprerelease=false\nfeed=\n");
    });

    it("sends a beta to the beta feed as a prerelease", () => {
        expect(channelOutputs("v0.15.0-beta.2")).toBe("channel=beta\nprerelease=true\nfeed=beta-feed\n");
    });

    it("sends a nightly to the nightly feed as a prerelease", () => {
        expect(channelOutputs("v0.15.0-nightly.20261028")).toBe(
            "channel=nightly\nprerelease=true\nfeed=nightly-feed\n",
        );
    });
});

describe("releaseNotes", () => {
    const withUnreleased = `# Changelog

## [Unreleased]

### Added

- Update channels

## [0.14.0] - 2026-10-20

- Builds
`;

    it("needs the release's own entry", () => {
        expect(releaseNotes(withUnreleased, "0.14.0")).toBe("- Builds");
        expect(releaseNotes(withUnreleased, "0.15.0")).toBeNull();
    });

    it("gives a prerelease the unreleased changes when it has no entry of its own", () => {
        expect(releaseNotes(withUnreleased, "0.15.0-beta.1")).toBe("### Added\n\n- Update channels");
    });

    it("prefers a prerelease's own entry", () => {
        const own = withUnreleased.replace(
            "## [0.14.0]",
            "## [0.15.0-beta.1] - 2026-10-28\n\n- Beta notes\n\n## [0.14.0]",
        );
        expect(releaseNotes(own, "0.15.0-beta.1")).toBe("- Beta notes");
    });

    it("still names a prerelease built with nothing listed", () => {
        expect(releaseNotes("# Changelog\n\n## [Unreleased]\n\n", "0.15.0-nightly.20261028")).toBe(
            "Nightly build 0.15.0-nightly.20261028.",
        );
    });
});

describe("updaterManifest for one platform group", () => {
    it("builds a feed with only the platforms asked for", () => {
        const feed = updaterManifest({
            version: "0.15.0-nightly.20261028",
            notes: "x",
            pubDate: "2026-10-28T03:00:00Z",
            signatures: { "windows-x86_64": "c2ln" },
            repo: "deadlock-plus/deadlock-plus",
            platforms: ["windows-x86_64"],
        });
        expect(Object.keys(feed.platforms)).toEqual(["windows-x86_64"]);
        expect(feed.platforms["windows-x86_64"].url).toBe(
            "https://github.com/deadlock-plus/deadlock-plus/releases/download/v0.15.0-nightly.20261028/Deadlock-Plus_0.15.0-nightly.20261028_x64-setup.exe",
        );
    });
});
