import * as React from 'react'
import { Separator } from '@radix-ui/react-separator'
import { cn } from '@/lib/utils'

const SidebarSeparator = React.forwardRef<
  React.ElementRef<typeof Separator>,
  React.ComponentPropsWithoutRef<typeof Separator>
>(({ className, ...props }, ref) => (
  <Separator ref={ref} className={cn('bg-sidebar-border my-1 h-px', className)} {...props} />
))
SidebarSeparator.displayName = 'SidebarSeparator'

export { SidebarSeparator }
