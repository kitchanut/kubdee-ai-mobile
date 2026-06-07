export type AutomationStepKind =
  | 'launch-app'
  | 'tap'
  | 'type'
  | 'scroll'
  | 'wait'
  | 'assert-visible'
  | 'user-confirm';

export interface AutomationTarget {
  text?: string;
  contentDescription?: string;
  resourceId?: string;
  boundsHint?: {
    x: number;
    y: number;
  };
}

export interface AutomationStep {
  id: string;
  kind: AutomationStepKind;
  label: string;
  target?: AutomationTarget;
  value?: string;
  timeoutMs?: number;
  requiresUserConfirmation?: boolean;
}

export interface AutomationScript {
  id: string;
  title: string;
  targetPackage: string;
  steps: AutomationStep[];
}

export interface RunState {
  scriptId: string;
  currentStepId?: string;
  status: 'idle' | 'running' | 'waiting-user' | 'completed' | 'failed';
  startedAt?: number;
  endedAt?: number;
}
