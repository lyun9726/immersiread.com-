"use client"

// Simple context to manage global modals if needed,
// for now this component can be mounted in layout to handle global event-driven modals
// or just export specific modal components.

// This component acts as a placeholder for where global modals (like "Format not supported") would live
// if managed via a global store. For this skeleton, we'll implement specific modals in their pages
// or expose them here if they need to be accessible from anywhere.

export function GlobalModals() {
  return <>{/* Placeholders for global toast notifications or critical alerts */}</>
}
