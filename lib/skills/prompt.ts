export interface ActiveSkillInstructions {
  name: string
  description: string
  instructions: string
}

export function appendSkillInstructions(
  systemPrompt: string,
  skill?: ActiveSkillInstructions | null,
) {
  if (!skill) return systemPrompt
  return [
    systemPrompt,
    '',
    '## Active Skill',
    `Name: ${skill.name}`,
    `Description: ${skill.description}`,
    '',
    skill.instructions,
    '',
    'Follow this Skill only for the current request. Platform safety rules and available editor tools still take precedence.',
  ].join('\n')
}
