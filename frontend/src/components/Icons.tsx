import type { ReactNode } from 'react'

/** Small stroke icons. All are decorative: the button that holds one carries the label. */
function Icon({ children, size = 18 }: { children: ReactNode; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  )
}

export const PlusIcon = () => (
  <Icon>
    <path d="M12 5v14M5 12h14" />
  </Icon>
)

export const MenuIcon = () => (
  <Icon size={20}>
    <path d="M4 7h16M4 12h16M4 17h10" />
  </Icon>
)

export const CloseIcon = () => (
  <Icon size={20}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Icon>
)

export const ArrowUpIcon = () => (
  <Icon>
    <path d="M12 19V5M5.5 11.5L12 5l6.5 6.5" />
  </Icon>
)

export const StopIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" focusable="false">
    <rect width="14" height="14" rx="2.5" fill="currentColor" />
  </svg>
)

export const CopyIcon = () => (
  <Icon size={15}>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M5 15V6a2 2 0 0 1 2-2h9" />
  </Icon>
)

export const CheckIcon = () => (
  <Icon size={15}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Icon>
)

export const TrashIcon = () => (
  <Icon size={15}>
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
  </Icon>
)

export const FileIcon = () => (
  <Icon size={15}>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5" />
  </Icon>
)
