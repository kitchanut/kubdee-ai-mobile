import type { AutomationScript, RunState } from '@/automation/types';

export function createInitialRunState(script: AutomationScript): RunState {
  return {
    scriptId: script.id,
    currentStepId: script.steps[0]?.id,
    status: 'idle',
  };
}

export function startRun(script: AutomationScript): RunState {
  return {
    scriptId: script.id,
    currentStepId: script.steps[0]?.id,
    status: 'running',
    startedAt: Date.now(),
  };
}

export function advanceRun(script: AutomationScript, state: RunState): RunState {
  const currentIndex = script.steps.findIndex((step) => step.id === state.currentStepId);
  const nextStep = script.steps[currentIndex + 1];

  if (!nextStep) {
    return {
      ...state,
      currentStepId: undefined,
      status: 'completed',
      endedAt: Date.now(),
    };
  }

  return {
    ...state,
    currentStepId: nextStep.id,
    status: nextStep.requiresUserConfirmation ? 'waiting-user' : 'running',
  };
}
