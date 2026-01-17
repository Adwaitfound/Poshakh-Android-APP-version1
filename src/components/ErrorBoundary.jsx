import React from 'react'

export default class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props)
        this.state = { hasError: false, error: null, info: null }
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error }
    }

    componentDidCatch(error, info) {
        // You could log to a remote service here
        this.setState({ info })
        try {
            console.error('App crashed:', error, info)
        } catch { }
    }

    componentDidMount() {
        this._onError = (message, source, lineno, colno, error) => {
            this.setState({ hasError: true, error: error || new Error(message), info: { componentStack: `at ${source}:${lineno}:${colno}` } })
            return false
        }
        this._onRejection = (event) => {
            const err = event.reason instanceof Error ? event.reason : new Error(String(event.reason))
            this.setState({ hasError: true, error: err, info: { componentStack: 'Unhandled Promise rejection' } })
        }
        window.addEventListener('error', this._onError)
        window.addEventListener('unhandledrejection', this._onRejection)
    }

    componentWillUnmount() {
        if (this._onError) window.removeEventListener('error', this._onError)
        if (this._onRejection) window.removeEventListener('unhandledrejection', this._onRejection)
    }

    render() {
        if (this.state.hasError) {
            const message = this.state.error?.message || 'Unexpected error'
            return (
                <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-pine via-emerald-800 to-emerald-900 p-6">
                    <div className="w-full max-w-md bg-gray-900 rounded-3xl shadow-2xl p-6 border border-red-500/40">
                        <h2 className="text-xl font-bold text-red-400 mb-2">Something went wrong</h2>
                        <p className="text-sm text-red-200 mb-4 break-words">{message}</p>
                        {this.state.error?.stack && (
                            <pre className="text-xs text-gray-400 bg-black/30 p-3 rounded-xl overflow-auto max-h-40 mb-2">
                                {this.state.error.stack}
                            </pre>
                        )}
                        {this.state.info?.componentStack && (
                            <pre className="text-xs text-gray-500 bg-black/20 p-3 rounded-xl overflow-auto max-h-40 mb-4">
                                {this.state.info.componentStack}
                            </pre>
                        )}
                        <div className="flex gap-2">
                            <button
                                className="flex-1 bg-lime-glow text-emerald-pine py-2 rounded-xl font-bold"
                                onClick={() => window.location.reload()}
                            >
                                Retry
                            </button>
                            <button
                                className="flex-1 bg-gray-800 text-white py-2 rounded-xl"
                                onClick={() => { try { localStorage.removeItem('poshakh-user') } catch { }; window.location.reload() }}
                            >
                                Clear User & Reload
                            </button>
                        </div>
                    </div>
                </div>
            )
        }
        return this.props.children
    }
}
