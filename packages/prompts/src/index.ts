import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

const here = dirname(fileURLToPath(import.meta.url));

export interface PromptBundle {
  system: string;
  greeting: string;
  hearing_items: Array<{
    key: string;
    label: string;
    required: boolean;
  }>;
  recording_notice: string;
  voice: string;
}

export type TenantKind = 'hospital' | 'clinic' | 'medicalcenter' | 'pharmacy';

const promptPaths: Record<TenantKind, string> = {
  hospital: '../hospital/general.yaml',
  clinic: '../clinic/general.yaml',
  medicalcenter: '../hospital/general.yaml',
  pharmacy: '../hospital/general.yaml',
};

export function loadPrompt(kind: TenantKind): PromptBundle {
  const rel = promptPaths[kind];
  const path = resolve(here, rel);
  const raw = readFileSync(path, 'utf8');
  const parsed = YAML.parse(raw) as PromptBundle;
  validate(parsed);
  return parsed;
}

function validate(p: PromptBundle): void {
  if (!p.system || !p.greeting || !Array.isArray(p.hearing_items)) {
    throw new Error('prompt yaml: missing required keys');
  }
}
