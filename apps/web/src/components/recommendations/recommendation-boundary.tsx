'use client'

/**
 * A render-time safety net around the suggestion surface.
 *
 * The panel already handles a failed request. This boundary covers the remaining
 * case — a response that parses but cannot be rendered — and keeps the promise
 * that a suggestion problem never takes the dashboard with it. Event handlers deal
 * with their own errors; this catches only what escapes rendering.
 */

import { Component, type ReactNode } from 'react'

interface RecommendationBoundaryProps {
  children: ReactNode
  fallback?: ReactNode
}

interface RecommendationBoundaryState {
  failed: boolean
}

export class RecommendationBoundary extends Component<
  RecommendationBoundaryProps,
  RecommendationBoundaryState
> {
  override state: RecommendationBoundaryState = { failed: false }

  static getDerivedStateFromError(): RecommendationBoundaryState {
    return { failed: true }
  }

  override componentDidCatch(error: unknown) {
    // The dashboard must stay usable; the details belong in the console, not on
    // the screen.
    console.error('The suggestion panel failed to render:', error)
  }

  override render() {
    if (this.state.failed) {
      return (
        this.props.fallback ?? (
          <p className="text-muted-foreground text-sm">
            Suggestions could not be displayed. The rest of this page is unaffected.
          </p>
        )
      )
    }
    return this.props.children
  }
}
