import { useSyncExternalStore } from 'react'

const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
const subscribers = new Set<() => void>()

const notifySubscribers = () => {
  subscribers.forEach((subscriber) => subscriber())
}

function subscribe(subscriber: () => void) {
  subscribers.add(subscriber)
  if (subscribers.size === 1) preference.addEventListener('change', notifySubscribers)

  return () => {
    subscribers.delete(subscriber)
    if (subscribers.size === 0) {
      preference.removeEventListener('change', notifySubscribers)
    }
  }
}

const getSnapshot = () => preference.matches

export function useReducedMotion() {
  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}
