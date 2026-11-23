'use client';

import { Component, type ReactNode } from 'react';

/**
 * If the scene fails in a way the WebGL checks did not foresee, keep the page:
 * render nothing in its place and switch to the static fallback, instead of
 * letting React unmount the copy along with it.
 */
export default class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch() {
    document.body.classList.add('no-webgl');
  }

  override render() {
    return this.state.failed ? null : this.props.children;
  }
}
