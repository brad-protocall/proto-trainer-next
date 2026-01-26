/**
 * Valid crisis counselor training skills.
 * Single source of truth for skill validation.
 */
export const VALID_SKILLS = [
  'risk-assessment',
  'safety-planning',
  'de-escalation',
  'active-listening',
  'self-harm-assessment',
  'substance-assessment',
  'dv-assessment',
  'grief-support',
  'anxiety-support',
  'rapport-building',
  'call-routing',
  'medication-support',
  'resource-linkage',
  'boundary-setting',
  'termination',
] as const;

export type CrisisSkill = typeof VALID_SKILLS[number];

export function isValidSkill(skill: string): skill is CrisisSkill {
  return VALID_SKILLS.includes(skill as CrisisSkill);
}

// Keyword patterns for skill detection from scenario text
export const SKILL_PATTERNS: Record<CrisisSkill, RegExp[]> = {
  'risk-assessment': [/suicid/i, /\bSI\b/, /ideation/i, /lethality/i, /kill/i, /end.*(life|it)/i],
  'safety-planning': [/safety plan/i, /means safety/i, /restrict/i, /secure.*firearm/i, /locked/i],
  'de-escalation': [/de-?escalat/i, /calm/i, /emotional regulation/i, /crisis intervention/i],
  'active-listening': [/listen/i, /rapport/i, /engagement/i, /routine.*support/i],
  'self-harm-assessment': [/cut/i, /self[- ]?harm/i, /self[- ]?injur/i, /NSSI/i, /bleeding/i],
  'substance-assessment': [/substance/i, /drug/i, /alcohol/i, /heroin/i, /detox/i, /drinking/i],
  'dv-assessment': [/domestic/i, /partner.*violen/i, /abuse/i, /IPV/i, /physical.*fight/i],
  'grief-support': [/grief/i, /loss/i, /death/i, /died/i, /bereave/i, /mourning/i, /spouse/i],
  'anxiety-support': [/anxi/i, /panic/i, /breath/i, /overwhelm/i],
  'rapport-building': [/rapport/i, /trust/i, /engage/i],
  'call-routing': [/transfer/i, /rout/i, /referr/i, /triage/i, /front desk/i],
  'medication-support': [/medica/i, /prescription/i, /Celexa/i, /Sertraline/i, /SSRI/i, /refill/i],
  'resource-linkage': [/resource/i, /community/i, /refer/i],
  'boundary-setting': [/boundar/i, /limit/i],
  'termination': [/terminat/i, /end.*call/i, /closure/i],
};

/**
 * Detect primary skill from scenario title and description.
 * Returns first matching skill or 'active-listening' as default.
 */
export function detectSkill(title: string, description: string | null): CrisisSkill {
  const text = `${title} ${description || ''}`;

  for (const [skill, patterns] of Object.entries(SKILL_PATTERNS)) {
    if (patterns.some(p => p.test(text))) {
      return skill as CrisisSkill;
    }
  }

  return 'active-listening'; // default
}

/**
 * Infer difficulty from scenario title and category.
 */
export function inferDifficulty(
  title: string,
  category: string | null
): 'beginner' | 'intermediate' | 'advanced' {
  const lowerTitle = title.toLowerCase();

  // Title-based inference (takes precedence)
  if (lowerTitle.includes('routine') || lowerTitle.includes('non-clinical')) return 'beginner';
  if (lowerTitle.includes('emergent')) return 'intermediate';
  if (lowerTitle.includes('urgent')) return 'intermediate';

  // Category-based inference
  if (category === 'onboarding') return 'beginner';
  if (category === 'advanced' || category === 'assessment') return 'advanced';

  return 'intermediate'; // default
}

/**
 * Estimate completion time based on scenario complexity.
 */
export function estimateTime(title: string, description: string | null): number {
  const text = `${title} ${description || ''}`.toLowerCase();

  if (text.includes('routine') || text.includes('non-clinical')) return 10;
  if (text.includes('safety plan') || text.includes('means safety')) return 25;
  if (text.includes('suicid') || text.includes('emergent')) return 20;
  if (text.includes('transfer') || text.includes('warm')) return 20;

  return 15; // default
}
