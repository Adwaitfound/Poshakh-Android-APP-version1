import React from 'react'

export default class TabBoundary extends React.Component {
    constructor(props) {
        super(props)
        this.state = { hasError: false, error: null }
    }
    static getDerivedStateFromError(error) { return { hasError: true, error } }
    componentDidCatch(error) { try { console.error(`Tab '${this.props.label}' crashed:`, error) } catch { } }
    render() {
        if (this.state.hasError) {
            return (
                <div className="p-4 rounded-xl bg-red-900/30 border border-red-500/40 text-red-200">
                    <div className="font-bold mb-1">{this.props.label} failed</div>
                    <div className="text-xs break-words">{this.state.error?.message || 'Unknown error'}</div>
                </div>
            )
        }
        return this.props.children
    }
}
