import React from 'react'
import { Trash2, ChevronRight, CheckCircle, Clock } from 'lucide-react'

export default function BatchScanQueue({
    queue = [],
    currentIndex = 0,
    onReviewItem,
    onDeleteItem,
    onExitBatchMode,
    isProcessing = false
}) {
    if (queue.length === 0) {
        return null
    }

    const completedCount = currentIndex
    const totalCount = queue.length

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-96 flex flex-col">
                {/* Header */}
                <div className="bg-blue-600 text-white p-4 rounded-t-lg">
                    <h2 className="text-lg font-bold">Batch Scan Queue</h2>
                    <p className="text-sm mt-1">
                        {completedCount} of {totalCount} completed
                    </p>
                    <div className="w-full bg-blue-700 rounded-full h-2 mt-2">
                        <div
                            className="bg-green-400 h-2 rounded-full transition-all duration-300"
                            style={{ width: `${(completedCount / totalCount) * 100}%` }}
                        />
                    </div>
                </div>

                {/* Queue List */}
                <div className="overflow-y-auto flex-1 p-4 space-y-2">
                    {queue.map((item, index) => (
                        <div
                            key={index}
                            className={`p-3 rounded-lg border-2 cursor-pointer transition-all ${
                                index === currentIndex
                                    ? 'border-blue-500 bg-blue-50'
                                    : index < currentIndex
                                    ? 'border-green-300 bg-green-50'
                                    : 'border-gray-200 bg-gray-50'
                            }`}
                            onClick={() => !isProcessing && onReviewItem(index)}
                        >
                            {/* Status indicator */}
                            <div className="flex items-start justify-between">
                                <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                        {index < currentIndex ? (
                                            <CheckCircle className="w-4 h-4 text-green-600" />
                                        ) : index === currentIndex ? (
                                            <Clock className="w-4 h-4 text-blue-600 animate-pulse" />
                                        ) : (
                                            <div className="w-4 h-4 rounded-full border-2 border-gray-400" />
                                        )}
                                        <span className="font-semibold text-sm">
                                            #{item.orderNumber || `Order ${index + 1}`}
                                        </span>
                                    </div>
                                    <p className="text-sm text-gray-600 mt-1 ml-6">
                                        {item.customerName || 'Unknown'}
                                    </p>
                                    <p className="text-xs text-gray-500 mt-0.5 ml-6">
                                        {item.items?.length || 0} item(s) • {item.totalPrice}
                                    </p>
                                </div>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        onDeleteItem(index)
                                    }}
                                    className="p-1 hover:bg-red-100 rounded text-red-600 ml-2"
                                    title="Remove from queue"
                                    disabled={isProcessing}
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>

                            {/* Show when it's current item */}
                            {index === currentIndex && (
                                <div className="mt-2 ml-6 text-xs text-blue-600 font-medium flex items-center gap-1">
                                    <ChevronRight className="w-3 h-3" />
                                    Review this order
                                </div>
                            )}
                        </div>
                    ))}
                </div>

                {/* Footer */}
                <div className="border-t p-4 flex gap-2 rounded-b-lg bg-gray-50">
                    <button
                        onClick={onExitBatchMode}
                        className="flex-1 px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-100 font-medium text-sm transition-colors"
                        disabled={isProcessing}
                    >
                        Exit Batch Mode
                    </button>
                    <button
                        onClick={() => onReviewItem(currentIndex)}
                        className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm transition-colors disabled:opacity-50"
                        disabled={isProcessing || queue.length === 0}
                    >
                        Review Now
                    </button>
                </div>
            </div>
        </div>
    )
}
