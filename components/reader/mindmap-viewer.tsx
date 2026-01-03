/**
 * MindmapViewer - Simple CSS-based tree visualization for mindmaps
 */
"use client"

import { X } from "lucide-react"
import { Button } from "@/components/ui/button"

interface MindmapNode {
    id: string
    text: string
    children?: MindmapNode[]
}

interface MindmapViewerProps {
    title: string
    nodes: MindmapNode[]
    onClose: () => void
}

// Recursive node renderer
function MindmapNodeItem({ node, level = 0 }: { node: MindmapNode; level?: number }) {
    const colors = [
        'border-primary bg-primary/10',
        'border-blue-400 bg-blue-50 dark:bg-blue-900/20',
        'border-green-400 bg-green-50 dark:bg-green-900/20',
        'border-purple-400 bg-purple-50 dark:bg-purple-900/20',
    ]

    const colorClass = colors[level % colors.length]

    return (
        <div className="relative">
            {/* Node */}
            <div
                className={`inline-block px-3 py-1.5 rounded-lg border-2 ${colorClass} text-sm font-medium transition-all hover:scale-105`}
            >
                {node.text}
            </div>

            {/* Children */}
            {node.children && node.children.length > 0 && (
                <div className="ml-6 mt-2 pl-4 border-l-2 border-border/50 space-y-2">
                    {node.children.map((child) => (
                        <MindmapNodeItem key={child.id} node={child} level={level + 1} />
                    ))}
                </div>
            )}
        </div>
    )
}

export function MindmapViewer({ title, nodes, onClose }: MindmapViewerProps) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-background rounded-2xl shadow-2xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-hidden flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b">
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center">
                            🧠
                        </div>
                        <div>
                            <h2 className="font-semibold text-lg">思维导图</h2>
                            <p className="text-sm text-muted-foreground">{title}</p>
                        </div>
                    </div>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onClose}>
                        <X className="h-4 w-4" />
                    </Button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                    {nodes.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                            暂无内容
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {/* Central title */}
                            <div className="flex justify-center mb-6">
                                <div className="px-6 py-3 rounded-2xl bg-gradient-to-r from-primary to-primary/80 text-primary-foreground font-bold text-lg shadow-lg">
                                    {title}
                                </div>
                            </div>

                            {/* Nodes tree */}
                            <div className="space-y-3">
                                {nodes.map((node) => (
                                    <MindmapNodeItem key={node.id} node={node} level={0} />
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 border-t bg-muted/30">
                    <p className="text-xs text-muted-foreground text-center">
                        基于当前页面内容生成 · AI 辅助阅读
                    </p>
                </div>
            </div>
        </div>
    )
}
