import { ScenarioCategoryValues } from '@/lib/validators'

// Skill label overrides — single source of truth
const SKILL_LABEL_OVERRIDES: Record<string, string> = {
  "de-escalation": "De-escalation",
  "self-harm-assessment": "Self-Harm Assessment",
  "dv-assessment": "DV Assessment",
}

export function formatSkillLabel(skill: string): string {
  if (SKILL_LABEL_OVERRIDES[skill]) return SKILL_LABEL_OVERRIDES[skill]
  return skill
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")
}

// Category label overrides — single source of truth
const CATEGORY_LABEL_OVERRIDES: Record<string, string> = {
  tap: "TAP",
  dv_assessment: "DV Assessment",
  expert_skill_path: "Expert Skill Path",
  account_specific: "Account Specific",
  customer_facing: "Customer Facing",
  cohort_training: "Cohort Training",
}

export function formatCategoryLabel(value: string): string {
  if (CATEGORY_LABEL_OVERRIDES[value]) return CATEGORY_LABEL_OVERRIDES[value]
  return value
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")
}

// Category options for dropdowns (derived from Zod schema)
export const CATEGORY_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "-- None --" },
  ...ScenarioCategoryValues.map((v) => ({
    value: v,
    label: formatCategoryLabel(v),
  })),
]

// Category filter options (includes "All" for filter UIs)
export const CATEGORY_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "All" },
  ...ScenarioCategoryValues.map((v) => ({
    value: v,
    label: formatCategoryLabel(v),
  })),
  { value: "uncategorized", label: "Uncategorized" },
]
