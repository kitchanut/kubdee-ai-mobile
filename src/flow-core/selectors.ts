/**
 * Shared Google Flow DOM selectors / markers — platform-agnostic.
 *
 * Google Flow changes its UI frequently; keeping the selectors in one place
 * means a UI break is a one-line fix shared by every consumer (mobile WebView
 * now, desktop Playwright/CDP later).
 */
export const FLOW_SELECTORS = {
  /** Slate rich-text prompt editor (the prompt input on the project page). */
  slateEditor: '[data-slate-editor="true"][contenteditable="true"]',
  /** Material icon text rendered inside the submit/generate button. */
  submitIcon: 'arrow_forward',
  /** "New project" button label variants (English + Thai). */
  newProjectText: ['New project', 'โปรเจ็กต์ใหม่'] as readonly string[],
} as const;
