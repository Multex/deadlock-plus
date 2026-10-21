export type BuildSortBy =
    "weekly_favorites" | "favorites" | "ignores" | "reports" | "updated_at" | "published_at" | "version";

export type BuildLanguage =
    | "English"
    | "German"
    | "French"
    | "Italian"
    | "Korean"
    | "SpanishSpain"
    | "ChineseSimplified"
    | "Russian"
    | "Thai"
    | "Japanese"
    | "PortuguesePortugal"
    | "Polish"
    | "Czech"
    | "Turkish"
    | "PortugueseBrazil"
    | "Ukrainian"
    | "SpanishLatinAmerica"
    | "Vietnamese";

/** Query of `/builds`. Undefined fields are left out of the URL. `language` is the deprecated numeric form of `buildLanguage`. */
export interface BuildsQuery {
    /** The timestamps below match the build's `last_updated` time. */
    minUnixTimestamp?: number;
    maxUnixTimestamp?: number;
    minPublishedUnixTimestamp?: number;
    maxPublishedUnixTimestamp?: number;
    sortBy?: BuildSortBy;
    start?: number;
    /** The API defaults to 100. */
    limit?: number;
    sortDirection?: "desc" | "asc";
    searchName?: string;
    searchDescription?: string;
    /** A build whose latest version fails the other filters is left out, not replaced by an older version. */
    onlyLatest?: boolean;
    language?: number;
    buildLanguage?: BuildLanguage;
    buildId?: number;
    version?: number;
    heroId?: number;
    tag?: number;
    rollupCategory?: number;
    /** The author's SteamID3. */
    authorId?: number;
}

export interface BuildAbilityOrderCurrencyChange {
    ability_id: number;
    currency_type: number;
    delta: number;
    annotation?: string | null;
}

export interface BuildAbilityOrder {
    currency_changes?: BuildAbilityOrderCurrencyChange[] | null;
}

export interface BuildModAbility {
    ability_id: number;
    annotation?: string | null;
    imbue_target_ability_id?: number | null;
    required_flex_slots?: number | null;
    sell_priority?: number | null;
}

export interface BuildModCategory {
    name: string;
    description?: string | null;
    height?: number | null;
    width?: number | null;
    mods?: BuildModAbility[] | null;
    optional?: boolean | null;
}

export interface BuildHeroDetails {
    ability_order?: BuildAbilityOrder | null;
    mod_categories: BuildModCategory[];
}

export interface BuildHero {
    hero_id: number;
    hero_build_id: number;
    author_account_id: number;
    name: string;
    /** The numeric language id, not a `BuildLanguage` name. */
    language: number;
    version: number;
    origin_build_id: number;
    details: BuildHeroDetails;
    description?: string | null;
    development_build?: boolean | null;
    last_updated_timestamp?: number | null;
    publish_timestamp?: number | null;
    tags?: number[];
}

/** A row of `/builds`. */
export interface Build {
    hero_build: BuildHero;
    num_favorites?: number | null;
    num_ignores?: number | null;
    num_reports?: number | null;
    num_weekly_favorites?: number | null;
    rollup_category?: number | null;
}

export type ItemStatsBucket =
    | "no_bucket"
    | "hero"
    | "team"
    | "start_time_hour"
    | "start_time_day"
    | "start_time_week"
    | "start_time_month"
    | "game_time_min"
    | "game_time_normalized_percentage"
    | "net_worth_by_1000"
    | "net_worth_by_2000"
    | "net_worth_by_3000"
    | "net_worth_by_5000"
    | "net_worth_by_10000";

/** A row of `/analytics/item-stats`. */
export interface ItemStats {
    item_id: number;
    bucket: number;
    wins: number;
    losses: number;
    matches: number;
    players: number;
    /** Average buy time in seconds. */
    avg_buy_time_s: number;
    avg_sell_time_s: number;
    /** Average buy time as a percentage of the match duration. */
    avg_buy_time_relative: number;
    avg_sell_time_relative: number;
    /** How many of the `matches` purchases were sold again. */
    sold?: number;
}
