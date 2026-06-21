export type CatalogScope = 'image' | 'video';
export type CatalogUi = 'grid' | 'segmented' | 'tabs' | 'text';

export interface CatalogOption {
  value: string;
  label: string;
  prompt: string;
  isNew?: boolean;
  enabled?: boolean;
  order?: number;
}

export interface CatalogSubTab {
  key: string;
  label: string;
  options: CatalogOption[];
}

export interface Category {
  id: string;
  label: string;
  settingsKey: string;
  placeholder: string;
  scope: CatalogScope;
  section: string;
  ui: CatalogUi;
  columns: number;
  allowsCustom: boolean;
  defaultValue: string;
  enabled: boolean;
  order: number;
  subTabs?: CatalogSubTab[];
  options?: CatalogOption[];
}

export interface Template {
  key: string;
  label: string;
  appliesTo: 'image' | 'video' | 'both';
  text: string;
}

export interface AssemblyLine {
  template: string;
  when?: string;
}

export interface AssemblyChain {
  key: 'image_auto' | 'image_custom' | 'video_auto' | 'video_custom';
  lines: AssemblyLine[];
}

export interface PlaceholderDef {
  key: string;
  label: string;
}

export interface PromptCatalog {
  catalogVersion: number;
  schemaVersion: 1;
  updatedAt: number;
  updatedBy: string;
  joinSeparator: string;
  placeholders: PlaceholderDef[];
  categories: Category[];
  templates: Template[];
  assembly: AssemblyChain[];
}

export function categoryOptions(category: Category): CatalogOption[] {
  if (category.subTabs) {
    return category.subTabs.flatMap((subTab) => subTab.options);
  }

  return category.options ?? [];
}
