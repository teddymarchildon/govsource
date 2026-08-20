import type { Congressman, Judge } from '@/types/types';

export function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

export function getJudgeName(judge: Judge) {
  return judge.full_name || [judge.first_name, judge.middle_name, judge.last_name, judge.suffix]
    .filter(Boolean)
    .join(' ');
}

export function getPartyLabel(party?: string) {
  const normalized = party?.trim().toLowerCase();
  if (normalized === 'd' || normalized === 'democrat' || normalized === 'democratic') return 'Democrat';
  if (normalized === 'r' || normalized === 'republican') return 'Republican';
  if (normalized === 'i' || normalized === 'independent') return 'Independent';
  return party || 'Party not listed';
}

export function getPartyBadgeClass(party?: string) {
  const normalized = getPartyLabel(party).toLowerCase();
  if (normalized === 'democrat') return 'border-blue-200 bg-blue-50 text-blue-800';
  if (normalized === 'republican') return 'border-red-200 bg-red-50 text-red-800';
  if (normalized === 'independent') return 'border-violet-200 bg-violet-50 text-violet-800';
  return 'border-border bg-muted text-muted-foreground';
}

export function getMemberRole(member: Pick<Congressman, 'chamber' | 'state' | 'district'>) {
  const chamber = member.chamber?.toLowerCase();
  if (chamber === 'house') {
    const district = member.district ? `${member.state}-${member.district}` : member.state;
    return `U.S. Representative${district ? ` · ${district}` : ''}`;
  }
  if (chamber === 'senate') return `U.S. Senator${member.state ? ` · ${member.state}` : ''}`;
  return member.chamber || 'Member of Congress';
}

const OPINION_TYPE_LABELS: Record<string, string> = {
  '010combined': 'Combined opinion',
  '020lead': 'Lead opinion',
  '030concurrence': 'Concurrence',
  '040dissent': 'Dissent',
};

export function getOpinionTypeLabel(type?: string) {
  if (!type) return 'Opinion';
  const normalized = type.toLowerCase();
  return OPINION_TYPE_LABELS[normalized] || `${type.charAt(0).toUpperCase()}${type.slice(1)}`;
}
