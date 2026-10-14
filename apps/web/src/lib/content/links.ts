import { REPO_URL, SUPPORT_URL } from "@deadlock-plus/links/urls";

export const LINKS = {
    repo: REPO_URL,
    download: `${REPO_URL}/releases/latest`,
    releases: `${REPO_URL}/releases`,
    workflows: `${REPO_URL}/tree/main/.github/workflows`,
    actions: `${REPO_URL}/actions`,
    appPrivacy: `${REPO_URL}#privacy-and-network-use`,
    linux: `${REPO_URL}#linux`,
    support: SUPPORT_URL,
} as const;
