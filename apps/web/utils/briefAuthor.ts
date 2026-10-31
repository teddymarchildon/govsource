/** Keep the publication byline consistent for existing and newly generated Briefs. */
export function getBriefAuthorName(name: string | null | undefined) {
  return name === 'GovSource Automated Briefs' ? 'GovSource Briefs' : name;
}
