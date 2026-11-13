// Deterministic scan of untrusted text (issue/PR titles, bodies, comments) for prompt injection,
// hidden content and pasted secrets. Runs BEFORE any agent reads the text. Findings never include
// the matched text, so reports can be posted publicly without repeating a secret or an attack.

export type Kind = "injection" | "hidden" | "secret" | "exfiltration";
export interface Finding {
  kind: Kind;
  rule: string;
  source: string;
  /** True when the match sits inside an HTML comment, which GitHub does not render. */
  concealed?: boolean;
}

const INJECTION: [string, RegExp][] = [
  ["ignore-previous", /\b(ignore|disregard|forget|override)\s+(all\s+|any\s+)?(of\s+)?(the\s+|your\s+)?(previous|prior|above|earlier|preceding|system)\s+(instructions?|prompts?|rules|directions|guidelines|messages?)/i],
  ["new-instructions", /\b(new|updated|real|actual|revised)\s+(system\s+)?instructions?\s*[:\-]/i],
  ["role-reassignment", /\byou\s+are\s+(now|no\s+longer)\b|\bfrom\s+now\s+on,?\s+you\b|\bact\s+as\s+(an?\s+)?(system|admin(istrator)?|root|developer|maintainer|owner)\b/i],
  ["fake-system-turn", /<\/?\s*(system|assistant|developer|instructions?)\s*>|\[\/?(SYSTEM|INST)\]|^\s*(system|assistant|developer)\s*:/im],
  ["prompt-leak", /\b(reveal|print|show|output|repeat|leak|dump)\s+(me\s+)?(your|the)\s+(system\s+prompt|hidden\s+instructions|instructions|prompt|secrets?|tokens?|environment|env\s+vars?)/i],
  ["label-steering", /\b(add|apply|set|remove)\s+(the\s+)?(`|")?(ready|security|scan-cleared|risk:low)(`|")?\s+label\b|\b(mark|label)\s+(this|it)\s+(issue\s+|pr\s+)?as\s+(ready|approved|safe|low[\s-]risk)\b/i],
  ["agent-action", /\b(you\s+(must|should)\s+|please\s+)?(approve|merge)\s+(this|the)\s+(pr|pull\s+request)\s+(now|immediately|without)\b|\bgit\s+push\s+(--force|-f)\s+origin\s+main\b/i],
];

const EXFILTRATION: [string, RegExp][] = [
  ["pipe-to-shell", /\b(curl|wget)\b[^\n|]*\|\s*(ba|z)?sh\b/i],
  // Shell or Actions expansion of a credential, e.g. `echo $GITHUB_TOKEN` or `${{ secrets.X }}`, not a mere mention.
  ["secret-expansion", /\$\{\{\s*secrets\.|\$\{?(GITHUB_TOKEN|GH_TOKEN|CLAUDE_CODE_OAUTH_TOKEN|ANTHROPIC_API_KEY|NPM_TOKEN|AWS_SECRET_ACCESS_KEY)\b/],
  ["send-data-out", /\b(send|post|upload|exfiltrate|forward)\b[^\n]{0,60}\b(token|secret|credential|password|\.env|api[\s_-]?key)s?\b[^\n]{0,60}\b(to|at)\s+https?:\/\//i],
];

const SECRETS: [string, RegExp][] = [
  ["github-token", /\b(gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{40,})\b/],
  ["anthropic-key", /\bsk-ant-[A-Za-z0-9_-]{20,}/],
  ["openai-key", /\bsk-(proj-)?[A-Za-z0-9]{32,}\b/],
  ["aws-access-key", /\b(AKIA|ASIA)[0-9A-Z]{16}\b/],
  ["google-api-key", /\bAIza[0-9A-Za-z_-]{35}\b/],
  ["slack-token", /\bxox[abprs]-[A-Za-z0-9-]{10,}/],
  ["private-key", /-----BEGIN ([A-Z]+ )?PRIVATE KEY-----/],
];

const HIDDEN: [string, RegExp][] = [
  ["bidi-override", /[‪-‮⁦-⁩]/],
  ["unicode-tags", /[\u{E0000}-\u{E007F}]/u],
];

/** Text inside <!-- --> comments, including an unclosed trailing one (GitHub hides both). */
function htmlComments(text: string): string[] {
  return text.split("<!--").slice(1).map((chunk) => (chunk.includes("-->") ? chunk.slice(0, chunk.indexOf("-->")) : chunk));
}

/** Decodes long base64 runs that turn into readable text, so encoded instructions are scanned too. */
function decodedBase64(text: string): string[] {
  const out: string[] = [];
  for (const run of text.match(/[A-Za-z0-9+/]{40,}={0,2}/g) ?? []) {
    const decoded = Buffer.from(run, "base64").toString("utf8");
    if (/^[\x20-\x7E\s]+$/.test(decoded)) out.push(decoded);
  }
  return out;
}

/** Tag characters (U+E0020-E007E) mirror ASCII invisibly ("ASCII smuggling"); recover what they spell. */
function untag(text: string): string {
  return [...text].map((c) => {
    const cp = c.codePointAt(0)!;
    return cp >= 0xe0020 && cp <= 0xe007e ? String.fromCodePoint(cp - 0xe0000) : c;
  }).join("");
}

export function scan(text: string, source: string): Finding[] {
  const findings: Finding[] = [];
  const add = (kind: Kind, rule: string, concealed = false) => {
    if (!findings.some((f) => f.kind === kind && f.rule === rule)) findings.push({ kind, rule, source, ...(concealed ? { concealed } : {}) });
  };
  const smuggled = [...text].filter((c) => /[\u{E0020}-\u{E007E}]/u.test(c)).join("");
  const visibleOrDecoded = [untag(text).replace(/[​-‍⁠﻿]/g, ""), untag(smuggled), ...decodedBase64(text)];
  const comments = htmlComments(text);

  for (const [rule, re] of HIDDEN) if (re.test(text)) add("hidden", rule);
  for (const [rule, re] of SECRETS) if (re.test(text)) add("secret", rule);
  for (const [list, kind] of [[INJECTION, "injection"], [EXFILTRATION, "exfiltration"]] as const) {
    for (const [rule, re] of list) {
      if (visibleOrDecoded.some((t) => re.test(t))) add(kind, rule, comments.some((c) => re.test(c)));
    }
  }
  if (decodedBase64(text).some((d) => INJECTION.some(([, re]) => re.test(d)))) add("hidden", "base64-instructions");
  // Zero-width characters are common and harmless (emoji joiners, GitHub breaking @mentions); flag them
  // only when they split a phrase that the rules catch once they are removed.
  const stripped = text.replace(/[​-‍⁠﻿]/g, "");
  if (stripped !== text && [...INJECTION, ...EXFILTRATION].some(([, re]) => re.test(stripped) && !re.test(text))) add("hidden", "zero-width");
  return findings;
}

export interface Input { source: string; author?: string; text: string }

export function scanAll(inputs: Input[], trustedAuthors: string[] = []): Finding[] {
  return inputs.filter((i) => !i.author || !trustedAuthors.includes(i.author)).flatMap((i) => scan(i.text, i.source));
}

/** Markdown report safe to post publicly: kinds, rules and locations only, never the matched text. */
export function report(findings: Finding[], cleared: boolean): string {
  if (!findings.length) return "Input scan: no findings.";
  const blocked = isBlocked(findings, cleared);
  const secrets = findings.some((f) => f.kind === "secret");
  const rows = findings.map((f) => `| ${f.source} | ${f.kind} | \`${f.rule}\`${f.concealed ? " (inside a hidden HTML comment)" : ""} |`);
  return [
    blocked ? "## Input scan: agents paused" : "## Input scan: cleared by a maintainer",
    "",
    blocked
      ? "The deterministic input scan flagged text that agents would read. No agent will act on this thread until it is resolved."
      : "The scan flagged the text below; a maintainer reviewed it and added `scan-cleared`.",
    "",
    "| Where | Kind | Rule |",
    "|---|---|---|",
    ...rows,
    "",
    secrets
      ? "**A credential-shaped value was found.** Treat it as leaked: revoke and rotate it now, then delete the text. Editing alone does not remove it from history or notifications. `scan-cleared` does not override a secret finding."
      : cleared
        ? "A maintainer added `scan-cleared`, so agents may proceed."
        : "If this is a false positive, a maintainer can add the `scan-cleared` label. The label is removed automatically when the flagged text is edited.",
    "",
    "Security vulnerabilities should be reported privately: use **Security → Report a vulnerability** on this repository.",
  ].join("\n");
}

/** Blocked unless a maintainer cleared it; a secret finding is never cleared. */
export function isBlocked(findings: Finding[], cleared: boolean): boolean {
  return findings.some((f) => f.kind === "secret") || (findings.length > 0 && !cleared);
}
