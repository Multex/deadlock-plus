import type { MatchTeam } from "@deadlock-plus/match/detail";
import type { BoxRow, FrontPage, Story, StoryParam, StoryText } from "@deadlock-plus/match/stories/index";
import type { BoxTeam, Brief, LaneLine, ObjectiveMark, Rating, TeamTotal, Weather } from "./paper/types";

type Params = Record<string, string | number>;

export interface ViewDeps {
    t: (key: string, params?: Params) => string;
    tn: (key: string, count: number, params?: Params) => string;
    number: (value: number) => string;
    /** Unix seconds to the dateline's date. */
    date: (unixS: number) => string;
    ordinal: (place: number) => string;
    clock: (seconds: number) => string;
    hero: (heroId: number) => { name: string; art: string | null } | undefined;
}

export interface StoryView {
    id: string;
    headline: string;
    deck: string;
}

export interface FrontPageView {
    label: string;
    masthead: { name: string; date: string; edition: string; detail: string; weather?: Weather };
    banner?: StoryView & { kicker?: string };
    /** The story set beside the photo. */
    lead?: StoryView;
    photo: { src: string | null; alt: string; caption: string; stamp?: { text: string; tone: "spot" | "ink" } };
    score: TeamTotal[];
    box: BoxTeam[];
    /** Empty when the match has no grades; the critics section is left out then. */
    ratings: Rating[];
    lanes: LaneLine[];
    briefs: Brief[];
    objectives: { marks: ObjectiveMark[]; durationS: number; teamNames: Record<MatchTeam, string> };
}

export const PAPER_WIDTH = 720;
export const PAPER_HEIGHT = 960;

/** The paper has room for this many short items under "In brief". */
export const BRIEF_SLOTS = 3;

export function teamName(t: ViewDeps["t"], team: MatchTeam): string {
    return team === "hidden-king" ? t("match_history.team.hidden_king") : t("match_history.team.archmother");
}

