"""Shared writing guidance and deterministic style checks for all Brief generation paths."""
import re

PLAIN_ENGLISH_STYLE = (
    "Use simple English throughout the headline, dek, points, and context. Write for "
    "readers with no legal or government background. Prefer common, everyday words, "
    "short sentences, and active voice. Avoid complex legal terms, bureaucratic jargon, "
    "and unexplained acronyms. When a legal term is necessary for accuracy, explain it "
    "in simple words the first time it appears. For example, use 'under' instead of "
    "'pursuant to' and 'before' instead of 'prior to'. Explain what happened and who is "
    "affected in concrete terms supported by the source. Simplify the wording without "
    "changing the legal meaning, certainty, scope, or important exceptions. Preserve "
    "official names when needed and keep supporting evidence quotes verbatim. "
    "Punctuation: never use em dashes, double hyphens, or any dash with spaces around it "
    "in the headline, dek, points, or context. Use a comma, colon, parentheses, or a new "
    "sentence instead. Ranges may use 'to' or an unspaced dash, as in 'October 1 to 15' or "
    "'FY2024-FY2025'. Text inside quotation marks and verbatim evidence quotes are exempt. "
    "Every sentence must state something specific from the source: who is affected, what "
    "changes, how much, when, or what is excluded. Do not write filler or generic claims of "
    "significance, such as 'it is important to note', 'in short', 'in other words', "
    "'overall', 'plays a key role', 'a significant step', 'landmark law', 'sweeping changes', "
    "'paves the way', 'underscores', 'highlights the importance of', 'aims to strengthen', "
    "or 'why this matters'. Do not end a section with a sentence that restates it. "
    "Illustration only, not a fact to reuse: instead of 'The rule marks a significant step "
    "toward safer water', write the concrete change, such as 'The rule lowers the limit for "
    "public water systems from 15 to 10 parts per billion'. "
)

# Spans inside quotation marks are verbatim source text and keep their punctuation.
# Straight single quotes are skipped because they double as apostrophes.
_QUOTED = re.compile(r'"[^"\n]*"|“[^”\n]*”|‘‘.*?’’|``[^\n]*?' + "''" + r'|‘[^’\n]*’')
# Em dashes anywhere; en/figure dashes and hyphens only when used as a spaced dash.
# Unspaced en dashes are ordinary range typography ("0–6 months", "FY2024–FY2025").
_DASH = re.compile(r'[—―]|\s[‒–]|[‒–]\s|(?<=\S) ?--+ ?(?=\S)|(?<=\w) - (?=\w)')

# Narrow phrases only: bare words like "significant" or "vital" appear in official
# names ("Finding of No Significant Impact", "vital records") and must stay allowed.
FILLER_PHRASES = (
    r"it is (?:important|worth) (?:to note|noting)", r"it'?s (?:important|worth) (?:to note|noting)",
    r"worth noting", r"in short", r"in other words", r"in summary", r"to summarize",
    r"(?:^|[.!?]\s+)overall,", r"(?:^|[.!?]\s+)ultimately,", r"the bottom line",
    r"at the end of the day", r"plays? an? (?:key|crucial|vital|critical|pivotal|important) role",
    r"an? (?:significant|major|key|important|crucial|critical|historic) step",
    r"a step (?:forward|in the right direction)",
    r"landmark (?:law|rule|ruling|decision|legislation|bill|case|move|step|achievement|reform|agreement|deal)",
    r"sweeping (?:changes?|reforms?|overhaul|new|expansion|powers)", r"game[- ]changer",
    r"paves? the way", r"underscores?", r"highlights? the (?:importance|need)",
    r"a testament to", r"in today'?s", r"ever[- ]evolving", r"far[- ]reaching",
    r"sends? an? (?:clear|strong) (?:message|signal)", r"remains to be seen", r"time will tell",
    r"aims? to (?:strengthen|enhance|improve|bolster|streamline)", r"why (?:this|it) matters",
    r"navigat(?:e|es|ing) the (?:complex|complexities)", r"\bdelve",
)
_FILLER = re.compile(r'\b(?:' + '|'.join(FILLER_PHRASES) + r')', re.IGNORECASE | re.MULTILINE)

# The selection plan is private. Its vocabulary must never surface in public copy.
_SCAFFOLD = re.compile(
    r'explanatory angles?|explanation[ _]plan|editorial[ _]plan|reader[ _]question|reader[ _]value|'
    r'\bangles? ?(?:#?\d+|one|two|three|four|[ivx]+)\b|\b(?:first|second|third|fourth) angle\b',
    re.IGNORECASE)


def _excerpt(text, match):
    start, end = max(0, match.start() - 30), min(len(text), match.end() + 30)
    return ' '.join(text[start:end].split())


def style_issues(field, text):
    """Return repair feedback for banned punctuation, filler and leaked planning notes."""
    if not isinstance(text, str) or not text.strip():
        return []
    issues = []
    match = _SCAFFOLD.search(text)
    if match:
        issues.append(f'{field}: remove planning language "{match.group(0)}" near "{_excerpt(text, match)}". '
                      'The editorial plan is private; explain the subject without naming, numbering or labeling angles.')
    prose = _QUOTED.sub(lambda m: ' ' * len(m.group(0)), text)
    match = _DASH.search(prose)
    if match:
        issues.append(f'{field}: replace the dash near "{_excerpt(prose, match)}" with a comma, colon, '
                      'parentheses or a new sentence; write ranges with "to" or "through".')
    for match in dict.fromkeys(m.group(0).strip(' .!?').lower() for m in _FILLER.finditer(prose)):
        issues.append(f'{field}: remove the stock phrase "{match}". State the specific source-supported fact '
                      'instead, or delete the sentence.')
    return issues
