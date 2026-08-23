import type { Brief } from '@/types/brief';
import type { ContentType } from '@/types/content';
import {
  GOVERNMENT_SECTIONS,
  SECTION_CONTENT_TYPES,
  type GovernmentSection,
} from '@/types/section';

type SectionableBrief = Pick<Brief, 'primary_item_type' | 'related_items'>;

export function getSectionsForContentType(type: ContentType): GovernmentSection[] {
  return GOVERNMENT_SECTIONS.filter((section) => SECTION_CONTENT_TYPES[section].includes(type));
}

export function getBriefSections(brief: SectionableBrief): GovernmentSection[] {
  const contentTypes = new Set<ContentType>([
    brief.primary_item_type,
    ...(brief.related_items ?? []).map((item) => item.type),
  ]);

  return GOVERNMENT_SECTIONS.filter((section) =>
    SECTION_CONTENT_TYPES[section].some((type) => contentTypes.has(type)),
  );
}

export function briefBelongsToSection(brief: SectionableBrief, section: GovernmentSection) {
  return getBriefSections(brief).includes(section);
}
