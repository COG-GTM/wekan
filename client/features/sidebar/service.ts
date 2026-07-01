import { SidebarTemplateInstance } from '/client/features/sidebar/types';

let sidebarInstance: SidebarTemplateInstance | null = null;

export function setSidebarInstance(instance: SidebarTemplateInstance | null) {
  sidebarInstance = instance || null;
}

export function getSidebarInstance() {
  return sidebarInstance;
}

export function clearSidebarInstance(instance: SidebarTemplateInstance | null) {
  if (!instance || sidebarInstance === instance) {
    sidebarInstance = null;
  }
}