export function frontPageView(page: FrontPage, deps: ViewDeps): FrontPageView {
    const { t, tn } = deps;
    const rows = new Map<number, BoxRow>(page.teams.flatMap((team) => team.rows.map((r) => [r.slot, r])));
    const heroName = (slot: number) => {
        const r = rows.get(slot);
        return (r && deps.hero(r.heroId)?.name) ?? t("match_history.detail.player_fallback", { slot });
    };
    const playerName = (slot: number) => rows.get(slot)?.name ?? heroName(slot);
    const teamNames: Record<MatchTeam, string> = {
        "hidden-king": teamName(t, "hidden-king"),
        archmother: teamName(t, "archmother"),
    };

    const param = (p: StoryParam): string => {
        switch (p.type) {
            case "hero":
                return heroName(p.slot);
            case "player":
                return playerName(p.slot);
            case "team":
                return teamNames[p.team];
            case "time":
                return deps.clock(Math.max(0, Math.round(p.seconds)));
            case "number":
                return deps.number(p.value);
            case "grade":
                return p.letter;
            case "place":
                return deps.ordinal(p.value);
        }
    };
    const text = (s: StoryText, params: Params) =>
        s.count === undefined ? t(s.key, params) : tn(s.key, s.count, params);
    const story = (s: Story, i: number): StoryView => {
        const params = Object.fromEntries(Object.entries(s.params).map(([k, p]) => [k, param(p)]));
        return { id: `${s.kind}-${i}`, headline: text(s.headline, params), deck: text(s.deck, params) };
    };

    const { dateline } = page;
    const masthead: FrontPageView["masthead"] = {
        name: t("front_page.name"),
        date: dateline.startTime === undefined ? "" : deps.date(dateline.startTime),
        edition: t("front_page.edition", { id: page.matchId }),
        detail: `${t(`match_history.detail.mode.${dateline.mode}`)} · ${deps.clock(dateline.durationS)}`,
    };
    if (page.weather) {
        const w = page.weather;
        const lines = [t("front_page.weather.ping", { avg: deps.number(w.avg), worst: deps.number(w.worst) })];
        if (w.jitter !== undefined) lines.push(t("front_page.weather.jitter", { jitter: deps.number(w.jitter) }));
        masthead.weather = { forecast: t(`front_page.weather.forecast_${w.forecast}`), lines };
    }

    let banner: FrontPageView["banner"];
    if (page.banner) {
        banner = story(page.banner, 0);
        const ours = page.viewerSlot !== undefined && page.banner.subject === page.viewerSlot;
        if (ours) banner.kicker = t("front_page.kicker_viewer");
    }
    const [lead, ...moreColumns] = page.columns.map((s, i) => story(s, i + 1));
    const briefs = [...moreColumns, ...page.briefs.map((s, i) => story(s, page.columns.length + i + 1))]
        .slice(0, BRIEF_SLOTS)
        .map((s): Brief => ({ id: s.id, headline: s.headline, body: s.deck }));

    const photoSlot =
        page.banner?.subject ?? page.viewerSlot ?? page.ratings[0]?.slot ?? page.teams[0].rows[0]?.slot ?? 0;
    const subject = rows.get(photoSlot);
    const photo: FrontPageView["photo"] = {
        src: subject ? (deps.hero(subject.heroId)?.art ?? null) : null,
        alt: heroName(photoSlot),
        caption: subject
            ? t("front_page.photo_caption", {
                  hero: heroName(photoSlot),
                  kills: subject.kills,
                  deaths: subject.deaths,
                  assists: subject.assists,
              })
            : "",
    };
    if (dateline.result === "win") photo.stamp = { text: t("stats.outcome.win"), tone: "spot" };
    else if (dateline.result === "loss") photo.stamp = { text: t("stats.outcome.loss"), tone: "ink" };

    const box = page.teams.map((team): BoxTeam => ({
        team: team.team,
        name: teamNames[team.team],
        ...(team.won ? { result: t("stats.outcome.win") } : {}),
        rows: team.rows.map((r) => ({
            id: r.slot,
            hero: heroName(r.slot),
            ...(r.name !== undefined ? { player: r.name } : {}),
            kills: r.kills,
            deaths: r.deaths,
            assists: r.assists,
            netWorth: r.netWorth,
            grade: r.grade?.letter ?? null,
            own: r.viewer,
        })),
    }));

    const ratings = page.ratings.map((r): Rating => ({
        id: r.slot,
        letter: r.letter,
        name: heroName(r.slot),
        place: r.place,
        placeLabel: t("front_page.place_of", {
            place: deps.ordinal(r.place),
            total: deps.number(page.gradedCount),
        }),
        own: r.viewer,
    }));

    const lanes = page.lanes.map((lane): LaneLine => {
        const heroes = (team: MatchTeam) => lane.slots[team].map(heroName).join(", ");
        let line: string;
        if (lane.leadAt10 === undefined) {
            line = t("front_page.lane.matchup", {
                hidden_king: heroes("hidden-king"),
                archmother: heroes("archmother"),
            });
        } else if (lane.leadAt10 === 0) {
            line = t("front_page.lane.even");
        } else {
            const ahead: MatchTeam = lane.leadAt10 > 0 ? "hidden-king" : "archmother";
            line = t("front_page.lane.lead", { team: teamNames[ahead], amount: deps.number(Math.abs(lane.leadAt10)) });
        }
        return {
            id: lane.laneId,
            name: t(`match_history.deep_dive.lanes.street_${lane.color}`),
            ink: lane.color,
            text: line,
        };
    });

    const marks = page.objectives.flatMap((m, i): ObjectiveMark[] => {
        if (!m.by) return [];
        const label =
            m.kind === "mid_boss"
                ? t("match_history.detail.replay.kind_mid_boss")
                : t(`match_history.deep_dive.objectives.kind_${m.kind}`);
        return [{ id: i, timeS: m.timeS, team: m.by, short: t(`front_page.objective.short_${m.kind}`), label }];
    });

    const view: FrontPageView = {
        label: t("front_page.dialog", { id: page.matchId }),
        masthead,
        photo,
        score: page.teams.map((team) => ({ team: team.team, name: teamNames[team.team], kills: team.kills })),
        box,
        ratings,
        lanes,
        briefs,
        objectives: { marks, durationS: dateline.durationS, teamNames },
    };
    if (banner) view.banner = banner;
    if (lead) view.lead = lead;
    return view;
}
