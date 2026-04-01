import * as React from 'react'
import { cn } from '../../lib/utils'

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      'w-full px-3 py-2 rounded-lg bg-[#18181b] border border-[#27272a] text-white text-sm font-mono placeholder-[#52525b] focus:outline-none focus:border-[#3f3f46] transition-colors',
      className
    )}
    {...props}
  />
))
Input.displayName = 'Input'

export { Input }
