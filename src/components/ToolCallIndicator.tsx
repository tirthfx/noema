import type { ToolCallActivity } from '../../shared/types'

/**
 * Every tool the agent can call needs a case here: rules.md §4 requires the UI to name the
 * tool it actually ran, so an unlisted tool must never fall through to another tool's label.
 */
function inputLabel(activity: ToolCallActivity): string {
  const { input } = activity
  switch (activity.tool) {
    case 'search_notes': return `search_notes(${JSON.stringify(input.query ?? '')})`
    case 'read_note': return `read_note(${JSON.stringify(input.path ?? '')})`
    case 'write_note': return `write_note(${JSON.stringify(input.path ?? '')})`
    case 'link_notes': return `link_notes(${JSON.stringify(input.fromPath ?? '')} → ${JSON.stringify(input.toPath ?? '')})`
    case 'list_notes': return input.folder ? `list_notes(${JSON.stringify(input.folder)})` : 'list_notes()'
  }
}

function runningLabel(tool: ToolCallActivity['tool']): string {
  switch (tool) {
    case 'search_notes': return 'searching'
    case 'read_note': return 'reading'
    case 'list_notes': return 'listing'
    case 'write_note': return 'drafting'
    case 'link_notes': return 'linking'
  }
}

export default function ToolCallIndicator({ activity }: { activity: ToolCallActivity }) {
  return (
    <p className={`tool-call ${activity.status === 'running' ? 'tool-call-running' : ''}`}>
      {inputLabel(activity)}{activity.status === 'complete' ? ` → ${activity.summary}` : ` → ${runningLabel(activity.tool)}`}
    </p>
  )
}
