import type { ToolCallActivity } from '../../shared/types'

function inputLabel(activity: ToolCallActivity): string {
  if (activity.tool === 'search_notes') return `search_notes(${JSON.stringify(activity.input.query ?? '')})`
  if (activity.tool === 'read_note') return `read_note(${JSON.stringify(activity.input.path ?? '')})`
  return activity.input.folder ? `list_notes(${JSON.stringify(activity.input.folder)})` : 'list_notes()'
}

export default function ToolCallIndicator({ activity }: { activity: ToolCallActivity }) {
  return (
    <p className={`tool-call ${activity.status === 'running' ? 'tool-call-running' : ''}`}>
      {inputLabel(activity)}{activity.status === 'complete' ? ` → ${activity.summary}` : ' → searching'}
    </p>
  )
}
