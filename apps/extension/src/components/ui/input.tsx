import * as React from 'react'
import { cn } from '../../lib/utils'

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      'w-full px-3 py-2 rounded-lg bg-ns-surface border border-ns-border text-ns-fg text-sm font-mono placeholder-ns-faint focus:outline-none focus:border-ns-subtle transition-colors',
      className
    )}
    {...props}
  />
))
Input.displayName = 'Input'

export { Input }
